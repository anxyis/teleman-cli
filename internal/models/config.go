package models

// Config represents the local CLI configuration mapping.
type Config struct {
	ActiveToken       string             `json:"active_token"`
	IndexChannelID    string             `json:"index_channel_id"`    // Dedicated private channel for Index versions
	AutoDetectAPIHost bool               `json:"auto_detect_api_host"` // Try to detect if we can send >50MB files via local API
	CustomAPIHost     string             `json:"custom_api_host"`     // e.g. "http://localhost:8081"
	FileServerHost    string             `json:"file_server_host"`    // e.g. "http://192.168.0.7:9000" — nginx serving bot API data dir for downloads
	Targets           map[string]*Target `json:"targets"`             // Map of aliases to Target
}

// Target represents a destination mapped to a human-readable alias.
type Target struct {
	Type     string `json:"type"` // "user", "channel", "topic"
	ChatID   string `json:"chat_id"`
	ThreadID string `json:"thread_id,omitempty"` // For topics
}
