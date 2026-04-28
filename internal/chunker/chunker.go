package chunker

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"

	"github.com/dhowden/tag"
	"github.com/teleman-cli/teleman/internal/models"
	"github.com/teleman-cli/teleman/internal/telegram"
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

// ProcessStream chunks an io.Reader and uploads parts to telegram
// returning the list of ChunkEntries to store in the Index.
func (e *Engine) ProcessStream(chatID, threadID, filename string, r io.Reader, password []byte) ([]*models.ChunkEntry, error) {
	var chunks []*models.ChunkEntry
	var offset int64

	buf := make([]byte, e.ChunkSize)

	for {
		n, err := io.ReadFull(r, buf)
		if n > 0 {
			chunkData := buf[:n]

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

			isEOF := (err == io.EOF || err == io.ErrUnexpectedEOF)
			
			var chunkName string
			if len(chunks) == 0 && isEOF {
				chunkName = filename
			} else {
				chunkName = fmt.Sprintf("%s.part%d", filename, len(chunks))
			}

			if e.MediaMode && len(chunks) == 0 && isEOF && !isEncrypted {
				// Eligible for Media API
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

						// If we found basically zero metadata, it's not worth breaking the audio UI.
						// Revert back to document!
						if len(params) == 0 {
							method = "sendDocument"
							fieldName = "document"
						}
					}
					
					if method != "sendDocument" {
						fileID, msgID, upErr = e.client.SendMedia(chatID, threadID, chunkName, chunkReader, method, fieldName, params, thumbData)
					} else {
						fileID, msgID, upErr = e.client.SendDocument(chatID, threadID, chunkName, chunkReader)
					}
				} else {
					fileID, msgID, upErr = e.client.SendDocument(chatID, threadID, chunkName, chunkReader)
				}
			} else {
				fileID, msgID, upErr = e.client.SendDocument(chatID, threadID, chunkName, chunkReader)
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
			offset += int64(n)
		}

		if err == io.EOF || err == io.ErrUnexpectedEOF {
			break
		}
		if err != nil {
			return nil, err
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
		// 2. Resolve Telegram file path from file_id
		filePath, err := e.client.GetFile(chunk.TGFileID)
		if err != nil {
			return fmt.Errorf("chunk %d/%d: failed to resolve file_id %s: %v", i+1, len(sorted), chunk.TGFileID, err)
		}

		// 3. Download the raw chunk stream
		stream, err := e.client.DownloadFileStream(filePath)
		if err != nil {
			return fmt.Errorf("chunk %d/%d: download failed: %v", i+1, len(sorted), err)
		}

		// Read chunk bytes (we need the full chunk in memory for hash verification)
		// This is bounded by ChunkSize (typically 49MB), not the entire file.
		chunkData, err := io.ReadAll(stream)
		stream.Close()
		if err != nil {
			return fmt.Errorf("chunk %d/%d: failed to read stream: %v", i+1, len(sorted), err)
		}

		// 4. Strict hash verification BEFORE any decryption
		// The hash was computed on the encrypted bytes during upload,
		// so we verify against the raw downloaded bytes.
		computedHash := HashChunk(chunkData)
		if computedHash != chunk.Hash {
			return fmt.Errorf("chunk %d/%d: HASH MISMATCH (expected %s, got %s) — aborting download to prevent data corruption", i+1, len(sorted), chunk.Hash, computedHash)
		}

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

// encryptAES encrypts data using AES-GCM
func encryptAES(plaintext []byte, key []byte) ([]byte, error) {
	// Pad key to 32 bytes for AES-256
	paddedKey := make([]byte, 32)
	copy(paddedKey, key)

	block, err := aes.NewCipher(paddedKey)
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
func decryptAES(ciphertext []byte, key []byte) ([]byte, error) {
	paddedKey := make([]byte, 32)
	copy(paddedKey, key)

	block, err := aes.NewCipher(paddedKey)
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
