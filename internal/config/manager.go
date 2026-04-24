package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/teleman-cli/teleman/internal/models"
)

// GetConfigPath returns the absolute path to the config file.
func GetConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".config", "teleman", "config.json")
}

// Load loads the configuration from disk.
func Load() (*models.Config, error) {
	path := GetConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &models.Config{Targets: make(map[string]*models.Target)}, nil
		}
		return nil, err
	}
	var cfg models.Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.Targets == nil {
		cfg.Targets = make(map[string]*models.Target)
	}
	return &cfg, nil
}

// Save writes the configuration to disk.
func Save(cfg *models.Config) error {
	path := GetConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
