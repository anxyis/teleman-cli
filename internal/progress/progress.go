package progress

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/mattn/go-isatty"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

// Manager handles progress bars for file transfers.
type Manager struct {
	p          *mpb.Progress
	overallBar *mpb.Bar
	isTTY      bool
}

// NewManager creates a new progress manager.
func NewManager(ctx context.Context, totalFiles int, description string) *Manager {
	isTTY := isatty.IsTerminal(os.Stdout.Fd()) || isatty.IsCygwinTerminal(os.Stdout.Fd())

	if !isTTY {
		return &Manager{isTTY: false}
	}

	p := mpb.NewWithContext(ctx,
		mpb.WithWidth(60),
		mpb.WithRefreshRate(100),
	)

	var overallBar *mpb.Bar
	if totalFiles > 0 {
		overallBar = p.AddBar(int64(totalFiles),
			mpb.PrependDecorators(
				decor.Name(description+": ", decor.WCSyncSpaceR),
				decor.CountersNoUnit("[%d / %d]", decor.WCSyncSpace),
			),
			mpb.AppendDecorators(
				decor.Percentage(decor.WCSyncSpace),
			),
		)
	}

	return &Manager{
		p:          p,
		overallBar: overallBar,
		isTTY:      true,
	}
}

// Wait blocks until all progress bars have finished.
func (m *Manager) Wait() {
	if m.p != nil {
		m.p.Wait()
	}
}

// IncrementOverall increments the overall progress bar by 1.
func (m *Manager) IncrementOverall() {
	if m.overallBar != nil {
		m.overallBar.Increment()
	}
}

// AddFileBar creates a new progress bar for a single file transfer.
// It automatically removes itself when completed.
func (m *Manager) AddFileBar(filename string, size int64) *mpb.Bar {
	if m.p == nil {
		return nil
	}

	// Truncate filename if it's too long
	display := filename
	if len(display) > 30 {
		display = "..." + display[len(display)-27:]
	}

	bar := m.p.AddBar(size,
		mpb.BarRemoveOnComplete(),
		mpb.PrependDecorators(
			decor.Name(fmt.Sprintf("%-30s", display), decor.WCSyncSpaceR),
			decor.CountersKibiByte("% .2f / % .2f", decor.WCSyncSpace),
		),
		mpb.AppendDecorators(
			decor.EwmaETA(decor.ET_STYLE_GO, 90, decor.WCSyncSpace),
			decor.Name(" ] "),
			decor.EwmaSpeed(decor.SizeB1024(0), "% .2f", 60),
		),
	)

	return bar
}

// ProxyReader wraps an io.Reader to update the progress bar.
// If the bar is nil, it returns the original reader.
func (m *Manager) ProxyReader(r io.Reader, bar *mpb.Bar) io.ReadCloser {
	if bar == nil {
		if rc, ok := r.(io.ReadCloser); ok {
			return rc
		}
		return io.NopCloser(r)
	}
	return bar.ProxyReader(r)
}

// NewBarWriter creates an io.Writer that updates the given bar using Ewma automatically.
func NewBarWriter(bar *mpb.Bar) io.Writer {
	if bar == nil {
		return io.Discard
	}
	return bar.ProxyWriter(io.Discard)
}

// IsTTY returns whether the output is an interactive terminal.
func (m *Manager) IsTTY() bool {
	return m.isTTY
}
