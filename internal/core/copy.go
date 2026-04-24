package core

import (
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

// RunCopy handles a minimal upload path for the given source and target
func RunCopy(source, targetRaw string, zipMode, mediaMode, force bool) error {
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
	client := telegram.NewClient(cfg.ActiveToken, cfg.CustomAPIHost)
	me, err := client.GetMe()
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

	// 5. Initialize Index & Engine
	mgr, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return err
	}
	engine := chunker.NewEngine(client, mediaMode)

	logger.Step("=> Loading Virtual Index...")
	idx, err := mgr.Load()
	if err != nil {
		return fmt.Errorf("failed to load index: %v", err)
	}

	// Validate source
	info, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source error: %v", err)
	}

	if zipMode {
		vPath := fmt.Sprintf("%s/%s.zip", strings.TrimRight(virtualRoot, "/"), filepath.Base(source))
		vPath = strings.TrimLeft(vPath, "/")
		
		logger.Step("=> Archiving '%s' on-the-fly to %s", source, vPath)
		logger.Info("   [Uploading] %s (Streaming Archive)...", vPath)

		r, err := chunker.StreamZip(source)
		if err != nil {
			return fmt.Errorf("failed to initialize zip stream: %v", err)
		}

		chunks, err := engine.ProcessStream(target.ChatID, target.ThreadID, filepath.Base(vPath), r, nil)
		if err != nil {
			return fmt.Errorf("upload failed: %v", err)
		}

		// Calculate simulated size and time from directory
		idx.Files[vPath] = &models.FileEntry{
			Size:    0, // Stream size isn't known until EOF, handled by chunks size sum
			ModTime: info.ModTime().Unix(),
			Chunks:  chunks,
		}
		
		// Update size to sum of chunks
		var totalSize int64
		for _, c := range chunks {
			totalSize += c.Size
		}
		idx.Files[vPath].Size = totalSize

		idx.Version++
		logger.Success("      Success! %d chunks uploaded (%d bytes)", len(chunks), totalSize)
	} else {
		var filesToUpload []string
		
		if info.IsDir() {
			filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
				if err == nil && !info.IsDir() {
					filesToUpload = append(filesToUpload, path)
				}
				return nil
			})
		} else {
			filesToUpload = append(filesToUpload, source)
		}

		logger.Step("=> Found %d files to sync", len(filesToUpload))

		var uploaded, skipped, errors int
		for i, localPath := range filesToUpload {
			relPath := filepath.Base(localPath)
			if info.IsDir() {
				rel, _ := filepath.Rel(source, localPath)
				relPath = rel
			}

			vPath := fmt.Sprintf("%s/%s", strings.TrimRight(virtualRoot, "/"), strings.ReplaceAll(relPath, "\\", "/"))
			vPath = strings.TrimLeft(vPath, "/")

			fileInfo, _ := os.Stat(localPath)
			if !force {
				if existing, ok := idx.Files[vPath]; ok {
					if existing.Size == fileInfo.Size() && existing.ModTime == fileInfo.ModTime().Unix() {
						logger.Debug("   [Skipped] %s (Unchanged)", vPath)
						skipped++
						continue
					}
				}
			}

			logger.Info("[%d/%d] %s (%d bytes)", i+1, len(filesToUpload), vPath, fileInfo.Size())

			f, err := os.Open(localPath)
			if err != nil {
				logger.Error("      Error: %v", err)
				errors++
				continue
			}

			chunks, err := engine.ProcessStream(target.ChatID, target.ThreadID, filepath.Base(vPath), f, nil)
			f.Close()
			if err != nil {
				logger.Error("      Upload Failed: %v", err)
				errors++
				continue
			}

			idx.Files[vPath] = &models.FileEntry{
				Size:    fileInfo.Size(),
				ModTime: fileInfo.ModTime().Unix(),
				Chunks:  chunks,
			}
			idx.Version++
			uploaded++
			logger.Debug("      Success! %d chunks uploaded", len(chunks))
		}
		logger.Success("=> Sync Summary: %d Uploaded, %d Skipped, %d Errors", uploaded, skipped, errors)
	}

	logger.Step("=> Committing new index to Telegram...")
	if err := mgr.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to push index: %v", err)
	}

	logger.Success("=> Copy operation completed successfully.")
	return nil
}
