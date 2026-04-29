<div align="center">
  <h1>Teleman CLI</h1>
  <p><strong>Limitless, End-to-End Encrypted Cloud Storage via Telegram</strong></p>
</div>

`teleman-cli` is a high-performance file synchronization utility built natively over the Telegram Bot API. It achieves behavior identical to high-level CLI tools (like `rclone` or `rsync`) by treating Telegram Channels as infinitely scalable remote object stores. 

It splits huge datasets into logical chunks, tracks their integrity across a unified virtual Index File mapping, and uses raw multi-threading power to achieve high-throughput transfers.

## 🌟 Core Features

- **Painless Storage Scaling**: By capitalizing on Telegram’s limitless native cloud architecture, you can backup massive local datasets completely free.
- **Smart IP Routing**: Automatically probes and falls back between Local, Tailscale, and Public endpoints. If you leave your home network, the CLI seamlessly finds the next best active route with zero manual intervention.
- **Dynamic 2GB Chunking**: The engine instantly detects local API hosts and auto-upgrades the chunking payload limit from 50MB to a massive 2GB, alongside memory-preserving dynamic buffer allocation that slashes GC overhead.
- **AES-256-GCM Security (TLM1)**: Secure sensitive directories seamlessly. Every chunk uses a unique, random cryptographically secure salt to prevent key-reuse vulnerabilities. Backward compatibility with legacy encrypted files is natively maintained.
- **Streaming Reassembly (OOM Protected)**: The reassembly engine streams downloads directly to disk, avoiding high RAM usage. This prevents crashes when handling massive files or large chunk sizes.
- **Buffer Pooling**: Implements `sync.Pool` logic to recycle memory buffers, slashing GC overhead and improving throughput during concurrent operations.
- **Dynamic Media Routing (Music/Video UI)**: Use the `--media` tag for your unencrypted payload files (like `.mp3` or `.flac`) and the engine will intuitively bind memory-resident ID3 Album Art and title strings directly into the push. This transforms your Telegram Channel instantly into a natively streaming Spotify-clone with track metadata, entirely without external logic layers.
- **On-the-Fly Archiving**: Streaming an entire web-project tree using `--zip` will stream a completely logical `.zip` directly into Telegram without wasting local I/O writing an intermediate archive onto disk.
- **Custom Telegram Captions**: Add custom strings or automatic metadata (name, size, date) to your file messages via `--caption auto`.
- **Dynamic Progress Monitoring**: Real-time progress bars for all transfers (`copy`, `move`, `sync`, `download`) showing per-file speeds, ETAs, and overall job completion status.


---

## 🚀 Installation & Setup

### 1. Download Binaries
You can download pre-built binaries for Windows and Linux from the [GitHub Releases](https://github.com/anxyis/teleman-cli/releases) page. No Go installation is required.

### 2. Build from Source
If you prefer to build from source:
```bash
git clone git@github.com:anxyis/teleman-cli.git
cd teleman-cli
go build -o teleman.exe .
```

2. **Run Initialization**
   You require a standard Telegram Bot API Token (from `@BotFather`) and the numeric Channel ID where you wish to permanently map your root index logic.
   ```bash
   ./teleman.exe config
   ```

---

## ⚡ Usage Examples

Teleman operates through intuitive semantic sub-commands. 

### Syncing & Copying
Push files incrementally. The CLI naturally ignores local files that map perfectly against the remote Telegram dataset matching criteria.

```bash
# Safely push a file without dedupping
teleman copy C:/Downloads/vacation_photos/ backup_alias:/Memories/

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
| [Usage Reference](docs/usage.md) | Quick command overview and flag reference |
| [Architecture](docs/architecture.md) | Internals: index design, chunking pipeline, download reassembly, and namespaced isolation |
| [Release Guide](docs/release.md) | 📦 How to build binaries and create new releases |

> **New here?** Start with the **[Command Guide](docs/command-guide.md)** — it covers everything from first-time setup to advanced multi-threaded encrypted backups with real examples for every scenario.

