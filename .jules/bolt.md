## 2024-05-20 - Faster Hash String Generation
**Learning:** `fmt.Sprintf("%x")` uses reflection and allocates more memory compared to the `encoding/hex` package. In high-throughput streaming/chunking systems where every chunk gets hashed, this translates to measurable CPU overhead.
**Action:** Always prefer `hex.EncodeToString(hash)` over `fmt.Sprintf("%x", hash)` when generating hex strings for hashes.
