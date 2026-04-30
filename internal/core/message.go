package core

import (
	"context"
	"fmt"
	"strings"

	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/telegram"
)

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

	_, err = client.SendMessageCtx(ctx, target.ChatID, target.ThreadID, text)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	if !quiet {
		fmt.Println("Message sent")
	}

	return nil
}
