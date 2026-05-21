package core

import (
	"testing"
)

func TestIsValidDownloadPath(t *testing.T) {
	tests := []struct {
		name    string
		relPath string
		want    bool
	}{
		{
			name:    "simple file",
			relPath: "file.txt",
			want:    true,
		},
		{
			name:    "nested file",
			relPath: "dir/file.txt",
			want:    true,
		},
		{
			name:    "deeply nested file",
			relPath: "dir1/dir2/dir3/file.txt",
			want:    true,
		},
		{
			name:    "path traversal single level",
			relPath: "../file.txt",
			want:    false,
		},
		{
			name:    "path traversal multi level",
			relPath: "../../etc/passwd",
			want:    false,
		},
		{
			name:    "path traversal mid path",
			relPath: "dir/../../etc/passwd",
			want:    false,
		},
		{
			name:    "path traversal mid path resolving safely",
			relPath: "dir/../file.txt", // resolves to file.txt which is safe
			want:    true,
		},
		{
			name:    "absolute path",
			relPath: "/etc/passwd",
			want:    false,
		},
		{
			name:    "empty path",
			relPath: "",
			want:    true, // filepath.Clean("") is ".", which is safe
		},
		{
			name:    "just dot dot",
			relPath: "..",
			want:    false,
		},
		{
			name:    "windows backslash safe",
			relPath: "dir\\file.txt",
			want:    true,
		},
		{
			name:    "windows backslash traversal",
			relPath: "..\\file.txt",
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isValidDownloadPath(tt.relPath); got != tt.want {
				t.Errorf("isValidDownloadPath(%q) = %v, want %v", tt.relPath, got, tt.want)
			}
		})
	}
}
