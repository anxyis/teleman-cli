
### Security Fix Optimization
Added path traversal mitigation during download (`internal/core/download.go`). Note: We optimized the `isValidDownloadPath` check to proactively sanitize string allocations by calling `strings.ReplaceAll` before `filepath.Clean(filepath.FromSlash(normalized))`. This cross-platform validation reliably blocks evasions like `..\` on unix systems handling malicious windows paths without allocating excessive strings.
