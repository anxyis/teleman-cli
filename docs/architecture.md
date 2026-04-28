# Teleman CLI - Architecture

Teleman is a high-performance cross-platform CLI tool that securely maps files from a physical filesystem to a virtualized state backed purely by a self-hosted Telegram Bot API. It treats Telegram **strictly as a message-based object store.**

## Core Principles

### 1. The Metadata Index (Single Source of Truth)
Telegram does not natively support folders, paths, metadata tags, or file relationships. It exclusively stores unassociated `Document` messages attached to Chat IDs.

Because of this, Teleman implements an isolated Metadata Index (`teleman.index.json`) that strictly enforces **Namespaced Isolation**.
- The index is partitioned by `TargetKey` (a composite of Telegram Chat ID and Thread ID).
- This structure holds the **entire** virtual filesystem tree, mapping logical paths (e.g. `photos/trip.jpg`) to individual chunks of uploaded documents *within their specific target namespace*.
- Files synced to one target (e.g. `backup_channel`) are completely isolated from other targets (e.g. `work_group`). There are no global path collisions.
- The state of your files is determined exclusively by reading this index. **We do not rely on Telegram's message history or folder layouts.**

### 2. Chunking & Global Deduplication
Teleman leverages an advanced streaming logic to split large files seamlessly in memory without blowing up your device's memory limitations (RAM):
1. **Hashing:** Before uploading, each local file is split into byte streams (chunks) and hashed (`SHA-256`).
2. **Deduplication:** Teleman queries the active Index. If a chunk hash already exists *anywhere* in your target storage, the client merely copies the existing `file_id` pointer into the index. It does not waste bandwidth re-uploading identical bytes.
3. **Encryption:** Optional AES-256 encryption (`-e`) is applied on a per-chunk streaming level *before* bytes hit the network.
4. **Archiving:** When using `--zip` or `--tgz`, entire local directories are collapsed into a continuous, single archive stream on-the-fly and chunked logically across Telegram.

### 3. Dedicated Index Channel & Locking
Because the Metadata Index is the heart of your filesystem, we ensure data integrity via **Distributed Locking.**
- When you execute `teleman config`, you must supply a **Dedicated Index Channel**. 
- Whenever `teleman sync` or `teleman copy` spins up, it first places a secure "Lock Message" in this channel. If another machine executing Teleman attempts to sync concurrently to the same targets, it will cleanly abort, preventing split-brain database corruption.
- Teleman versions your configuration updates and stores the last 5 Index versions natively inside the channel for robust disaster recovery.

### 4. Download & Reassembly Pipeline
The download path is the strict inverse of the upload pipeline, with explicit corruption safeguards:
1. **Offset-Sorted Reassembly:** Chunks are explicitly sorted by their byte offset before processing, guaranteeing correct file reconstruction regardless of index entry order.
2. **Hash Verification:** Every downloaded chunk is SHA-256 hashed and compared against the index record *before* any decryption or disk writes. A mismatch aborts the entire download immediately — no partial, corrupted files are ever finalized.
3. **Pipeline Order:** `Download → Hash Verify → Decrypt (if encrypted) → Write to Disk`. The hash is verified on the raw (possibly encrypted) bytes, matching exactly what was hashed during upload.
4. **Atomic Writes:** Files are streamed to a `.partial` temp file during download. Only after all chunks are successfully verified and written is the file atomically renamed to its final path. This ensures the output directory never contains half-written files.
5. **Safe Path Matching:** Virtual path prefix matching enforces segment boundaries (e.g., `media` will never collide with `media_test`). Only exact segment or exact file matches are resolved.

## Component Overview

- **Config Wizard (`config`)**: Generates local maps resolving human readable aliases (e.g., `remote_office`) to technical Bot targets (Chat IDs & Topic Threads). 
- **Chunk Engine (`chunker`)**: Bidirectional stream processing engine. Handles upload chunking (`ProcessStream`) and download reassembly (`ReassembleStream`) with AES-256-GCM encrypt/decrypt, SHA-256 hash verification, and dynamic chunk size logic (50MB Cloud / 2000MB Local).
- **Sync Engine**: Orchestrates N-number of `checkers` and multi-threaded routine `transfers` against the namespaced `models.Index` natively, ensuring strict target isolation during uploads and diffs.
- **Download Engine (`core/download`)**: Resolves namespaced virtual paths with safe prefix matching, coordinates chunk-level fetching via the Chunk Engine, and writes files atomically to the local filesystem.
