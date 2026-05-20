package chunker

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestHashChunk(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected string
	}{
		{
			name:     "empty data",
			data:     []byte{},
			expected: fmt.Sprintf("%x", sha256.Sum256([]byte{})),
		},
		{
			name:     "hello world",
			data:     []byte("hello world"),
			expected: fmt.Sprintf("%x", sha256.Sum256([]byte("hello world"))),
		},
		{
			name:     "binary data",
			data:     []byte{0x00, 0x01, 0x02, 0x03, 0xFF},
			expected: fmt.Sprintf("%x", sha256.Sum256([]byte{0x00, 0x01, 0x02, 0x03, 0xFF})),
		},
		{
			name:     "large data",
			data:     make([]byte, 1024*1024), // 1MB of zeros
			expected: fmt.Sprintf("%x", sha256.Sum256(make([]byte, 1024*1024))),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := HashChunk(tt.data)
			if result != tt.expected {
				t.Errorf("HashChunk() = %v, expected %v", result, tt.expected)
			}
		})
	}
}
