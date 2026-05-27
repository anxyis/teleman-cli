package metadata

// MediaInfo contains unified structural metadata for audio, video, and images.
// It prioritizes Telegram's required fields for media rendering.
type MediaInfo struct {
	Type              string // "audio", "video", "photo", "document"
	Title             string // Cleaned title or ID3 title
	Performer         string // ID3 artist
	Album             string // ID3 album
	Year              int    // ID3 year
	Duration          int    // Playback duration in seconds (for audio/video)
	Width             int    // Pixel width (for video/photo)
	Height            int    // Pixel height (for video/photo)
	ThumbData         []byte // Embedded cover art bytes
	MimeType          string // Detected MIME type (e.g. "video/mp4")
	SupportsStreaming bool   // True if video supports streaming (e.g. faststart mp4)
}
