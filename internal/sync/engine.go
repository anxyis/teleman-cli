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
	"github.com/teleman-cli/teleman/internal/core"
	"github.com/teleman-cli/teleman/internal/ignore"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/progress"
)

// SyncEngine orchestrates parallel file diffing and upload transfers.
type SyncEngine struct {
	opts *models.TransferOptions
}

type fileTask struct {
	LocalPath   string
	VirtualPath string
	FileInfo    os.FileInfo
}

// NewSyncEngine creates a sync engine using explicit TransferOptions instead of globals.
func NewSyncEngine(opts *models.TransferOptions) (*SyncEngine, error) {
	return &SyncEngine{
		opts: opts,
	}, nil
}

// Run executes the sync operation with context support for graceful shutdown.
func (s *SyncEngine) Run(ctx context.Context, source, targetRaw string) error {
	tctx, err := core.InitContext(ctx, targetRaw, s.opts)
	if err != nil {
		return err
	}

	engine := chunker.NewEngineWithSize(tctx.Client, s.opts.MediaMode, s.opts.ChunkSize)

	// Acquire distributed lock
	if err := tctx.IdxManager.AcquireLock("", "sync"); err != nil {
		return fmt.Errorf("failed to acquire lock: %v", err)
	}
	defer tctx.IdxManager.ReleaseLock()

	idx, err := tctx.IdxManager.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	if idx.Targets[tctx.TargetKey] == nil {
		idx.Targets[tctx.TargetKey] = make(map[string]*models.FileEntry)
	}

	// Load .telemanignore
	ignorer := ignore.Load(source)
	if ignorer.Loaded {
		logger.Info("=> Using .telemanignore rules")
	}

	// 1. Gather files
	var localFiles []fileTask
	info, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source error: %v", err)
	}

	if info.IsDir() {
		filepath.Walk(source, func(path string, fInfo os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(source, path)
			if rel == "." {
				return nil
			}

			if ignorer.IsIgnored(rel) {
				logger.Debug("   [Skipped by ignore] %s", rel)
				if fInfo.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			if !fInfo.IsDir() {
				vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), strings.ReplaceAll(rel, "\\", "/"))
				localFiles = append(localFiles, fileTask{
					LocalPath:   path,
					VirtualPath: strings.TrimLeft(vPath, "/"),
					FileInfo:    fInfo,
				})
			}
			return nil
		})
	} else {
		rel := filepath.Base(source)
		if !ignorer.IsIgnored(rel) {
			vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), filepath.Base(source))
			localFiles = append(localFiles, fileTask{
				LocalPath:   source,
				VirtualPath: strings.TrimLeft(vPath, "/"),
				FileInfo:    info,
			})
		} else {
			logger.Debug("   [Skipped by ignore] %s", rel)
		}
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
					if existing, ok := idx.Targets[tctx.TargetKey][task.VirtualPath]; ok {
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

	pm := progress.NewManager(ctx, len(uploadList), "Syncing")

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

				uploaded.Add(1)

				if !pm.IsTTY() {
					logger.Info("[%d/%d] %s (%d bytes)", uploaded.Load(), len(uploadList), task.VirtualPath, task.FileInfo.Size())
				}

				f, err := os.Open(task.LocalPath)
				if err != nil {
					logger.Error("      [Error] Failed to open %s: %v", task.LocalPath, err)
					errors.Add(1)
					pm.IncrementOverall()
					continue
				}

				bar := pm.AddFileBar(task.VirtualPath, task.FileInfo.Size())
				readerProxy := pm.ProxyReader(f, bar)

				chunks, err := engine.ProcessStreamCtx(ctx, tctx.Target.ChatID, tctx.Target.ThreadID, filepath.Base(task.VirtualPath), readerProxy, s.opts.Password, s.opts.Caption)

				if rc, ok := readerProxy.(interface{ Close() error }); ok {
					rc.Close()
				}

				pm.IncrementOverall()

				if err != nil {
					if bar != nil {
						bar.Abort(true)
					}
					logger.Error("      [Error] Upload Failed for %s: %v", task.VirtualPath, err)
					errors.Add(1)
					continue
				}

				// Thread-safe index update
				idxMutex.Lock()
				idx.Targets[tctx.TargetKey][task.VirtualPath] = &models.FileEntry{
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
	pm.Wait()

	// Check if we were cancelled
	if ctx.Err() != nil {
		logger.Warn("=> Sync interrupted. Saving partial progress...")
	}

	logger.Success("=> Sync Summary: %d Uploaded, %d Skipped, %d Errors", uploaded.Load()-errors.Load(), skipped.Load(), errors.Load())

	logger.Step("=> Committing new index to Telegram...")
	if err := tctx.IdxManager.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to commit index: %v", err)
	}

	logger.Success("=> Sync operation completed successfully.")
	if errors.Load() > 0 {
		return fmt.Errorf("completed with %d upload errors", errors.Load())
	}
	return nil
}
