package models

// Index is the root structure for the teleman.index.json
// It acts as the single source of truth for the virtual filesystem.
type Index struct {
	Version int                                      `json:"version"`
	Targets map[string]map[string]*FileEntry `json:"targets"` 
}

// FileEntry represents a file in the virtual filesystem.
type FileEntry struct {
	Size    int64         `json:"size"`
	ModTime int64         `json:"mod_time"`
	Hash    string        `json:"hash,omitempty"` // Global file hash (optional but recommended)
	Chunks  []*ChunkEntry `json:"chunks"`
}

// ChunkEntry represents a single piece of a file stored in Telegram.
type ChunkEntry struct {
	Offset    int64  `json:"offset"`
	Size      int64  `json:"size"`
	Hash      string `json:"hash"` // Crucial for global deduplication
	TGFileID  string `json:"tg_file_id"`
	TGMsgID   int64  `json:"tg_msg_id"`
	Encrypted bool   `json:"encrypted,omitempty"`
}
