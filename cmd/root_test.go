package cmd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyFile_Success(t *testing.T) {
	tempDir := t.TempDir()

	srcPath := filepath.Join(tempDir, "source.txt")
	dstPath := filepath.Join(tempDir, "dest.txt")
	content := []byte("hello, world!")

	err := os.WriteFile(srcPath, content, 0644)
	if err != nil {
		t.Fatalf("Failed to create source file: %v", err)
	}

	err = copyFile(srcPath, dstPath)
	if err != nil {
		t.Fatalf("copyFile returned unexpected error: %v", err)
	}

	copiedContent, err := os.ReadFile(dstPath)
	if err != nil {
		t.Fatalf("Failed to read destination file: %v", err)
	}

	if string(copiedContent) != string(content) {
		t.Errorf("Copied content does not match source. Got: %s, Want: %s", string(copiedContent), string(content))
	}
}

func TestCopyFile_SourceNotFound(t *testing.T) {
	tempDir := t.TempDir()

	srcPath := filepath.Join(tempDir, "non_existent.txt")
	dstPath := filepath.Join(tempDir, "dest.txt")

	err := copyFile(srcPath, dstPath)
	if err == nil {
		t.Error("copyFile expected to fail when source file does not exist, but got nil error")
	}
}

func TestCopyFile_DestinationUnwritable(t *testing.T) {
	tempDir := t.TempDir()

	srcPath := filepath.Join(tempDir, "source.txt")
	content := []byte("hello, world!")

	err := os.WriteFile(srcPath, content, 0644)
	if err != nil {
		t.Fatalf("Failed to create source file: %v", err)
	}

	// Try to copy to a nested directory that doesn't exist
	dstPath := filepath.Join(tempDir, "non_existent_dir", "dest.txt")

	err = copyFile(srcPath, dstPath)
	if err == nil {
		t.Error("copyFile expected to fail when destination is unwritable, but got nil error")
	}
}

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

