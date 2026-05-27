package metadata

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// GenerateCaption returns a semantic, Telegram-native caption based on the metadata.
func GenerateCaption(info *MediaInfo, filename string) string {
	if info == nil {
		return filename
	}

	var parts []string

	switch info.Type {
	case "audio":
		if info.Title != "" && info.Performer != "" {
			parts = append(parts, fmt.Sprintf("🎵 %s - %s", info.Performer, info.Title))
		} else if info.Title != "" {
			parts = append(parts, fmt.Sprintf("🎵 %s", info.Title))
		} else {
			parts = append(parts, fmt.Sprintf("🎵 %s", filename))
		}

		if info.Album != "" && info.Year > 0 {
			parts = append(parts, fmt.Sprintf("💿 %s (%d)", info.Album, info.Year))
		} else if info.Album != "" {
			parts = append(parts, fmt.Sprintf("💿 %s", info.Album))
		}

		if info.Duration > 0 {
			parts = append(parts, fmt.Sprintf("⏱ %s", formatDuration(info.Duration)))
		}

	case "video":
		if info.Title != "" {
			parts = append(parts, fmt.Sprintf("🎬 %s", info.Title))
		} else {
			// Clean up filename for title
			ext := filepath.Ext(filename)
			name := strings.TrimSuffix(filename, ext)
			parts = append(parts, fmt.Sprintf("🎬 %s", name))
		}

		if info.Width > 0 && info.Height > 0 {
			parts = append(parts, fmt.Sprintf("📺 %dx%d", info.Width, info.Height))
		}

		if info.Duration > 0 {
			parts = append(parts, fmt.Sprintf("⏱ %s", formatDuration(info.Duration)))
		}

	default:
		return filename
	}

	return strings.Join(parts, "\n")
}

func formatDuration(seconds int) string {
	d := time.Duration(seconds) * time.Second
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	
	if h > 0 {
		return fmt.Sprintf("%dh %dm %ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
