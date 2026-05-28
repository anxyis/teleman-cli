# Teleman CLI — Complete Command Guide

A comprehensive, scenario-driven reference for every Teleman command. Each section contains real, copy-pasteable examples you can run directly.

> **Tip:** Run `teleman --help` or `teleman <command> --help` at any time to see inline documentation.

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Understanding the Target Format](#2-understanding-the-target-format)
3. [Listing Your Virtual Drive (`ls`)](#3-listing-your-virtual-drive-ls)
   - [Checking Directory Size (`size`)](#checking-directory-size-size)
   - [Viewing Directory Tree (`tree`)](#viewing-directory-tree-tree)
   - [Interactive Remote Explorer (`browse`)](#interactive-remote-explorer-browse)
4. [Copying Files (`copy`)](#4-copying-files-copy)
   - [Single Files](#single-files)
   - [Whole Directories](#whole-directories)
   - [Encrypted Uploads](#encrypted-uploads)
   - [Archive Mode (Streaming ZIP / TGZ)](#archive-mode-streaming-zip--tgz)
   - [Media Mode (Always-On)](#media-mode-always-on)
   - [Dry Run (Preview Changes)](#dry-run-preview-changes)
5. [Syncing Files (`sync`)](#5-syncing-files-sync)
6. [Moving Files (`move`)](#6-moving-files-move)
7. [Advanced Filtering & Ignoring (`.telemanfilter`)](#7-advanced-filtering--ignoring-telemanfilter)
8. [Downloading Files (`download`)](#8-downloading-files-download)
   - [Single Files](#single-file-download)
   - [Whole Directories](#directory-download)
   - [Encrypted Downloads](#encrypted-downloads)
   - [Password Priority](#password-priority)
9. [Deleting Files (`delete`)](#9-deleting-files-delete)
10. [Purging Directories (`purge`)](#10-purging-directories-purge)
11. [Best Performance & Multi-Threading](#11-best-performance--multi-threading)
    - [Tuning for a Local Bot API Server](#tuning-for-a-local-bot-api-server)
    - [Tuning for Telegram's Cloud API](#tuning-for-telegrams-cloud-api)
12. [Sending Messages (`message`)](#12-sending-messages-message)
13. [Updating & Versioning (`update`, `version`)](#13-updating--versioning-update-version)
14. [Output Control](#14-output-control)
15. [Common Scenario Recipes](#15-common-scenario-recipes)
16. [Flag Reference Table](#16-flag-reference-table)

---

## 1. Initial Setup

Before using any transfer commands you need a Bot Token and a dedicated Index Channel.

```bash
# Step 1: Build the binary
git clone git@github.com:anxyis/teleman-cli.git
cd teleman-cli
go build -o teleman.exe .

# Step 2: (Optional) Install globally so you can call it from anywhere
./teleman.exe install

# Step 3: Run the interactive configuration wizard
teleman config
```

The wizard will ask for:
- Your **Bot Token** (get one from `@BotFather` on Telegram)
- A **Dedicated Index Channel ID** (e.g. `-100123456789`) — Teleman stores its metadata here
- **Smart IP Endpoints** for your API and File Server. You can set **Local** (192.168.x.x), **Tailscale** (100.x.x.x), and **Public** domains. Teleman will automatically ping and route through the fastest available one!
- One or more **Target Aliases** — human-readable names like `backup`, `remote`, or `nas` that map to specific Chat IDs and Topic Thread IDs

---

## 2. Understanding the Target Format

All transfer commands use the format `alias:virtual/path`.

| Part | Example | Meaning |
|---|---|---|
| `alias` | `backup` | A name you defined in `teleman config` |
| `virtual/path` | `documents/reports/` | A virtual folder path inside that target's namespace |

```
backup:documents/reports/2025/
^      ^
alias  virtual path
```

- An empty path (`backup:`) or bare slash (`backup:/`) means the root of that target.
- Virtual paths are **fully isolated per target** — `backup:photos/` and `nas:photos/` are completely separate namespaces.

---

## 3. Listing Your Virtual Drive (`ls`)

```bash
# List everything at the root of a target
teleman ls backup:

# List contents of a specific virtual folder
teleman ls backup:documents/

# List deeply nested paths
teleman ls remote:projects/web/assets/

# Use verbose mode to see debug output during listing
teleman ls remote: -v
```

### Checking Directory Size (`size`)

To get a quick summary of total files and total size for a given path without listing every file (and without querying the Telegram API):

```bash
# Check size of the entire target root
teleman size backup:

# Check size of a specific virtual folder
teleman size remote:projects/web/assets/
```

### Viewing Directory Tree (`tree`)

To display your virtual filesystem structure in a nested, visual format:

```bash
# View the tree for an entire target
teleman tree backup:

# View the tree for a specific folder
teleman tree remote:media/

# Limit the depth of the tree to top-level folders
teleman tree nas: --depth 1
```

### Interactive Remote Explorer (`browse`)

To launch a terminal-native, fully interactive visual file explorer to navigate your remotes, inspect directory metrics, search files, and download instantly:

```bash
# Open the interactive TUI browser
teleman browse
```

- **Vim bindings:** Use `j/k` to navigate, `h/l` to enter/exit folders, and `Enter` to select.
- **Real-time search:** Press `/` to search and filter files dynamically.
- **Quick download:** Press `d` to instantly download the selected item and view real-time progress bars.

> 📖 For full UI documentation, keybindings, and capabilities, see [browse.md](./browse.md).

---

## 4. Copying Files (`copy`)

`copy` uploads files that don't already exist at the destination (checked by size + modification time). It **does not delete** anything on the remote.

### Single Files

```bash
# Upload one file to the root of a target
teleman copy ./report.pdf backup:

# Upload one file into a specific virtual folder
teleman copy ./invoice_march.pdf backup:invoices/2025/

# Upload one file and force re-upload even if it exists
teleman copy ./config.json remote:configs/ --force

# Upload multiple files at once
teleman copy ./report.pdf ./presentation.pptx backup:docs/
teleman copy "C:\file1.txt" "C:\file2.txt" remote:
```

### Whole Directories

```bash
# Upload an entire local folder into a virtual directory
teleman copy ./Documents/ backup:documents/

# Upload a photo collection
teleman copy C:/Photos/Vacation2025/ remote:photos/2025/

# Recursively backup a project folder
teleman copy ./my-project/ nas:dev/my-project/

# Upload multiple directories and files together
teleman copy ./Docs/ ./Images/ ./readme.txt backup:project_files/
```

### Encrypted Uploads

All chunks are AES-256-GCM encrypted on your CPU **before** hitting the network. Teleman uses a cryptographically secure **random salt** for every chunk (stored in the new `TLM1` format) to prevent key-reuse vulnerabilities. Keys are derived from your passphrase using **scrypt** (memory-hard KDF). Backward compatibility with older deterministic-salt files is maintained.

```bash
# Encrypt using environment variable (recommended)
TELEMAN_PASSWORD=mysecret teleman copy ./passwords.kdbx secure_vault: --encrypt

# Encrypt using interactive prompt (if no env var set, you'll be asked)
teleman copy ./PrivateDocuments/ secure_vault:private/ --encrypt

# Encrypt with max threads (see Performance section)
teleman copy ./SensitiveData/ vault:backup/ --encrypt -t 8 -c 16
```

> ⚠️ **Important:** Lost passphrases mean unrecoverable data. There is no master key. See [security.md](./security.md) for full details.

### Archive Mode (Streaming ZIP / TGZ)

Collapses an entire directory into a single streaming `.zip` or `.tar.gz` without writing anything to disk first. Great for project snapshots.

```bash
# Archive a whole project folder into one .zip chunk stream
teleman copy ./my-website/ backup:snapshots/ --zip

# Archive as .tar.gz instead
teleman copy ./my-website/ backup:snapshots/ --tgz

# Archive and encrypt in one pass
teleman copy ./DatabaseDump/ remote:backups/ --zip --encrypt

# Archive a Node.js project (avoids uploading node_modules individually)
teleman copy ./node-app/ nas:apps/ --tgz
```

### Media Mode (Always-On)

Media routing is **enabled by default** for all transfer commands. Eligible audio, video, and image files are automatically routed through Telegram's native media APIs (`sendAudio`, `sendVideo`, `sendPhoto`) with ID3 tag extraction, cover art, and playback scrubbers — no flag needed.

```bash
# Upload a music library with album art and title metadata (media routing is automatic)
teleman copy ./Music/ media_channel:

# Upload a single album — audio files get native playback automatically
teleman copy ./Music/DaftPunk-RAM/ music_backup:albums/

# Upload video files with native Telegram video player support
teleman copy ./Videos/Clips/ channel:videos/

# Force all files to be sent as plain documents (opt out of media routing)
teleman copy ./Music/ media_channel: --sendasfile
```

### Custom Captions

Add metadata or custom notes to your Telegram messages. Captions are only added to the first chunk of each file to avoid channel clutter.

```bash
# Automatically generate metadata (Filename, Size, Date, #Ext)
teleman copy ./Project/ backup: --caption auto

# Add a custom note
teleman copy ./Secrets.zip vault: --caption "Confidential Backup 2025"

# Works with sync and move too
teleman sync ./Docs/ remote: --caption auto
```

### Dry Run (Preview Changes)

Use `--dry-run` to see exactly what would be uploaded without making any changes. Works with `copy`, `sync`, `move`, and `download`.

```bash
# Preview what copy would upload
teleman copy ./Documents/ backup:docs/ --dry-run

# Preview a sync operation
teleman sync ./Projects/ nas:dev/ --dry-run -v

# Preview a move before committing
teleman move ./Temp/ remote:archive/ --dry-run

# Preview a download
teleman download backup:photos/ ./restored/ --dry-run
```

---

## 5. Syncing Files (`sync`)

`sync` brings the remote into **exact parity** with the local source. It uses a parallel checker pool and a separate transfer pool for maximum throughput.

> ⚠️ **Warning:** `sync` is designed to delete files on the remote that no longer exist locally. Use `copy` if you only want additive uploads.

```bash
# Sync a local folder to a remote target (standard)
teleman sync ./LocalBackup/ remote:backup/

# Sync with custom worker pools
teleman sync ./Projects/ nas:dev/ -t 8 -c 16

# Force a full re-sync (ignores existing index entries)
teleman sync ./DataDump/ backup:dump/ --force

# Sync a directory as a streaming ZIP archive
teleman sync ./WebProject/ remote:snapshots/ --zip
```

---

## 6. Moving Files (`move`)

`move` is identical to `copy`, but **deletes the source files** from your local disk after the index has been successfully committed to Telegram. Source files are only removed after Telegram confirms storage — never before.

```bash
# Move a confidential vault to Telegram and delete the local copy
teleman move ./ConfidentialVault/ remote:

# Move with encryption — local files deleted only after encrypted upload + index commit
teleman move ./SensitiveRecords/ vault:records/ --encrypt

# Move a large folder with parallel workers
teleman move ./OldProjects/ archive:legacy/ -t 8 -c 16

# Move multiple specific files at once
teleman move ./Temp/log1.txt ./Temp/log2.txt archive:logs/

# Preview what would be moved before committing
teleman move ./Temp/ remote:archive/ --dry-run
```

> **Safety Guarantee:** If the upload or index commit fails for any reason (network error, Telegram outage, Ctrl+C), source files are **preserved**. Teleman will never delete source files without confirmed remote storage.

---

## 7. Advanced Filtering & Ignoring (`.telemanfilter`)

Teleman supports highly optimized file exclusions and inclusions during `copy`, `move`, and `sync` operations. Excluded folders are skipped during traversal, drastically reducing I/O operations.

### Key Features:
- **Unified Engine:** CLI flags and `.telemanfilter` files use the exact same logic.
- **Layered Rules:** Rules are evaluated top-to-bottom, where later rules override earlier ones (Last Match Wins).
- **Dynamic Presets:** Standard setups (`--photos`, `--videos`, `--music`, `--documents`) are generated on-the-fly.
- **Dry-Run Visibility:** Combined with `--dry-run -v`, Teleman logs exactly which rule matches each file.
- **Backwards Compatibility:** Legacy `.telemanignore` files continue to work out-of-the-box.

> 📖 For full syntax details, presets, and examples, see [filtering.md](./filtering.md).

---

## 8. Downloading Files (`download`)

`download` is the inverse of `copy`. It fetches chunks from Telegram, verifies each chunk's SHA-256 hash, optionally decrypts, and writes to disk atomically. The engine uses a streaming reassembly pipeline that saves chunks directly to temporary files on disk, ensuring memory safety even when handling massive chunks or high concurrency.

### Single File Download

```bash
# Download one file to a local directory
teleman download backup:documents/report.pdf ./recovered/

# Download a file to the current directory
teleman download remote:configs/config.json .

# Download with verbose output to see chunk-by-chunk progress
teleman download backup:photos/trip.jpg ./output/ -v
```

### Directory Download

```bash
# Download an entire virtual directory
teleman download backup:documents/ ./local_documents/

# Download a deeply nested virtual folder
teleman download remote:projects/web/assets/ ./restored_assets/

# Download the entire root of a target
teleman download nas: ./full_nas_restore/
```

### Encrypted Downloads

```bash
# Recommended: use environment variable (hidden from process list)
TELEMAN_PASSWORD=mysecret teleman download vault:private/ ./decrypted/

# Interactive prompt (if no env var set)
teleman download vault:private/ ./decrypted/

# CLI flag (visible in process list — use only for testing)
teleman download secure_vault:passwords.kdbx ./restored/ --password "my-secret-key"
```

> **Note:** Chunk hash verification happens **before** decryption. If a chunk is corrupted in transit, the download aborts immediately — no partial, corrupted files are ever written to the final path.

### Password Priority

When decrypting, Teleman resolves the password in this order:
1. `TELEMAN_PASSWORD` environment variable (recommended)
2. Interactive terminal prompt (automatic if stdin is a TTY)
3. `--password` CLI flag (last resort — visible in `ps aux`)

See [security.md](./security.md) for full encryption architecture details.

---

## 9. Deleting Files (`delete`)

The `delete` command removes files from the virtual index and physically deletes the chunks from Telegram. By default, it is **non-recursive** (it only matches files directly in the specified path).

```bash
# Delete a single file from a target
teleman delete backup:reports/2023_tax.pdf

# Delete all files directly under a folder (non-recursive)
# This will NOT touch files in sub-folders like reports/2024/
teleman delete backup:reports/

# Preview what would be deleted without actually doing it
teleman delete backup:legacy/ --dry-run
```

## 10. Purging Directories (`purge`)

The `purge` command is the recursive counterpart to `delete`. It removes everything starting with the virtual path prefix.

> **Warning:** This is a destructive operation. By default, it will ask for confirmation before proceeding.

```bash
# Recursively delete a directory and all its sub-folders
teleman purge remote:old_projects/

# Bypass the confirmation prompt (good for scripts)
teleman purge remote:temp/ --confirm

# Purge an entire target root (DANGER: Wipes the entire alias!)
teleman purge remote: --confirm

# Use more workers to speed up physical deletion of thousands of chunks
teleman purge backup:archive/ -t 16 --confirm
```

---

## 11. Performance Tuning

Teleman exposes two concurrency pools you can tune:

| Flag | Default | Role |
|---|---|---|
| `-c` / `--checkers` | `8` | Number of concurrent file scanning workers (CPU/disk bound) |
| `-t` / `--transfers` | `4` | Number of concurrent upload/download workers (network bound) |

### What They Do
- **Checkers (`-c`)**: These workers scan your local disk, hash chunks, and diff them against the index. They are primarily CPU and disk I/O bound.
- **Transfers (`-t`)**: These workers handle the actual HTTP upload and download chunk streams. They are entirely network bound.

### Example Configurations

- **Low** (Small systems, limited bandwidth):
  `-c 2 -t 2`
- **Balanced** (Standard PCs):
  `-c 8 -t 6`
- **Aggressive** (High-end CPU, Gigabit fiber):
  `-c 12 -t 8`

> ⚠️ **Warning:** Setting values too high can actually reduce performance due to CPU contention, memory pressure, or hitting Telegram's strict API rate limits.

Teleman uses a custom `http.Transport` initialized with a massive `100` MaxIdleConnsPerHost connection pool. This prevents TLS handshake drops even on extreme worker settings.

### Tuning for a Local Bot API Server

If you're running [Telegram's Local Bot API Server](https://github.com/tdlib/telegram-bot-api), Teleman is designed to instantly detect it.

> **Auto-Upgrade Logic**: If Teleman detects you are routed through a non-public endpoint (like your Local or Tailscale IP), it **automatically upgrades your Chunk Size limit from 49MB to 2GB**. It leverages an optimized reassembly engine with `sync.Pool` buffer recycling and direct-to-disk streaming to handle these massive payloads without exceeding your device's RAM.

> **Dynamic Chunk Sizing**: When you haven't explicitly set `--cz`, Teleman dynamically sizes chunks to match the file size (up to 2GB) on Local API servers. This means a single 83MB FLAC file is uploaded as one piece — preserving native media playback — instead of being split into dead 49MB+33MB parts. The old 49MB default only applies to the public Telegram Cloud API.

```bash
# Max throughput on local API: 16 upload threads, 32 checkers
teleman copy ./4K_Videos/ local_nas: -t 16 -c 32

# Sync a huge dataset with max workers
teleman sync ./DataLake/ local_server:archive/ -t 16 -c 32

# Download with full parallel workers on local API
teleman download local_nas:videos/ ./restored/ -t 16 -c 32
```

### Tuning for Telegram's Cloud API

Telegram's public Cloud API has rate limits. Stay conservative to avoid flood waits.

```bash
# Safe high-throughput settings for the public Cloud API
teleman copy ./Documents/ cloud_backup: -t 4 -c 8

# Moderate throughput — good for background sync jobs
teleman sync ./Photos/ cloud: -t 2 -c 4

# Aggressive (may hit rate limits on large jobs)
teleman copy ./LargeDataset/ cloud: -t 8 -c 16
```

### Combined Performance Recipes

```bash
# Best-effort encrypted backup of a large directory (local API)
teleman copy ./SecretArchive/ vault: --encrypt -t 16 -c 32

# Streaming ZIP of a big project with max workers
teleman copy ./enterprise-app/ remote:snapshots/ --zip -t 16 -c 32

# Syncing a media library (media routing is automatic)
teleman sync ./MusicLibrary/ media: -t 8 -c 16

# Full verbose encrypted sync for debugging performance issues
teleman sync ./TestData/ remote:test/ --encrypt -t 8 -c 16 -v
```

---

## 12. Sending Messages (`message`)

The `message` command sends a direct text message to a Telegram target chat. This is useful for notification scripts, sending reports, or simple communication.

### Basic Usage

```bash
# Send a simple text message
teleman message backup: "Backup job completed successfully."

# Send text with special characters (use quotes)
teleman message remote: "Status: OK | Files: 124 | Size: 1.2GB"
```

### Piping from Stdin

You can pipe output from other commands directly into Teleman to send it as a message.

```bash
# Send a system report
df -h | teleman message server_logs:

# Send the last few lines of a log file
tail -n 20 error.log | teleman message dev_team:
```

---

## 13. Updating & Versioning (`update`, `version`)

Teleman features a native, zero-dependency self-update and versioning system. It communicates directly with public GitHub APIs to detect, download, and safely install updates in-place.

### Checking the Current Version (`version`)

You can view your currently running version by executing:

```bash
teleman version
```

This prints your version and performs a lightweight, non-blocking check against the latest release on GitHub:

```text
Teleman v1.1.8

Update available: v1.1.9! Run 'teleman update' to install.
```

### Performing a Self-Update (`update`)

To update Teleman to the latest available version, simply run:

```bash
teleman update
```

#### How it works:
1. **Zero External Requirements**: Does **not** require the GitHub CLI (`gh`) or any local active authentications.
2. **OS/Arch Detection**: Automatically detects your runtime operating system (Windows, Linux, Termux) and CPU architecture (AMD64, ARM64).
3. **Safe In-Place Replacement**:
   - **Unix (Linux/macOS/Termux)**: Downloads the new binary to a secure temporary directory, copies permissions, and performs an atomic in-place rename. If write permissions to the active path are denied (e.g. `/usr/local/bin`), it automatically triggers a passwordless `sudo` helper to apply the update.
   - **Windows**: Renames the active executable to a `.old` file (to bypass active-process file locks) and drops the new binary in its place. The old `.old` files are automatically cleaned up.
4. **Dynamic Progress Indicator**: Displays real-time download completion percentages directly in your terminal.

---

## 14. Output Control & UI

Teleman features a professional, high-performance console UI designed for clear feedback during massive operations.

### Dynamic Progress Bars (Interactive Mode)
When running in an interactive terminal (TTY), Teleman automatically activates dynamic progress bars for `copy`, `move`, `sync`, and `download`.

- **Overall Progress**: Displays the count of files processed vs. total files found (e.g., `Syncing: [4 / 12 files]`).
- **Live Worker Status**: Every active transfer worker (set by `-t`) has a dedicated bar showing its current filename, speed (MB/s), and ETA.
- **Auto-Cleanup**: Bars for finished files are automatically cleared to keep the terminal clean.

### Plain-Text Logs (Non-Interactive/CI Mode)
If Teleman detects it is running in a script, cron job, or a non-TTY environment, it automatically switches to a clean, line-by-line logging format.

```bash
# Verbose mode: shows every pipeline step, index decisions, chunk hashes
teleman copy ./data/ remote: -v

# Quiet mode: no output at all (only fatal errors go to stderr)
# Perfect for cron jobs — silent unless something breaks
teleman sync /home/user/Documents backup:docs/ -t 4 -c 8 -q
```

---

## 15. Common Scenario Recipes

### Scenario: Nightly automated backup (cron job)
```bash
# Run silently, 4 upload threads — set this as a scheduled task
teleman sync /home/user/Documents backup:nightly/ -t 4 -c 8 -q
```

### Scenario: One-time encrypted offsite dump
```bash
teleman copy ./SensitiveRecords/ offsite_vault:records/2025/ --encrypt -t 8 -c 16 -v
```

### Scenario: Recover a specific file after disk failure
```bash
teleman download backup:documents/critical_report.pdf ./recovered/ -v
```

### Scenario: Full disaster recovery of an entire target
```bash
teleman download backup: ./full_restore/ -v
```

### Scenario: Share a media library via Telegram channel
```bash
teleman copy ./MyMusicLibrary/ music_channel: -t 4 -c 8
```

### Scenario: Snapshot a web project before deploying
```bash
teleman copy ./my-website/ nas:snapshots/ --zip
```

### Scenario: Migrate from one target to another (manual)
```bash
# Step 1: Download from old target
teleman download old_server: ./migration_temp/

# Step 2: Re-upload to new target
teleman copy ./migration_temp/ new_server: -t 8 -c 16
```

### Scenario: Check what's stored before downloading
```bash
# First, inspect
teleman ls backup:projects/ -v

# Then download what you need
teleman download backup:projects/my-app/ ./restored/
```

---

## 16. Flag Reference Table

### Transfer Flags (`copy`, `sync`, `move`)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--transfers` | `-t` | `4` | Number of parallel file upload workers |
| `--checkers` | `-c` | `8` | Number of parallel index diff/checker workers |
| `--cz` | — | `49M` | Chunk size (e.g. `49M`, `1G`, `512K`) |
| `--encrypt` | `-e` | `false` | AES-256-GCM encrypt all chunks before upload (requires password) |
| `--zip` | — | `false` | Stream source directory as a `.zip` archive |
| `--tgz` | — | `false` | Stream source directory as a `.tar.gz` archive |
| `--sendasfile` | — | `false` | Force all files to be sent as plain Telegram documents (disables default media routing) |
| `--caption` | — | `""` | Add a caption to the first chunk (`auto` for metadata or custom string) |
| `--force` | `-f` | `false` | Skip index diff — re-upload everything unconditionally |
| `--dry-run` | — | `false` | Preview what would be transferred without making changes |
| `--password` | — | `""` | Encryption password (prefer `TELEMAN_PASSWORD` env var) |
| `--include` | — | `[]` | Include paths matching pattern (e.g. `*.flac`) |
| `--exclude` | — | `[]` | Exclude paths matching pattern (e.g. `node_modules/`) |
| `--min-size` | — | `""` | Exclude files smaller than size (e.g. `50M`) |
| `--max-size` | — | `""` | Exclude files larger than size (e.g. `2G`) |
| `--modified-after` | — | `""` | Exclude files modified on or before date (e.g. `2026-01-01`) |
| `--modified-before` | — | `""` | Exclude files modified on or after date (e.g. `2026-01-01`) |
| `--photos` | — | `false` | Apply the standard photos filter preset |
| `--videos` | — | `false` | Apply the standard videos filter preset |
| `--music` | — | `false` | Apply the standard music filter preset |
| `--documents` | — | `false` | Apply the standard documents filter preset |

### Download Flags (`download`)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--password` | — | `""` | Decryption password (prefer `TELEMAN_PASSWORD` env var) |
| `--dry-run` | — | `false` | Preview what would be downloaded without making changes |

### Deletion Flags (`delete`, `purge`)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--confirm` | — | `false` | Bypass the interactive confirmation prompt (Purge only) |
| `--transfers` | `-t` | `4` | Number of parallel physical deletion workers |
| `--dry-run` | — | `false` | Preview what would be deleted without making changes |

### Global Flags (all commands)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--verbose` | `-v` | `false` | Print every internal pipeline step and chunk decision |
| `--quiet` | `-q` | `false` | Suppress all output — only fatal errors reach stderr |

### Environment Variables

| Variable | Description |
|---|---|
| `TELEMAN_PASSWORD` | Encryption/decryption password (recommended over `--password` flag) |

---

> 📖 For architectural details on how Teleman works internally, see [architecture.md](./architecture.md).  
> 📖 For a quick command overview, see [usage.md](./usage.md).
