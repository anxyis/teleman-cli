package models

type HostMap struct {
	Local     string `json:"local,omitempty"`     // e.g. "http://192.168.0.7:8081"
	Tailscale string `json:"tailscale,omitempty"` // e.g. "http://100.x.x.x:8081"
	Public    string `json:"public,omitempty"`    // e.g. "https://api.mydomain.com"
}

// Config represents the local CLI configuration mapping.
type Config struct {
	ActiveToken       string             `json:"active_token"`
	IndexChannelID    string             `json:"index_channel_id"`     // Dedicated private channel for Index versions
	AutoDetectAPIHost bool               `json:"auto_detect_api_host"` // Try to detect if we can send >50MB files via local API
	APIHosts          HostMap            `json:"api_hosts"`            // Fallback endpoints for Bot API
	FileServerHosts   HostMap            `json:"file_server_hosts"`    // Fallback endpoints for File Server
	Targets           map[string]*Target `json:"targets"`              // Map of aliases to Target
}

// Target represents a destination mapped to a human-readable alias.
type Target struct {
	Type     string `json:"type"` // "user", "channel", "topic"
	ChatID   string `json:"chat_id"`
	ThreadID string `json:"thread_id,omitempty"` // For topics
}
