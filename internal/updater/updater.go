package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"golang.org/x/mod/semver"
)

const repoOwner = "anxyis"
const repoName = "teleman-cli"

type Release struct {
	TagName string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// CheckUpdate queries the GitHub API for the latest release and returns it if it's newer than currentVersion.
func CheckUpdate(currentVersion string) (*Release, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", repoOwner, repoName)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned status %d", resp.StatusCode)
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to decode release JSON: %w", err)
	}

	if !semver.IsValid(release.TagName) || !semver.IsValid(currentVersion) {
		// Fallback to simple string comparison if invalid semver, though they should be valid
		if release.TagName == currentVersion {
			return nil, nil // No update
		}
		return &release, nil
	}

	if semver.Compare(release.TagName, currentVersion) > 0 {
		return &release, nil
	}

	return nil, nil // No update needed
}

// GetAssetFileName returns the expected asset filename for the current OS/Arch.
func GetAssetFileName() string {
	osName := runtime.GOOS
	arch := runtime.GOARCH

	// Normalize arch
	if arch == "x86_64" {
		arch = "amd64"
	} else if arch == "aarch64" {
		arch = "arm64"
	}

	ext := ""
	if osName == "windows" {
		ext = ".exe"
	}

	return fmt.Sprintf("teleman-%s-%s%s", osName, arch, ext)
}

// progressReader wraps an io.Reader to report progress.
type progressReader struct {
	io.Reader
	total      int64
	downloaded int64
	onProgress func(downloaded, total int64)
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	if n > 0 {
		pr.downloaded += int64(n)
		if pr.onProgress != nil {
			pr.onProgress(pr.downloaded, pr.total)
		}
	}
	return n, err
}

// DownloadAsset downloads the specified asset to destPath and calls onProgress during the download.
func DownloadAsset(asset *Asset, destPath string, onProgress func(downloaded, total int64)) error {
	resp, err := http.Get(asset.BrowserDownloadURL)
	if err != nil {
		return fmt.Errorf("failed to start download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download request returned status %d", resp.StatusCode)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer out.Close()

	reader := &progressReader{
		Reader:     resp.Body,
		total:      resp.ContentLength,
		onProgress: onProgress,
	}

	if _, err := io.Copy(out, reader); err != nil {
		return fmt.Errorf("error during download: %w", err)
	}

	return nil
}

// GetExePath returns the path to the currently running executable.
func GetExePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to determine executable path: %w", err)
	}
	// EvalSymlinks is important to get the real path if executed via a symlink
	return filepath.EvalSymlinks(exe)
}
