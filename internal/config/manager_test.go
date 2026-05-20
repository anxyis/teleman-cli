package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/teleman-cli/teleman/internal/models"
)

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
