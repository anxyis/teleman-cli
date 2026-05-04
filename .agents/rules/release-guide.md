# Agent Release Process Guidelines

When the USER requests to make a new release for `teleman-cli` using GitHub CLI (`gh`), you MUST follow these exact steps to avoid breaking legacy updaters.

## 1. Version Update
Ensure `AppVersion` inside `cmd/root.go` is updated to the target version (e.g., `v1.1.4`).

## 2. Commit and Push
Run `git add .`, `git commit -m "..."`, and `git push origin main` before creating the release.

## 3. Build Binaries
Run the build script to generate fresh cross-platform binaries:
```powershell
.\scripts\build.ps1
```
*(This will populate the `dist/` folder with the Windows, Linux, and Termux/ARM binaries).*

## 4. GitHub Release Creation (CRITICAL)
When running `gh release create`, you MUST include **BOTH** the compiled binaries from `dist/` **AND** the legacy installation scripts from `scripts/`. 

**Why?** Older versions of `teleman` (v1.1.2 and below) rely on downloading `install.ps1` or `install.sh` directly from the GitHub release assets to perform self-updates. If you omit them, legacy users running `teleman update` will get a fatal error: `"no assets match the file pattern"`.

**Exact `gh` Command Structure:**
```bash
gh release create <VERSION_TAG> dist/teleman-windows-amd64.exe dist/teleman-linux-amd64 dist/teleman-linux-arm64 scripts/install.ps1 scripts/install.sh --title "<TITLE>" --notes "<NOTES>"
```

### Verification Checklist:
- [ ] Included `dist/teleman-windows-amd64.exe`
- [ ] Included `dist/teleman-linux-amd64`
- [ ] Included `dist/teleman-linux-arm64`
- [ ] **Included `scripts/install.ps1`** (REQUIRED to prevent Windows updater crash)
- [ ] **Included `scripts/install.sh`** (REQUIRED to prevent Linux/macOS updater crash)
