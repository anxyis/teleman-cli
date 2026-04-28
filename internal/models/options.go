package models

import (
	"fmt"
	"strconv"
	"strings"
)

// TransferOptions encapsulates all runtime flags for upload/download operations.
// Passed explicitly to engines instead of relying on package-level globals.
type TransferOptions struct {
	Transfers int    // Number of parallel file transfers
	Checkers  int    // Number of parallel diff checkers
	ChunkSize int64  // Chunk size in bytes (parsed from human-readable string)
	Encrypt   bool   // Whether to encrypt chunks with AES-256-GCM
	ZipMode   bool   // Compress source into streaming zip archive
	TgzMode   bool   // Compress source into streaming tar.gz archive
	MediaMode bool   // Route eligible files to Telegram media endpoints
	Force     bool   // Bypass index diffing, force re-upload
	DryRun           bool   // Show what would be transferred without mutating state
	Password         []byte // Encryption/decryption passphrase (derived from env, prompt, or flag)
	AutoUpgradeChunk bool   // Indicates if --cz was left at default and can be auto-upgraded for local APIs
}

// ParseChunkSize converts a human-readable size string (e.g., "49M", "1G", "512K")
// into bytes. Returns an error for invalid formats so the user gets early feedback
// instead of a cryptic failure deep in the chunker.
func ParseChunkSize(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 49 * 1024 * 1024, nil // Default: 49MB
	}

	// Pure numeric (bytes)
	if n, err := strconv.ParseInt(raw, 10, 64); err == nil {
		if n <= 0 {
			return 0, fmt.Errorf("chunk size must be positive, got %d", n)
		}
		return n, nil
	}

	// Extract suffix
	suffix := strings.ToUpper(raw[len(raw)-1:])
	numPart := raw[:len(raw)-1]

	n, err := strconv.ParseFloat(numPart, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid chunk size '%s': cannot parse numeric part", raw)
	}
	if n <= 0 {
		return 0, fmt.Errorf("chunk size must be positive, got %s", raw)
	}

	var multiplier float64
	switch suffix {
	case "K":
		multiplier = 1024
	case "M":
		multiplier = 1024 * 1024
	case "G":
		multiplier = 1024 * 1024 * 1024
	default:
		return 0, fmt.Errorf("invalid chunk size suffix '%s': use K, M, or G", suffix)
	}

	return int64(n * multiplier), nil
}
