package metadata

import (
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
func Parse(r io.ReadSeeker, filename string) *MediaInfo {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeType := mime.TypeByExtension(ext)
	
	info := &MediaInfo{
		MimeType: mimeType,
	}

	// Route based on MIME type or extension
	if strings.HasPrefix(mimeType, "audio/") {
		info.Type = "audio"
		parseAudio(r, filename, ext, info)
	} else if strings.HasPrefix(mimeType, "video/") || ext == ".mkv" || ext == ".webm" {
		info.Type = "video"
		// Set default supports streaming if we know it's a video. Will be overridden by actual parsing if not supported.
		info.SupportsStreaming = true 
		parseVideo(r, filename, ext, info)
	} else if strings.HasPrefix(mimeType, "image/") {
		info.Type = "photo"
		// basic image parsing could go here
	} else {
		info.Type = "document"
	}

	// Rewind the reader for the actual upload
	r.Seek(0, io.SeekStart)

	return fallbackInfo(info, filename)
}
