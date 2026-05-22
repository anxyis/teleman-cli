package core

import (
	"context"
	"fmt"
	"strings"

	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// TelemanContext holds shared initialized state for commands.
type TelemanContext struct {
	Ctx         context.Context
	Config      *models.Config
	Client      *telegram.Client
	IdxManager  *index.Manager
	Target      *models.Target
	TargetKey   string
	VirtualRoot string
	Opts        *models.TransferOptions
}

// InitContext loads the config, initializes the Telegram client,
// validates the target and sets up the index manager.
func InitContext(ctx context.Context, targetRaw string, opts *models.TransferOptions) (*TelemanContext, error) {
	// 1. Load config
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %v", err)
	}
	if cfg.ActiveToken == "" {
		return nil, fmt.Errorf("no bot token found. Run 'teleman config' first")
	}

	// 2. Parse Target (alias:virtual_path)
	parts := strings.SplitN(targetRaw, ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid target format. Use alias:virtual/path")
	}
	alias, virtualRoot := parts[0], parts[1]

	target, ok := cfg.Targets[alias]
	if !ok {
		return nil, fmt.Errorf("target alias '%s' not found. Run 'teleman config'", alias)
	}

	// 3. API Connectivity Check
	logger.Step("=> Initializing API Client...")
	client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)



	me, err := client.GetMeCtx(ctx)
	if err != nil {
		return nil, fmt.Errorf("API connectivity failed: %v", err)
	}
	logger.Debug("   Connected as: %s", me["first_name"])

	// 4. Validate Target Permissions
	logger.Step("=> Validating target chat permissions...")
	if err := client.GetChat(target.ChatID); err != nil {
		if target.Type == "user" {
			logger.Warn("   [Warning] Could not validate user chat (%v). Proceeding assuming bot has access.", err)
		} else {
			return nil, fmt.Errorf("target validation failed: %v", err)
		}
	}

	// 5. Initialize index manager (no lock yet)
	mgr, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return nil, err
	}

	targetKey := target.ChatID
	if target.ThreadID != "" {
		targetKey += ":" + target.ThreadID
	}

	return &TelemanContext{
		Ctx:         ctx,
		Config:      cfg,
		Client:      client,
		IdxManager:  mgr,
		Target:      target,
		TargetKey:   targetKey,
		VirtualRoot: virtualRoot,
		Opts:        opts,
	}, nil
}
