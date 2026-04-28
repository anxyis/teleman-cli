package models

import "time"

// Index is the root structure for the teleman.index.json
// It acts as the single source of truth for the virtual filesystem.
type Index struct {
	Version int                              `json:"version"`
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

// LockInfo represents a distributed lock message stored in the index channel.
// Includes a timestamp so stale locks (from crashed instances) can be detected
// and automatically broken after a configurable timeout.
type LockInfo struct {
	Owner     string    `json:"owner"`     // Hostname or instance identifier
	Timestamp time.Time `json:"timestamp"` // When the lock was acquired
	Operation string    `json:"operation"` // What operation holds the lock (sync, copy, move)
	MsgID     int64     `json:"msg_id"`    // Telegram message ID for cleanup
}

// DefaultLockTimeout is the maximum duration a lock can be held before
// it is considered stale and eligible for automatic recovery.
const DefaultLockTimeout = 5 * time.Minute

// IsStale returns true if the lock has exceeded the timeout duration,
// indicating the holding instance likely crashed.
func (l *LockInfo) IsStale() bool {
	return time.Since(l.Timestamp) > DefaultLockTimeout
}
