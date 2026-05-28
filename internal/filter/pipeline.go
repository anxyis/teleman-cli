package filter

import (
	"os"
	"path/filepath"
)

// Pipeline represents an ordered sequence of rules to evaluate.
type Pipeline struct {
	Rules []Rule
}

// NewPipeline creates a new empty pipeline.
func NewPipeline() *Pipeline {
	return &Pipeline{
		Rules: make([]Rule, 0),
	}
}

// AddRule appends a rule to the end of the pipeline.
// Rules added later take precedence (last match wins).
func (p *Pipeline) AddRule(r Rule) {
	p.Rules = append(p.Rules, r)
}

// ShouldProcess evaluates the file/directory against all rules.
// Rules are evaluated top-to-bottom. The *last* rule that matches determines the outcome.
// Default behavior (if no rules match) is to INCLUDE.
//
// Special Behavior:
// If it explicitly matches an exclude rule and it's a directory, this function
// returns (false, filepath.SkipDir) so the caller can directly return that from their WalkDirFunc.
func (p *Pipeline) ShouldProcess(relPath string, info os.FileInfo) (bool, error) {
	// By default, we include everything unless explicitly excluded.
	// But if the user did `exclude *` at the top, the last matching rule handles it.
	finalResult := MatchResultInclude 
	var finalRule *Rule

	isDir := info.IsDir()
	size := info.Size()
	modTime := info.ModTime()

	for i := range p.Rules {
		r := &p.Rules[i]
		res, err := r.Evaluate(relPath, isDir, size, modTime)
		if err != nil {
			// If a pattern is malformed, we might want to log it, but for now we skip the error
			// and just don't match. Or return the error. Let's ignore parse errs at runtime
			// because they should be caught during parser loading.
			continue
		}

		if res != MatchResultNone {
			finalResult = res
			finalRule = r
		}
	}

	if finalResult == MatchResultExclude {
		if isDir {
			// Fast directory skipping
			return false, filepath.SkipDir
		}
		return false, nil
	}

	_ = finalRule // In the future, we could return finalRule for `--dry-run` logging

	return true, nil
}

// EvaluateDryRun evaluates a file and returns whether it's included, 
// and a string explanation of exactly which rule caused that outcome.
func (p *Pipeline) EvaluateDryRun(relPath string, info os.FileInfo) (bool, string) {
	finalResult := MatchResultInclude
	reason := "default behavior (no matching rule)"

	isDir := info.IsDir()
	size := info.Size()
	modTime := info.ModTime()

	for i := range p.Rules {
		r := &p.Rules[i]
		res, _ := r.Evaluate(relPath, isDir, size, modTime)
		if res != MatchResultNone {
			finalResult = res
			reason = r.String()
		}
	}

	included := (finalResult == MatchResultInclude)
	return included, reason
}
