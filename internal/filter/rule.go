package filter

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/bmatcuk/doublestar/v4"
)

// RuleType denotes what kind of matching logic this rule uses.
type RuleType int

const (
	RuleTypePath RuleType = iota // Direct directory/file match (e.g., node_modules/)
	RuleTypeGlob                 // Glob pattern match (e.g., **/*.flac)
	RuleTypeRegex                // Advanced regex (e.g., ^S\d+E\d+$)
	RuleTypeSize                 // Size limit (e.g., 50M)
	RuleTypeDate                 // Date limit (e.g., 2021-01-01)
)

// RuleAction denotes whether a matching rule includes or excludes the file.
type RuleAction int

const (
	RuleActionExclude RuleAction = iota
	RuleActionInclude
)

// Rule is a single compiled filter condition.
type Rule struct {
	Type   RuleType
	Action RuleAction

	// The raw string value used to construct the rule.
	Raw string

	// For RuleTypeGlob and RuleTypePath
	Pattern string

	// For RuleTypeRegex
	Regex *regexp.Regexp

	// For RuleTypeSize
	// MinSize is the lower bound (0 if none)
	MinSize int64
	// MaxSize is the upper bound (0 if none)
	MaxSize int64

	// For RuleTypeDate
	// ModAfter is the lower bound timestamp
	ModAfter time.Time
	// ModBefore is the upper bound timestamp
	ModBefore time.Time
}

// MatchResult represents the outcome of evaluating a rule against a file/dir.
type MatchResult int

const (
	MatchResultNone MatchResult = iota // Rule did not match
	MatchResultInclude                 // Rule matched and explicitly includes
	MatchResultExclude                 // Rule matched and explicitly excludes
)

// Evaluate checks if the given relPath, isDir, size, and modTime match this rule.
// It returns a MatchResult and optionally an error if pattern matching fails unexpectedly.
func (r *Rule) Evaluate(relPath string, isDir bool, size int64, modTime time.Time) (MatchResult, error) {
	// Standardize path separators for consistent matching
	relPath = strings.ReplaceAll(relPath, "\\", "/")
	if isDir && !strings.HasSuffix(relPath, "/") {
		relPath += "/"
	}

	match := false
	var err error

	switch r.Type {
	case RuleTypePath:
		// For path rules like "drumkits/", we check if any path segment matches
		// or if it matches as a prefix/suffix depending on how rclone/rsync does it.
		// A simple robust way is: if it's a dir match, check if relPath contains it.
		// If the rule starts with "/", it must be rooted at relPath start.
		pattern := r.Pattern
		rooted := strings.HasPrefix(pattern, "/")
		if rooted {
			pattern = strings.TrimPrefix(pattern, "/")
			match = strings.HasPrefix(relPath, pattern)
		} else {
			// e.g. "node_modules/" matches "node_modules/" and "src/node_modules/"
			match = strings.Contains(relPath, pattern) || relPath == pattern
		}

	case RuleTypeGlob:
		// Use doublestar for things like **/*.flac
		match, err = doublestar.Match(r.Pattern, relPath)
		if err != nil {
			return MatchResultNone, err
		}
		// In many engines, a glob might also match just the base name.
		if !match && !strings.Contains(r.Pattern, "/") {
			match, err = doublestar.Match(r.Pattern, getBaseName(relPath))
			if err != nil {
				return MatchResultNone, err
			}
		}

	case RuleTypeRegex:
		if r.Regex != nil {
			match = r.Regex.MatchString(relPath) || r.Regex.MatchString(getBaseName(relPath))
		}

	case RuleTypeSize:
		// Size rules only apply to files
		if !isDir {
			if r.MinSize > 0 && r.MaxSize > 0 {
				match = size >= r.MinSize && size <= r.MaxSize
			} else if r.MinSize > 0 {
				match = size >= r.MinSize
			} else if r.MaxSize > 0 {
				match = size <= r.MaxSize
			}
		}

	case RuleTypeDate:
		// Date rules only apply to files
		if !isDir {
			if !r.ModAfter.IsZero() {
				match = !modTime.After(r.ModAfter)
			} else if !r.ModBefore.IsZero() {
				match = !modTime.Before(r.ModBefore)
			}
		}
	}

	if match {
		if r.Action == RuleActionInclude {
			return MatchResultInclude, nil
		}
		return MatchResultExclude, nil
	}

	return MatchResultNone, nil
}

func getBaseName(path string) string {
	path = strings.TrimSuffix(path, "/")
	idx := strings.LastIndex(path, "/")
	if idx >= 0 {
		return path[idx+1:]
	}
	return path
}

// String provides a human-readable representation of the rule for dry-run debugging.
func (r *Rule) String() string {
	actionStr := "exclude"
	if r.Action == RuleActionInclude {
		actionStr = "include"
	}
	return fmt.Sprintf("%s: %s", actionStr, r.Raw)
}
