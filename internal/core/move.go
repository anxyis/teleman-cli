package core

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// RunMove copies files from source to a virtual Telegram target, then deletes
// the local source files only after the index has been successfully committed.
// This ensures no data loss: source is only removed when Telegram confirms storage.
func RunMove(ctx context.Context, source, targetRaw string, opts *models.TransferOptions) error {
	// 1. Load config
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %v", err)
	}
	if cfg.ActiveToken == "" {
		return fmt.Errorf("no bot token found. Run 'teleman config' first")
	}

	// 2. Parse Target (alias:virtual_path)
	parts := strings.SplitN(targetRaw, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid target format. Use alias:virtual/path")
	}
	alias, virtualRoot := parts[0], parts[1]

	target, ok := cfg.Targets[alias]
	if !ok {
		return fmt.Errorf("target alias '%s' not found. Run 'teleman config'", alias)
	}

	// 3. API Connectivity Check
	logger.Step("=> Initializing API Client...")
	client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)
	
	if opts.AutoUpgradeChunk && !strings.Contains(client.APIHost, "api.telegram.org") {
		logger.Info("   [Auto-Detect] Local API detected. Upgrading chunk size from 49M to 1999M limit.")
		opts.ChunkSize = 1999 * 1024 * 1024
	}

	me, err := client.GetMeCtx(ctx)
	if err != nil {
		return fmt.Errorf("API connectivity failed: %v", err)
	}
	logger.Debug("   Connected as: %s", me["first_name"])

	// 4. Validate Target Permissions
	logger.Step("=> Validating target chat permissions...")
	if err := client.GetChat(target.ChatID); err != nil {
		if target.Type == "user" {
			logger.Warn("   [Warning] Could not validate user chat (%v). Proceeding assuming bot has access.", err)
		} else {
			return fmt.Errorf("target validation failed: %v", err)
		}
	}

	// 5. Initialize Index & Engine with locking
	mgr, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return err
	}

	// Acquire distributed lock
	if err := mgr.AcquireLock("", "move"); err != nil {
		return fmt.Errorf("failed to acquire lock: %v", err)
	}
	defer mgr.ReleaseLock()

	engine := chunker.NewEngineWithSize(client, opts.MediaMode, opts.ChunkSize)

	logger.Step("=> Loading Virtual Index...")
	idx, err := mgr.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	targetKey := target.ChatID
	if target.ThreadID != "" {
		targetKey += ":" + target.ThreadID
	}
	if idx.Targets[targetKey] == nil {
		idx.Targets[targetKey] = make(map[string]*models.FileEntry)
	}

	// Validate source
	info, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source error: %v", err)
	}

	// 6. Collect files to move
	type moveTask struct {
		LocalPath string
		VPath     string
	}
	var filesToMove []moveTask

	if info.IsDir() {
		filepath.Walk(source, func(path string, fi os.FileInfo, err error) error {
			if err == nil && !fi.IsDir() {
				rel, _ := filepath.Rel(source, path)
				vPath := fmt.Sprintf("%s/%s", strings.TrimRight(virtualRoot, "/"), strings.ReplaceAll(rel, "\\", "/"))
				vPath = strings.TrimLeft(vPath, "/")
				filesToMove = append(filesToMove, moveTask{LocalPath: path, VPath: vPath})
			}
			return nil
		})
	} else {
		vPath := fmt.Sprintf("%s/%s", strings.TrimRight(virtualRoot, "/"), filepath.Base(source))
		vPath = strings.TrimLeft(vPath, "/")
		filesToMove = append(filesToMove, moveTask{LocalPath: source, VPath: vPath})
	}

	logger.Step("=> Found %d files to move", len(filesToMove))

	// Dry-run mode
	if opts.DryRun {
		logger.Info("=> [DRY RUN] Would move %d files (upload then delete source):", len(filesToMove))
		for _, task := range filesToMove {
			fi, _ := os.Stat(task.LocalPath)
			logger.Info("   %s → %s (%d bytes)", task.LocalPath, task.VPath, fi.Size())
		}
		return nil
	}

	// 7. Upload phase — identical to copy, but track which files succeeded
	var successfulMoves []string
	var uploaded, skipped, errors int

	for i, task := range filesToMove {
		// Check for cancellation
		select {
		case <-ctx.Done():
			logger.Warn("=> Move interrupted after %d/%d files. Source files NOT deleted for safety.", i, len(filesToMove))
			goto commit
		default:
		}

		fileInfo, _ := os.Stat(task.LocalPath)
		if !opts.Force {
			if existing, ok := idx.Targets[targetKey][task.VPath]; ok {
				if existing.Size == fileInfo.Size() && existing.ModTime == fileInfo.ModTime().Unix() {
					logger.Debug("   [Skipped] %s (Unchanged — already on remote)", task.VPath)
					skipped++
					// Even skipped files should be deleted from source since they're confirmed on remote
					successfulMoves = append(successfulMoves, task.LocalPath)
					continue
				}
			}
		}

		logger.Info("[%d/%d] %s (%d bytes)", i+1, len(filesToMove), task.VPath, fileInfo.Size())

		f, err := os.Open(task.LocalPath)
		if err != nil {
			logger.Error("      Error: %v", err)
			errors++
			continue
		}

		chunks, err := engine.ProcessStreamCtx(ctx, target.ChatID, target.ThreadID, filepath.Base(task.VPath), f, opts.Password)
		f.Close()
		if err != nil {
			logger.Error("      Upload Failed: %v", err)
			errors++
			continue
		}

		idx.Targets[targetKey][task.VPath] = &models.FileEntry{
			Size:    fileInfo.Size(),
			ModTime: fileInfo.ModTime().Unix(),
			Chunks:  chunks,
		}
		idx.Version++
		uploaded++
		successfulMoves = append(successfulMoves, task.LocalPath)
		logger.Debug("      Success! %d chunks uploaded", len(chunks))
	}

	logger.Success("=> Upload Summary: %d Uploaded, %d Skipped, %d Errors", uploaded, skipped, errors)

commit:
	// 8. Commit index BEFORE deleting source — this is the critical safety guarantee
	logger.Step("=> Committing new index to Telegram...")
	if err := mgr.PushVersion(idx); err != nil {
		logger.Error("=> CRITICAL: Index commit failed. Source files will NOT be deleted to prevent data loss.")
		return fmt.Errorf("failed to push index: %v", err)
	}

	// 9. Delete source files only after successful index commit
	logger.Step("=> Removing %d source files...", len(successfulMoves))
	var deleteErrors int
	for _, localPath := range successfulMoves {
		if err := os.Remove(localPath); err != nil {
			logger.Error("   [Error] Failed to remove %s: %v", localPath, err)
			deleteErrors++
		} else {
			logger.Debug("   [Deleted] %s", localPath)
		}
	}

	// Clean up empty directories if source was a directory
	if info.IsDir() {
		cleanEmptyDirs(source)
	}

	if deleteErrors > 0 {
		logger.Warn("=> %d files could not be deleted from source.", deleteErrors)
	}

	logger.Success("=> Move operation completed: %d files transferred, %d source files removed.", uploaded+skipped, len(successfulMoves)-deleteErrors)
	return nil
}

// cleanEmptyDirs walks a directory tree bottom-up and removes any empty directories.
func cleanEmptyDirs(root string) {
	var dirs []string
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err == nil && info.IsDir() {
			dirs = append(dirs, path)
		}
		return nil
	})

	// Walk in reverse (deepest first) to clean up empty leaf directories
	for i := len(dirs) - 1; i >= 0; i-- {
		entries, err := os.ReadDir(dirs[i])
		if err == nil && len(entries) == 0 {
			os.Remove(dirs[i])
			logger.Debug("   [Cleaned] Empty dir: %s", dirs[i])
		}
	}
}
