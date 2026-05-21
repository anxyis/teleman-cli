package models

import (
	"testing"
)

func TestParseChunkSize(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    int64
		wantErr bool
	}{
		// Happy paths
		{
			name:    "empty string defaults to 49MB",
			raw:     "",
			want:    49 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "whitespace only defaults to 49MB",
			raw:     "   \t  ",
			want:    49 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "pure numeric string (bytes)",
			raw:     "1048576",
			want:    1048576,
			wantErr: false,
		},
		{
			name:    "uppercase K suffix",
			raw:     "512K",
			want:    512 * 1024,
			wantErr: false,
		},
		{
			name:    "lowercase k suffix",
			raw:     "512k",
			want:    512 * 1024,
			wantErr: false,
		},
		{
			name:    "uppercase M suffix",
			raw:     "49M",
			want:    49 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "lowercase m suffix",
			raw:     "49m",
			want:    49 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "uppercase G suffix",
			raw:     "2G",
			want:    2 * 1024 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "lowercase g suffix",
			raw:     "2g",
			want:    2 * 1024 * 1024 * 1024,
			wantErr: false,
		},
		{
			name:    "float value with suffix",
			raw:     "1.5M",
			want:    int64(1.5 * 1024 * 1024),
			wantErr: false,
		},

		// Errors and Edge Cases
		{
			name:    "zero pure numeric",
			raw:     "0",
			want:    0,
			wantErr: true,
		},
		{
			name:    "negative pure numeric",
			raw:     "-1024",
			want:    0,
			wantErr: true,
		},
		{
			name:    "zero with suffix",
			raw:     "0M",
			want:    0,
			wantErr: true,
		},
		{
			name:    "negative with suffix",
			raw:     "-1M",
			want:    0,
			wantErr: true,
		},
		{
			name:    "invalid suffix",
			raw:     "100X",
			want:    0,
			wantErr: true,
		},
		{
			name:    "invalid numeric part",
			raw:     "abcM",
			want:    0,
			wantErr: true,
		},
		{
			name:    "missing numeric part",
			raw:     "M",
			want:    0,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseChunkSize(tt.raw)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseChunkSize() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("ParseChunkSize() got = %v, want %v", got, tt.want)
			}
		})
	}
}
