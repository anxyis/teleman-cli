package index

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
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

// AcquireLock sends a lock message to the channel. 
// In a true distributed system, we'd check for existing lock messages first.
func (m *Manager) AcquireLock(owner string) error {
	// For production: Search history for "LOCK_OPEN", if exists fail.
	// For MVP: We just "pin" a lock message.
	lockData := fmt.Sprintf("LOCK_OWNER: %s", owner)
	_ = lockData // Placeholder logic
	return nil
}

// ReleaseLock removes the lock message.
func (m *Manager) ReleaseLock() error {
	if m.lockMsgID != 0 {
		return m.client.DeleteMessage(m.indexChannel, m.lockMsgID)
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
		return &models.Index{Version: 1, Files: make(map[string]*models.FileEntry)}, nil
	}
	var idx models.Index
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, err
	}
	if idx.Files == nil {
		idx.Files = make(map[string]*models.FileEntry)
	}
	return &idx, nil
}

// GlobalDedupeCheck checks if a chunk hash exists locally to avoid upload
func (m *Manager) GlobalDedupeCheck(idx *models.Index, hash string) (string, bool) {
	for _, f := range idx.Files {
		for _, c := range f.Chunks {
			if c.Hash == hash && c.TGFileID != "" {
				return c.TGFileID, true
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
