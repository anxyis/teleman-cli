package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
)

// ErrFatal represents a critical error that should immediately abort the sync.
var ErrFatal = errors.New("fatal error")

// ErrMissingLocal represents a local file that vanished or became unreadable during sync.
var ErrMissingLocal = errors.New("missing local file")

// TransportPacer implements a lightweight degraded mode.
// If the transport throws transient errors, the Pacer globally increases a penalty sleep
// causing all workers to voluntarily yield before hitting the network again.
type TransportPacer struct {
	consecutiveErrors atomic.Int32
}

// AddError records a transient error and calculates a backoff duration.
func (p *TransportPacer) AddError() {
	p.consecutiveErrors.Add(1)
}

// Reset clears the penalty state.
func (p *TransportPacer) Reset() {
	p.consecutiveErrors.Store(0)
}

// Wait applies a global backpressure sleep if the system is in a degraded state.
func (p *TransportPacer) Wait(ctx context.Context) error {
	errs := p.consecutiveErrors.Load()
	if errs == 0 {
		return nil
	}
	
	// Calculate degraded sleep (exponential but capped at 10 seconds)
	base := math.Pow(1.5, float64(errs))
	if base > 10 {
		base = 10
	}
	
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(time.Duration(base) * time.Second):
		return nil
	}
}

// IsTransientNetworkError checks if the error is a retriable network drop.
func IsTransientNetworkError(err error) bool {
	if err == nil {
		return false
	}
	
	// Unwrap the error
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	
	errString := strings.ToLower(err.Error())
	retriablePhrases := []string{
		"wsaeconnaborted",
		"connectex: an established connection was aborted",
		"eof",
		"unexpected eof",
		"connection reset by peer",
		"connection refused",
		"client.timeout",
		"tls: use of closed connection",
		"use of closed network connection",
	}
	
	for _, phrase := range retriablePhrases {
		if strings.Contains(errString, phrase) {
			return true
		}
	}
	
	return false
}

// Client handles interaction with the Telegram Bot API.
type Client struct {
	Token          string
	APIHost        string // e.g. "https://api.telegram.org" or a local Bot API server
	FileServerHost string // e.g. "http://192.168.0.7:9000" — separate file server for downloads (local API only)
	HTTPClient     *http.Client
	Pacer          *TransportPacer
}

// testEndpoint checks if a URL is reachable within a short timeout.
func testEndpoint(url string) bool {
	if url == "" {
		return false
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	// As long as the server responds (even 401/404), it's reachable.
	return true
}

// resolveAPIHost tests the Local, Tailscale, and Public hosts in order and returns the first reachable one.
// If none are reachable, it returns the first configured one as a last resort.
func resolveAPIHost(token string, hosts models.HostMap) string {
	candidates := []string{hosts.Local, hosts.Tailscale, hosts.Public}
	var firstConfigured string

	for _, host := range candidates {
		host = strings.TrimSpace(host)
		if host == "" {
			continue
		}
		host = strings.TrimRight(host, "/")
		
		if firstConfigured == "" {
			firstConfigured = host
		}
		
		// For the Bot API, we test the /getMe endpoint
		testURL := fmt.Sprintf("%s/bot%s/getMe", host, token)
		if testEndpoint(testURL) {
			return host
		}
	}
	
	// If none are reachable, return the first one they configured so the error output makes sense
	return firstConfigured
}

// resolveFileHost tests the Local, Tailscale, and Public hosts in order and returns the first reachable one.
func resolveFileHost(hosts models.HostMap) string {
	candidates := []string{hosts.Local, hosts.Tailscale, hosts.Public}
	for _, host := range candidates {
		host = strings.TrimSpace(host)
		if host == "" {
			continue
		}
		host = strings.TrimRight(host, "/")
		if testEndpoint(host) {
			return host
		}
	}
	return ""
}

// NewSmartClient initializes a client by intelligently falling back between local, tailscale, and public endpoints.
func NewSmartClient(token string, apiHosts models.HostMap, fileHosts models.HostMap) *Client {
	apiHost := resolveAPIHost(token, apiHosts)
	fileHost := resolveFileHost(fileHosts)

	logger.Step("Using API Endpoint: %s", apiHost)
	if fileHost != "" {
		logger.Step("Using File Server Endpoint: %s", fileHost)
	}

	// Custom transport optimized for high-throughput concurrent uploads
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   100, // Prevent dropping keep-alives when running many concurrent transfers
		MaxConnsPerHost:       100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &Client{
		Token:          token,
		APIHost:        apiHost,
		FileServerHost: fileHost,
		HTTPClient:     &http.Client{
			Transport: transport,
			Timeout:   30 * time.Minute,
		},
		Pacer:          &TransportPacer{},
	}
}

// SetConcurrency dynamically tunes the transport pooling to prevent socket starvation under high load.
func (c *Client) SetConcurrency(n int) {
	if t, ok := c.HTTPClient.Transport.(*http.Transport); ok {
		// Double the connection limit to allow ample room for keepalives
		conns := n * 2
		if conns < 100 {
			conns = 100 // Fallback minimum
		}
		t.MaxIdleConnsPerHost = conns
		t.MaxIdleConns = conns * 2
		t.MaxConnsPerHost = conns
	}
}

// backoff computes an exponential backoff duration with jitter.
// Base delay doubles each attempt: 1s, 2s, 4s, 8s... capped at 60s.
func backoff(attempt int) time.Duration {
	base := math.Pow(2, float64(attempt))
	if base > 60 {
		base = 60
	}
	return time.Duration(base) * time.Second
}

// handleRateLimit reads the Retry-After from a 429 response and sleeps accordingly.
// Returns an error describing the wait for logging purposes.
func (c *Client) handleRateLimit(resp *http.Response) error {
	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfterStr := resp.Header.Get("Retry-After")
		retryAfter, _ := strconv.Atoi(retryAfterStr)
		if retryAfter == 0 {
			// Fallback if header is missing, sometimes Telegram sends it in JSON
			var rData struct {
				Parameters struct {
					RetryAfter int `json:"retry_after"`
				} `json:"parameters"`
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body = io.NopCloser(bytes.NewBuffer(body)) // restore
			json.Unmarshal(body, &rData)
			retryAfter = rData.Parameters.RetryAfter
		}
		if retryAfter > 0 {
			time.Sleep(time.Duration(retryAfter) * time.Second)
			return fmt.Errorf("rate limited, waited %d seconds", retryAfter)
		}
		time.Sleep(2 * time.Second)
		return fmt.Errorf("rate limited (implicit wait)")
	}
	return nil
}

// GetMe fetches information about the bot.
func (c *Client) GetMe() (map[string]interface{}, error) {
	return c.GetMeCtx(context.Background())
}

// GetMeCtx fetches information about the bot with context support.
func (c *Client) GetMeCtx(ctx context.Context) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/bot%s/getMe", c.APIHost, c.Token)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.handleRateLimit(resp); err != nil {
		// simple retry logic could live here or higher up
	}

	var result struct {
		Ok     bool                   `json:"ok"`
		Result map[string]interface{} `json:"result"`
		Desc   string                 `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if !result.Ok {
		return nil, fmt.Errorf("Telegram API Error: %s", result.Desc)
	}
	return result.Result, nil
}

// SendDocument uploads a chunk stream as a document to Telegram.
func (c *Client) SendDocument(chatID string, threadID string, filename string, r io.Reader, caption string) (string, int64, error) {
	return c.SendDocumentCtx(context.Background(), chatID, threadID, filename, r, caption)
}

// SendDocumentCtx uploads a chunk stream as a document to Telegram with context support for cancellation.
func (c *Client) SendDocumentCtx(ctx context.Context, chatID string, threadID string, filename string, r io.Reader, caption string) (string, int64, error) {
	url := fmt.Sprintf("%s/bot%s/sendDocument", c.APIHost, c.Token)

	seeker, isSeeker := r.(io.Seeker)

	// Exponential backoff retry loop for 429 Flood Wait
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			if !isSeeker {
				return "", 0, fmt.Errorf("rate limited, but reader cannot be rewound for retry")
			}
			if _, err := seeker.Seek(0, io.SeekStart); err != nil {
				return "", 0, fmt.Errorf("failed to seek reader for retry: %v", err)
			}
		}

		pr, pw := io.Pipe()
		writer := multipart.NewWriter(pw)

		go func() {
			defer pw.Close()
			writer.WriteField("chat_id", chatID)
			if threadID != "" {
				writer.WriteField("message_thread_id", threadID)
			}
			if caption != "" {
				writer.WriteField("caption", caption)
			}

			// Force Telegram to treat this as a pure raw file, not rich media
			writer.WriteField("disable_content_type_detection", "true")

			part, err := writer.CreateFormFile("document", filename)
			if err == nil {
				io.Copy(part, r)
			}
			writer.Close()
		}()

		req, err := http.NewRequestWithContext(ctx, "POST", url, pr)
		if err != nil {
			return "", 0, err
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())

		// Apply global backpressure if transport is degraded
		if err := c.Pacer.Wait(ctx); err != nil {
			return "", 0, err
		}

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return "", 0, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			if IsTransientNetworkError(err) {
				c.Pacer.AddError()
				select {
				case <-ctx.Done():
					return "", 0, ctx.Err()
				case <-time.After(backoff(attempt)):
				}
				continue
			}
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.Pacer.AddError()
			c.handleRateLimit(resp)
			resp.Body.Close()
			continue
		}

		c.Pacer.Reset()
		defer resp.Body.Close()

		var result struct {
			Ok     bool `json:"ok"`
			Result struct {
				MessageID int64 `json:"message_id"`
				Document  struct {
					FileID string `json:"file_id"`
				} `json:"document"`
			} `json:"result"`
			Desc string `json:"description"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", 0, err
		}

		if !result.Ok {
			return "", 0, fmt.Errorf("Telegram API Error: %s", result.Desc)
		}

		return result.Result.Document.FileID, result.Result.MessageID, nil
	}
	return "", 0, fmt.Errorf("max retries exceeded")
}

// SendMedia uploads a stream using a specific media endpoint (sendPhoto, sendVideo, sendAudio).
func (c *Client) SendMedia(chatID string, threadID string, filename string, r io.Reader, method string, fieldName string, params map[string]string, thumbData []byte, caption string) (string, int64, error) {
	return c.SendMediaCtx(context.Background(), chatID, threadID, filename, r, method, fieldName, params, thumbData, caption)
}

// SendMediaCtx uploads a stream using a specific media endpoint with context support.
func (c *Client) SendMediaCtx(ctx context.Context, chatID string, threadID string, filename string, r io.Reader, method string, fieldName string, params map[string]string, thumbData []byte, caption string) (string, int64, error) {
	url := fmt.Sprintf("%s/bot%s/%s", c.APIHost, c.Token, method)

	seeker, isSeeker := r.(io.Seeker)

	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			if !isSeeker {
				return "", 0, fmt.Errorf("rate limited, but reader cannot be rewound for retry")
			}
			if _, err := seeker.Seek(0, io.SeekStart); err != nil {
				return "", 0, fmt.Errorf("failed to seek reader for retry: %v", err)
			}
		}

		pr, pw := io.Pipe()
		writer := multipart.NewWriter(pw)

		go func() {
			defer pw.Close()
			writer.WriteField("chat_id", chatID)
			if threadID != "" {
				writer.WriteField("message_thread_id", threadID)
			}
			if caption != "" {
				writer.WriteField("caption", caption)
			}

			if params != nil {
				for k, v := range params {
					writer.WriteField(k, v)
				}
			}

			if len(thumbData) > 0 {
				part, err := writer.CreateFormFile("thumb", "thumb.jpg")
				if err == nil {
					io.Copy(part, bytes.NewReader(thumbData))
				}
			}

			part, err := writer.CreateFormFile(fieldName, filename)
			if err == nil {
				io.Copy(part, r)
			}
			writer.Close()
		}()

		req, err := http.NewRequestWithContext(ctx, "POST", url, pr)
		if err != nil {
			return "", 0, err
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())

		// Apply global backpressure if transport is degraded
		if err := c.Pacer.Wait(ctx); err != nil {
			return "", 0, err
		}

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return "", 0, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			if IsTransientNetworkError(err) {
				c.Pacer.AddError()
				select {
				case <-ctx.Done():
					return "", 0, ctx.Err()
				case <-time.After(backoff(attempt)):
				}
				continue
			}
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.Pacer.AddError()
			c.handleRateLimit(resp)
			resp.Body.Close()
			continue
		}

		c.Pacer.Reset()
		defer resp.Body.Close()
		var result struct {
			Ok     bool                   `json:"ok"`
			Result map[string]interface{} `json:"result"`
			Desc   string                 `json:"description"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", 0, err
		}

		if !result.Ok {
			return "", 0, fmt.Errorf("Telegram API Error: %s", result.Desc)
		}

		msgID := int64(result.Result["message_id"].(float64))
		var fileID string

		if v, ok := result.Result[fieldName]; ok {
			switch val := v.(type) {
			case []interface{}:
				if len(val) > 0 {
					if obj, ok := val[len(val)-1].(map[string]interface{}); ok {
						if fID, ok := obj["file_id"].(string); ok {
							fileID = fID
						}
					}
				}
			case map[string]interface{}:
				if fID, ok := val["file_id"].(string); ok {
					fileID = fID
				}
			}
		}

		if fileID == "" {
			for _, v := range result.Result {
				switch val := v.(type) {
				case []interface{}:
					if len(val) > 0 {
						if obj, ok := val[len(val)-1].(map[string]interface{}); ok {
							if fID, ok := obj["file_id"].(string); ok {
								fileID = fID
								break
							}
						}
					}
				case map[string]interface{}:
					if fID, ok := val["file_id"].(string); ok {
						fileID = fID
						break
					}
				}
			}
		}

		if fileID == "" {
			return "", 0, fmt.Errorf("Telegram API returned success but failed to locate file_id in response structure")
		}

		return fileID, msgID, nil
	}
	return "", 0, fmt.Errorf("max retries exceeded")
}

// SendMessage sends a text message to a chat.
func (c *Client) SendMessage(chatID string, threadID string, text string) (int64, error) {
	return c.SendMessageCtx(context.Background(), chatID, threadID, text)
}

// SendMessageCtx sends a text message with context support.
func (c *Client) SendMessageCtx(ctx context.Context, chatID string, threadID string, text string) (int64, error) {
	url := fmt.Sprintf("%s/bot%s/sendMessage", c.APIHost, c.Token)

	payload := map[string]string{
		"chat_id": chatID,
		"text":    text,
	}
	if threadID != "" {
		payload["message_thread_id"] = threadID
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	for attempt := 0; attempt < 5; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return 0, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			return 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			err = c.handleRateLimit(resp)
			resp.Body.Close()
			if err != nil && attempt == 4 {
				return 0, fmt.Errorf("rate limited after %d attempts", attempt+1)
			}
			continue
		}

		var result struct {
			Ok     bool `json:"ok"`
			Result struct {
				MessageID int64 `json:"message_id"`
			} `json:"result"`
			Desc string `json:"description"`
		}

		err = json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()

		if err != nil {
			return 0, err
		}

		if !result.Ok {
			return 0, fmt.Errorf("Telegram API Error: %s", result.Desc)
		}

		return result.Result.MessageID, nil
	}
	return 0, fmt.Errorf("max retries exceeded")
}

// GetFile requests file metadata (specifically the path) needed for download
func (c *Client) GetFile(fileID string) (string, error) {
	return c.GetFileCtx(context.Background(), fileID)
}

// GetFileCtx requests file metadata with context support.
func (c *Client) GetFileCtx(ctx context.Context, fileID string) (string, error) {
	url := fmt.Sprintf("%s/bot%s/getFile?file_id=%s", c.APIHost, c.Token, fileID)

	for attempt := 0; attempt < 5; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return "", err
		}

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return "", fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			return "", err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			continue
		}

		var result struct {
			Ok     bool `json:"ok"`
			Result struct {
				FilePath string `json:"file_path"`
			} `json:"result"`
			Desc string `json:"description"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}

		if !result.Ok {
			return "", fmt.Errorf("Telegram API Error: %s", result.Desc)
		}

		return result.Result.FilePath, nil
	}
	return "", fmt.Errorf("max retries exceeded for getFile")
}

// DownloadFileStream downloads a file directly from Telegram's API using its file_path
func (c *Client) DownloadFileStream(filePath string) (io.ReadCloser, error) {
	return c.DownloadFileStreamCtx(context.Background(), filePath)
}

// DownloadFileStreamCtx downloads a file with context support and exponential backoff.
// When FileServerHost is configured, downloads go directly to the file server (e.g. nginx)
// instead of the Bot API's /file/ endpoint. This is required for local Bot API setups.
func (c *Client) DownloadFileStreamCtx(ctx context.Context, filePath string) (io.ReadCloser, error) {
	var url string
	if c.FileServerHost != "" {
		// Local API + file server: nginx serves the bot data directory directly.
		// The local Bot API returns absolute container paths like:
		//   /var/lib/telegram-bot-api/<token>/documents/file_0.txt
		// Strip the known data directory prefix so we get a path relative to nginx's document root.
		cleanPath := filePath
		knownPrefixes := []string{
			"/var/lib/telegram-bot-api/",
			"./",
		}
		for _, prefix := range knownPrefixes {
			if strings.HasPrefix(cleanPath, prefix) {
				cleanPath = strings.TrimPrefix(cleanPath, prefix)
				break
			}
		}
		cleanPath = strings.TrimLeft(cleanPath, "/")
		url = fmt.Sprintf("%s/%s", c.FileServerHost, cleanPath)
	} else {
		// Cloud API: standard Telegram download endpoint
		url = fmt.Sprintf("%s/file/bot%s/%s", c.APIHost, c.Token, filePath)
	}

	for attempt := 0; attempt < 5; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return nil, err
		}

		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
			// Exponential backoff before retry
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff(attempt)):
			}
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to download file, status code: %d", resp.StatusCode)
		}

		return resp.Body, nil
	}
	return nil, fmt.Errorf("max retries exceeded while downloading file stream")
}

// DeleteMessage deletes a message in a chat history
func (c *Client) DeleteMessage(chatID string, messageID int64) error {
	url := fmt.Sprintf("%s/bot%s/deleteMessage?chat_id=%s&message_id=%d", c.APIHost, c.Token, chatID, messageID)
	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return c.handleRateLimit(resp)
}

// GetChat validates permissions and checks if the bot can see the chat
func (c *Client) GetChat(chatID string) error {
	url := fmt.Sprintf("%s/bot%s/getChat?chat_id=%s", c.APIHost, c.Token, chatID)
	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if err := c.handleRateLimit(resp); err != nil {
		return err
	}

	var result struct {
		Ok   bool   `json:"ok"`
		Desc string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if !result.Ok {
		return fmt.Errorf("chat validation failed: %s", result.Desc)
	}

	return nil
}

// GetUpdates fetches recent updates (channel posts, messages).
func (c *Client) GetUpdates() ([]map[string]interface{}, error) {
	url := fmt.Sprintf("%s/bot%s/getUpdates?allowed_updates=[\"channel_post\",\"message\"]", c.APIHost, c.Token)
	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.handleRateLimit(resp); err != nil {
		return nil, err
	}

	var result struct {
		Ok     bool                     `json:"ok"`
		Result []map[string]interface{} `json:"result"`
		Desc   string                   `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if !result.Ok {
		return nil, fmt.Errorf("Telegram API Error: %s", result.Desc)
	}

	return result.Result, nil
}

// DeleteMessages deletes multiple messages in a chat history in batches of 100.
func (c *Client) DeleteMessages(chatID string, messageIDs []int64) error {
	if len(messageIDs) == 0 {
		return nil
	}

	urlStr := fmt.Sprintf("%s/bot%s/deleteMessages", c.APIHost, c.Token)

	var wg sync.WaitGroup
	errChan := make(chan error, (len(messageIDs)/100)+1)
	sem := make(chan struct{}, 5) // 5 concurrent batches

	for i := 0; i < len(messageIDs); i += 100 {
		end := i + 100
		if end > len(messageIDs) {
			end = len(messageIDs)
		}

		batch := messageIDs[i:end]

		wg.Add(1)
		go func(b []int64) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			payload := map[string]interface{}{
				"chat_id":     chatID,
				"message_ids": b,
			}

			bodyBytes, err := json.Marshal(payload)
			if err != nil {
				errChan <- err
				return
			}

			req, err := http.NewRequest("POST", urlStr, bytes.NewBuffer(bodyBytes))
			if err != nil {
				errChan <- err
				return
			}
			req.Header.Set("Content-Type", "application/json")

			resp, err := c.HTTPClient.Do(req)
			if err != nil {
				errChan <- err
				return
			}

			if err := c.handleRateLimit(resp); err != nil {
				resp.Body.Close()
				errChan <- err
				return
			}

			var result struct {
				Ok   bool   `json:"ok"`
				Desc string `json:"description"`
			}
			err = json.NewDecoder(resp.Body).Decode(&result)
			resp.Body.Close()
			if err != nil {
				errChan <- err
				return
			}

			if !result.Ok {
				errChan <- fmt.Errorf("Telegram API Error (deleteMessages): %s", result.Desc)
				return
			}
		}(batch)
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		if err != nil {
			return err
		}
	}

	return nil
}
