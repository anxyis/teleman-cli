# Teleman v1.2.0: The Semantic Resilience Update

This major release introduces the **Adaptive Transport Pacer** and the **Native Media Semantics Layer**, completely overhauling Teleman's resilience and presentation aesthetics.

## 🚀 Key Features

### The Adaptive Resilience Engine
Teleman is now heavily fortified against unstable networks and API disruptions:
- **Enterprise-Grade Transport Pacer**: Dynamically slows down active chunk uploads in response to HTTP 429 rate-limits or sustained network failure, and recovers throughput automatically.
- **Categorized Error Taxonomy**: Differentiates between transient transport failures (retriable) and fatal states (missing files, auth issues).
- **Graceful Vanished Files**: If a file is deleted from your disk while it's in the middle of syncing, Teleman logs a warning and gracefully continues the sync job rather than crashing the worker pool.

### Native Media Semantics Layer (Always-On)
Teleman now converts Telegram into a natively streaming, beautifully organized media vault without relying on bloated dependencies like FFmpeg. Media routing is **enabled by default** for all transfer commands — no flag needed:
- **Pure-Go Parsing**: Extracts dimensions, playback durations, and ID3 tags from Audio (MP3/FLAC/M4A), Video (MP4/MKV/WebM), and Images natively with O(1) efficiency.
- **MP4 Streaming Verification**: Reads top-level ISOBMFF boxes to accurately determine if a video supports web streaming (guarantees the `moov` atom is present before the `mdat` payload).

### Aesthetic Captions & Searchable Hashtags (`--caption auto`)
We rewrote the auto-caption system to output visually calm, Telegram-native rich objects across 8 semantic profiles (Audio, Video, Photo, Code, Markdown, Archive, PDF, Document).
- **High-Signal Hashtags**: Automatically generates 2-5 normalized search tags per file (e.g. `#movie #4k`, `#golang`, `#flac`) while stripping noisy release-scene garbage.
- **Graceful Filename Cleaning**: When structural metadata is missing, Teleman strips underscores, dots, and release bracket metadata to emit beautiful fallback titles (e.g. `Frieren — Episode 12`).

## 🛡️ Safety & Memory Constraints
- **10MB MKV Sandbox**: Hard-capped EBML parsing to prevent corrupted videos from triggering infinite event loops.
- **5MB ID3 Circuit Breaker**: Wrapped the audio tag parser behind an `io.LimitReader` to prevent maliciously large 100MB cover arts from crashing workers.
- **O(1) VBR Extraction**: Ripped out frame-based MP3 duration scanning. Teleman now perfectly extracts VBR lengths instantly by reading just the first 128KB of a file, scaling efficiently even against 3-hour podcasts.

## 🔧 Post-Release Hotfix

The following improvements were applied as a post-release hotfix to v1.2.0:

### Media Routing Now Default
- The `--media` flag has been **removed**. Media routing (`sendAudio`/`sendVideo`/`sendPhoto`) is now **always-on by default** for all transfer commands (`copy`, `sync`, `move`). Audio files automatically get ID3 metadata, cover art, and playback scrubbers. Video files get native streaming. Images get native display.
- A new `--sendasfile` flag has been added for users who explicitly want to force document mode (the old default behavior). This sends all files as plain Telegram documents regardless of their type.

### Local API Dynamic Chunk Sizing
- When using a self-hosted Local Bot API server, Teleman now **dynamically sizes chunks to match the file size** (up to 2GB), preventing unnecessary splitting. An 83MB FLAC on Local API is now uploaded as a single file (preserving full media playback) instead of being split into dead 49MB+33MB parts.
- The old 49MB default chunk size only applies to the public Telegram Cloud API now.

### `AutoUpgradeChunk` Wired
- The `AutoUpgradeChunk` flag was previously dead code. It is now fully wired into the chunker. When the user hasn't explicitly set `--cz` and they're on a Local API, the engine automatically scales the chunk size to fit the entire file in one piece — ensuring media files retain full native playback semantics.
