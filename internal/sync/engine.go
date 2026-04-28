package sync

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// SyncEngine orchestrates parallel file diffing and upload transfers.
type SyncEngine struct {
	client     *telegram.Client
	idxManager *index.Manager
	chunker    *chunker.Engine
	cfg        *models.Config
	opts       *models.TransferOptions
}

type fileTask struct {
	LocalPath   string
	VirtualPath string
	FileInfo    os.FileInfo
}

// NewSyncEngine creates a sync engine using explicit TransferOptions instead of globals.
func NewSyncEngine(opts *models.TransferOptions) (*SyncEngine, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %v", err)
	}

	client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)

	if opts.AutoUpgradeChunk && !strings.Contains(client.APIHost, "api.telegram.org") {
		logger.Info("   [Auto-Detect] Local API detected. Upgrading chunk size from 49M to 1999M limit.")
		opts.ChunkSize = 1999 * 1024 * 1024
	}

	idxManager, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return nil, err
	}

	return &SyncEngine{
		client:     client,
		idxManager: idxManager,
		chunker:    chunker.NewEngineWithSize(client, opts.MediaMode, opts.ChunkSize),
		cfg:        cfg,
		opts:       opts,
	}, nil
}

// Run executes the sync operation with context support for graceful shutdown.
func (s *SyncEngine) Run(ctx context.Context, source, targetRaw string) error {
	parts := strings.SplitN(targetRaw, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid target format. Use alias:virtual/path")
	}
	alias, virtualRoot := parts[0], parts[1]

	target, ok := s.cfg.Targets[alias]
	if !ok {
		return fmt.Errorf("target alias '%s' not found", alias)
	}

	// Acquire distributed lock
	if err := s.idxManager.AcquireLock("", "sync"); err != nil {
		return fmt.Errorf("failed to acquire lock: %v", err)
	}
	defer s.idxManager.ReleaseLock()

	idx, err := s.idxManager.Load()
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

	// 1. Gather files
	var localFiles []fileTask
	info, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source error: %v", err)
	}

	if info.IsDir() {
		filepath.Walk(source, func(path string, fInfo os.FileInfo, err error) error {
			if !fInfo.IsDir() {
				rel, _ := filepath.Rel(source, path)
				vPath := fmt.Sprintf("%s/%s", strings.TrimRight(virtualRoot, "/"), strings.ReplaceAll(rel, "\\", "/"))
				localFiles = append(localFiles, fileTask{
					LocalPath:   path,
					VirtualPath: strings.TrimLeft(vPath, "/"),
					FileInfo:    fInfo,
				})
			}
			return nil
		})
	} else {
		vPath := fmt.Sprintf("%s/%s", strings.TrimRight(virtualRoot, "/"), filepath.Base(source))
		localFiles = append(localFiles, fileTask{
			LocalPath:   source,
			VirtualPath: strings.TrimLeft(vPath, "/"),
			FileInfo:    info,
		})
	}

	logger.Step("=> Diffing %d local files against virtual index (Checkers: %d)...", len(localFiles), s.opts.Checkers)

	// 2. Diffing Pipeline (Checkers)
	tasksChan := make(chan fileTask, len(localFiles))
	uploadChan := make(chan fileTask, len(localFiles))

	var skipped atomic.Int32

	var wgCheck sync.WaitGroup
	for i := 0; i < s.opts.Checkers; i++ {
		wgCheck.Add(1)
		go func() {
			defer wgCheck.Done()
			for task := range tasksChan {
				needsUpload := true
				if !s.opts.Force {
					if existing, ok := idx.Targets[targetKey][task.VirtualPath]; ok {
						if existing.Size == task.FileInfo.Size() && existing.ModTime == task.FileInfo.ModTime().Unix() {
							needsUpload = false
							skipped.Add(1)
							logger.Debug("   [Skipped] %s (Unchanged)", task.VirtualPath)
						}
					}
				}
				if needsUpload {
					uploadChan <- task
				}
			}
		}()
	}

	for _, t := range localFiles {
		tasksChan <- t
	}
	close(tasksChan)
	wgCheck.Wait()
	close(uploadChan)

	var uploadList []fileTask
	for t := range uploadChan {
		uploadList = append(uploadList, t)
	}

	if len(uploadList) == 0 {
		logger.Success("=> Target is perfectly in sync. Nothing to do (Skipped %d files).", skipped.Load())
		return nil
	}

	// Dry-run mode: report what would be uploaded without mutating state
	if s.opts.DryRun {
		logger.Info("=> [DRY RUN] Would upload %d files:", len(uploadList))
		for _, t := range uploadList {
			logger.Info("   %s (%d bytes)", t.VirtualPath, t.FileInfo.Size())
		}
		return nil
	}

	logger.Step("=> Enqueueing %d files for transfer (Workers: %d)...", len(uploadList), s.opts.Transfers)

	// 3. Upload Pipeline (Transfers)
	transferChan := make(chan fileTask, len(uploadList))
	var wgTransfer sync.WaitGroup
	var idxMutex sync.Mutex

	var uploaded atomic.Int32
	var errors atomic.Int32
	totalToUpload := int32(len(uploadList))

	for i := 0; i < s.opts.Transfers; i++ {
		wgTransfer.Add(1)
		go func() {
			defer wgTransfer.Done()
			for task := range transferChan {
				// Check for cancellation
				select {
				case <-ctx.Done():
					return
				default:
				}

				current := uploaded.Add(1)
				logger.Info("[%d/%d] %s (%d bytes)", current, totalToUpload, task.VirtualPath, task.FileInfo.Size())

				f, err := os.Open(task.LocalPath)
				if err != nil {
					logger.Error("      [Error] Failed to open %s: %v", task.LocalPath, err)
					errors.Add(1)
					continue
				}

				chunks, err := s.chunker.ProcessStreamCtx(ctx, target.ChatID, target.ThreadID, filepath.Base(task.VirtualPath), f, s.opts.Password)
				f.Close()
				if err != nil {
					logger.Error("      [Error] Upload Failed for %s: %v", task.VirtualPath, err)
					errors.Add(1)
					continue
				}

				// Thread-safe index update
				idxMutex.Lock()
				idx.Targets[targetKey][task.VirtualPath] = &models.FileEntry{
					Size:    task.FileInfo.Size(),
					ModTime: task.FileInfo.ModTime().Unix(),
					Chunks:  chunks,
				}
				idx.Version++
				idxMutex.Unlock()
				logger.Debug("      Success! %d chunks uploaded for %s", len(chunks), task.VirtualPath)
			}
		}()
	}

	for _, t := range uploadList {
		transferChan <- t
	}
	close(transferChan)
	wgTransfer.Wait()

	// Check if we were cancelled
	if ctx.Err() != nil {
		logger.Warn("=> Sync interrupted. Saving partial progress...")
	}

	logger.Success("=> Sync Summary: %d Uploaded, %d Skipped, %d Errors", uploaded.Load()-errors.Load(), skipped.Load(), errors.Load())

	logger.Step("=> Committing new index to Telegram...")
	if err := s.idxManager.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to commit index: %v", err)
	}

	logger.Success("=> Sync operation completed successfully.")
	return nil
}
