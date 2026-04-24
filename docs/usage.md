# Teleman CLI - Usage Guide

Teleman behaves identically to high-level CLI tools like `rclone`, but communicates uniquely over your self-hosted Telegram Bot API backend.

## 1. Initial Setup (`teleman config`)

Before you can sync any files, you can globally deploy the binary into your PATH.

```bash
teleman install
```

Once installed, you must run the interactive Configuration Wizard:

```bash
teleman config
```

### Global Settings
The wizard will first request your **Bot Token** (from `@BotFather`) and a **Dedicated Index Channel ID** (e.g. `-100123456789`). This Channel is mandatory—Teleman uses it to store the master map of your files safely out of the public eye.

### Target Aliases
Instead of forcing you to memorize complex `-100` numeric channel IDs or user IDs, the wizard allows you to assign them English "Aliases" (like `home_nas`, `backup_channel`, or `wife`).

**Namespace Isolation Rule:**
Teleman securely isolates each target under the hood. `teleman ls wife:` and `teleman ls home_nas:` operate entirely independently without their mapped files ever colliding, ensuring true virtual isolation.

**Note on User Targets:**
If you want Teleman to back up directly to a specific user, that user **must** manually start the bot on Telegram (send `/start`) before Teleman is legally permitted to upload chunks. 

## 2. Basic Commands

### List Files
Lists the content of your virtual filesystem map inside the target alias.
```bash
teleman ls my_alias:
teleman ls my_alias:photos/trip/
```

### Copy Files
Uploads non-identical files strictly logically. It detects existing file hashes from the index map and skips transferring files you've already uploaded.
```bash
# Copy a local file to the remote root
teleman copy document.pdf backup_channel:

# Copy a directory into a virtual folder
teleman copy ./Movies/ my_alias:media/videos/
```

### Move Files
Identical to `copy`, but actively deletes the source data from your local drive once the file map has been successfully recorded in Telegram.
```bash
teleman move ./ConfidentialVault/ remote:
```

### Sync Files (In Development)
Brings your remote destination into identical parity with your local endpoint. *Warning: Sync **will** delete files on the remote destination if they no longer exist on your physical computer.*

## 3. High-Performance Flags

Teleman natively utilizes all logical CPU cores available to it. You can tightly adjust the worker capacities to match your specific API Host or bandwidth limits.

- **Concurrecy Flags**: 
  - `--transfers` (`-t`): Determines how many concurrent chunks operate over HTTP paths at once (Default: 4).
  - `--checkers` (`-c`): Determines how rapidly the disk scanner combs your local filesystem matching against the virtual tree (Default: 8).
- **Chunk Parameters**: 
  - `--cz`: Chunk size (e.g., `49M` for standard Cloud APIs or `1000M` for your Local API server).
- **Encryption**: 
  - `--encrypt` (`-e`): Passing this flag will seal all file streams natively through AES-256-GCM before exiting the local machine.
- **On The Fly Archiving**:
  - `--zip` / `--tgz`: Condenses massive directory trees down into highly transportable `.zip` chunks rather than retaining 1:1 internal directory mappings.
- **Media Native UI (Spotify-Clone Mode)**:
  - `--media`: Opt-in mapping that natively inspects single-chunk unencrypted files. Discovers media models (`.jpg`, `.mp4`, `.mp3`) and organically routes the byte-stream against Telegram's rich media `/sendAudio` protocols. Leverages pure-Go native tag-extraction to bind ID3 Metadata (Album cover/Artist strings) natively bypassing raw blobs entirely! Fallbacks safely to standard logic if the format breaks or metadata resolves corrupted.
- **Sync Overrides**:
  - `--force` (`-f`): Bypasses the active index diffing engine. Explicitly forces an immediate network push of your byte chunk, ripping and overwriting destination chunk indices even if matching records indicate zero byte variation.
- **Output Control**:
  - `--verbose` (`-v`): Unlocks maximal debug and index chunk inspection data.
  - `--quiet` (`-q`): Completely suppresses the terminal to silent mode. Output isolated strictly to fatal crashes.
