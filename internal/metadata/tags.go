package metadata

import (
	"path/filepath"
	"regexp"
	"strings"
)

// GenerateHashtags creates a minimal, high-signal set of hashtags based on file type and name.
func GenerateHashtags(filename, ext string, mediaType string) []string {
	var tags []string
	extTag := strings.ToLower(strings.TrimPrefix(ext, "."))

	// Base tag by category
	switch mediaType {
	case "audio":
		tags = append(tags, "#music")
		if extTag != "" && isHighSignalAudio(extTag) {
			tags = append(tags, "#"+extTag)
		}
	case "video":
		cat := identifyVideoCategory(filename)
		tags = append(tags, "#"+cat)
		tags = append(tags, extractVideoQualities(filename)...)
	case "photo":
		tags = append(tags, "#photo")
		if extTag == "raw" || extTag == "dng" {
			tags = append(tags, "#raw")
		}
	case "markdown":
		tags = append(tags, "#markdown", "#docs")
	case "sourcecode":
		tags = append(tags, getLangTag(extTag), "#sourcecode")
	case "archive":
		tags = append(tags, "#archive")
		if extTag != "" {
			tags = append(tags, "#"+extTag)
		}
	case "pdf":
		tags = append(tags, "#book", "#pdf")
	case "document":
		tags = append(tags, "#document")
	}

	return deduplicateAndLimit(tags, 5)
}

func isHighSignalAudio(ext string) bool {
	switch ext {
	case "flac", "wav", "alac", "dsd":
		return true
	}
	return false
}

func identifyVideoCategory(filename string) string {
	lower := strings.ToLower(filename)
	
	// TV heuristics
	if strings.Contains(lower, "s01") || strings.Contains(lower, "s02") || strings.Contains(lower, "s03") ||
		strings.Contains(lower, "episode") || regexp.MustCompile(`s\d{2}e\d{2}`).MatchString(lower) || regexp.MustCompile(`ep\d{2}`).MatchString(lower) {
		return "tv"
	}
	
	// Anime heuristics
	if regexp.MustCompile(`\[.*?\]`).MatchString(filename) && (strings.Contains(lower, "subsplease") || strings.Contains(lower, "erai-raws")) {
		return "anime"
	}
	
	// Default conservative fallback
	return "video"
}

func extractVideoQualities(filename string) []string {
	var tags []string
	lower := strings.ToLower(filename)
	
	if strings.Contains(lower, "2160p") || strings.Contains(lower, "4k") {
		tags = append(tags, "#4k")
	} else if strings.Contains(lower, "1080p") {
		tags = append(tags, "#1080p")
	} else if strings.Contains(lower, "720p") {
		tags = append(tags, "#720p")
	}
	
	if strings.Contains(lower, "hevc") || strings.Contains(lower, "x265") || strings.Contains(lower, "h265") {
		tags = append(tags, "#hevc")
	}
	
	return tags
}

func getLangTag(ext string) string {
	mapping := map[string]string{
		"go": "golang", "py": "python", "js": "javascript", "ts": "typescript",
		"rs": "rust", "c": "c", "cpp": "cpp", "cs": "csharp", "java": "java",
		"kt": "kotlin", "swift": "swift", "php": "php", "rb": "ruby", "sh": "shell",
		"lua": "lua", "sql": "sql", "html": "html", "css": "css", "json": "json",
		"yaml": "yaml", "yml": "yaml", "toml": "toml",
	}
	if val, ok := mapping[ext]; ok {
		return "#" + val
	}
	return "#" + ext
}

func deduplicateAndLimit(tags []string, limit int) []string {
	seen := make(map[string]bool)
	var res []string
	for _, t := range tags {
		if !seen[t] && len(res) < limit {
			seen[t] = true
			res = append(res, t)
		}
	}
	return res
}

// CleanFilename takes a messy filename and makes it human-readable for fallback captions.
func CleanFilename(filename string) string {
	ext := filepath.Ext(filename)
	base := strings.TrimSuffix(filename, ext)

	// Remove release tags inside brackets or parentheses e.g. [SubsPlease] or (2014)
	base = regexp.MustCompile(`\[.*?\]`).ReplaceAllString(base, "")
	
	// Remove common noisy release suffix terms
	noisy := []string{"1080p", "720p", "2160p", "4k", "WEBRip", "WEB-DL", "BluRay", "x264", "x265", "HEVC", "AAC", "FLAC"}
	for _, noise := range noisy {
		// Case insensitive replacement for noise terms bounded by dots or underscores
		re := regexp.MustCompile(`(?i)([\._\-\s])` + regexp.QuoteMeta(noise) + `([\._\-\s]|$)`)
		base = re.ReplaceAllString(base, "$1")
	}

	// Replace separators with spaces
	base = strings.ReplaceAll(base, ".", " ")
	base = strings.ReplaceAll(base, "_", " ")
	
	// Reformat S01E02 to " - Episode 02"
	reEp := regexp.MustCompile(`(?i)S\d{2}E(\d{2})`)
	base = reEp.ReplaceAllString(base, "— Episode $1")
	
	// Clean up duplicate spaces
	base = strings.Join(strings.Fields(base), " ")
	
	return strings.TrimSpace(base)
}
