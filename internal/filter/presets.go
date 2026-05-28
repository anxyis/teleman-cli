package filter

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/teleman-cli/teleman/internal/config"
)

var defaultPresets = map[string]string{
	"photos": `
# Photos Preset
include *.{jpg,jpeg,png,gif,bmp,tiff,webp,heic,raw,cr2,nef,arw}
`,
	"videos": `
# Videos Preset
include *.{mp4,mkv,avi,mov,wmv,flv,webm,m4v}
`,
	"music": `
# Music Preset
include *.{mp3,flac,wav,aac,ogg,wma,m4a,alac}
`,
	"documents": `
# Documents Preset
include *.{pdf,doc,docx,xls,xlsx,ppt,pptx,txt,rtf,odt,ods,odp}
`,
}

// GetPresetsDir returns the path to the user's preset directory.
func GetPresetsDir() (string, error) {
	return filepath.Join(filepath.Dir(config.GetConfigPath()), "presets"), nil
}

// EnsureDefaultPresets checks if the preset directory exists and creates default preset files if missing.
func EnsureDefaultPresets() error {
	presetDir, err := GetPresetsDir()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(presetDir, 0755); err != nil {
		return fmt.Errorf("failed to create presets directory: %w", err)
	}

	for name, content := range defaultPresets {
		presetPath := filepath.Join(presetDir, name+".preset")
		if _, err := os.Stat(presetPath); os.IsNotExist(err) {
			if err := os.WriteFile(presetPath, []byte(content), 0644); err != nil {
				return fmt.Errorf("failed to write preset %s: %w", name, err)
			}
		}
	}

	return nil
}

// LoadPreset loads a specific preset by name (e.g. "photos") and appends its rules to the pipeline.
func LoadPreset(name string, p *Pipeline) error {
	presetDir, err := GetPresetsDir()
	if err != nil {
		return err
	}

	presetPath := filepath.Join(presetDir, name+".preset")
	if _, err := os.Stat(presetPath); os.IsNotExist(err) {
		return fmt.Errorf("preset '%s' not found. You can create it at %s", name, presetPath)
	}

	return parseFile(presetPath, p, false)
}
