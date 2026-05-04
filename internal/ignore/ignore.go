package ignore

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// Pattern holds a parsed rule and whether it is a negation
type Pattern struct {
	Text     string
	IsNegate bool
}

// Matcher holds the ignore patterns and provides a way to check files
type Matcher struct {
	patterns []Pattern
	Loaded   bool
}

// Load reads .telemanignore from the given source directory if it exists
func Load(sourceDir string) *Matcher {
	m := &Matcher{}

	info, err := os.Stat(sourceDir)
	if err != nil {
		return m
	}

	var ignorePath string
	if info.IsDir() {
		ignorePath = filepath.Join(sourceDir, ".telemanignore")
	} else {
		ignorePath = filepath.Join(filepath.Dir(sourceDir), ".telemanignore")
	}

	file, err := os.Open(ignorePath)
	if err != nil {
		return m // File might not exist, which is fine
	}
	defer file.Close()

	m.Loaded = true

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		
		isNegate := false
		if strings.HasPrefix(line, "!") {
			isNegate = true
			line = strings.TrimPrefix(line, "!")
			line = strings.TrimSpace(line)
		}

		if line != "" {
			m.patterns = append(m.patterns, Pattern{
				Text:     line,
				IsNegate: isNegate,
			})
		}
	}

	return m
}

// IsIgnored checks if a given relative path is ignored based on the patterns.
// It iterates through all rules in order. The last matching rule wins.
// If the last match is a negation (!), the file is NOT ignored.
func (m *Matcher) IsIgnored(relPath string) bool {
	if len(m.patterns) == 0 {
		return false
	}

	// standardize path to forward slashes
	relPath = strings.ReplaceAll(relPath, "\\", "/")
	
	// get just the filename for some match rules
	baseName := filepath.Base(relPath)
	parts := strings.Split(relPath, "/")

	ignored := false

	for _, p := range m.patterns {
		match := false

		// 1. Directory exclusion (ends with /)
		if strings.HasSuffix(p.Text, "/") {
			dirName := strings.TrimSuffix(p.Text, "/")
			for _, part := range parts {
				if part == dirName {
					match = true
					break
				}
			}
		} else if strings.HasPrefix(p.Text, "*.") {
			// 2. Extension match
			ext := strings.TrimPrefix(p.Text, "*")
			if strings.HasSuffix(relPath, ext) {
				match = true
			}
		} else {
			// 3. Exact match
			if relPath == p.Text || baseName == p.Text {
				match = true
			}
		}

		if match {
			// Last match wins, if it's negated, then ignored is false
			ignored = !p.IsNegate
		}
	}

	return ignored
}
