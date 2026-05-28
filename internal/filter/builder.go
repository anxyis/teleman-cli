package filter

import (
	"fmt"

	"github.com/teleman-cli/teleman/internal/models"
)

// BuildPipelineFromOptions loads the .telemanfilter (or .telemanignore) for a source directory,
// appends preset rules, and finally appends CLI flag rules to create the final pipeline.
func BuildPipelineFromOptions(sourceDir string, opts *models.TransferOptions) (*Pipeline, error) {
	p, err := Load(sourceDir)
	if err != nil {
		return nil, fmt.Errorf("failed to load filter: %v", err)
	}

	// 1. Presets
	if opts.Photos {
		LoadPreset("photos", p)
	}
	if opts.Videos {
		LoadPreset("videos", p)
	}
	if opts.Music {
		LoadPreset("music", p)
	}
	if opts.Documents {
		LoadPreset("documents", p)
	}

	// 2. CLI flags (appended last to override)
	var cliLines []string
	
	if opts.MinSize != "" {
		cliLines = append(cliLines, "min-size "+opts.MinSize)
	}
	if opts.MaxSize != "" {
		cliLines = append(cliLines, "max-size "+opts.MaxSize)
	}
	if opts.ModifiedAfter != "" {
		cliLines = append(cliLines, "modified-after "+opts.ModifiedAfter)
	}
	if opts.ModifiedBefore != "" {
		cliLines = append(cliLines, "modified-before "+opts.ModifiedBefore)
	}
	for _, inc := range opts.Includes {
		cliLines = append(cliLines, "include "+inc)
	}
	for _, exc := range opts.Excludes {
		cliLines = append(cliLines, "exclude "+exc)
	}

	if err := ParseLines(cliLines, p, false); err != nil {
		return nil, fmt.Errorf("invalid CLI filter: %v", err)
	}

	return p, nil
}
