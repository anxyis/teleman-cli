package progress

import (
	"context"
	"io"
	"testing"

	"github.com/vbauerster/mpb/v8"
)

func TestNewBarWriter(t *testing.T) {
	t.Run("nil bar", func(t *testing.T) {
		writer := NewBarWriter(nil)
		if writer != io.Discard {
			t.Errorf("expected io.Discard for nil bar, got %T", writer)
		}
	})

	t.Run("valid bar", func(t *testing.T) {
		p := mpb.NewWithContext(context.Background(), mpb.WithOutput(io.Discard))
		bar := p.AddBar(100)

		writer := NewBarWriter(bar)
		if writer == nil {
			t.Error("expected non-nil writer for valid bar")
		}
		if writer == io.Discard {
			t.Error("expected wrapped writer for valid bar, got io.Discard directly")
		}

		// Ensure the writer works by writing to it
		n, err := writer.Write([]byte("test"))
		if err != nil {
			t.Errorf("unexpected error writing to bar writer: %v", err)
		}
		if n != 4 {
			t.Errorf("expected 4 bytes written, got %d", n)
		}

		bar.Abort(false)
		p.Wait()
	})
}
