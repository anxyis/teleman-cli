package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Client handles interaction with the Telegram Bot API.
type Client struct {
	Token      string
	APIHost    string // e.g. "https://api.telegram.org" or a local Nginx mirror
	HTTPClient *http.Client
}

// NewClient initializes a new Telegram API client.
func NewClient(token string, apiHost string) *Client {
	apiHost = strings.TrimSpace(apiHost)
	if apiHost == "" {
		apiHost = "https://api.telegram.org"
	} else {
		apiHost = strings.TrimRight(apiHost, "/")
	}
	return &Client{
		Token:      token,
		APIHost:    apiHost,
		HTTPClient: &http.Client{Timeout: 30 * time.Minute}, // Large timeout for chunks
	}
}

// rateLimitSleep simulates a basic rate limiter based on Telegram's 429
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
	url := fmt.Sprintf("%s/bot%s/getMe", c.APIHost, c.Token)
	resp, err := c.HTTPClient.Get(url)
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
func (c *Client) SendDocument(chatID string, threadID string, filename string, r io.Reader) (string, int64, error) {
	url := fmt.Sprintf("%s/bot%s/sendDocument", c.APIHost, c.Token)

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		writer.WriteField("chat_id", chatID)
		if threadID != "" {
			writer.WriteField("message_thread_id", threadID)
		}
		
		// Force Telegram to treat this as a pure raw file, not rich media
		writer.WriteField("disable_content_type_detection", "true")

		part, err := writer.CreateFormFile("document", filename)
		if err == nil {
			io.Copy(part, r)
		}
		writer.Close()
	}()

	req, err := http.NewRequest("POST", url, pr)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Simple loop to handle 429 Flood Wait at client level
	for attempt := 0; attempt < 3; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
			// Because we piped the reader, doing a blind retry here actually fails 
			// if the body reader was totally consumed. For MVP, we return error to let the Chunk Engine retry.
			return "", 0, fmt.Errorf("rate limited")
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
func (c *Client) SendMedia(chatID string, threadID string, filename string, r io.Reader, method string, fieldName string, params map[string]string, thumbData []byte) (string, int64, error) {
	url := fmt.Sprintf("%s/bot%s/%s", c.APIHost, c.Token, method)

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		writer.WriteField("chat_id", chatID)
		if threadID != "" {
			writer.WriteField("message_thread_id", threadID)
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

	req, err := http.NewRequest("POST", url, pr)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	for attempt := 0; attempt < 3; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			return "", 0, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
			return "", 0, fmt.Errorf("rate limited")
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

// GetFile requests file metadata (specifically the path) needed for download
func (c *Client) GetFile(fileID string) (string, error) {
	url := fmt.Sprintf("%s/bot%s/getFile?file_id=%s", c.APIHost, c.Token, fileID)
	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if err := c.handleRateLimit(resp); err != nil {
		return "", err
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

// DownloadFileStream downloads a file directly from Telegram's API using its file_path
func (c *Client) DownloadFileStream(filePath string) (io.ReadCloser, error) {
	url := fmt.Sprintf("%s/file/bot%s/%s", c.APIHost, c.Token, filePath)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	for attempt := 0; attempt < 3; attempt++ {
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			c.handleRateLimit(resp)
			resp.Body.Close()
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
		Ok     bool `json:"ok"`
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
