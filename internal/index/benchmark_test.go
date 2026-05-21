package index_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/teleman-cli/teleman/internal/telegram"
)

func BenchmarkDeleteMessages(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Millisecond) // Simulate network latency

		// Optional: parse body to ensure it's doing work, but keep it minimal
		if r.Method == "POST" {
			io.Copy(io.Discard, r.Body)
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := &telegram.Client{
		Token:      "testtoken",
		APIHost:    server.URL,
		HTTPClient: server.Client(),
	}

	b.Run("Sequential_DeleteMessage", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			for j := 0; j < 50; j++ {
				client.DeleteMessage("chat_id", int64(j))
			}
		}
	})

	b.Run("Bulk_DeleteMessages", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			var ids []int64
			for j := 0; j < 50; j++ {
				ids = append(ids, int64(j))
			}
			client.DeleteMessages("chat_id", ids)
		}
	})
}
