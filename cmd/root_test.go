package cmd

import (
	"testing"
)

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		name     string
		input    int64
		expected string
	}{
		{"Zero", 0, "0 B"},
		{"Bytes", 512, "512 B"},
		{"Just Under KB", 1023, "1023 B"},
		{"Exactly 1 KB", 1024, "1.0 KB"},
		{"1.5 KB", 1536, "1.5 KB"},
		{"Exactly 1 MB", 1024 * 1024, "1.0 MB"},
		{"2.5 MB", int64(2.5 * 1024 * 1024), "2.5 MB"},
		{"Exactly 1 GB", 1024 * 1024 * 1024, "1.0 GB"},
		{"Exactly 1 TB", 1024 * 1024 * 1024 * 1024, "1.0 TB"},
		{"Exactly 1 PB", 1024 * 1024 * 1024 * 1024 * 1024, "1.0 PB"},
		{"Exactly 1 EB", 1024 * 1024 * 1024 * 1024 * 1024 * 1024, "1.0 EB"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatBytes(tt.input)
			if result != tt.expected {
				t.Errorf("formatBytes(%d): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}
