package core

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// DeleteOptions configures the behavior of the delete/purge command.
type DeleteOptions struct {
	Recursive bool // If true, deletes files in subdirectories (purge behavior)
	DryRun    bool // If true, shows what would be deleted without mutating state
	Confirm   bool // If true, bypasses interactive confirmation (used by purge)
	Transfers int  // Parallelism for physical deletion
}

// RunDelete handles the deletion of files from the virtual index and physically deletes the Telegram messages.
func RunDelete(ctx context.Context, targetRaw string, opts *DeleteOptions) error {
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
		return fmt.Errorf("target alias '%s' not found", alias)
	}

	// 3. API Connectivity Check
	logger.Step("=> Initializing API Client...")
	client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)
	me, err := client.GetMeCtx(ctx)
	if err != nil {
		return fmt.Errorf("API connectivity failed: %v", err)
	}
	logger.Debug("   Connected as: %s", me["first_name"])

	// 4. Initialize Index Manager
	mgr, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return err
	}

	// We lock the index early because we are mutating state (unlike download which is read-only)
	if !opts.DryRun {
		if err := mgr.AcquireLock("", "delete"); err != nil {
			return fmt.Errorf("failed to acquire lock: %v", err)
		}
		defer mgr.ReleaseLock()
	}

	logger.Step("=> Loading Virtual Index...")
	idx, err := mgr.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	targetKey := target.ChatID
	if target.ThreadID != "" {
		targetKey += ":" + target.ThreadID
	}

	targetFiles, ok := idx.Targets[targetKey]
	if !ok || len(targetFiles) == 0 {
		logger.Success("=> Nothing to delete (target is empty).")
		return nil
	}

	// 5. Match files based on scope (recursive vs non-recursive)
	virtualPrefix := strings.TrimLeft(virtualRoot, "/")
	
	// If virtualPrefix is empty, it means they are targeting the root of the alias.
	// For 'delete' (non-recursive), we only match files at the root (no slashes in path).
	// For 'purge' (recursive), we match everything.
	var matchedPaths []string
	var totalBytes int64
	var totalChunks int

	for vPath, entry := range targetFiles {
		// Exact file match
		if vPath == virtualPrefix {
			matchedPaths = append(matchedPaths, vPath)
			totalBytes += entry.Size
			totalChunks += len(entry.Chunks)
			continue
		}

		// Prefix match
		dirPrefix := virtualPrefix
		if dirPrefix != "" && !strings.HasSuffix(dirPrefix, "/") {
			dirPrefix += "/"
		}

		if strings.HasPrefix(vPath, dirPrefix) {
			if !opts.Recursive {
				// Non-recursive: check if there are any additional subdirectories
				relPath := strings.TrimPrefix(vPath, dirPrefix)
				if strings.Contains(relPath, "/") {
					continue // It's in a subdirectory, skip it
				}
			}
			matchedPaths = append(matchedPaths, vPath)
			totalBytes += entry.Size
			totalChunks += len(entry.Chunks)
		}
	}

	if len(matchedPaths) == 0 {
		logger.Success("=> Nothing to delete (no files matched path '%s').", virtualPrefix)
		return nil
	}

	logger.Step("=> Found %d files (%d chunks, %d bytes) to delete", len(matchedPaths), totalChunks, totalBytes)

	if opts.DryRun {
		logger.Info("=> [DRY RUN] Would delete the following files:")
		for _, vPath := range matchedPaths {
			logger.Info("   - %s (%d bytes)", vPath, targetFiles[vPath].Size)
		}
		return nil
	}

	// 6. Interactive Confirmation (for Purge or large deletes if desired)
	if !opts.Confirm {
		var resp string
		fmt.Printf("\nWARNING: You are about to permanently delete %d files.\n", len(matchedPaths))
		fmt.Printf("Are you sure you want to proceed? (y/N): ")
		fmt.Scanln(&resp)
		resp = strings.ToLower(strings.TrimSpace(resp))
		if resp != "y" && resp != "yes" {
			logger.Warn("=> Deletion aborted by user.")
			return nil
		}
	}

	// 7. Collect chunks for physical deletion before we wipe them from the index
	type deleteJob struct {
		vPath string
		msgID int64
	}
	
	jobChan := make(chan deleteJob, totalChunks)
	for _, vPath := range matchedPaths {
		for _, chunk := range targetFiles[vPath].Chunks {
			jobChan <- deleteJob{vPath: vPath, msgID: chunk.TGMsgID}
		}
	}
	close(jobChan)

	// 8. Update Virtual Index (Remove matched paths) FIRST to ensure atomic safety.
	// If the user interrupts physical deletion, we leave garbage chunks on Telegram
	// but the index remains perfectly healthy and uncorrupted.
	logger.Step("=> Updating Virtual Index...")
	for _, vPath := range matchedPaths {
		delete(idx.Targets[targetKey], vPath)
	}
	idx.Version++

	logger.Step("=> Committing new index to Telegram...")
	if err := mgr.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to commit index: %v", err)
	}

	// 9. Physical Deletion Pipeline
	logger.Step("=> Physically deleting chunks from Telegram...")

	var wg sync.WaitGroup
	var deletedChunks atomic.Int32
	var failedChunks atomic.Int32

	// Use parallel workers to send DeleteMessage requests
	for i := 0; i < opts.Transfers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobChan {
				select {
				case <-ctx.Done():
					return
				default:
				}
				
				// Delete physical message
				err := client.DeleteMessage(target.ChatID, job.msgID)
				if err != nil {
					// Ignore "message to delete not found" as it means it's already gone
					if !strings.Contains(err.Error(), "message to delete not found") {
						logger.Debug("   [Warning] Failed to delete chunk msg_id=%d: %v", job.msgID, err)
						failedChunks.Add(1)
						continue
					}
				}
				deletedChunks.Add(1)
			}
		}()
	}
	wg.Wait()

	// Check if context was cancelled during deletion
	if ctx.Err() != nil {
		logger.Warn("=> Physical deletion interrupted! Some garbage chunks may remain on Telegram, but the virtual index is safely synced.")
		return fmt.Errorf("operation cancelled: %w", ctx.Err())
	}

	logger.Success("=> Deletion Summary: %d files removed (%d chunks deleted physically, %d failed).", len(matchedPaths), deletedChunks.Load(), failedChunks.Load())
	return nil
}
