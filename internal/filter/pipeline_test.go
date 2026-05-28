package filter

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

type dummyFileInfo struct {
	name    string
	size    int64
	mode    os.FileMode
	modTime time.Time
	isDir   bool
}

func (d dummyFileInfo) Name() string     { return d.name }
func (d dummyFileInfo) Size() int64      { return d.size }
func (d dummyFileInfo) Mode() os.FileMode { return d.mode }
func (d dummyFileInfo) ModTime() time.Time { return d.modTime }
func (d dummyFileInfo) IsDir() bool       { return d.isDir }
func (d dummyFileInfo) Sys() interface{}   { return nil }

func TestFilterPipeline_MaxSize(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"max-size 5M",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing lines: %v", err)
	}

	infoSmall := dummyFileInfo{name: "small.jpg", isDir: false, size: 2 * 1024 * 1024}
	infoLarge := dummyFileInfo{name: "large.jpg", isDir: false, size: 10 * 1024 * 1024}

	shouldSmall, _ := p.ShouldProcess("small.jpg", infoSmall)
	shouldLarge, _ := p.ShouldProcess("large.jpg", infoLarge)

	if !shouldSmall {
		t.Errorf("Expected small.jpg (2MB) to be processed under max-size 5M, but it was excluded")
	}
	if shouldLarge {
		t.Errorf("Expected large.jpg (10MB) to be excluded under max-size 5M, but it was processed")
	}
}

func TestFilterPipeline_MinSize(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"min-size 5M",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing: %v", err)
	}

	infoSmall := dummyFileInfo{name: "small.jpg", isDir: false, size: 2 * 1024 * 1024}
	infoLarge := dummyFileInfo{name: "large.jpg", isDir: false, size: 10 * 1024 * 1024}

	shouldSmall, _ := p.ShouldProcess("small.jpg", infoSmall)
	shouldLarge, _ := p.ShouldProcess("large.jpg", infoLarge)

	if shouldSmall {
		t.Errorf("Expected small.jpg (2MB) to be excluded under min-size 5M, but it was processed")
	}
	if !shouldLarge {
		t.Errorf("Expected large.jpg (10MB) to be processed under min-size 5M, but it was excluded")
	}
}

func TestFilterPipeline_ModifiedAfter(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"modified-after 2026-01-01",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing: %v", err)
	}

	timeOld := time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC)
	timeNew := time.Date(2026, 01, 02, 0, 0, 0, 0, time.UTC)

	infoOld := dummyFileInfo{name: "old.jpg", isDir: false, modTime: timeOld}
	infoNew := dummyFileInfo{name: "new.jpg", isDir: false, modTime: timeNew}

	shouldOld, _ := p.ShouldProcess("old.jpg", infoOld)
	shouldNew, _ := p.ShouldProcess("new.jpg", infoNew)

	if shouldOld {
		t.Errorf("Expected old.jpg (2025) to be excluded under modified-after 2026-01-01, but it was processed")
	}
	if !shouldNew {
		t.Errorf("Expected new.jpg (2026) to be processed under modified-after 2026-01-01, but it was excluded")
	}
}

func TestFilterPipeline_ModifiedBefore(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"modified-before 2026-01-01",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing: %v", err)
	}

	timeOld := time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC)
	timeNew := time.Date(2026, 01, 02, 0, 0, 0, 0, time.UTC)

	infoOld := dummyFileInfo{name: "old.jpg", isDir: false, modTime: timeOld}
	infoNew := dummyFileInfo{name: "new.jpg", isDir: false, modTime: timeNew}

	shouldOld, _ := p.ShouldProcess("old.jpg", infoOld)
	shouldNew, _ := p.ShouldProcess("new.jpg", infoNew)

	if !shouldOld {
		t.Errorf("Expected old.jpg (2025) to be processed under modified-before 2026-01-01, but it was excluded")
	}
	if shouldNew {
		t.Errorf("Expected new.jpg (2026) to be excluded under modified-before 2026-01-01, but it was processed")
	}
}

func TestFilterPipeline_LayeredGlobs(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"exclude *.jpg",
		"include important.jpg",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing: %v", err)
	}

	infoNormal := dummyFileInfo{name: "normal.jpg", isDir: false}
	infoImportant := dummyFileInfo{name: "important.jpg", isDir: false}
	infoPng := dummyFileInfo{name: "image.png", isDir: false}

	shouldNormal, _ := p.ShouldProcess("normal.jpg", infoNormal)
	shouldImportant, _ := p.ShouldProcess("important.jpg", infoImportant)
	shouldPng, _ := p.ShouldProcess("image.png", infoPng)

	if shouldNormal {
		t.Errorf("Expected normal.jpg to be excluded, but it was processed")
	}
	if !shouldImportant {
		t.Errorf("Expected important.jpg to be included (override), but it was excluded")
	}
	if !shouldPng {
		t.Errorf("Expected image.png to be included by default, but it was excluded")
	}
}

func TestFilterPipeline_DirectoryExclusion(t *testing.T) {
	p := NewPipeline()
	err := ParseLines([]string{
		"exclude node_modules/",
	}, p, false)
	if err != nil {
		t.Fatalf("unexpected error parsing: %v", err)
	}

	infoDir := dummyFileInfo{name: "node_modules", isDir: true}
	shouldProcess, err := p.ShouldProcess("node_modules/", infoDir)

	if shouldProcess {
		t.Errorf("Expected node_modules/ directory to be excluded, but it was processed")
	}
	if err != filepath.SkipDir {
		t.Errorf("Expected error to be filepath.SkipDir, but got %v", err)
	}
}
