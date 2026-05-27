package metadata

import (
	"image"
	_ "image/jpeg"
	_ "image/png"
	// Note: to support webp without cgo, we'd need golang.org/x/image/webp
	// Since we are pure-Go and want to stay lightweight, we'll stick to stdlib (jpeg/png/gif).
	_ "image/gif"
	"io"
	"mime"
	"path/filepath"
	"strings"
)

func init() {
	// Ensure common media extensions are registered
	mime.AddExtensionType(".mkv", "video/x-matroska")
	mime.AddExtensionType(".webm", "video/webm")
	mime.AddExtensionType(".mp4", "video/mp4")
	mime.AddExtensionType(".m4a", "audio/mp4")
	mime.AddExtensionType(".mp3", "audio/mpeg")
	mime.AddExtensionType(".flac", "audio/flac")
}

// Parse attempts to extract structural metadata from the media stream.
// It is best-effort and will never panic or return fatal errors that should abort an upload.
func Parse(r io.ReadSeeker, filename string, size int64) *MediaInfo {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeType := mime.TypeByExtension(ext)
	
	info := &MediaInfo{
		MimeType: mimeType,
		Size:     size,
	}

	// Route based on MIME type or extension
	if strings.HasPrefix(mimeType, "audio/") {
		info.Type = "audio"
		parseAudio(r, filename, ext, info)
	} else if strings.HasPrefix(mimeType, "video/") || ext == ".mkv" || ext == ".webm" {
		info.Type = "video"
		info.SupportsStreaming = true 
		parseVideo(r, filename, ext, info)
	} else if strings.HasPrefix(mimeType, "image/") {
		info.Type = "photo"
		r.Seek(0, io.SeekStart)
		if config, _, err := image.DecodeConfig(r); err == nil {
			info.Width = config.Width
			info.Height = config.Height
		}
	} else {
		// Document sub-routing
		info.Type = resolveDocumentType(ext)
	}

	// Generate hashtags
	info.Hashtags = GenerateHashtags(filename, ext, info.Type)

	// Rewind the reader for the actual upload
	r.Seek(0, io.SeekStart)

	return fallbackInfo(info, filename)
}

func resolveDocumentType(ext string) string {
	extTag := strings.TrimPrefix(ext, ".")
	
	switch extTag {
	case "md":
		return "markdown"
	case "pdf":
		return "pdf"
	case "zip", "rar", "7z", "tar", "gz", "xz", "bz2":
		return "archive"
	}
	
	// Check source code mapping
	if strings.HasPrefix(getLangTag(extTag), "#") && getLangTag(extTag) != "#"+extTag {
		// If getLangTag returned a mapped value like #golang instead of just #ext
		// Or if it's explicitly in our source code map... wait, the logic in tags.go maps many extensions.
		// Let's just explicitly match common ones here to be safe.
		return "sourcecode"
	}

	// Double check explicit code extensions
	switch extTag {
	case "go", "py", "js", "ts", "rs", "c", "cpp", "cs", "java", "kt", "swift", "php", "rb", "sh", "lua", "sql", "html", "css", "json", "yaml", "yml", "toml":
		return "sourcecode"
	}
	
	return "document"
}
