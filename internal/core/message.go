package core

import (
	"context"
	"fmt"
	"strings"

	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// chunkMessage splits a text into multiple chunks if it exceeds the limit.
// It ensures that chunks do not split UTF-8 characters and optionally adds a prefix.
func chunkMessage(text string, limit int) []string {
	runes := []rune(text)
	if len(runes) <= limit {
		return []string{text}
	}

	var chunks []string
	// Reserve 20 characters for the "[i/n]\n" prefix
	chunkSize := limit - 20
	if chunkSize <= 0 {
		chunkSize = 1 // Fallback just in case
	}

	totalChunks := (len(runes) + chunkSize - 1) / chunkSize

	for i := 0; i < totalChunks; i++ {
		start := i * chunkSize
		end := start + chunkSize
		if end > len(runes) {
			end = len(runes)
		}

		prefix := fmt.Sprintf("[%d/%d]\n", i+1, totalChunks)
		chunks = append(chunks, prefix+string(runes[start:end]))
	}

	return chunks
}

// RunMessage sends a plain text message to the target Telegram chat
func RunMessage(ctx context.Context, targetRaw string, text string, quiet bool) error {
	// Require trailing colon to keep visual consistency
	if !strings.HasSuffix(targetRaw, ":") {
		return fmt.Errorf("invalid target format. Use alias:")
	}
	alias := strings.TrimSuffix(targetRaw, ":")

	cfg, err := config.Load()
	if err != nil || cfg.ActiveToken == "" {
		return fmt.Errorf("config error (run teleman config)")
	}

	target, ok := cfg.Targets[alias]
	if !ok {
		return fmt.Errorf("target alias '%s' not found", alias)
	}

	client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)

	chunks := chunkMessage(text, 4096)
	for i, chunk := range chunks {
		_, err = client.SendMessageCtx(ctx, target.ChatID, target.ThreadID, chunk)
		if err != nil {
			if len(chunks) > 1 {
				return fmt.Errorf("failed to send message chunk %d/%d: %v", i+1, len(chunks), err)
			}
			return fmt.Errorf("failed to send message: %v", err)
		}
	}

	if !quiet {
		if len(chunks) > 1 {
			fmt.Printf("Message sent in %d chunks\n", len(chunks))
		} else {
			fmt.Println("Message sent")
		}
	}

	return nil
}
