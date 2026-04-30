package core

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestChunkMessage_Short(t *testing.T) {
	text := "short text"
	chunks := chunkMessage(text, 4096)
	if len(chunks) != 1 {
		t.Errorf("Expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != text {
		t.Errorf("Expected %q, got %q", text, chunks[0])
	}
}

func TestChunkMessage_Long(t *testing.T) {
	// Create a text longer than 4096
	base := "This is a test string. "
	var sb strings.Builder
	for i := 0; i < 200; i++ {
		sb.WriteString(base)
	}
	text := sb.String()
	limit := 500

	chunks := chunkMessage(text, limit)
	if len(chunks) <= 1 {
		t.Errorf("Expected multiple chunks, got %d", len(chunks))
	}

	reconstructed := ""
	for i, chunk := range chunks {
		if utf8.RuneCountInString(chunk) > limit {
			t.Errorf("Chunk %d exceeds limit: %d > %d", i, utf8.RuneCountInString(chunk), limit)
		}

		// extract payload (remove prefix)
		lines := strings.SplitN(chunk, "\n", 2)
		if len(lines) == 2 {
			reconstructed += lines[1]
		}
	}

	if reconstructed != text {
		t.Errorf("Reconstructed text does not match original text. Len %d vs %d", len(reconstructed), len(text))
	}
}

func TestChunkMessage_UTF8(t *testing.T) {
	// Create a long text with multi-byte characters
	base := "日本語のテキスト "
	var sb strings.Builder
	for i := 0; i < 50; i++ {
		sb.WriteString(base)
	}
	text := sb.String()
	limit := 100

	chunks := chunkMessage(text, limit)

	reconstructed := ""
	for i, chunk := range chunks {
		if utf8.RuneCountInString(chunk) > limit {
			t.Errorf("Chunk %d exceeds limit in runes: %d > %d", i, utf8.RuneCountInString(chunk), limit)
		}
		if !utf8.ValidString(chunk) {
			t.Errorf("Chunk %d is not valid UTF-8", i)
		}

		lines := strings.SplitN(chunk, "\n", 2)
		if len(lines) == 2 {
			reconstructed += lines[1]
		}
	}

	if reconstructed != text {
		t.Errorf("Reconstructed text does not match original text.")
	}
}
