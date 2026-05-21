package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/teleman-cli/teleman/internal/models"
)

func TestGetConfigPath(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)

	path := GetConfigPath()
	expected := filepath.Join(tmp, ".config", "teleman", "config.json")
	if path != expected {
		t.Errorf("expected %s, got %s", expected, path)
	}
}

func TestLoad_NotExist(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg == nil {
		t.Fatal("expected config, got nil")
	}
	if cfg.Targets == nil {
		t.Fatal("expected Targets map to be initialized, got nil")
	}
}

func TestLoad_ValidJSON(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)

	path := GetConfigPath()
	err := os.MkdirAll(filepath.Dir(path), 0755)
	if err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}

	validJSON := `{
		"targets": {
			"default": {
				"type": "channel",
				"chat_id": "123456"
			}
		}
	}`
	err = os.WriteFile(path, []byte(validJSON), 0600)
	if err != nil {
		t.Fatalf("failed to write file: %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg == nil {
		t.Fatal("expected config, got nil")
	}
	if cfg.Targets == nil {
		t.Fatal("expected Targets map to be initialized, got nil")
	}
	if target, ok := cfg.Targets["default"]; !ok {
		t.Fatal("expected 'default' target, got none")
	} else {
		if target.Type != "channel" {
			t.Errorf("expected type 'channel', got %s", target.Type)
		}
		if target.ChatID != "123456" {
			t.Errorf("expected chat_id '123456', got %s", target.ChatID)
		}
	}
}

func TestLoad_InvalidJSON(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)

	path := GetConfigPath()
	err := os.MkdirAll(filepath.Dir(path), 0755)
	if err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}

	invalidJSON := `{
		"targets": {
			"default": {
				"type": "channel",
				"chat_id": "123456"
	` // missing closing braces
	err = os.WriteFile(path, []byte(invalidJSON), 0600)
	if err != nil {
		t.Fatalf("failed to write file: %v", err)
	}

	cfg, err := Load()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if cfg != nil {
		t.Fatalf("expected nil config, got %v", cfg)
	}
}

func TestSave_Success(t *testing.T) {
	tmpDir := t.TempDir()

	// Override HOME environment variable
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir) // for windows

	cfg := &models.Config{
		ActiveToken: "test-token",
	}

	err := Save(cfg)
	if err != nil {
		t.Errorf("Save failed: %v", err)
	}

	// Verify file was written
	configPath := GetConfigPath()
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Errorf("config file was not created at %s", configPath)
	}
}

func TestSave_MkdirAllError(t *testing.T) {
	tmpDir := t.TempDir()

	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)

	// Create a file where .config would be, so MkdirAll fails
	dotConfigPath := filepath.Join(tmpDir, ".config")
	err := os.WriteFile(dotConfigPath, []byte("i am a file"), 0644)
	if err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	cfg := &models.Config{}

	err = Save(cfg)
	if err == nil {
		t.Errorf("Save should have failed because .config is a file")
	}
}

func TestSave_WriteFileError(t *testing.T) {
	tmpDir := t.TempDir()

	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)

	// Create the directory structure but make the target file a directory, so WriteFile fails
	configDir := filepath.Join(tmpDir, ".config", "teleman")
	err := os.MkdirAll(configDir, 0755)
	if err != nil {
		t.Fatalf("failed to create config dir: %v", err)
	}

	configFilePath := filepath.Join(configDir, "config.json")
	err = os.Mkdir(configFilePath, 0755) // Create a directory where the file should be
	if err != nil {
		t.Fatalf("failed to create directory at config file path: %v", err)
	}

	cfg := &models.Config{}

	err = Save(cfg)
	if err == nil {
		t.Errorf("Save should have failed because config.json is a directory")
	}
}

