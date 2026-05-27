# Teleman Media Metadata Layer

The Media Metadata layer (`internal/metadata`) enables Teleman to act as a **Telegram-native semantic sync engine** rather than a generic file sync tool, without bloating the binary or relying on external CGO bindings/FFmpeg.

> **Note:** Media routing is now **always-on by default** for all transfer commands (`copy`, `sync`, `move`). No `--media` flag is needed — audio files automatically get ID3 metadata, cover art, and playback scrubbers; video files get native streaming; images get native display. Use `--sendasfile` to explicitly force plain document mode if needed.

## Core Philosophy

1. **Telegram-Native**: Extracts only the specific metadata required to make media look perfect on Telegram (`duration`, `width`, `height`, `performer`, `title`, `thumb`).
2. **Pure-Go Architecture**: Uses pure-Go container parsing (`abema/go-mp4`, `remko/go-mkvparse`, `dhowden/tag`) to keep Teleman a single-binary deployment.
3. **Best-Effort & Resilience**: Parsing media is strictly best-effort and bounded. If metadata is missing or the file is corrupted, Teleman will gracefully zero the fields, fallback to semantic filenames, and continue the upload process. It is **never** a routing authority that aborts sync jobs.

## Supported Capabilities & Safety Bounds

### Video
- **MP4/MOV**: Fast structural ISOBMFF box scanning to extract `width`, `height`, precise `duration`, and accurately determine `SupportsStreaming` by verifying the `moov` atom is ahead of the `mdat` payload.
- **MKV/WebM**: Event-driven EBML parsing that short-circuits before the media payload. Hard-capped at 10MB to prevent infinite loops on corrupted headers.

### Audio
- **ID3 / FLAC / OGG / M4A**: Extracts `title`, `artist/performer`, `album`, `year`, and embedded thumbnails. The parser is protected by a 5MB memory circuit breaker to prevent runaway allocations from giant malicious cover art.
- **MP3**: Reads Xing/VBRI VBR headers in the first 128KB of the file for O(1) duration extraction, completely skipping payload decoding for podcast-sized files.

### Image
- Pure-Go header-only dimensions extraction using `image.DecodeConfig` (jpeg, png, webp) without pulling large image buffers into memory.

## Semantic Formatting Profiles (`--caption auto`)
The engine categorizes files and formats their metadata into visually calm, native Telegram rich-objects without generating metadata spam.

### Eight Supported Profiles
1. **Audio**: `🎵 Artist — Track \n 💿 Album (Year) \n ⏱ 5m 13s`
2. **Video**: `🎬 Movie Title \n 📺 1920x1080 • MKV \n ⏱ 2h 13m`
3. **Photo**: `🖼 Beautiful Shot \n 📐 3840x2160`
4. **Markdown**: `📝 readme.md \n 📚 Markdown Document`
5. **Source Code**: `💻 main.go \n ⚙ Source Code • 14 KB`
6. **Archive**: `📦 assets.zip \n 💾 2.4 GB \n 🗜 Archive`
7. **PDF**: `📖 The Great Book \n 📄 PDF • 14 MB`
8. **Generic**: `📄 filename.txt \n 💾 2 MB`

## Hashtag Generation Engine
Teleman generates 2-5 high-signal, normalized hashtags for every file to anchor Telegram's internal search ecosystem:
- Extracts qualities securely (`#4k`, `#1080p`, `#hevc`).
- Identifies generic categories deterministically (`#anime`, `#tv`, `#movie`).
- Aggressively maps source code (`#golang`, `#python`, `#rust`).
- Scrubs off and ignores noisy release-scene garbage (e.g. `x264-SPARKS`).

## Filename Cleaning Fallback
If tags are absent, the engine employs a graceful semantic filename cleaner that strips out dots, underscores, bracketed release tags (`[SubsPlease]`), and reformats TV notation (`S01E12` -> `— Episode 12`) to ensure that fallbacks remain perfectly readable.

## Local API Dynamic Chunk Sizing
When using a self-hosted Local Bot API server, Teleman dynamically sizes chunks to match the file size (up to 2GB), preventing unnecessary splitting. For example, an 83MB FLAC file on Local API is uploaded as a single piece — preserving native media playback and metadata — instead of being split into dead 49MB+33MB parts that lose all media semantics. The old 49MB default chunk size only applies when using the public Telegram Cloud API.
