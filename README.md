<div align="center">
  <h1>Teleman CLI</h1>
  <p><strong>Limitless, End-to-End Encrypted Cloud Storage via Telegram</strong></p>
</div>

`teleman-cli` is a high-performance file synchronization utility built natively over the Telegram Bot API. It achieves behavior identical to high-level CLI tools (like `rclone` or `rsync`) by treating Telegram Channels as infinitely scalable remote object stores. 

It splits huge datasets into logical chunks, tracks their integrity across a unified virtual Index File mapping, and uses raw multi-threading power to achieve high-throughput transfers.

## 🌟 Core Features

- **Painless Storage Scaling**: By capitalizing on Telegram’s limitless native cloud architecture, you can backup massive local datasets completely free.
- **Smart IP Routing**: Automatically probes and falls back between Local, Tailscale, and Public endpoints. If you leave your home network, the CLI seamlessly finds the next best active route with zero manual intervention.
- **Smart Auto-Tuning Chunk Sizes**: The engine analyzes file sizes and API host limits to dynamically scale chunk buffers on-the-fly. Small files get tighter chunks for fast UI progress, while massive transfers gracefully unlock chunks up to 1999MB (2GB) on local APIs without exceeding safe memory overheads.
- **Download Resumption**: Network interrupted mid-transfer? Teleman gracefully resumes downloads exactly from the last verified chunk without redownloading data you already have, saving bandwidth and time.
- **AES-256-GCM Security (TLM1)**: Secure sensitive directories seamlessly. Every chunk uses a unique, random cryptographically secure salt to prevent key-reuse vulnerabilities. Backward compatibility with legacy encrypted files is natively maintained.
- **Streaming Reassembly (OOM Protected)**: The reassembly engine streams downloads directly to disk, avoiding high RAM usage. This prevents crashes when handling massive files or large chunk sizes.
- **Buffer Pooling**: Implements `sync.Pool` logic to recycle memory buffers, slashing GC overhead and improving throughput during concurrent operations.
- **Dynamic Media Routing (Music/Video UI)**: Use the `--media` tag for your unencrypted payload files (like `.mp3` or `.flac`) and the engine will intuitively bind memory-resident ID3 Album Art and title strings directly into the push. This transforms your Telegram Channel instantly into a natively streaming Spotify-clone with track metadata, entirely without external logic layers.
- **On-the-Fly Archiving**: Streaming an entire web-project tree using `--zip` will stream a completely logical `.zip` directly into Telegram without wasting local I/O writing an intermediate archive onto disk.
- **Custom Telegram Captions**: Add custom strings or automatic metadata (name, size, date) to your file messages via `--caption auto`.
- **Smart Ignoring (`.telemanignore`)**: Natively supports excluding files, folders, and applying override negation rules (`!`) directly from your source directories during sync or copy operations.
- **Native Self-Updating**: Seamlessly update the CLI to the latest version by running `teleman update`. It securely queries GitHub and patches itself in-place without needing external scripts.
- **Dynamic Progress Monitoring**: Real-time progress bars for all transfers (`copy`, `move`, `sync`, `download`) showing per-file speeds, ETAs, and overall job completion status.


---

## 🚀 Installation

Teleman is distributed as a single standalone binary. No external dependencies or Go runtimes are required.

- 🪟 **[How to install in Windows](docs/installation.md#windows)**
- 🐧 **[How to install in Linux](docs/installation.md#linux)**
- 📱 **[How to install in Termux](docs/installation.md#termux)**
- 🛠️ **[Build from Source](docs/installation.md#building-from-source)**

> 📖 For first-time setup (Bot Token, Channel IDs), follow the **[Initialization Guide](docs/installation.md#initial-configuration)**.

---

## ⚡ Usage Examples

Teleman operates through intuitive semantic sub-commands. 

### Syncing & Copying
Push files incrementally. The CLI naturally ignores local files that map perfectly against the remote Telegram dataset matching criteria.

```bash
# Safely push a file without dedupping
teleman copy C:/Downloads/vacation_photos/ backup_alias:/Memories/

# Upload multiple files and folders at once
teleman copy file1.txt ./MyDocs/ backup_alias:/archive/

# Aggressively sync a folder (Warning: destroys remote missing targets)
teleman sync ./LocalProjects cloud:/dev_backups/
```

### Inspecting Virtual Drive
```bash
# List all files
teleman ls cloud:/

# View total file count and size
teleman size cloud:/

# Display nested directory tree
teleman tree cloud:/
```

### Utility Commands
```bash
# Send a notification message to a target
teleman message backup: "Sync job finished at $(date)"

# Print version and check for updates
teleman version

# Update teleman to the latest version natively
teleman update
```

### Advanced Power-User Flags
The engine operates globally scaled concurrent worker pools. You can bind limits explicitly via CLI switches for network constraint tuning:
* `-c` : **Global Checkers** (Disk I/O traversal workers mapping the virtual index against real disk structures)
* `-t` : **HTTP Transporters** (Parallel upload routines)
* `--encrypt` : Force AES-256 sealing 
* `--media` : Smart ID3 / Image media encapsulation routing natively formatted for Telegram UI
* `--force` : Physically bypass the index check entirely and instantly overwrite chunks.
* `-v` / `-q` : Detailed verbose traces for error debugging, or quiet suppression output mode.

```bash
# Push an encrypted backup leveraging 16 network threads and 32 I/O index checkers
teleman copy ./SecretData remote:/ -e -t 16 -c 32 -v
```

---

## 🛠 Project Architecture

Teleman heavily utilizes a **Stateless Index Architecture**.
The true "file mapping" dictating how all data chunks piece back into original target streams is completely encapsulated in a static `.json` configuration file, which maintains a living history natively preserved onto a pinned channel string message state stream on Telegram. Your destination channel works strictly as BLOB storage.

---

## 📖 Documentation

| Document | Description |
|---|---|
| **[Command Guide](docs/command-guide.md)** | 📘 Full scenario-driven guide with copy-pasteable examples for every command, performance tuning, encryption, media mode, and common recipes |
| [Installation](docs/installation.md) | 🚀 Step-by-step setup for Windows, Linux, and Termux |
| [Usage Reference](docs/usage.md) | Quick command overview and flag reference |
| [Teleman Ignore](docs/telemanignore.md) | 🛑 How to exclude files/folders during sync using `.telemanignore` |
| [Architecture](docs/architecture.md) | Internals: index design, chunking pipeline, download reassembly, and namespaced isolation |
| [Release Guide](docs/release.md) | 📦 How to build binaries and create new releases |

> **New here?** Start with the **[Command Guide](docs/command-guide.md)** — it covers everything from first-time setup to advanced multi-threaded encrypted backups with real examples for every scenario.

