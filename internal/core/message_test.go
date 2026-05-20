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

func TestChunkMessage_Table(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		limit    int
		expected []string
	}{
		{
			name:     "Empty text",
			text:     "",
			limit:    4096,
			expected: []string{""},
		},
		{
			name:     "Limit equal to text length",
			text:     "exact limit",
			limit:    11,
			expected: []string{"exact limit"},
		},
		{
			name:     "Limit greater than text length",
			text:     "short",
			limit:    10,
			expected: []string{"short"},
		},
		{
			name:  "Limit extremely small (limit <= 20)",
			text:  "abcdefghijklmnopqrstuvwxyz", // 26 chars
			limit: 20, // chunkSize will be 1
			expected: []string{
				"[1/26]\na", "[2/26]\nb", "[3/26]\nc", "[4/26]\nd",
				"[5/26]\ne", "[6/26]\nf", "[7/26]\ng", "[8/26]\nh",
				"[9/26]\ni", "[10/26]\nj", "[11/26]\nk", "[12/26]\nl",
				"[13/26]\nm", "[14/26]\nn", "[15/26]\no", "[16/26]\np",
				"[17/26]\nq", "[18/26]\nr", "[19/26]\ns", "[20/26]\nt",
				"[21/26]\nu", "[22/26]\nv", "[23/26]\nw", "[24/26]\nx",
				"[25/26]\ny", "[26/26]\nz",
			},
		},
		{
			name:  "Multi-byte characters split cleanly",
			text:  "あいうえおかきくけこさしすせそたちつてとなにぬねのは", // 26 chars
			limit: 22, // chunkSize = 2 (22 - 20)
			expected: []string{
				"[1/13]\nあい", "[2/13]\nうえ", "[3/13]\nおか", "[4/13]\nきく",
				"[5/13]\nけこ", "[6/13]\nさし", "[7/13]\nすせ", "[8/13]\nそた",
				"[9/13]\nちつ", "[10/13]\nてと", "[11/13]\nなに", "[12/13]\nぬね",
				"[13/13]\nのは",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := chunkMessage(tt.text, tt.limit)
			if len(got) != len(tt.expected) {
				t.Fatalf("expected %d chunks, got %d", len(tt.expected), len(got))
			}
			for i, chunk := range got {
				if chunk != tt.expected[i] {
					t.Errorf("chunk %d: expected %q, got %q", i, tt.expected[i], chunk)
				}
			}
		})
	}
}
