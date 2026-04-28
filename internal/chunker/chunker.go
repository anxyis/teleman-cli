package chunker

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/dhowden/tag"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
	"golang.org/x/crypto/scrypt"
)

// Engine handles breaking files into streams and pushing to Telegram.
type Engine struct {
	client    *telegram.Client
	ChunkSize int64
	MediaMode bool
}

// NewEngine creates a chunking engine with dynamic chunk limits.
func NewEngine(client *telegram.Client, mediaMode bool) *Engine {
	return &Engine{
		client:    client,
		ChunkSize: 49 * 1024 * 1024,
		MediaMode: mediaMode,
	}
}

// NewEngineWithSize creates a chunking engine with an explicit chunk size.
func NewEngineWithSize(client *telegram.Client, mediaMode bool, chunkSize int64) *Engine {
	if chunkSize <= 0 {
		chunkSize = 49 * 1024 * 1024
	}
	return &Engine{
		client:    client,
		ChunkSize: chunkSize,
		MediaMode: mediaMode,
	}
}

// ProcessStream chunks an io.Reader and uploads parts to telegram
// returning the list of ChunkEntries to store in the Index.
func (e *Engine) ProcessStream(chatID, threadID, filename string, r io.Reader, password []byte) ([]*models.ChunkEntry, error) {
	return e.ProcessStreamCtx(context.Background(), chatID, threadID, filename, r, password)
}

// ProcessStreamCtx chunks an io.Reader and uploads parts to telegram with context support.
// Returns the list of ChunkEntries to store in the Index.
// Respects context cancellation between chunk uploads for graceful shutdown.
func (e *Engine) ProcessStreamCtx(ctx context.Context, chatID, threadID, filename string, r io.Reader, password []byte) ([]*models.ChunkEntry, error) {
	var chunks []*models.ChunkEntry
	var offset int64

	for {
		// Check for cancellation before reading the next chunk
		select {
		case <-ctx.Done():
			return chunks, fmt.Errorf("upload cancelled: %w", ctx.Err())
		default:
		}

		var expectedSize int64 = 0
		// If we can determine the exact remaining size, pre-allocate exactly that
		if f, ok := r.(interface{ Stat() (os.FileInfo, error) }); ok {
			if stat, err := f.Stat(); err == nil {
				rem := stat.Size() - offset
				if rem > 0 && rem < e.ChunkSize {
					expectedSize = rem
				} else if rem >= e.ChunkSize {
					expectedSize = e.ChunkSize
				}
			}
		}

		// Fallback for streams (e.g. zip/tgz): allocate a reasonable 1MB to start, avoiding massive GC pressure
		if expectedSize == 0 {
			expectedSize = 1024 * 1024 
			if expectedSize > e.ChunkSize {
				expectedSize = e.ChunkSize
			}
		}

		chunkData := make([]byte, 0, expectedSize)
		tmp := make([]byte, 64*1024) // 64KB read buffer
		var readErr error
		var nBytes int64

		for nBytes < e.ChunkSize {
			toRead := len(tmp)
			if e.ChunkSize-nBytes < int64(toRead) {
				toRead = int(e.ChunkSize - nBytes)
			}
			n, err := r.Read(tmp[:toRead])
			if n > 0 {
				chunkData = append(chunkData, tmp[:n]...)
				nBytes += int64(n)
			}
			if err != nil {
				readErr = err
				break
			}
		}

		if nBytes == 0 && readErr == io.EOF {
			break
		}

		if readErr != nil && readErr != io.EOF {
			return nil, readErr
		}

		isEOF := (readErr == io.EOF)
		if nBytes > 0 {
			var isEncrypted bool
			if len(password) > 0 {
				encryptedData, encErr := encryptAES(chunkData, password)
				if encErr != nil {
					return nil, encErr
				}
				chunkData = encryptedData
				isEncrypted = true
			}

			hash := HashChunk(chunkData)

			chunkReader := bytes.NewReader(chunkData)
			var fileID string
			var msgID int64
			var upErr error

			var chunkName string
			if len(chunks) == 0 && isEOF {
				chunkName = filename
			} else {
				chunkName = fmt.Sprintf("%s.part%d", filename, len(chunks))
			}

			if e.MediaMode && len(chunks) == 0 && isEOF && !isEncrypted {
				// Eligible for Media API — single-chunk, unencrypted, media mode on
				ext := strings.ToLower(filepath.Ext(filename))
				method := "sendDocument"
				fieldName := "document"

				switch ext {
				case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp":
					method = "sendPhoto"
					fieldName = "photo"
				case ".mp4", ".mov", ".avi", ".mkv", ".webm":
					method = "sendVideo"
					fieldName = "video"
				case ".mp3", ".ogg", ".flac", ".m4a":
					method = "sendAudio"
					fieldName = "audio"
				}

				if method != "sendDocument" {
					var params map[string]string
					var thumbData []byte

					if method == "sendAudio" {
						params = make(map[string]string)
						m, tErr := tag.ReadFrom(bytes.NewReader(chunkData))
						if tErr == nil && m != nil {
							if m.Title() != "" {
								params["title"] = m.Title()
							}
							artist := m.Artist()
							if artist == "" {
								artist = m.AlbumArtist()
							}
							if artist != "" {
								params["performer"] = artist
							}
							if pic := m.Picture(); pic != nil {
								thumbData = pic.Data
							}
						}

						// No metadata found — fall back to sendDocument to avoid empty audio UI
						if len(params) == 0 {
							logger.Debug("      [Media] %s → sendDocument (no ID3 tags found, falling back)", filename)
							method = "sendDocument"
							fieldName = "document"
						} else {
							logger.Debug("      [Media] %s → sendAudio (title=%q performer=%q thumb=%v)",
								filename, params["title"], params["performer"], thumbData != nil)
						}
					}

					if method != "sendDocument" {
						if method == "sendPhoto" {
							logger.Debug("      [Media] %s → sendPhoto", filename)
						} else if method == "sendVideo" {
							logger.Debug("      [Media] %s → sendVideo", filename)
						}
						fileID, msgID, upErr = e.client.SendMediaCtx(ctx, chatID, threadID, chunkName, chunkReader, method, fieldName, params, thumbData)
					} else {
						fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader)
					}
				} else {
					// Extension not in any media category
					logger.Debug("      [Media] %s → sendDocument (unsupported extension for media routing)", filename)
					fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader)
				}
			} else {
				// Not eligible for media endpoint
				if e.MediaMode {
					if isEncrypted {
						logger.Debug("      [Media] %s → sendDocument (encrypted — media endpoints require plaintext)", filename)
					} else if !isEOF {
						logger.Debug("      [Media] %s → sendDocument (multi-part chunk — too large for media endpoint)", filename)
					}
				}
				fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader)
			}

			if upErr != nil {
				return nil, upErr
			}

			// 6. Record metadata
			entry := &models.ChunkEntry{
				Offset:    offset,
				Size:      int64(len(chunkData)),
				Hash:      hash,
				TGFileID:  fileID,
				TGMsgID:   msgID,
				Encrypted: isEncrypted,
			}
			chunks = append(chunks, entry)
			offset += nBytes
		}

		if isEOF {
			break
		}
	}

	return chunks, nil
}

func HashChunk(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return fmt.Sprintf("%x", h.Sum(nil))
}

// ReassembleStream downloads chunks from Telegram and writes them sequentially to dst.
// Pipeline order: download → hash verify → decrypt (if needed) → write.
// Chunks are explicitly sorted by offset before reassembly.
// A hash mismatch aborts immediately with a non-nil error.
func (e *Engine) ReassembleStream(chunks []*models.ChunkEntry, dst io.Writer, password []byte) error {
	return e.ReassembleStreamCtx(context.Background(), chunks, dst, password)
}

// ReassembleStreamCtx downloads chunks from Telegram and writes them sequentially to dst
// with context support for graceful cancellation.
func (e *Engine) ReassembleStreamCtx(ctx context.Context, chunks []*models.ChunkEntry, dst io.Writer, password []byte) error {
	if len(chunks) == 0 {
		return fmt.Errorf("no chunks to reassemble")
	}

	// 1. Sort chunks by offset to guarantee correct byte order
	sorted := make([]*models.ChunkEntry, len(chunks))
	copy(sorted, chunks)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Offset < sorted[j].Offset
	})

	for i, chunk := range sorted {
		// Check for cancellation between chunks
		select {
		case <-ctx.Done():
			return fmt.Errorf("download cancelled: %w", ctx.Err())
		default:
		}

		// 2. Resolve Telegram file path from file_id
		filePath, err := e.client.GetFileCtx(ctx, chunk.TGFileID)
		if err != nil {
			return fmt.Errorf("chunk %d/%d: failed to resolve file_id %s: %v", i+1, len(sorted), chunk.TGFileID, err)
		}

		logger.Debug("      [Chunk %d/%d] file_path resolved: %s", i+1, len(sorted), filePath)

		// 3. Download the raw chunk stream
		stream, err := e.client.DownloadFileStreamCtx(ctx, filePath)
		if err != nil {
			return fmt.Errorf("chunk %d/%d: download failed: %v", i+1, len(sorted), err)
		}

		// Read chunk bytes (we need the full chunk in memory for hash verification)
		// Pre-allocate the exact slice capacity to bypass massive slice growth overhead
		expectedSize := chunk.Size
		if expectedSize <= 0 {
			expectedSize = 1024 * 1024 // 1MB fallback
		}
		
		buf := bytes.NewBuffer(make([]byte, 0, expectedSize))
		_, err = buf.ReadFrom(stream)
		stream.Close()
		if err != nil {
			return fmt.Errorf("chunk %d/%d: failed to read stream: %v", i+1, len(sorted), err)
		}
		chunkData := buf.Bytes()

		// 4. Strict hash verification BEFORE any decryption
		// The hash was computed on the encrypted bytes during upload,
		// so we verify against the raw downloaded bytes.
		computedHash := HashChunk(chunkData)
		if computedHash != chunk.Hash {
			return fmt.Errorf("chunk %d/%d: HASH MISMATCH (expected %s, got %s) — aborting download to prevent data corruption", i+1, len(sorted), chunk.Hash, computedHash)
		}

		logger.Debug("      [Chunk %d/%d] Hash verified ✓", i+1, len(sorted))

		// 5. Decrypt if the chunk was encrypted during upload
		if chunk.Encrypted {
			if len(password) == 0 {
				return fmt.Errorf("chunk %d/%d: chunk is encrypted but no password was provided", i+1, len(sorted))
			}
			decrypted, err := decryptAES(chunkData, password)
			if err != nil {
				return fmt.Errorf("chunk %d/%d: decryption failed: %v", i+1, len(sorted), err)
			}
			chunkData = decrypted
		}

		// 6. Stream to destination writer
		if _, err := dst.Write(chunkData); err != nil {
			return fmt.Errorf("chunk %d/%d: write to disk failed: %v", i+1, len(sorted), err)
		}
	}

	return nil
}

// DeriveKey uses scrypt to derive a 32-byte AES-256 key from a passphrase.
// The salt is deterministic (derived from the passphrase itself via SHA-256)
// so the same passphrase always produces the same key without needing to store salt.
// This is a deliberate trade-off: we lose per-file salt uniqueness but gain the ability
// to decrypt without any additional metadata beyond the passphrase.
func DeriveKey(passphrase []byte) ([]byte, error) {
	// Use SHA-256 of the passphrase as a deterministic salt
	saltHash := sha256.Sum256(passphrase)
	salt := saltHash[:16]

	// scrypt params: N=32768, r=8, p=1, keyLen=32 (AES-256)
	key, err := scrypt.Key(passphrase, salt, 32768, 8, 1, 32)
	if err != nil {
		return nil, fmt.Errorf("key derivation failed: %v", err)
	}
	return key, nil
}

// encryptAES encrypts data using AES-256-GCM with a key derived from the passphrase.
func encryptAES(plaintext []byte, passphrase []byte) ([]byte, error) {
	key, err := DeriveKey(passphrase)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// decryptAES decrypts data that was encrypted with encryptAES (AES-256-GCM).
// The nonce is prepended to the ciphertext by the encrypt function.
func decryptAES(ciphertext []byte, passphrase []byte) ([]byte, error) {
	key, err := DeriveKey(passphrase)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short to contain nonce")
	}

	nonce, sealed := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, sealed, nil)
}
