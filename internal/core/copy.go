package core

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
)

// fileTask is a local struct used by the copy pipeline.
type copyFileTask struct {
	localPath   string
	virtualPath string
	fileInfo    os.FileInfo
}

// RunCopy handles a minimal upload path for the given source and target.
// Accepts explicit TransferOptions instead of relying on package globals.
//
// Lock acquisition is deferred until after a pre-flight diff confirms there
// is actual work to do. If all files are already in sync, the function returns
// without ever acquiring the distributed lock or committing a new index version.
func RunCopy(ctx context.Context, source, targetRaw string, opts *models.TransferOptions) error {
	tctx, err := InitContext(ctx, targetRaw, opts)
	if err != nil {
		return err
	}

	// Validate source exists
	info, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source error: %v", err)
	}

	engine := chunker.NewEngineWithSize(tctx.Client, opts.MediaMode, opts.ChunkSize)

	// ── Archive mode (--zip or --tgz) ────────────────────────────────────────
	// Archives are always a new upload — no pre-flight diff needed. Acquire the
	// lock immediately and proceed.
	if opts.ZipMode || opts.TgzMode {
		archiveExt := ".zip"
		archiveLabel := "zip"
		if opts.TgzMode {
			archiveExt = ".tar.gz"
			archiveLabel = "tar.gz"
		}

		vPath := fmt.Sprintf("%s/%s%s", strings.TrimRight(tctx.VirtualRoot, "/"), filepath.Base(source), archiveExt)
		vPath = strings.TrimLeft(vPath, "/")

		if opts.DryRun {
			logger.Info("=> [DRY RUN] Would archive '%s' as %s to %s", source, archiveLabel, vPath)
			return nil
		}

		// Acquire lock for the write path
		if err := tctx.IdxManager.AcquireLock("", "copy"); err != nil {
			return fmt.Errorf("failed to acquire lock: %v", err)
		}
		defer tctx.IdxManager.ReleaseLock()

		logger.Step("=> Loading Virtual Index...")
		idx, err := tctx.IdxManager.Load()
		if err != nil {
			return fmt.Errorf("failed to load index: %v", err)
		}
		if idx.Targets[tctx.TargetKey] == nil {
			idx.Targets[tctx.TargetKey] = make(map[string]*models.FileEntry)
		}

		logger.Step("=> Archiving '%s' on-the-fly (%s) to %s", source, archiveLabel, vPath)
		logger.Info("   [Uploading] %s (Streaming Archive)...", vPath)

		var r interface {
			Read(p []byte) (n int, err error)
		}
		if opts.TgzMode {
			r, err = chunker.StreamTgz(source)
		} else {
			r, err = chunker.StreamZip(source)
		}
		if err != nil {
			return fmt.Errorf("failed to initialize %s stream: %v", archiveLabel, err)
		}

		chunks, err := engine.ProcessStreamCtx(ctx, tctx.Target.ChatID, tctx.Target.ThreadID, filepath.Base(vPath), r, opts.Password, opts.Caption)
		if err != nil {
			return fmt.Errorf("upload failed: %v", err)
		}

		var totalSize int64
		for _, c := range chunks {
			totalSize += c.Size
		}
		idx.Targets[tctx.TargetKey][vPath] = &models.FileEntry{
			Size:    totalSize,
			ModTime: info.ModTime().Unix(),
			Chunks:  chunks,
		}
		idx.Version++
		logger.Success("      Success! %d chunks uploaded (%d bytes)", len(chunks), totalSize)

		logger.Step("=> Committing new index to Telegram...")
		if err := tctx.IdxManager.PushVersion(idx); err != nil {
			return fmt.Errorf("failed to push index: %v", err)
		}
		logger.Success("=> Copy operation completed successfully.")
		return nil
	}

	// ── Regular file copy ─────────────────────────────────────────────────────
	// Phase 1: pre-flight diff (no lock).
	// Load the index read-only to check which files need uploading. If nothing
	// has changed we return immediately — no lock acquired, no index committed.

	logger.Step("=> Loading Virtual Index...")
	idx, err := tctx.IdxManager.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}
	if idx.Targets[tctx.TargetKey] == nil {
		idx.Targets[tctx.TargetKey] = make(map[string]*models.FileEntry)
	}

	// Collect all source files
	var allFiles []copyFileTask
	if info.IsDir() {
		filepath.Walk(source, func(path string, fi os.FileInfo, err error) error {
			if err == nil && !fi.IsDir() {
				rel, _ := filepath.Rel(source, path)
				vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), strings.ReplaceAll(rel, "\\", "/"))
				vPath = strings.TrimLeft(vPath, "/")
				allFiles = append(allFiles, copyFileTask{localPath: path, virtualPath: vPath, fileInfo: fi})
			}
			return nil
		})
	} else {
		vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), filepath.Base(source))
		vPath = strings.TrimLeft(vPath, "/")
		allFiles = append(allFiles, copyFileTask{localPath: source, virtualPath: vPath, fileInfo: info})
	}

	logger.Step("=> Found %d files to sync", len(allFiles))

	// Dry-run: show what would be uploaded and exit (no lock needed)
	if opts.DryRun {
		// Count what actually needs uploading for an accurate dry-run
		var wouldUpload []copyFileTask
		for _, t := range allFiles {
			if !opts.Force {
				if existing, ok := idx.Targets[tctx.TargetKey][t.virtualPath]; ok {
					if existing.Size == t.fileInfo.Size() && existing.ModTime == t.fileInfo.ModTime().Unix() {
						continue
					}
				}
			}
			wouldUpload = append(wouldUpload, t)
		}
		if len(wouldUpload) == 0 {
			logger.Success("=> [DRY RUN] Nothing to upload — all %d files already in sync.", len(allFiles))
			return nil
		}
		logger.Info("=> [DRY RUN] Would upload %d files:", len(wouldUpload))
		for _, t := range wouldUpload {
			logger.Info("   %s (%d bytes)", t.virtualPath, t.fileInfo.Size())
		}
		return nil
	}

	// Pre-flight diff: parallel checker pool against the (unlocked) index snapshot
	preChan := make(chan copyFileTask, len(allFiles))
	preDoneChan := make(chan copyFileTask, len(allFiles))
	var preSkipped atomic.Int32

	var wgPre sync.WaitGroup
	for i := 0; i < opts.Checkers; i++ {
		wgPre.Add(1)
		go func() {
			defer wgPre.Done()
			for task := range preChan {
				if !opts.Force {
					if existing, ok := idx.Targets[tctx.TargetKey][task.virtualPath]; ok {
						if existing.Size == task.fileInfo.Size() && existing.ModTime == task.fileInfo.ModTime().Unix() {
							preSkipped.Add(1)
							logger.Debug("   [Skipped] %s (Unchanged)", task.virtualPath)
							continue
						}
					}
				}
				preDoneChan <- task
			}
		}()
	}
	for _, t := range allFiles {
		preChan <- t
	}
	close(preChan)
	wgPre.Wait()
	close(preDoneChan)

	var needsUpload []copyFileTask
	for t := range preDoneChan {
		needsUpload = append(needsUpload, t)
	}

	// ── Early exit: nothing to do ─────────────────────────────────────────────
	if len(needsUpload) == 0 {
		logger.Success("=> Already in sync. Nothing to do (Skipped %d files).", preSkipped.Load())
		return nil // No lock acquired, no index version committed.
	}

	// ── Actual work: acquire lock, reload index, re-diff, upload ─────────────
	// We reload the index under the lock so that any concurrent uploads from
	// another instance are respected (TOCTOU safety).
	if err := tctx.IdxManager.AcquireLock("", "copy"); err != nil {
		return fmt.Errorf("failed to acquire lock: %v", err)
	}
	defer tctx.IdxManager.ReleaseLock()

	// Reload index under lock to pick up any changes since our pre-flight read
	idx, err = tctx.IdxManager.Load()
	if err != nil {
		return fmt.Errorf("failed to reload index under lock: %v", err)
	}
	if idx.Targets[tctx.TargetKey] == nil {
		idx.Targets[tctx.TargetKey] = make(map[string]*models.FileEntry)
	}

	// Re-diff: filter the pre-flight upload list against the freshly-loaded index
	tasksChan := make(chan copyFileTask, len(needsUpload))
	uploadChan := make(chan copyFileTask, len(needsUpload))
	var reSkipped atomic.Int32

	var wgCheck sync.WaitGroup
	for i := 0; i < opts.Checkers; i++ {
		wgCheck.Add(1)
		go func() {
			defer wgCheck.Done()
			for task := range tasksChan {
				if !opts.Force {
					if existing, ok := idx.Targets[tctx.TargetKey][task.virtualPath]; ok {
						if existing.Size == task.fileInfo.Size() && existing.ModTime == task.fileInfo.ModTime().Unix() {
							reSkipped.Add(1)
							logger.Debug("   [Skipped] %s (Unchanged — updated by concurrent upload)", task.virtualPath)
							continue
						}
					}
				}
				uploadChan <- task
			}
		}()
	}
	for _, t := range needsUpload {
		tasksChan <- t
	}
	close(tasksChan)
	wgCheck.Wait()
	close(uploadChan)

	var uploadList []copyFileTask
	for t := range uploadChan {
		uploadList = append(uploadList, t)
	}

	totalSkipped := preSkipped.Load() + reSkipped.Load()

	if len(uploadList) == 0 {
		// Concurrent upload beat us to it — nothing left to do under the lock either
		logger.Success("=> Already in sync. Nothing to do (Skipped %d files).", totalSkipped)
		return nil
	}

	// Transfer pipeline — parallel uploads
	logger.Step("=> Enqueueing %d files for transfer (Workers: %d)...", len(uploadList), opts.Transfers)

	transferChan := make(chan copyFileTask, len(uploadList))
	var wgTransfer sync.WaitGroup
	var idxMutex sync.Mutex
	var uploaded atomic.Int32
	var uploadErrors atomic.Int32
	totalToUpload := int32(len(uploadList))

	for i := 0; i < opts.Transfers; i++ {
		wgTransfer.Add(1)
		go func() {
			defer wgTransfer.Done()
			for task := range transferChan {
				select {
				case <-ctx.Done():
					return
				default:
				}

				current := uploaded.Add(1)
				logger.Info("[%d/%d] %s (%d bytes)", current, totalToUpload, task.virtualPath, task.fileInfo.Size())

				f, err := os.Open(task.localPath)
				if err != nil {
					logger.Error("      Error: %v", err)
					uploadErrors.Add(1)
					continue
				}

				chunks, err := engine.ProcessStreamCtx(ctx, tctx.Target.ChatID, tctx.Target.ThreadID, filepath.Base(task.virtualPath), f, opts.Password, opts.Caption)
				f.Close()
				if err != nil {
					logger.Error("      Upload Failed: %v", err)
					uploadErrors.Add(1)
					continue
				}

				idxMutex.Lock()
				idx.Targets[tctx.TargetKey][task.virtualPath] = &models.FileEntry{
					Size:    task.fileInfo.Size(),
					ModTime: task.fileInfo.ModTime().Unix(),
					Chunks:  chunks,
				}
				idx.Version++
				idxMutex.Unlock()
				logger.Debug("      Success! %d chunks uploaded", len(chunks))
			}
		}()
	}

	for _, t := range uploadList {
		transferChan <- t
	}
	close(transferChan)
	wgTransfer.Wait()

	if ctx.Err() != nil {
		logger.Warn("=> Copy interrupted. Saving partial progress...")
	}

	successCount := uploaded.Load() - uploadErrors.Load()
	logger.Success("=> Sync Summary: %d Uploaded, %d Skipped, %d Errors", successCount, totalSkipped, uploadErrors.Load())

	logger.Step("=> Committing new index to Telegram...")
	if err := tctx.IdxManager.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to push index: %v", err)
	}

	logger.Success("=> Copy operation completed successfully.")
	return nil
}
