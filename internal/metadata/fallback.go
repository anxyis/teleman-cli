package metadata

import (
	"path/filepath"
	"strings"
)

// fallbackInfo ensures the MediaInfo has basic fields populated even if parsing failed.
func fallbackInfo(info *MediaInfo, filename string) *MediaInfo {
	if info == nil {
		return &MediaInfo{
			Type:  "document",
			Title: fallbackTitle(filename),
		}
	}

	if info.Title == "" {
		info.Title = fallbackTitle(filename)
	}

	return info
}

func fallbackTitle(filename string) string {
	ext := filepath.Ext(filename)
	return strings.TrimSuffix(filename, ext)
}
