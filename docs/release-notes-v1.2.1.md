# Teleman v1.2.1 Release Notes

This is a massive update that brings Teleman's media semantics layer to production-grade, alongside crucial stability improvements and local API optimizations.

## 🌟 Major Features & Improvements

### 1. Telegram-Native Media Semantics (Always-On)
Teleman now intelligently understands the media you are uploading and ensures it plays natively in Telegram, complete with structural metadata.
- **Audio**: Fast, O(1) duration extraction for MP3 (Xing/VBRI/LAME headers) and FLAC/M4A parsing. Extracts ID3 tags (Title, Artist, Album, Year) and cover art. The Telegram audio player and scrubber now work perfectly.
- **Video**: Faststart MP4 and MKV parsing for resolution and duration. Videos are sent with native streaming enabled.
- **Photos**: Image resolution extraction.
- **Always-On by Default**: You no longer need to pass `--media`. Media routing is now the default behavior! (Use `--sendasfile` if you want to force plain document mode).

### 2. Semantic Captions & Hashtags (`--caption auto`)
A brand new intelligent captioning system that turns raw files into beautiful, readable Telegram objects.
- Automatically generates formatted captions based on the media type (e.g., 🎵 for audio, 🎬 for video, 📝 for markdown).
- Injects file size, duration, and resolution elegantly.
- **Auto-Hashtagging**: Generates semantic, searchable hashtags based on heuristics (e.g., `#1080p`, `#flac`, `#anime`, `#tv`, `#sourcecode`).

### 3. Adaptive Transport Pacer & Error Taxonomy
Massive resilience improvements for unreliable networks or aggressive Telegram API rate limits.
- **Global Backpressure**: If transient network errors occur, all workers voluntarily yield and back off globally, preventing stampeding herds.
- **Taxonomy**: Cleanly categorizes errors (Fatal vs. Transient) so Teleman knows exactly when to retry and when to abort to save time.

### 4. Local API Dynamic Chunk Sizing
When running against a self-hosted Local Bot API (which supports up to 2GB uploads), Teleman now dynamically scales its chunk size to fit the entire file in one piece!
- Media files are no longer needlessly split into 49MB dead parts on local APIs.
- A 500MB video or an 80MB FLAC is now sent as a single, playable, streamable file!
- The 49MB limit is strictly enforced only on the public `api.telegram.org` endpoints.

## 🐛 Bug Fixes
- **AutoUpgradeChunk Wired**: The previously dead code for auto-upgrading chunk sizes on local APIs has been fully wired into the engine.
- **Removed `--media` Confusion**: By making media-mode always-on, the bug where casual users ended up with unplayable documents is permanently fixed.

## 🛠 Usage Changes
- `--media` flag has been completely removed.
- `--sendasfile` flag added to force the old "document" behavior for uploads.
