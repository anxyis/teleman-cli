# Teleman - Release Guide

This document outlines the process for building binaries and preparing a new release of Teleman.

## 1. Local Build Process

Teleman is written in Go, which makes cross-compilation straightforward. You can generate binaries for Windows and Linux directly from your development machine.

### Build Scripts
We provide scripts to automate the build process for standard platforms:
- **Windows (PowerShell):** `.\scripts\build.ps1`
- **Linux/macOS (Bash):** `./scripts/build.sh`

### Manual Build Instructions
If you prefer to run commands manually, use the following:

**Windows (amd64):**
```bash
$env:GOOS="windows"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o teleman-windows-amd64.exe main.go
```

**Linux (amd64):**
```bash
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o teleman-linux-amd64 main.go
```

**Linux (arm64/Termux):**
```bash
$env:GOOS="linux"; $env:GOARCH="arm64"; go build -ldflags="-s -w" -o teleman-linux-arm64 main.go
```

> [!TIP]
> The `-ldflags="-s -w"` flag significantly reduces the binary size by removing debug symbols.

---

## 2. GitHub Release Checklist

Follow these steps when creating a new release on GitHub:

### Pre-Release
- [ ] **Run Tests:** Ensure all tests pass.
  ```bash
  go test ./...
  ```
- [ ] **Verify Version:** Update version strings if applicable (e.g., in `README.md` or a `version.go` file).
- [ ] **Changelog:** Prepare a summary of changes (Features, Bug Fixes, Breaking Changes).

### Build & Package
- [ ] **Run Build Script:** Generate the binaries in the `dist/` folder.
- [ ] **Sanity Check:** Run the generated binaries locally to ensure they start correctly.

### GitHub Upload
- [ ] **Create Tag:** Create a new git tag (e.g., `v1.2.0`) and push it.
- [ ] **Draft Release:** Go to the "Releases" page on GitHub and draft a new release.
- [ ] **Upload Binaries:** Drag and drop the files from the `dist/` folder:
  - `teleman-windows-amd64.exe`
  - `teleman-linux-amd64`
  - `teleman-linux-arm64`
- [ ] **Add Release Notes:** Paste your changelog and include basic usage instructions for new users.

### Post-Release
- [ ] **Announcement:** Notify the community or users of the update.

---

## 3. Usage Instructions for Users

When users download the binary, they can run it immediately without Go installed.

### Windows
1. Download `teleman-windows-amd64.exe`.
2. Rename it to `teleman.exe` (optional).
3. Open Terminal/PowerShell in the same folder.
4. Run: `.\teleman.exe config`

### Linux / Termux
1. Download the appropriate binary (amd64 or arm64).
2. Give it execution permissions:
   ```bash
   chmod +x teleman-linux-amd64
   ```
3. Move to a folder in your PATH (optional):
   ```bash
   mv teleman-linux-amd64 /usr/local/bin/teleman
   ```
4. Run: `teleman config`
