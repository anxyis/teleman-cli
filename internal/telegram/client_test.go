package telegram_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
    "fmt"

	"github.com/teleman-cli/teleman/internal/telegram"
)

func TestDeleteMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path != "/bottoken/deleteMessages" {
			t.Errorf("expected /bottoken/deleteMessages, got %s", r.URL.Path)
		}

		var payload map[string]interface{}
		json.Unmarshal(body, &payload)

        fmt.Printf("Received payload: %v\n", payload)

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := telegram.Client{
		Token:      "token",
		APIHost:    server.URL,
		HTTPClient: server.Client(),
	}

	err := client.DeleteMessages("chat123", []int64{1, 2, 3})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}
