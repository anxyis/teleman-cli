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
	"time"

	"github.com/dhowden/tag"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
	"golang.org/x/crypto/scrypt"
)

import "sync"

// Engine handles breaking files into streams and pushing to Telegram.
type Engine struct {
	client    *telegram.Client
	ChunkSize int64
	MediaMode bool
	pool      sync.Pool
}

func newEngineWithPool(client *telegram.Client, mediaMode bool, chunkSize int64) *Engine {
	return &Engine{
		client:    client,
		ChunkSize: chunkSize,
		MediaMode: mediaMode,
		pool: sync.Pool{
			New: func() interface{} {
				// We don't allocate the full ChunkSize immediately to save memory for small files,
				// but we allocate a reasonable starting capacity.
				buf := make([]byte, 0, 1024*1024)
				return &buf
			},
		},
	}
}

// NewEngine creates a chunking engine with dynamic chunk limits.
func NewEngine(client *telegram.Client, mediaMode bool) *Engine {
	return newEngineWithPool(client, mediaMode, 49*1024*1024)
}

// NewEngineWithSize creates a chunking engine with an explicit chunk size.
func NewEngineWithSize(client *telegram.Client, mediaMode bool, chunkSize int64) *Engine {
	if chunkSize <= 0 {
		chunkSize = 49 * 1024 * 1024
	}
	return newEngineWithPool(client, mediaMode, chunkSize)
}

// ProcessStream chunks an io.Reader and uploads parts to telegram
// returning the list of ChunkEntries to store in the Index.
func (e *Engine) ProcessStream(chatID, threadID, filename string, r io.Reader, password []byte, caption string) ([]*models.ChunkEntry, error) {
	return e.ProcessStreamCtx(context.Background(), chatID, threadID, filename, r, password, caption)
}

// formatSize converts bytes into a short, readable format (e.g. 15.2 MB)
func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// ProcessStreamCtx chunks an io.Reader and uploads parts to telegram with context support.
// Returns the list of ChunkEntries to store in the Index.
// Respects context cancellation between chunk uploads for graceful shutdown.
func (e *Engine) ProcessStreamCtx(ctx context.Context, chatID, threadID, filename string, r io.Reader, password []byte, captionOpt string) ([]*models.ChunkEntry, error) {
	var chunks []*models.ChunkEntry
	var offset int64

	// Determine total size if possible (used for caption)
	var totalSize int64 = -1
	if f, ok := r.(interface{ Stat() (os.FileInfo, error) }); ok {
		if stat, err := f.Stat(); err == nil {
			totalSize = stat.Size()
		}
	}

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

		bufPtr := e.pool.Get().(*[]byte)
		chunkData := (*bufPtr)[:0]

		// Pre-allocate capacity if we know it's going to be larger than current capacity
		if int64(cap(chunkData)) < expectedSize {
			newBuf := make([]byte, 0, expectedSize)
			chunkData = newBuf
			bufPtr = &newBuf
		}

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
			e.pool.Put(bufPtr)
			break
		}

		if readErr != nil && readErr != io.EOF {
			e.pool.Put(bufPtr)
			return nil, readErr
		}

		isEOF := (readErr == io.EOF)
		if nBytes > 0 {
			var isEncrypted bool
			var dataToUpload []byte

			// Determine caption for the first chunk only
			var currentCaption string
			if len(chunks) == 0 && captionOpt != "" {
				if captionOpt == "auto" {
					parts := []string{filename}
					if totalSize >= 0 {
						parts = append(parts, formatSize(totalSize))
					}
					parts = append(parts, time.Now().Format("2006-01-02"))

					ext := strings.ToLower(filepath.Ext(filename))
					if ext != "" {
						// Remove dot and prepend hashtag
						parts = append(parts, "#"+ext[1:])
					}

					currentCaption = strings.Join(parts, "\n")
				} else {
					currentCaption = captionOpt
				}
			}

			if len(password) > 0 {
				encryptedData, encErr := encryptAES(chunkData, password)
				if encErr != nil {
					e.pool.Put(bufPtr)
					return nil, encErr
				}
				dataToUpload = encryptedData
				isEncrypted = true
			} else {
				dataToUpload = chunkData
			}

			hash := HashChunk(dataToUpload)

			chunkReader := bytes.NewReader(dataToUpload)
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
						fileID, msgID, upErr = e.client.SendMediaCtx(ctx, chatID, threadID, chunkName, chunkReader, method, fieldName, params, thumbData, currentCaption)
					} else {
						fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader, currentCaption)
					}
				} else {
					// Extension not in any media category
					logger.Debug("      [Media] %s → sendDocument (unsupported extension for media routing)", filename)
					fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader, currentCaption)
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
				fileID, msgID, upErr = e.client.SendDocumentCtx(ctx, chatID, threadID, chunkName, chunkReader, currentCaption)
			}

			if upErr != nil {
				e.pool.Put(bufPtr)
				return nil, upErr
			}

			// 6. Record metadata
			entry := &models.ChunkEntry{
				Offset:    offset,
				Size:      int64(len(dataToUpload)),
				Hash:      hash,
				TGFileID:  fileID,
				TGMsgID:   msgID,
				Encrypted: isEncrypted,
			}
			chunks = append(chunks, entry)
			offset += nBytes

			// Return buffer to pool after upload
			e.pool.Put(bufPtr)
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
	return e.ReassembleStreamCtx(context.Background(), chunks, dst, password, nil)
}

// ReassembleStreamCtx downloads chunks from Telegram and writes them sequentially to dst
// with context support for graceful cancellation.
func (e *Engine) ReassembleStreamCtx(ctx context.Context, chunks []*models.ChunkEntry, dst io.Writer, password []byte, progressTracker io.Writer) error {
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

		err = func() error {
			// 3. Stream download, compute hash dynamically
			stream, err := e.client.DownloadFileStreamCtx(ctx, filePath)
			if err != nil {
				return fmt.Errorf("chunk %d/%d: download failed: %v", i+1, len(sorted), err)
			}

			// We use a temp file to avoid holding the chunk in memory if it's large.
			tmpFile, err := os.CreateTemp("", "teleman-chunk-*")
			if err != nil {
				stream.Close()
				return fmt.Errorf("chunk %d/%d: failed to create tmp file: %v", i+1, len(sorted), err)
			}
			tmpFileName := tmpFile.Name()
			defer os.Remove(tmpFileName)

			hasher := sha256.New()
			var multiWriter io.Writer
			if progressTracker != nil {
				multiWriter = io.MultiWriter(hasher, tmpFile, progressTracker)
			} else {
				multiWriter = io.MultiWriter(hasher, tmpFile)
			}

			_, err = io.Copy(multiWriter, stream)
			stream.Close()
			tmpFile.Close() // Close for writing

			if err != nil {
				return fmt.Errorf("chunk %d/%d: failed to read stream: %v", i+1, len(sorted), err)
			}

			// 4. Strict hash verification
			computedHash := fmt.Sprintf("%x", hasher.Sum(nil))
			if computedHash != chunk.Hash {
				return fmt.Errorf("chunk %d/%d: HASH MISMATCH (expected %s, got %s) — aborting download to prevent data corruption", i+1, len(sorted), chunk.Hash, computedHash)
			}

			logger.Debug("      [Chunk %d/%d] Hash verified ✓", i+1, len(sorted))

			// Open temp file for reading
			tmpFileRead, err := os.Open(tmpFileName)
			if err != nil {
				return fmt.Errorf("chunk %d/%d: failed to open tmp file for reading: %v", i+1, len(sorted), err)
			}
			defer tmpFileRead.Close()

			// 5. Decrypt if the chunk was encrypted during upload
			if chunk.Encrypted {
				if len(password) == 0 {
					return fmt.Errorf("chunk %d/%d: chunk is encrypted but no password was provided", i+1, len(sorted))
				}

				// For GCM decryption, we still need it in memory to authenticate.
				// However, at least we didn't hold it in memory while downloading over network.
				chunkData, err := io.ReadAll(tmpFileRead)
				if err != nil {
					return fmt.Errorf("chunk %d/%d: failed to read encrypted chunk from disk: %v", i+1, len(sorted), err)
				}

				decrypted, err := decryptAES(chunkData, password)
				if err != nil {
					return fmt.Errorf("chunk %d/%d: decryption failed: %v", i+1, len(sorted), err)
				}

				if _, err := dst.Write(decrypted); err != nil {
					return fmt.Errorf("chunk %d/%d: write to disk failed: %v", i+1, len(sorted), err)
				}
			} else {
				// Fast path for unencrypted: just io.Copy from tmp file to destination
				if _, err := io.Copy(dst, tmpFileRead); err != nil {
					return fmt.Errorf("chunk %d/%d: write to disk failed: %v", i+1, len(sorted), err)
				}
			}
			return nil
		}()
		if err != nil {
			return err
		}
	}

	return nil
}

// DeriveKey uses scrypt to derive a 32-byte AES-256 key from a passphrase.
// Takes a salt.
func DeriveKey(passphrase []byte, salt []byte) ([]byte, error) {
	// scrypt params: N=32768, r=8, p=1, keyLen=32 (AES-256)
	key, err := scrypt.Key(passphrase, salt, 32768, 8, 1, 32)
	if err != nil {
		return nil, fmt.Errorf("key derivation failed: %v", err)
	}
	return key, nil
}

// encryptAES encrypts data using AES-256-GCM with a key derived from the passphrase and a random salt.
// Prepend format: `TLM1` (magic bytes) + 16 bytes salt + nonce + ciphertext
func encryptAES(plaintext []byte, passphrase []byte) ([]byte, error) {
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}

	key, err := DeriveKey(passphrase, salt)
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

	// Format: TLM1 + salt + nonce + sealed
	out := make([]byte, 0, 4+len(salt)+len(nonce)+len(plaintext)+gcm.Overhead())
	out = append(out, []byte("TLM1")...)
	out = append(out, salt...)
	out = append(out, nonce...)

	return gcm.Seal(out, nonce, plaintext, nil), nil
}

// decryptAES decrypts data that was encrypted with encryptAES (AES-256-GCM).
// Supports both new format with unique salt and old format with deterministic salt.
func decryptAES(ciphertext []byte, passphrase []byte) ([]byte, error) {
	if len(ciphertext) > 4 && string(ciphertext[:4]) == "TLM1" {
		// New format
		if len(ciphertext) < 4+16 {
			return nil, fmt.Errorf("ciphertext too short to contain salt")
		}
		salt := ciphertext[4:20]
		key, err := DeriveKey(passphrase, salt)
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
		if len(ciphertext) < 4+16+nonceSize {
			return nil, fmt.Errorf("ciphertext too short to contain nonce")
		}

		nonce := ciphertext[20:20+nonceSize]
		sealed := ciphertext[20+nonceSize:]
		return gcm.Open(nil, nonce, sealed, nil)
	}

	// Legacy format (deterministic salt)
	saltHash := sha256.Sum256(passphrase)
	salt := saltHash[:16]

	key, err := DeriveKey(passphrase, salt)
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
