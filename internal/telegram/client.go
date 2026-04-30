package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/teleman-cli/teleman/internal/models"
)

// Client handles interaction with the Telegram Bot API.
type Client struct {
	Token          string
	APIHost        string // e.g. "https://api.telegram.org" or a local Bot API server
	FileServerHost string // e.g. "http://192.168.0.7:9000" — separate file server for downloads (local API only)
	HTTPClient     *http.Client
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

	fmt.Printf("Using API Endpoint: %s\n", apiHost)
	if fileHost != "" {
		fmt.Printf("Using File Server Endpoint: %s\n", fileHost)
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

	// Exponential backoff retry loop for 429 Flood Wait
	for attempt := 0; attempt < 5; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			// Check if context was cancelled
			if ctx.Err() != nil {
				return "", 0, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
			// Because we piped the reader, doing a blind retry here actually fails
			// if the body reader was totally consumed. Return error to let the Chunk Engine retry.
			return "", 0, fmt.Errorf("rate limited after %d attempts", attempt+1)
		}

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

	for attempt := 0; attempt < 5; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return "", 0, fmt.Errorf("operation cancelled: %w", ctx.Err())
			}
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
			return "", 0, fmt.Errorf("rate limited after %d attempts", attempt+1)
		}

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
