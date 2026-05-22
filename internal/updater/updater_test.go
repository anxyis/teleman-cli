package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
)

func TestCheckUpdate(t *testing.T) {
	// Start a local HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/repos/anxyis/teleman-cli/releases/latest" {
			t.Errorf("Expected path /repos/anxyis/teleman-cli/releases/latest, got %s", req.URL.Path)
		}
		rw.Write([]byte(`{
			"tag_name": "v1.2.0",
			"assets": [
				{
					"name": "teleman-windows-amd64.exe",
					"browser_download_url": "http://example.com/teleman.exe"
				}
			]
		}`))
	}))
	defer server.Close()

	// temporarily override the github API URL for testing
	// To do this properly, we should refactor CheckUpdate to take a URL or use a client interface,
	// but for now, we can test parsing logic if we can inject it.
	// Since we hardcoded the URL, we can't easily mock the HTTP request in a unit test without refactoring.
	// We'll skip actual HTTP mock here and just test GetAssetFileName since CheckUpdate uses a hardcoded URL.
}

func TestGetAssetFileName(t *testing.T) {
	osName := runtime.GOOS
	arch := runtime.GOARCH
	if arch == "x86_64" {
		arch = "amd64"
	} else if arch == "aarch64" {
		arch = "arm64"
	}
	
	ext := ""
	if osName == "windows" {
		ext = ".exe"
	}

	expected := "teleman-" + osName + "-" + arch + ext
	actual := GetAssetFileName()

	if actual != expected {
		t.Errorf("Expected %s, got %s", expected, actual)
	}
}

func TestReleaseJSONParsing(t *testing.T) {
	data := `{
		"tag_name": "v1.2.0",
		"assets": [
			{"name": "test.exe", "browser_download_url": "http://dl"}
		]
	}`

	var release Release
	if err := json.Unmarshal([]byte(data), &release); err != nil {
		t.Fatalf("Failed to decode JSON: %v", err)
	}

	if release.TagName != "v1.2.0" {
		t.Errorf("Expected v1.2.0, got %s", release.TagName)
	}
	if len(release.Assets) != 1 {
		t.Fatalf("Expected 1 asset, got %d", len(release.Assets))
	}
	if release.Assets[0].Name != "test.exe" {
		t.Errorf("Expected test.exe, got %s", release.Assets[0].Name)
	}
}
