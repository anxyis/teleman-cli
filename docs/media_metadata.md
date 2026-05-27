# Teleman Media Metadata Layer

The Media Metadata layer (`internal/metadata`) enables Teleman to act as a **Telegram-native semantic sync engine** rather than a generic file sync tool, without bloating the binary or relying on external CGO bindings/FFmpeg.

## Core Philosophy

1. **Telegram-Native**: Extracts only the specific metadata required to make media look perfect on Telegram (`duration`, `width`, `height`, `performer`, `title`, `thumb`).
2. **Pure-Go Architecture**: Uses pure-Go container parsing (`abema/go-mp4`, `remko/go-mkvparse`, `dhowden/tag`, `tcolgate/mp3`) to keep Teleman a single-binary deployment.
3. **Best-Effort & Resilience**: Parsing media is best-effort. If metadata is missing or the file is corrupted, Teleman will gracefully zero the fields, fallback to semantic filenames, and continue the upload process. It is **never** a routing authority that aborts sync jobs.

## Supported Capabilities

### Video
- **MP4/MOV**: Fast structural ISOBMFF `moov` atom parsing for `width`, `height`, and precise `duration`.
- **MKV/WebM**: Event-driven EBML parsing (short-circuits before media payload) for `width`, `height`, and `duration`.

### Audio
- **ID3 / FLAC / OGG / M4A**: Extracts `title`, `artist/performer`, `album`, `year`, and embedded thumbnails.
- **MP3**: Reads raw MP3 frames to calculate accurate timeline durations (including VBR support).

## Semantic Captions (`--caption auto`)
The layer powers the `caption auto` system by emitting structured Markdown:

**Audio:**
```
🎵 Artist - Track
💿 Album (Year)
⏱ 3m 45s
```

**Video:**
```
🎬 My Video Title
📺 1920x1080
⏱ 2h 13m 5s
```

## Developer Notes
All logic is contained in `internal/metadata`. 
- `Parse(io.ReadSeeker, filename)` is the primary entrypoint.
- It is designed to work efficiently with the `chunker` by reading buffered memory rather than hitting disk directly.
