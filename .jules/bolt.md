## Performance Optimization: Lazy Path Splitting in ignore

**Date:** 2024-05-20
**Component:** `internal/ignore/ignore.go`
**Issue:** `IsIgnored` function was unconditionally performing `strings.Split(relPath, "/")` on every file check, even when the path didn't require directory matching.
**Solution:** Implemented lazy evaluation for path splitting. The `strings.Split` call is deferred until a directory exclusion rule (ends with `/`) is evaluated, checking a boolean `partsComputed` flag to ensure it's split at most once.
**Impact:**
- `BenchmarkIsIgnoredNoDirRules` (no directory rules in .telemanignore): Eliminated all allocations (from 224 B/op, 3 allocs/op to 0 B/op, 0 allocs/op).
- Execution time improved from ~610 ns/op down to ~194 ns/op.
- For configurations without directory rules, this provides a massive 68% latency reduction and eliminates memory pressure during file scanning.
