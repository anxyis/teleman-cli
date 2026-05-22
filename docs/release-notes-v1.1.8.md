# Teleman v1.1.8 - Performance & Reliability Upgrades

This release brings massive reliability improvements to downloads and completely unlocks the true power of Local Telegram API setups with smart, memory-aware auto-tuning.

## 🚀 New Features

### Seamless Download Resumption
Say goodbye to restarting massive downloads! Teleman now fully supports **Download Resumption**.
* **Smart Recovery:** If a network connection drops or the process is interrupted, Teleman safely resumes the transfer directly from the last verified chunk boundary.
* **Corruption Proof:** The engine recalculates the exact `.partial` file offsets and physically truncates incomplete/corrupted chunk streams to guarantee hash-verified integrity before resuming.
* **Instant UI Feedback:** Re-running a download will instantly fast-forward your progress bar to reflect exactly how many bytes were recovered from the disk!

### Smart Auto-Tuning Chunk Sizes (Local API Unleashed)
We ripped out the legacy engine caps and introduced a truly dynamic scaling engine.
* **Public API (`api.telegram.org`):** Small files (under 10MB) now use **2MB chunks** instead of reserving huge buffers. This drastically improves UI progress-bar responsiveness! Large files gracefully max out at the strict 49MB limit.
* **Local API Potential Unlocked:** Previously, chunk sizes were strictly capped or bypassed through a clunky `--cz` legacy parameter. Now, if you are running a custom Bot API server, the engine aggressively scales up to **1999 MB (2GB)** chunks for massive files! This drastically reduces API calls and index sizes, while safely capping buffers so you never run out of RAM.

## 🛠 Fixes & Under the Hood Cleanups
* **Legacy Bypass Removed:** Ripped out the old `AutoUpgradeChunk` code scattered across `move.go` and `context.go` that was improperly forcing 1999MB chunks and bypassing the actual chunking engine.
* **Memory Preservation:** The 1999MB auto-tuning tier now strictly checks the source file's total size before allocating, preventing explosive `sync.Pool` allocations for mid-sized files.
