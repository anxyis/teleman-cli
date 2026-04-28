# Teleman CLI — Complete Command Guide

A comprehensive, scenario-driven reference for every Teleman command. Each section contains real, copy-pasteable examples you can run directly.

> **Tip:** Run `teleman --help` or `teleman <command> --help` at any time to see inline documentation.

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Understanding the Target Format](#2-understanding-the-target-format)
3. [Listing Your Virtual Drive (`ls`)](#3-listing-your-virtual-drive-ls)
4. [Copying Files (`copy`)](#4-copying-files-copy)
   - [Single Files](#single-files)
   - [Whole Directories](#whole-directories)
   - [Encrypted Uploads](#encrypted-uploads)
   - [Archive Mode (Streaming ZIP / TGZ)](#archive-mode-streaming-zip--tgz)
   - [Media Mode (Spotify-Style)](#media-mode-spotify-style)
   - [Dry Run (Preview Changes)](#dry-run-preview-changes)
5. [Syncing Files (`sync`)](#5-syncing-files-sync)
6. [Moving Files (`move`)](#6-moving-files-move)
7. [Downloading Files (`download`)](#7-downloading-files-download)
   - [Single Files](#single-file-download)
   - [Whole Directories](#directory-download)
   - [Encrypted Downloads](#encrypted-downloads)
   - [Password Priority](#password-priority)
8. [Best Performance & Multi-Threading](#8-best-performance--multi-threading)
   - [Tuning for a Local Bot API Server](#tuning-for-a-local-bot-api-server)
   - [Tuning for Telegram's Cloud API](#tuning-for-telegrams-cloud-api)
9. [Output Control](#9-output-control)
10. [Common Scenario Recipes](#10-common-scenario-recipes)
11. [Flag Reference Table](#11-flag-reference-table)

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

---

## 4. Copying Files (`copy`)

`copy` uploads files that don't already exist at the destination (checked by size + modification time). It **does not delete** anything on the remote.

### Single Files

```bash
# Upload one file to the root of a target
teleman copy ./report.pdf backup:

# Upload one file into a specific virtual folder
teleman copy ./invoice_march.pdf backup:invoices/2025/

# Upload and force re-upload even if the file already exists remotely
teleman copy ./config.json remote:configs/ --force
```

### Whole Directories

```bash
# Upload an entire local folder into a virtual directory
teleman copy ./Documents/ backup:documents/

# Upload a photo collection
teleman copy C:/Photos/Vacation2025/ remote:photos/2025/

# Recursively backup a project folder
teleman copy ./my-project/ nas:dev/my-project/
```

### Encrypted Uploads

All chunks are AES-256-GCM encrypted on your CPU **before** hitting the network. Keys are derived from your passphrase using **scrypt** (memory-hard KDF). You need the same passphrase when downloading.

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

### Media Mode (Spotify-Style)

Routes eligible audio/video/image files through Telegram's native media APIs with ID3 tag extraction. Makes your channel look like a media player.

```bash
# Upload a music library with album art and title metadata
teleman copy ./Music/ media_channel: --media

# Upload a single album
teleman copy ./Music/DaftPunk-RAM/ music_backup:albums/ --media

# Upload video files with native Telegram video player support
teleman copy ./Videos/Clips/ channel:videos/ --media
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

# Preview what would be moved before committing
teleman move ./Temp/ remote:archive/ --dry-run
```

> **Safety Guarantee:** If the upload or index commit fails for any reason (network error, Telegram outage, Ctrl+C), source files are **preserved**. Teleman will never delete source files without confirmed remote storage.

---

## 7. Downloading Files (`download`)

`download` is the inverse of `copy`. It fetches chunks from Telegram, verifies each chunk's SHA-256 hash, optionally decrypts, and writes to disk atomically.

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

## 8. Best Performance & Multi-Threading

Teleman exposes two concurrency pools you can tune:

| Flag | Default | Role |
|---|---|---|
| `-t` / `--transfers` | `4` | Parallel HTTP upload/download workers |
| `-c` / `--checkers` | `8` | Parallel disk scanner / index diff workers |

Teleman uses a custom `http.Transport` initialized with a massive `100` MaxIdleConnsPerHost connection pool. This prevents TLS handshake drops even on extreme worker settings.

### Tuning for a Local Bot API Server

If you're running [Telegram's Local Bot API Server](https://github.com/tdlib/telegram-bot-api), Teleman is designed to instantly detect it.

> **Auto-Upgrade Logic**: If Teleman detects you are routed through a non-public endpoint (like your Local or Tailscale IP), it **automatically upgrades your Chunk Size limit from 49MB to 2GB**. It will also seamlessly pre-allocate memory chunks precisely to file sizes, preserving your RAM.

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

# Syncing a media library with media routing and max workers
teleman sync ./MusicLibrary/ media: --media -t 8 -c 16

# Full verbose encrypted sync for debugging performance issues
teleman sync ./TestData/ remote:test/ --encrypt -t 8 -c 16 -v
```

---

## 9. Output Control

```bash
# Verbose mode: shows every pipeline step, index decisions, chunk hashes
teleman copy ./data/ remote: -v

# Quiet mode: no output at all (only fatal errors go to stderr)
teleman sync ./data/ remote: -q

# Combine with other flags
teleman copy ./bigfile.iso backup: -t 8 -q

# Perfect for cron jobs — silent unless something breaks
teleman sync /home/user/Documents backup:docs/ -t 4 -c 8 -q
```

---

## 10. Common Scenario Recipes

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
teleman copy ./MyMusicLibrary/ music_channel: --media -t 4 -c 8
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

## 11. Flag Reference Table

### Transfer Flags (`copy`, `sync`, `move`)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--transfers` | `-t` | `4` | Number of parallel file upload workers |
| `--checkers` | `-c` | `8` | Number of parallel index diff/checker workers |
| `--cz` | — | `49M` | Chunk size (e.g. `49M`, `1G`, `512K`) |
| `--encrypt` | `-e` | `false` | AES-256-GCM encrypt all chunks before upload (requires password) |
| `--zip` | — | `false` | Stream source directory as a `.zip` archive |
| `--tgz` | — | `false` | Stream source directory as a `.tar.gz` archive |
| `--media` | — | `false` | Route audio/video/image via Telegram's native media APIs |
| `--force` | `-f` | `false` | Skip index diff — re-upload everything unconditionally |
| `--dry-run` | — | `false` | Preview what would be transferred without making changes |
| `--password` | — | `""` | Encryption password (prefer `TELEMAN_PASSWORD` env var) |

### Download Flags (`download`)

| Flag | Short | Default | Description |
|---|---|---|---|
| `--password` | — | `""` | Decryption password (prefer `TELEMAN_PASSWORD` env var) |
| `--dry-run` | — | `false` | Preview what would be downloaded without making changes |

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
