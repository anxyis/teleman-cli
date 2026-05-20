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
