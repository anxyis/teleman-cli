package metadata

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// GenerateCaption returns a semantic, Telegram-native caption based on the metadata and formatting profiles.
func GenerateCaption(info *MediaInfo, filename string) string {
	if info == nil {
		return filename
	}

	var parts []string
	cleanName := CleanFilename(filepath.Base(filename))

	switch info.Type {
	case "audio":
		if info.Title != "" && info.Performer != "" {
			parts = append(parts, fmt.Sprintf("🎵 %s — %s", info.Performer, info.Title))
		} else if info.Title != "" {
			parts = append(parts, fmt.Sprintf("🎵 %s", info.Title))
		} else {
			parts = append(parts, fmt.Sprintf("🎵 %s", cleanName))
		}

		if info.Album != "" && info.Year > 0 {
			parts = append(parts, fmt.Sprintf("💿 %s (%d)", info.Album, info.Year))
		} else if info.Album != "" {
			parts = append(parts, fmt.Sprintf("💿 %s", info.Album))
		}

		// Third line: Duration and Ext
		durExt := formatDurationAndExt(info.Duration, filename)
		if durExt != "" {
			parts = append(parts, "⏱ "+durExt)
		}

	case "video":
		if info.Title != "" {
			parts = append(parts, fmt.Sprintf("🎬 %s", info.Title))
		} else {
			parts = append(parts, fmt.Sprintf("🎬 %s", cleanName))
		}

		if info.Width > 0 && info.Height > 0 {
			res := fmt.Sprintf("%d×%d", info.Width, info.Height)
			ext := strings.ToUpper(strings.TrimPrefix(filepath.Ext(filename), "."))
			if ext != "" {
				res += " • " + ext
			}
			parts = append(parts, fmt.Sprintf("📺 %s", res))
		}

		if info.Duration > 0 {
			parts = append(parts, fmt.Sprintf("⏱ %s", formatDuration(info.Duration)))
		}

	case "photo":
		parts = append(parts, fmt.Sprintf("🖼 %s", cleanName))
		if info.Width > 0 && info.Height > 0 {
			parts = append(parts, fmt.Sprintf("📐 %d×%d", info.Width, info.Height))
		}

	case "markdown":
		parts = append(parts, fmt.Sprintf("📝 %s", filepath.Base(filename)))
		parts = append(parts, "📚 Markdown Document")

	case "sourcecode":
		parts = append(parts, fmt.Sprintf("💻 %s", filepath.Base(filename)))
		parts = append(parts, fmt.Sprintf("⚙ Source Code • %s", formatSize(info.Size)))

	case "archive":
		parts = append(parts, fmt.Sprintf("📦 %s", filepath.Base(filename)))
		if info.Size > 0 {
			parts = append(parts, fmt.Sprintf("💾 %s", formatSize(info.Size)))
		}
		parts = append(parts, "🗜 Archive")

	case "pdf":
		parts = append(parts, fmt.Sprintf("📖 %s", cleanName))
		parts = append(parts, fmt.Sprintf("📄 PDF • %s", formatSize(info.Size)))

	default: // generic document
		parts = append(parts, fmt.Sprintf("📄 %s", filepath.Base(filename)))
		if info.Size > 0 {
			parts = append(parts, fmt.Sprintf("💾 %s", formatSize(info.Size)))
		}
	}

	// Append hashtags nicely spaced at the bottom
	if len(info.Hashtags) > 0 {
		parts = append(parts, "")
		parts = append(parts, strings.Join(info.Hashtags, " "))
	}

	return strings.Join(parts, "\n")
}

func formatDurationAndExt(seconds int, filename string) string {
	ext := strings.ToUpper(strings.TrimPrefix(filepath.Ext(filename), "."))
	dur := formatDuration(seconds)
	
	if dur != "" && ext != "" {
		return dur + " • " + ext
	} else if dur != "" {
		return dur
	}
	return ext
}

func formatDuration(seconds int) string {
	if seconds <= 0 {
		return ""
	}
	d := time.Duration(seconds) * time.Second
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m) // Usually don't need seconds if hours are present
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

func formatSize(bytes int64) string {
	if bytes == 0 {
		return "Unknown Size"
	}
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
