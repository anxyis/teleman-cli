# Teleman v1.1.9 - Zero-Dependency Native Self-Updater & Version Command

This release introduces a completely overhauled, zero-dependency native self-updater and versioning system, removing the requirement for the GitHub CLI (`gh`) and external toolchains.

## 🚀 New Features

### Zero-Dependency Native Self-Updater
We have completely overhauled the `teleman update` system to make it robust, native, and completely decoupled from external toolchains.
* **No GitHub CLI Required:** The updater now queries the public GitHub Releases API and downloads updates entirely natively. You no longer need `gh` installed or authenticated on your systems!
* **OS-Specific Safety Guardrails:** Built native support for atomic replaces, automatic `sudo` elevation for Unix-like systems on permission failure, and in-place `.old` renames for Windows to bypass running executable locks.
* **Dynamic Progress Indicator:** Displays real-time download completion percentages directly in your terminal.

### New `teleman version` Command
* **Interactive Update Alerts:** Added a quick way to check your version that automatically alerts you in a non-blocking background query if a newer release is available on GitHub.

## 🛠 Fixes & Under the Hood Cleanups
* **Test Suite Alignment:** Restored test compatibility for package tests and ensured overall repository test cleanliness.
