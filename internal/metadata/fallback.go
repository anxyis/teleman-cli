package metadata

import (
	"path/filepath"
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
	return CleanFilename(filepath.Base(filename))
}
