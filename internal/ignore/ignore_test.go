package ignore

import (
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
