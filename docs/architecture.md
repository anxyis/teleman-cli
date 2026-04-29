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
3. **Memory Optimization:** Uses a `sync.Pool` for byte buffers during chunking, drastically reducing memory pressure and GC overhead during high-concurrency uploads.
4. **Encryption:** Optional AES-256 encryption (`-e`) is applied on a per-chunk streaming level *before* bytes hit the network.
4. **Archiving:** When using `--zip` or `--tgz`, entire local directories are collapsed into a continuous, single archive stream on-the-fly and chunked logically across Telegram.

### 3. Dedicated Index Channel & Locking
Because the Metadata Index is the heart of your filesystem, we ensure data integrity via **Distributed Locking.**
- When you execute `teleman config`, you must supply a **Dedicated Index Channel**. 
- Whenever `teleman sync`, `teleman copy`, or `teleman move` spins up, it first places a secure **Lock Message** in this channel containing owner identification and a UTC timestamp.
- If another machine executing Teleman attempts to sync concurrently to the same targets, it will cleanly abort, preventing split-brain database corruption.
- **Stale Lock Recovery:** If a lock is older than 5 minutes (configurable via `DefaultLockTimeout`), it is automatically considered stale and eligible for recovery. This prevents permanent deadlocks when an instance crashes while holding the lock.
- All locks are released via `defer` — even on Ctrl+C interruptions, the lock cleanup fires because commands use `RunE` error returns instead of `os.Exit(1)`.
- Teleman versions your configuration updates and stores the last 5 Index versions natively inside the channel for robust disaster recovery.

### 4. Download & Reassembly Pipeline
The download path is the strict inverse of the upload pipeline, with explicit corruption safeguards:
1. **Offset-Sorted Reassembly:** Chunks are explicitly sorted by their byte offset before processing, guaranteeing correct file reconstruction regardless of index entry order.
2. **Hash Verification:** Every downloaded chunk is SHA-256 hashed and compared against the index record *before* any decryption or disk writes. A mismatch aborts the entire download immediately — no partial, corrupted files are ever finalized.
3. **Pipeline Order:** `Download → Hash Verify → Decrypt (if encrypted) → Write to Disk`. The hash is verified on the raw (possibly encrypted) bytes, matching exactly what was hashed during upload.
4. **OOM Protection:** Chunks are streamed directly to temporary files on disk during download and hashing, preventing memory-based crashes when handling extremely large chunks or concurrent transfers.
5. **Atomic Writes:** Files are streamed to a `.partial` temp file during download. Only after all chunks are successfully verified and written is the file atomically renamed to its final path. This ensures the output directory never contains half-written files.
5. **Safe Path Matching:** Virtual path prefix matching enforces segment boundaries (e.g., `media` will never collide with `media_test`). Only exact segment or exact file matches are resolved.

### 5. Encryption & Key Management
Teleman provides optional per-chunk AES-256-GCM encryption:
1. **Key Derivation:** Passphrases are processed through **scrypt** (N=32768, r=8, p=1) to derive a 32-byte AES-256 key. 
2. **Unique Salts:** Each chunk uses a random 16-byte cryptographically secure salt. This prevents key-reuse vulnerabilities. 
3. **Magic Header (TLM1):** Encrypted chunks are stored with a `TLM1` magic header that encodes the salt and nonce. Legacy files (deterministic salts) are automatically detected and supported.
4. **Password Resolution:** Passwords are resolved in priority order: `TELEMAN_PASSWORD` env var → interactive terminal prompt → `--password` CLI flag. This prevents plaintext passwords from appearing in process listings.
3. **Pipeline:** Encryption occurs at the chunk level, after splitting and before hashing. The hash is computed on encrypted bytes, enabling integrity verification without the decryption key.

### 6. Graceful Shutdown & Context Cancellation
All long-running operations (chunk uploads, downloads, sync pipelines) are wired through Go's `context.Context`:
- **SIGINT/SIGTERM** triggers context cancellation via a global signal handler in `main()`.
- Worker goroutines check the context between chunk iterations, allowing clean shutdown.
- On interruption, partial index progress is committed to prevent data loss.
- Deferred lock releases execute properly because commands return errors instead of calling `os.Exit(1)` directly.

## Component Overview

- **Config Wizard (`config`)**: Generates local maps resolving human readable aliases (e.g., `remote_office`) to technical Bot targets (Chat IDs & Topic Threads). 
- **Chunk Engine (`chunker`)**: Bidirectional stream processing engine. Handles upload chunking (`ProcessStreamCtx`) and download reassembly (`ReassembleStreamCtx`) with AES-256-GCM encrypt/decrypt, SHA-256 hash verification, scrypt key derivation, and context-aware cancellation.
- **Sync Engine**: Orchestrates N-number of `checkers` and multi-threaded routine `transfers` against the namespaced `models.Index`. Accepts a `TransferOptions` struct (not globals) for all configuration.
- **Download Engine (`core/download`)**: Resolves namespaced virtual paths with safe prefix matching, coordinates chunk-level fetching via the Chunk Engine, and writes files atomically to the local filesystem.
- **Move Engine (`core/move`)**: Copy-then-delete pipeline that only removes source files after successful index commit. Includes empty directory cleanup.
- **Transfer Options (`models/options`)**: Explicit struct carrying all runtime flags (`transfers`, `checkers`, `chunkSize`, `encrypt`, etc.), eliminating hidden global dependencies and enabling testability.
- **Progress Monitoring Engine (`internal/progress`)**: A Multi-Progress-Bar (`mpb`) orchestration layer that monitors all active transfer workers. It uses `io.Reader`/`io.Writer` proxying to track byte-level throughput without mutating core engine logic, ensuring a clear UI while maintaining engine performance.

