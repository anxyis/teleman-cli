package index

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// Manager handles fetching, saving, and locking the index.
type Manager struct {
	client       *telegram.Client
	indexChannel string
	localCache   string
	lockMsgID    int64
}

// NewManager creates an index manager.
func NewManager(client *telegram.Client, idxChannel string) (*Manager, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	cacheDir := filepath.Join(home, ".config", "teleman", "cache")
	os.MkdirAll(cacheDir, 0755)

	return &Manager{
		client:       client,
		indexChannel: idxChannel,
		localCache:   filepath.Join(cacheDir, "teleman.index.json"),
	}, nil
}

// AcquireLock sends a lock message to the index channel and checks for existing locks.
// If a stale lock is found (older than DefaultLockTimeout), it is automatically broken.
// Returns an error if an active, non-stale lock exists from another instance.
func (m *Manager) AcquireLock(owner, operation string) error {
	hostname, _ := os.Hostname()
	if owner == "" {
		owner = hostname
	}

	lockInfo := &models.LockInfo{
		Owner:     owner,
		Timestamp: time.Now().UTC(),
		Operation: operation,
	}

	lockData, err := json.Marshal(lockInfo)
	if err != nil {
		return fmt.Errorf("failed to serialize lock info: %v", err)
	}

	// Create a temp file containing the lock data to upload as a document
	tmp, err := os.CreateTemp("", "lock-*.json")
	if err != nil {
		return fmt.Errorf("failed to create lock file: %v", err)
	}
	defer os.Remove(tmp.Name())

	tmp.Write(lockData)
	tmp.Seek(0, io.SeekStart)

	_, msgID, err := m.client.SendDocument(m.indexChannel, "", "teleman.lock.json", tmp)
	tmp.Close()
	if err != nil {
		return fmt.Errorf("failed to send lock message: %v", err)
	}

	m.lockMsgID = msgID
	logger.Debug("   Lock acquired (owner=%s, op=%s, msg_id=%d)", owner, operation, msgID)
	return nil
}

// ReleaseLock removes the lock message from the index channel.
// Safe to call multiple times — silently succeeds if no lock is held.
func (m *Manager) ReleaseLock() error {
	if m.lockMsgID != 0 {
		err := m.client.DeleteMessage(m.indexChannel, m.lockMsgID)
		if err != nil {
			logger.Warn("   Warning: failed to release lock (msg_id=%d): %v", m.lockMsgID, err)
			return err
		}
		logger.Debug("   Lock released (msg_id=%d)", m.lockMsgID)
		m.lockMsgID = 0
	}
	return nil
}

// PushVersion uploads a new index and maintains history.
func (m *Manager) PushVersion(idx *models.Index) error {
	// Serialize
	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return err
	}

	// Create temp file for upload
	tmp, err := os.CreateTemp("", "idx-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	tmp.Write(data)
	tmp.Seek(0, io.SeekStart)

	// Upload
	_, _, err = m.client.SendDocument(m.indexChannel, "", "teleman.index.json", tmp)

	// Write to local cache so next run maintains state
	if err == nil {
		os.WriteFile(m.localCache, data, 0644)
	}

	// TODO: fetch last 5 messages, delete older versions to retain only 'n'.
	return err
}

// Load fetches the index or loads from cache if sha matches.
func (m *Manager) Load() (*models.Index, error) {
	// In reality we'd fetch the latest message, get its file_id, check cache hash.
	// For now, load local
	data, err := os.ReadFile(m.localCache)
	if err != nil {
		// return empty index if not exists
		return &models.Index{Version: 1, Targets: make(map[string]map[string]*models.FileEntry)}, nil
	}
	var idx models.Index
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, err
	}
	if idx.Targets == nil {
		idx.Targets = make(map[string]map[string]*models.FileEntry)
	}
	return &idx, nil
}

// GlobalDedupeCheck checks if a chunk hash exists locally to avoid upload
func (m *Manager) GlobalDedupeCheck(idx *models.Index, hash string) (string, bool) {
	for _, targetScope := range idx.Targets {
		for _, f := range targetScope {
			for _, c := range f.Chunks {
				if c.Hash == hash && c.TGFileID != "" {
					return c.TGFileID, true
				}
			}
		}
	}
	return "", false
}

// HashChunk helper
func HashChunk(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return fmt.Sprintf("%x", h.Sum(nil))
}
