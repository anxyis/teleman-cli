package filter

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Load reads .telemanfilter from the given source directory if it exists
// and returns a Pipeline. If it doesn't exist, it looks for .telemanignore.
func Load(sourceDir string) (*Pipeline, error) {
	p := NewPipeline()

	info, err := os.Stat(sourceDir)
	if err != nil {
		return p, nil
	}

	var baseDir string
	if info.IsDir() {
		baseDir = sourceDir
	} else {
		baseDir = filepath.Dir(sourceDir)
	}

	filterPath := filepath.Join(baseDir, ".telemanfilter")
	ignorePath := filepath.Join(baseDir, ".telemanignore")

	// .telemanfilter takes precedence
	if _, err := os.Stat(filterPath); err == nil {
		err := parseFile(filterPath, p, false)
		return p, err
	}

	// Legacy .telemanignore fallback
	if _, err := os.Stat(ignorePath); err == nil {
		err := parseFile(ignorePath, p, true)
		return p, err
	}

	return p, nil
}

// ParseLines parses a slice of raw strings into the pipeline.
// Useful for CLI flags and preset files.
func ParseLines(lines []string, p *Pipeline, legacyIgnore bool) error {
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		rule, err := parseLine(line, legacyIgnore)
		if err != nil {
			return fmt.Errorf("invalid rule '%s': %v", line, err)
		}
		if rule != nil {
			p.AddRule(*rule)
		}
	}
	return nil
}

func parseFile(path string, p *Pipeline, legacyIgnore bool) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return ParseLines(lines, p, legacyIgnore)
}

func parseLine(line string, legacyIgnore bool) (*Rule, error) {
	if legacyIgnore {
		// Legacy ignore syntax: every line is an exclude unless prefixed with !
		isNegate := false
		if strings.HasPrefix(line, "!") {
			isNegate = true
			line = strings.TrimPrefix(line, "!")
			line = strings.TrimSpace(line)
		}

		action := RuleActionExclude
		if isNegate {
			action = RuleActionInclude
		}
		
		return buildStringRule(action, line, line), nil
	}

	// Modern .telemanfilter syntax
	parts := strings.SplitN(line, " ", 2)
	if len(parts) == 0 {
		return nil, nil
	}

	keyword := strings.ToLower(parts[0])
	val := ""
	if len(parts) > 1 {
		val = strings.TrimSpace(parts[1])
	}

	switch keyword {
	case "include":
		return buildStringRule(RuleActionInclude, val, line), nil
	case "exclude":
		return buildStringRule(RuleActionExclude, val, line), nil
	case "max-size":
		size, err := parseSize(val)
		if err != nil {
			return nil, err
		}
		// If larger than max-size, exclude it
		return &Rule{Type: RuleTypeSize, Action: RuleActionExclude, Raw: line, MinSize: size + 1}, nil
	case "min-size":
		size, err := parseSize(val)
		if err != nil {
			return nil, err
		}
		// If less than min-size, exclude it
		return &Rule{Type: RuleTypeSize, Action: RuleActionExclude, Raw: line, MaxSize: size - 1}, nil
	case "modified-after":
		t, err := parseDate(val)
		if err != nil {
			return nil, err
		}
		// If modTime <= t (not after), exclude it
		return &Rule{Type: RuleTypeDate, Action: RuleActionExclude, Raw: line, ModAfter: t}, nil
	case "modified-before":
		t, err := parseDate(val)
		if err != nil {
			return nil, err
		}
		// If modTime >= t (not before), exclude it
		return &Rule{Type: RuleTypeDate, Action: RuleActionExclude, Raw: line, ModBefore: t}, nil
	default:
		return nil, fmt.Errorf("unknown keyword '%s'", keyword)
	}
}

func buildStringRule(action RuleAction, pattern string, raw string) *Rule {
	r := &Rule{
		Action:  action,
		Raw:     raw,
		Pattern: pattern,
	}

	if strings.HasSuffix(pattern, "/") || strings.HasPrefix(pattern, "/") {
		r.Type = RuleTypePath
	} else if strings.HasPrefix(pattern, "regex:") {
		r.Type = RuleTypeRegex
		rx, _ := regexp.Compile(strings.TrimPrefix(pattern, "regex:"))
		r.Regex = rx
	} else {
		// Treat as glob
		r.Type = RuleTypeGlob
	}
	return r
}

func parseSize(s string) (int64, error) {
	s = strings.ToUpper(s)
	multiplier := int64(1)
	if strings.HasSuffix(s, "G") || strings.HasSuffix(s, "GB") {
		multiplier = 1024 * 1024 * 1024
		s = strings.TrimRight(s, "GB")
	} else if strings.HasSuffix(s, "M") || strings.HasSuffix(s, "MB") {
		multiplier = 1024 * 1024
		s = strings.TrimRight(s, "MB")
	} else if strings.HasSuffix(s, "K") || strings.HasSuffix(s, "KB") {
		multiplier = 1024
		s = strings.TrimRight(s, "KB")
	}
	
	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	return int64(val * float64(multiplier)), nil
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}
