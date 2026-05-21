package ignore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMatcher_IsIgnored(t *testing.T) {
	tests := []struct {
		name     string
		patterns []Pattern
		relPath  string
		expected bool
	}{
		{
			name:     "no patterns, implicit ignore .telemanignore",
			patterns: nil,
			relPath:  ".telemanignore",
			expected: true,
		},
		{
			name:     "no patterns, not ignored",
			patterns: nil,
			relPath:  "main.go",
			expected: false,
		},
		{
			name: "explicitly not ignore .telemanignore",
			patterns: []Pattern{
				{Text: ".telemanignore", IsNegate: true},
			},
			relPath:  ".telemanignore",
			expected: false,
		},
		{
			name: "directory exclusion",
			patterns: []Pattern{
				{Text: "node_modules/", IsNegate: false},
			},
			relPath:  "foo/node_modules/bar.js",
			expected: true,
		},
		{
			name: "directory exclusion with different path",
			patterns: []Pattern{
				{Text: "node_modules/", IsNegate: false},
			},
			relPath:  "node_modules/bar.js",
			expected: true,
		},
		{
			name: "directory exclusion not match",
			patterns: []Pattern{
				{Text: "node_modules/", IsNegate: false},
			},
			relPath:  "foo/modules/bar.js",
			expected: false,
		},
		{
			name: "extension match",
			patterns: []Pattern{
				{Text: "*.txt", IsNegate: false},
			},
			relPath:  "foo/bar/baz.txt",
			expected: true,
		},
		{
			name: "extension match not match",
			patterns: []Pattern{
				{Text: "*.txt", IsNegate: false},
			},
			relPath:  "foo/bar/baz.go",
			expected: false,
		},
		{
			name: "exact match base name",
			patterns: []Pattern{
				{Text: "secret.key", IsNegate: false},
			},
			relPath:  "foo/secret.key",
			expected: true,
		},
		{
			name: "exact match path",
			patterns: []Pattern{
				{Text: "foo/secret.key", IsNegate: false},
			},
			relPath:  "foo/secret.key",
			expected: true,
		},
		{
			name: "negation of extension",
			patterns: []Pattern{
				{Text: "*.txt", IsNegate: false},
				{Text: "important.txt", IsNegate: true},
			},
			relPath:  "foo/important.txt",
			expected: false,
		},
		{
			name: "negation of extension (last match wins)",
			patterns: []Pattern{
				{Text: "important.txt", IsNegate: true},
				{Text: "*.txt", IsNegate: false},
			},
			relPath:  "foo/important.txt",
			expected: true,
		},
		{
			name: "windows path standardized",
			patterns: []Pattern{
				{Text: "node_modules/", IsNegate: false},
			},
			relPath:  "foo\\node_modules\\bar.js",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := &Matcher{
				patterns: tt.patterns,
				Loaded:   true,
			}
			result := m.IsIgnored(tt.relPath)
			if result != tt.expected {
				t.Errorf("IsIgnored(%q) with patterns %v = %v; want %v", tt.relPath, tt.patterns, result, tt.expected)
			}
		})
	}
}

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

