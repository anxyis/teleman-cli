package core

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/progress"
	"sync"
)

// RunDownload handles downloading files from a virtual Telegram target to the local filesystem.
// It resolves the target alias, loads the namespaced index, matches virtual paths using safe
// prefix boundaries, and reassembles chunks via the chunker engine's verified pipeline.
// Accepts context for graceful shutdown and TransferOptions for consistent flag handling.
func RunDownload(ctx context.Context, targetRaw, localDest string, opts *models.TransferOptions) error {
	tctx, err := InitContext(ctx, targetRaw, opts)
	if err != nil {
		return err
	}

	engine := chunker.NewEngine(tctx.Client, false) // mediaMode irrelevant for download

	logger.Step("=> Loading Virtual Index...")
	idx, err := tctx.IdxManager.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	targetFiles, ok := idx.Targets[tctx.TargetKey]
	if !ok || len(targetFiles) == 0 {
		logger.Info("(No files found in target)")
		return nil
	}

	// 6. Match files using safe prefix matching
	// Avoids partial prefix collisions (e.g. "media" should NOT match "media_test/file.txt")
	virtualPrefix := strings.TrimLeft(tctx.VirtualRoot, "/")
	var matchedPaths []string
	var anyEncrypted bool

	for vPath := range targetFiles {
		if matchesVirtualPrefix(vPath, virtualPrefix) {
			matchedPaths = append(matchedPaths, vPath)
			
			if !anyEncrypted {
				for _, chunk := range targetFiles[vPath].Chunks {
					if chunk.Encrypted {
						anyEncrypted = true
						break
					}
				}
			}
		}
	}

	// Sort matched paths for deterministic output
	sort.Strings(matchedPaths)

	if len(matchedPaths) == 0 {
		logger.Info("(No files matched path '%s')", virtualPrefix)
		return nil
	}

	logger.Step("=> Found %d files to download", len(matchedPaths))

	if anyEncrypted && len(opts.Password) == 0 && opts.PasswordCallback != nil {
		pwd, err := opts.PasswordCallback()
		if err != nil {
			return fmt.Errorf("failed to resolve password: %v", err)
		}
		opts.Password = pwd
	}

	// Dry-run mode
	if opts.DryRun {
		logger.Info("=> [DRY RUN] Would download %d files:", len(matchedPaths))
		for _, vPath := range matchedPaths {
			entry := targetFiles[vPath]
			logger.Info("   %s (%d bytes, %d chunks)", vPath, entry.Size, len(entry.Chunks))
		}
		return nil
	}

	// 7. Download pipeline
	var downloaded, errors int
	var mu sync.Mutex

	pm := progress.NewManager(ctx, len(matchedPaths), "Downloading")

	concurrency := opts.Transfers
	if concurrency <= 0 {
		concurrency = 4
	}
	if concurrency > len(matchedPaths) {
		concurrency = len(matchedPaths)
	}

	jobs := make(chan string, len(matchedPaths))
	for _, vPath := range matchedPaths {
		jobs <- vPath
	}
	close(jobs)

	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for vPath := range jobs {
				// Check for cancellation between files
				select {
				case <-ctx.Done():
					return
				default:
				}

				entry := targetFiles[vPath]

				// Determine local path relative to the prefix
				relPath := vPath
				if virtualPrefix != "" {
					relPath = strings.TrimPrefix(vPath, virtualPrefix)
					relPath = strings.TrimLeft(relPath, "/")
				}
				// If the user targeted a single file (relPath is now empty), use the filename
				if relPath == "" {
					relPath = filepath.Base(vPath)
				}

				if !isValidDownloadPath(relPath) {
					logger.Error("      [Error] Path traversal detected: %s", relPath)
					mu.Lock()
					errors++
					mu.Unlock()
					pm.IncrementOverall()
					continue
				}

				localPath := filepath.Join(localDest, filepath.FromSlash(relPath))

				// Create parent directories
				if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
					logger.Error("      [Error] Failed to create directory for %s: %v", localPath, err)
					mu.Lock()
					errors++
					mu.Unlock()
					pm.IncrementOverall()
					continue
				}

				if !pm.IsTTY() {
					logger.Info("Downloading: %s (%d bytes, %d chunks)", vPath, entry.Size, len(entry.Chunks))
				}

				// Write to a temp file first, then rename on success.
				// This leaves a clean .partial file on failure, making future resume trivial.
				tmpPath := localPath + ".partial"

				bar := pm.AddFileBar(vPath, entry.Size)
				var progressTracker io.Writer
				if bar != nil {
					progressTracker = progress.NewBarWriter(bar)
				}

				if err := DownloadFile(ctx, engine, entry, tmpPath, opts.Password, progressTracker); err != nil {
					if bar != nil {
						bar.Abort(true)
					}
					logger.Error("      [Error] %v", err)
					mu.Lock()
					errors++
					mu.Unlock()
					pm.IncrementOverall()
					continue
				}

				// Ensure bar completes before incrementing overall
				if bar != nil {
					bar.SetTotal(entry.Size, true)
				}

				// Atomic rename from .partial to final destination
				if err := os.Rename(tmpPath, localPath); err != nil {
					logger.Error("      [Error] Failed to finalize %s: %v", localPath, err)
					// Clean up partial file on rename failure
					os.Remove(tmpPath)
					mu.Lock()
					errors++
					mu.Unlock()
					pm.IncrementOverall()
					continue
				}

				mu.Lock()
				downloaded++
				mu.Unlock()
				pm.IncrementOverall()
				logger.Debug("      Success! %s", localPath)
			}
		}()
	}

	wg.Wait()

	if ctx.Err() != nil {
		logger.Warn("=> Download interrupted.")
	}

	pm.Wait()
	logger.Success("=> Download Summary: %d Downloaded, %d Errors", downloaded, errors)
	return nil
}

// DownloadFile creates a file at the given path and streams reassembled chunks into it.
func DownloadFile(ctx context.Context, engine *chunker.Engine, entry *models.FileEntry, destPath string, password []byte, progressTracker io.Writer) error {
	// Open file in RDWR mode, create if it doesn't exist
	f, err := os.OpenFile(destPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return fmt.Errorf("failed to open file %s: %v", destPath, err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat file: %v", err)
	}
	currentSize := info.Size()

	// 1. Sort chunks by offset to properly map them
	sorted := make([]*models.ChunkEntry, len(entry.Chunks))
	copy(sorted, entry.Chunks)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Offset < sorted[j].Offset
	})

	var chunksToDownload []*models.ChunkEntry
	var startOffset int64 = 0

	for i, chunk := range sorted {
		chunkEnd := entry.Size
		if i < len(sorted)-1 {
			chunkEnd = sorted[i+1].Offset
		}

		if currentSize >= chunkEnd {
			// Chunk is fully downloaded, we can safely resume past it
			startOffset = chunkEnd
		} else {
			// Chunk is partially or not downloaded, need to resume from this chunk
			chunksToDownload = append(chunksToDownload, chunk)
		}
	}

	// Truncate back to the nearest safe chunk boundary to discard incomplete chunk writes
	if err := f.Truncate(startOffset); err != nil {
		return fmt.Errorf("failed to truncate partial file: %v", err)
	}
	if _, err := f.Seek(startOffset, io.SeekStart); err != nil {
		return fmt.Errorf("failed to seek partial file: %v", err)
	}

	// Advance progress bar by skipping the verified bytes
	if startOffset > 0 && progressTracker != nil {
		// Use a 1MB dummy buffer to fast-forward the progress bar
		// (io.Writer expects byte writes, but progress trackers just count them over io.Discard)
		dummy := make([]byte, 1024*1024)
		var written int64
		for written < startOffset {
			toWrite := int64(len(dummy))
			if startOffset-written < toWrite {
				toWrite = startOffset - written
			}
			progressTracker.Write(dummy[:toWrite])
			written += toWrite
		}
	}

	if len(chunksToDownload) == 0 {
		return nil
	}

	if err := engine.ReassembleStreamCtx(ctx, chunksToDownload, f, password, progressTracker); err != nil {
		return fmt.Errorf("reassembly failed: %v", err)
	}

	return nil
}

// matchesVirtualPrefix performs safe prefix matching that respects path segment boundaries.
// This prevents partial collisions like "media" matching "media_test/file.txt".
//
// Rules:
//   - Empty prefix matches everything (list all files)
//   - Exact match always succeeds (single file download)
//   - Prefix must align to a '/' boundary in the candidate path
func matchesVirtualPrefix(candidatePath, prefix string) bool {
	if prefix == "" {
		return true
	}

	// Exact match (single file)
	if candidatePath == prefix {
		return true
	}

	// Ensure prefix ends with "/" for directory-style matching
	dirPrefix := prefix
	if !strings.HasSuffix(dirPrefix, "/") {
		dirPrefix += "/"
	}

	return strings.HasPrefix(candidatePath, dirPrefix)
}

// isValidDownloadPath checks if a relative path is safe to use for downloading.
// It prevents path traversal attacks (e.g. Zip Slip) where a virtual file
// could be named "../../etc/passwd" to escape the intended destination directory.
func isValidDownloadPath(relPath string) bool {
	// Convert Windows-style separators to Unix-style for cross-platform validation
	// if a malicious index contains backslashes.
	normalized := strings.ReplaceAll(relPath, "\\", "/")
	if strings.HasPrefix(normalized, "/") {
		return false
	}
	cleanPath := filepath.Clean(filepath.FromSlash(normalized))
	if cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(filepath.Separator)) || filepath.IsAbs(cleanPath) {
		return false
	}
	return true
}
