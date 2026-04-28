package sync

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/teleman-cli/teleman/internal/chunker"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
	"sync/atomic"
)

type SyncEngine struct {
	client     *telegram.Client
	idxManager *index.Manager
	chunker    *chunker.Engine
	cfg        *models.Config

	optTransfers int
	optCheckers  int
	optZipMode   bool
	optMediaMode bool
	optForce     bool
}

type fileTask struct {
	LocalPath   string
	VirtualPath string
	FileInfo    os.FileInfo
}

func NewSyncEngine(transfers, checkers int, zipMode, mediaMode, force bool) (*SyncEngine, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %v", err)
	}

	client := telegram.NewClient(cfg.ActiveToken, cfg.CustomAPIHost)

	idxManager, err := index.NewManager(client, cfg.IndexChannelID)
	if err != nil {
		return nil, err
	}

	return &SyncEngine{
		client:       client,
		idxManager:   idxManager,
		chunker:      chunker.NewEngine(client, mediaMode),
		cfg:          cfg,
		optTransfers: transfers,
		optCheckers:  checkers,
		optZipMode:   zipMode,
		optMediaMode: mediaMode,
		optForce:     force,
	}, nil
}

func (s *SyncEngine) Run(source, targetRaw string) error {
	parts := strings.SplitN(targetRaw, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid target format. Use alias:virtual/path")
	}
	alias, virtualRoot := parts[0], parts[1]

	target, ok := s.cfg.Targets[alias]
	if !ok {
		return fmt.Errorf("target alias '%s' not found", alias)
	}

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

	logger.Step("=> Diffing %d local files against virtual index (Checkers: %d)...", len(localFiles), s.optCheckers)

	// 2. Diffing Pipeline (Checkers)
	tasksChan := make(chan fileTask, len(localFiles))
	uploadChan := make(chan fileTask, len(localFiles))

	var skipped atomic.Int32

	var wgCheck sync.WaitGroup
	for i := 0; i < s.optCheckers; i++ {
		wgCheck.Add(1)
		go func() {
			defer wgCheck.Done()
			for task := range tasksChan {
				needsUpload := true
				if !s.optForce {
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

	logger.Step("=> Enqueueing %d files for transfer (Workers: %d)...", len(uploadList), s.optTransfers)

	// 3. Upload Pipeline (Transfers)
	transferChan := make(chan fileTask, len(uploadList))
	var wgTransfer sync.WaitGroup
	var idxMutex sync.Mutex

	var uploaded atomic.Int32
	var errors atomic.Int32
	totalToUpload := int32(len(uploadList))

	for i := 0; i < s.optTransfers; i++ {
		wgTransfer.Add(1)
		go func() {
			defer wgTransfer.Done()
			for task := range transferChan {
				current := uploaded.Add(1)
				logger.Info("[%d/%d] %s (%d bytes)", current, totalToUpload, task.VirtualPath, task.FileInfo.Size())

				f, err := os.Open(task.LocalPath)
				if err != nil {
					logger.Error("      [Error] Failed to open %s: %v", task.LocalPath, err)
					errors.Add(1)
					continue
				}

				chunks, err := s.chunker.ProcessStream(target.ChatID, target.ThreadID, filepath.Base(task.VirtualPath), f, nil)
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

	logger.Success("=> Sync Summary: %d Uploaded, %d Skipped, %d Errors", uploaded.Load()-errors.Load(), skipped.Load(), errors.Load())

	logger.Step("=> Committing new index to Telegram...")
	if err := s.idxManager.PushVersion(idx); err != nil {
		return fmt.Errorf("failed to commit index: %v", err)
	}

	logger.Success("=> Sync operation completed successfully.")
	return nil
}
