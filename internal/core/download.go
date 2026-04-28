package core

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// RunDownload handles downloading files from a virtual Telegram target to the local filesystem.
// It resolves the target alias, loads the namespaced index, matches virtual paths using safe
// prefix boundaries, and reassembles chunks via the chunker engine's verified pipeline.
// Accepts context for graceful shutdown and TransferOptions for consistent flag handling.
func RunDownload(ctx context.Context, targetRaw, localDest string, opts *models.TransferOptions) error {
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
	me, err := client.GetMeCtx(ctx)
	if err != nil {
		return fmt.Errorf("API connectivity failed: %v", err)
	}
	logger.Debug("   Connected as: %s", me["first_name"])

	// 4. Initialize Index & Chunker Engine
	mgr, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return err
	}
	engine := chunker.NewEngine(client, false) // mediaMode irrelevant for download

	logger.Step("=> Loading Virtual Index...")
	idx, err := mgr.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	// 5. Resolve namespaced target key
	targetKey := target.ChatID
	if target.ThreadID != "" {
		targetKey += ":" + target.ThreadID
	}

	targetFiles, ok := idx.Targets[targetKey]
	if !ok || len(targetFiles) == 0 {
		logger.Info("(No files found in target '%s')", alias)
		return nil
	}

	// 6. Match files using safe prefix matching
	// Avoids partial prefix collisions (e.g. "media" should NOT match "media_test/file.txt")
	virtualPrefix := strings.TrimLeft(virtualRoot, "/")
	var matchedPaths []string

	for vPath := range targetFiles {
		if matchesVirtualPrefix(vPath, virtualPrefix) {
			matchedPaths = append(matchedPaths, vPath)
		}
	}

	// Sort matched paths for deterministic output
	sort.Strings(matchedPaths)

	if len(matchedPaths) == 0 {
		logger.Info("(No files matched path '%s')", virtualPrefix)
		return nil
	}

	logger.Step("=> Found %d files to download", len(matchedPaths))

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
	for i, vPath := range matchedPaths {
		// Check for cancellation between files
		select {
		case <-ctx.Done():
			logger.Warn("=> Download interrupted after %d/%d files.", i, len(matchedPaths))
			logger.Success("=> Download Summary: %d Downloaded, %d Errors", downloaded, errors)
			return fmt.Errorf("download cancelled: %w", ctx.Err())
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

		localPath := filepath.Join(localDest, filepath.FromSlash(relPath))

		// Create parent directories
		if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
			logger.Error("      [Error] Failed to create directory for %s: %v", localPath, err)
			errors++
			continue
		}

		logger.Info("[%d/%d] %s (%d bytes, %d chunks)", i+1, len(matchedPaths), vPath, entry.Size, len(entry.Chunks))

		// Write to a temp file first, then rename on success.
		// This leaves a clean .partial file on failure, making future resume trivial.
		tmpPath := localPath + ".partial"
		if err := downloadFile(ctx, engine, entry, tmpPath, opts.Password); err != nil {
			logger.Error("      [Error] %v", err)
			errors++
			continue
		}

		// Atomic rename from .partial to final destination
		if err := os.Rename(tmpPath, localPath); err != nil {
			logger.Error("      [Error] Failed to finalize %s: %v", localPath, err)
			// Clean up partial file on rename failure
			os.Remove(tmpPath)
			errors++
			continue
		}

		downloaded++
		logger.Debug("      Success! %s", localPath)
	}

	logger.Success("=> Download Summary: %d Downloaded, %d Errors", downloaded, errors)
	return nil
}

// downloadFile creates a file at the given path and streams reassembled chunks into it.
func downloadFile(ctx context.Context, engine *chunker.Engine, entry *models.FileEntry, destPath string, password []byte) error {
	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create file %s: %v", destPath, err)
	}
	defer f.Close()

	if err := engine.ReassembleStreamCtx(ctx, entry.Chunks, f, password); err != nil {
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
