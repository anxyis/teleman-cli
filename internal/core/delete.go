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
func RunDelete(ctx context.Context, targetsRaw []string, opts *DeleteOptions) error {
	if len(targetsRaw) == 0 {
		return fmt.Errorf("no targets specified")
	}

	// 1. Load config
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %v", err)
	}
	if cfg.ActiveToken == "" {
		return fmt.Errorf("no bot token found. Run 'teleman config' first")
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

	type deleteJob struct {
		targetKey string
		chatID    string
		vPath     string
		msgID     int64
	}
	
	var jobs []deleteJob
	var totalFiles int
	var totalBytes int64
	var totalChunks int

	// Parse all targets and accumulate matches
	for _, targetRaw := range targetsRaw {
		parts := strings.SplitN(targetRaw, ":", 2)
		if len(parts) != 2 {
			logger.Warn("=> Skipping invalid target format '%s'. Use alias:virtual/path", targetRaw)
			continue
		}
		alias, virtualRoot := parts[0], parts[1]

		target, ok := cfg.Targets[alias]
		if !ok {
			logger.Warn("=> Skipping unknown target alias '%s'", alias)
			continue
		}

		targetKey := target.ChatID
		if target.ThreadID != "" {
			targetKey += ":" + target.ThreadID
		}

		targetFiles, ok := idx.Targets[targetKey]
		if !ok || len(targetFiles) == 0 {
			continue // empty target
		}

		virtualPrefix := strings.TrimLeft(virtualRoot, "/")

		for vPath, entry := range targetFiles {
			// Exact file match
			if vPath == virtualPrefix {
				totalFiles++
				totalBytes += entry.Size
				totalChunks += len(entry.Chunks)
				for _, chunk := range entry.Chunks {
					jobs = append(jobs, deleteJob{targetKey: targetKey, chatID: target.ChatID, vPath: vPath, msgID: chunk.TGMsgID})
				}
				continue
			}

			// Prefix match
			dirPrefix := virtualPrefix
			if dirPrefix != "" && !strings.HasSuffix(dirPrefix, "/") {
				dirPrefix += "/"
			}

			if strings.HasPrefix(vPath, dirPrefix) {
				if !opts.Recursive {
					relPath := strings.TrimPrefix(vPath, dirPrefix)
					if strings.Contains(relPath, "/") {
						continue // It's in a subdirectory, skip it
					}
				}
				totalFiles++
				totalBytes += entry.Size
				totalChunks += len(entry.Chunks)
				for _, chunk := range entry.Chunks {
					jobs = append(jobs, deleteJob{targetKey: targetKey, chatID: target.ChatID, vPath: vPath, msgID: chunk.TGMsgID})
				}
			}
		}
	}

	if totalFiles == 0 {
		logger.Success("=> Nothing to delete (no files matched).")
		return nil
	}

	logger.Step("=> Found %d files (%d chunks, %d bytes) to delete across targets", totalFiles, totalChunks, totalBytes)

	if opts.DryRun {
		logger.Info("=> [DRY RUN] Would delete %d files", totalFiles)
		return nil
	}

	if !opts.Confirm {
		var resp string
		fmt.Printf("\nWARNING: You are about to permanently delete %d files.\n", totalFiles)
		fmt.Printf("Are you sure you want to proceed? (y/N): ")
		fmt.Scanln(&resp)
		resp = strings.ToLower(strings.TrimSpace(resp))
		if resp != "y" && resp != "yes" {
			logger.Warn("=> Deletion aborted by user.")
			return nil
		}
	}

	jobChan := make(chan deleteJob, len(jobs))
	for _, job := range jobs {
		jobChan <- job
	}
	close(jobChan)

	logger.Step("=> Updating Virtual Index...")
	// Keep track of which files we've already deleted from idx (since multiple chunks map to same file)
	deletedFromIdx := make(map[string]bool)
	for _, job := range jobs {
		key := job.targetKey + ":" + job.vPath
		if !deletedFromIdx[key] {
			delete(idx.Targets[job.targetKey], job.vPath)
			deletedFromIdx[key] = true
		}
	}
	idx.Version++

	logger.Step("=> Committing new index to Telegram...")
	if err := mgr.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to commit index: %v", err)
	}

	logger.Step("=> Physically deleting chunks from Telegram...")
	var wg sync.WaitGroup
	var deletedChunks atomic.Int32
	var failedChunks atomic.Int32

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
				
				err := client.DeleteMessage(job.chatID, job.msgID)
				if err != nil {
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

	if ctx.Err() != nil {
		logger.Warn("=> Physical deletion interrupted! Virtual index is safely synced.")
		return fmt.Errorf("operation cancelled: %w", ctx.Err())
	}

	logger.Success("=> Deletion Summary: %d files removed (%d chunks deleted physically, %d failed).", totalFiles, deletedChunks.Load(), failedChunks.Load())
	return nil
}
