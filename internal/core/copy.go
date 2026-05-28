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
	"github.com/teleman-cli/teleman/internal/filter"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/progress"
)

// fileTask is a local struct used by the copy pipeline.
type copyFileTask struct {
	localPath   string
	virtualPath string
	fileInfo    os.FileInfo
}

// RunCopy handles a minimal upload path for the given sources and target.
// Accepts explicit TransferOptions instead of relying on package globals.
//
// Lock acquisition is deferred until after a pre-flight diff confirms there
// is actual work to do. If all files are already in sync, the function returns
// without ever acquiring the distributed lock or committing a new index version.
func RunCopy(ctx context.Context, sources []string, targetRaw string, opts *models.TransferOptions) error {
	tctx, err := InitContext(ctx, targetRaw, opts)
	if err != nil {
		return err
	}

	if len(sources) == 0 {
		return fmt.Errorf("no sources provided")
	}

	// Validate sources exist
	for _, source := range sources {
		if _, err := os.Stat(source); err != nil {
			return fmt.Errorf("source error: %v", err)
		}
	}

	engine := chunker.NewEngineWithSize(tctx.Client, opts.MediaMode, opts.ChunkSize, opts.AutoUpgradeChunk)

	// ── Archive mode (--zip or --tgz) ────────────────────────────────────────
	// Archives are always a new upload — no pre-flight diff needed. Acquire the
	// lock immediately and proceed.
	if opts.ZipMode || opts.TgzMode {
		if len(sources) > 1 {
			return fmt.Errorf("archive mode (--zip/--tgz) currently only supports a single source directory")
		}
		source := sources[0]
		
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

		pm := progress.NewManager(ctx, 1, "Archiving")
		defer pm.Wait()

		// For streaming archives, we might not know the final size in advance, so we pass 0
		// and it functions as a simple byte counter.
		bar := pm.AddFileBar(vPath, 0)
		readerProxy := pm.ProxyReader(r, bar)

		chunks, err := engine.ProcessStreamCtx(ctx, tctx.Target.ChatID, tctx.Target.ThreadID, filepath.Base(vPath), readerProxy, opts.Password, opts.Caption)

		if rc, ok := readerProxy.(interface{ Close() error }); ok {
			rc.Close()
		}
		pm.IncrementOverall()

		if err != nil {
			if bar != nil {
				bar.Abort(true)
			}
			return fmt.Errorf("upload failed: %v", err)
		}

		var totalSize int64
		for _, c := range chunks {
			totalSize += c.Size
		}
		info, _ := os.Stat(source)

		// Acquire lock for the write path now that upload is done
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
	vPathMap := make(map[string]string) // virtualPath -> localPath for collision detection

	for _, source := range sources {
		info, err := os.Stat(source)
		if err != nil {
			continue
		}

		pipeline, err := filter.BuildPipelineFromOptions(source, opts)
		if err != nil {
			logger.Warn("=> Failed to build filter pipeline for %s: %v", source, err)
			continue
		}

		if info.IsDir() {
			filepath.Walk(source, func(path string, fi os.FileInfo, err error) error {
				if err != nil {
					return nil
				}
				rel, _ := filepath.Rel(source, path)
				if rel == "." {
					return nil
				}

				shouldProcess, pErr := pipeline.ShouldProcess(rel, fi)
				if !shouldProcess {
					if opts.DryRun {
						_, reason := pipeline.EvaluateDryRun(rel, fi)
						logger.Debug("   [EXCLUDED] %s (matched: %s)", rel, reason)
					}
					if pErr == filepath.SkipDir {
						return filepath.SkipDir
					}
					return nil
				}
				if opts.DryRun && !fi.IsDir() {
					_, reason := pipeline.EvaluateDryRun(rel, fi)
					logger.Debug("   [INCLUDED] %s (matched: %s)", rel, reason)
				}

				if !fi.IsDir() {
					vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), strings.ReplaceAll(rel, "\\", "/"))
					vPath = strings.TrimLeft(vPath, "/")
					
					// Duplicate detection
					if existingLocal, exists := vPathMap[vPath]; exists {
						return fmt.Errorf("destination collision detected: both '%s' and '%s' map to the same virtual path '%s'", existingLocal, path, vPath)
					}
					vPathMap[vPath] = path
					
					allFiles = append(allFiles, copyFileTask{localPath: path, virtualPath: vPath, fileInfo: fi})
				}
				return nil
			})
		} else {
			rel := filepath.Base(source)
			shouldProcess, _ := pipeline.ShouldProcess(rel, info)
			if shouldProcess {
				vPath := fmt.Sprintf("%s/%s", strings.TrimRight(tctx.VirtualRoot, "/"), filepath.Base(source))
				vPath = strings.TrimLeft(vPath, "/")
				
				// Duplicate detection
				if existingLocal, exists := vPathMap[vPath]; exists {
					return fmt.Errorf("destination collision detected: both '%s' and '%s' map to the same virtual path '%s'", existingLocal, source, vPath)
				}
				vPathMap[vPath] = source
				
				if opts.DryRun {
					_, reason := pipeline.EvaluateDryRun(rel, info)
					logger.Debug("   [INCLUDED] %s (matched: %s)", rel, reason)
				}
				
				allFiles = append(allFiles, copyFileTask{localPath: source, virtualPath: vPath, fileInfo: info})
			} else {
				if opts.DryRun {
					_, reason := pipeline.EvaluateDryRun(rel, info)
					logger.Debug("   [EXCLUDED] %s (matched: %s)", rel, reason)
				}
			}
		}
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

	pm := progress.NewManager(ctx, len(uploadList), "Copying")

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

				uploaded.Add(1)

				if !pm.IsTTY() {
					// Fallback to simpler logs if no TTY
					logger.Info("[%d/%d] %s (%d bytes)", uploaded.Load(), len(uploadList), task.virtualPath, task.fileInfo.Size())
				}

				f, err := os.Open(task.localPath)
				if err != nil {
					logger.Error("      Error: %v", err)
					uploadErrors.Add(1)
					pm.IncrementOverall()
					continue
				}

				bar := pm.AddFileBar(task.virtualPath, task.fileInfo.Size())
				readerProxy := pm.ProxyReader(f, bar)

				chunks, err := engine.ProcessStreamCtx(ctx, tctx.Target.ChatID, tctx.Target.ThreadID, filepath.Base(task.virtualPath), readerProxy, opts.Password, opts.Caption)

				// Ensure proxy reader wraps things up nicely
				if rc, ok := readerProxy.(interface{ Close() error }); ok {
					rc.Close()
				}

				pm.IncrementOverall()

				if err != nil {
					if bar != nil {
						bar.Abort(true)
					}
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
	pm.Wait()

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
