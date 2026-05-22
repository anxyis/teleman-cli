# Release Notes - v1.1.7

This release focuses on critical security patching, performance optimizations in core operations, and complete test suite hardening to ensure maximum reliability and safety when syncing files over Telegram.

## 🚀 Key Improvements

### 1. 🔒 Security & Permissions Hardening {#security}

*   **Zip Slip / Path Traversal Fix**: A critical security fix was added to the zip extraction engine used during download. Any path traversal sequences (`../`) in archived files are intercepted, preventing Zip Slip exploits that could overwrite arbitrary local files.
*   **Strict Cache Permissions**: Local index cache files are now safely created with `0600` permissions (read/write only by owner) and internal configuration directories with `0700` permissions (read/write/search only by owner). This prevents local privilege escalation/snooping on multi-user systems.

### 2. ⚡ Performance Optimizations {#performance}

*   **Zero-Allocation Encryption & Decryption**: Added a pooled scratch space (`scratchPool`) to recycle small buffers used for random salts and GCM nonces, completely eliminating their heap allocations during chunk encryption. Furthermore, integrated the central buffer `pool` during chunk decryption in `ReassembleStreamCtx`, avoiding massive dynamic slice allocations (up to 49MB per chunk) during file downloads.
*   **Index Truncation Optimization**: Resolved N+1 remote API request overhead. Previously, the index engine made recursive queries to truncate older versions of virtual files; this process has been optimized to batch metadata lookups, greatly reducing sync time.
*   **Lazy Path Splitting**: Memory allocations within the `.telemanignore` evaluation subsystem (`IsIgnored`) have been optimized by utilizing lazy splitting for directory components, avoiding immediate heap allocations on deep paths.
*   **Fast Hash Conversions**: Switched Bolt hash conversions from expensive `fmt.Sprintf("%x", hash)` to direct `hex.EncodeToString(hash)` calls. This boosts the index engine's throughput when scanning large file trees.

### 3. 🧹 Code Health & Reliability {#code-health}

*   **Streamlined Sync Engine**: Simplified the concurrency checker logic within the main synchronization loop (`internal/sync/engine.go`). This reduces CPU overhead and resource locking when managing deep directories with hundreds of concurrent requests.

### 4. 🧪 Test Suite Hardening {#testing}

To guarantee that performance improvements do not regress, the test suite was greatly expanded:
*   Added robust, table-driven tests for `chunkMessage`, `IsIgnored`, `ParseChunkSize`, config save/load routines, `HashChunk`, `DeriveKey`, `NewBarWriter`, `copyFile` and `formatBytes`.
*   Unified duplicate test suites and added cross-platform checks for paths and zip files.

---

## 💾 Installation & Update

If you are already running Teleman (v1.1.2 or higher), simply run:
```bash
teleman update
```

For fresh installations, download the pre-compiled binary for your system from the [Releases](https://github.com/anxyis/teleman-cli/releases) page:
*   `teleman-windows-amd64.exe` (Windows 64-bit)
*   `teleman-linux-amd64` (Linux 64-bit)
*   `teleman-linux-arm64` (Linux ARM64 / Termux)
