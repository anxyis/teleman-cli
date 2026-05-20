package ignore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_DirDoesNotExist(t *testing.T) {
	m := Load("non_existent_directory_that_should_not_exist")
	if m == nil {
		t.Fatal("expected a valid Matcher, got nil")
	}
	if m.Loaded {
		t.Errorf("expected Loaded to be false, got true")
	}
	if len(m.patterns) != 0 {
		t.Errorf("expected 0 patterns, got %d", len(m.patterns))
	}
}

func TestLoad_NoIgnoreFile(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "teleman_test_no_ignore")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	m := Load(tmpDir)
	if m == nil {
		t.Fatal("expected a valid Matcher, got nil")
	}
	if m.Loaded {
		t.Errorf("expected Loaded to be false, got true")
	}
	if len(m.patterns) != 0 {
		t.Errorf("expected 0 patterns, got %d", len(m.patterns))
	}
}

func TestLoad_ValidIgnoreFile_InDir(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "teleman_test_valid_ignore")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	ignorePath := filepath.Join(tmpDir, ".telemanignore")
	content := `
# This is a comment

pattern1
!pattern2
dir/
*.txt
`
	err = os.WriteFile(ignorePath, []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write .telemanignore: %v", err)
	}

	m := Load(tmpDir)
	if m == nil {
		t.Fatal("expected a valid Matcher, got nil")
	}
	if !m.Loaded {
		t.Errorf("expected Loaded to be true, got false")
	}
	if len(m.patterns) != 4 {
		t.Fatalf("expected 4 patterns, got %d", len(m.patterns))
	}

	expectedPatterns := []Pattern{
		{Text: "pattern1", IsNegate: false},
		{Text: "pattern2", IsNegate: true},
		{Text: "dir/", IsNegate: false},
		{Text: "*.txt", IsNegate: false},
	}

	for i, expected := range expectedPatterns {
		if m.patterns[i] != expected {
			t.Errorf("pattern %d: expected %+v, got %+v", i, expected, m.patterns[i])
		}
	}
}

func TestLoad_ValidIgnoreFile_IsFile(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "teleman_test_ignore_isfile")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	ignorePath := filepath.Join(tmpDir, ".telemanignore")
	err = os.WriteFile(ignorePath, []byte("filepattern\n"), 0644)
	if err != nil {
		t.Fatalf("failed to write .telemanignore: %v", err)
	}

	dummyFilePath := filepath.Join(tmpDir, "dummy.txt")
	err = os.WriteFile(dummyFilePath, []byte("dummy"), 0644)
	if err != nil {
		t.Fatalf("failed to write dummy file: %v", err)
	}

	// Pass the file path to Load
	m := Load(dummyFilePath)
	if m == nil {
		t.Fatal("expected a valid Matcher, got nil")
	}
	if !m.Loaded {
		t.Errorf("expected Loaded to be true, got false")
	}
	if len(m.patterns) != 1 {
		t.Fatalf("expected 1 pattern, got %d", len(m.patterns))
	}

	if m.patterns[0].Text != "filepattern" {
		t.Errorf("expected pattern 'filepattern', got '%s'", m.patterns[0].Text)
	}
	if m.patterns[0].IsNegate {
		t.Errorf("expected IsNegate to be false, got true")
	}
}
