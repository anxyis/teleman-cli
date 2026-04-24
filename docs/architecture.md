# Teleman CLI - Architecture

Teleman is a high-performance cross-platform CLI tool that securely maps files from a physical filesystem to a virtualized state backed purely by a self-hosted Telegram Bot API. It treats Telegram **strictly as a message-based object store.**

## Core Principles

### 1. The Metadata Index (Single Source of Truth)
Telegram does not natively support folders, paths, metadata tags, or file relationships. It exclusively stores unassociated `Document` messages attached to Chat IDs.

Because of this, Teleman implements an isolated Metadata Index (`teleman.index.json`). 
- This index holds the **entire** virtual filesystem tree, mapping logical paths (e.g. `photos/trip.jpg`) to individual chunks of uploaded documents.
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

## Component Overview

- **Config Wizard (`config`)**: Generates local maps resolving human readable aliases (e.g., `remote_office`) to technical Bot targets (Chat IDs & Topic Threads). 
- **Chunk Engine (`chunker`)**: Stream processing engine dictating `io.Pipe` behavior, chunk limitations (dynamic logic switching between 50MB Cloud and 2000MB Local limits), and AES sealing.
- **Sync Engine**: Currently in-development; orchestrates N-number of `checkers` and multi-threaded routine `transfers` against the `models.Index` blueprint natively.
