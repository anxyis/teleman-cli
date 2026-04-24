<div align="center">
  <h1>Teleman CLI</h1>
  <p><strong>Limitless, End-to-End Encrypted Cloud Storage via Telegram</strong></p>
</div>

`teleman-cli` is a high-performance file synchronization utility built natively over the Telegram Bot API. It achieves behavior identical to high-level CLI tools (like `rclone` or `rsync`) by treating Telegram Channels as infinitely scalable remote object stores. 

It splits huge datasets into logical chunks, tracks their integrity across a unified virtual Index File mapping, and uses raw multi-threading power to achieve high-throughput transfers.

## 🌟 Core Features

- **Painless Storage Scaling**: By capitalizing on Telegram’s limitless native cloud architecture, you can backup massive local datasets completely free.
- **Smart Diffing Engine**: Natively maps existing file chunks remotely. If a file exists globally or has already been transferred to your exact destination, it physically bypasses the upload step and logically links the index instead.
- **AES-256-GCM Encryption**: Secure sensitive directories seamlessly. Flag `--encrypt` physically encrypts payload byte streams on your CPU before they are ever attached to a Telegram API payload.
- **Dynamic Media Routing (Music/Video UI)**: Use the `--media` tag for your unencrypted payload files (like `.mp3` or `.flac`) and the engine will intuitively bind memory-resident ID3 Album Art and title strings directly into the push. This transforms your Telegram Channel instantly into a natively streaming Spotify-clone with track metadata, entirely without external logic layers.
- **On-the-Fly Archiving**: Streaming an entire web-project tree using `--zip` will stream a completely logical `.zip` directly into Telegram without wasting local I/O writing an intermediate archive onto disk.

---

## 🚀 Installation & Setup

1. **Build from Source**
   ```bash
   git clone git@github.com:anxyis/teleman-cli.git
   cd teleman-cli
   go build -o teleman.exe main.go
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
teleman ls cloud:/
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
