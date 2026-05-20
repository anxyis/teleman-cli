## Performance Optimization Journal

**Target:** `internal/telegram/client.go:testEndpoint`
**Issue:** Missing HTTP client reuse leading to unnecessary memory allocations on every `testEndpoint` call.
**Resolution:** Replaced the local instantiation of `http.Client` with a package-level global `testEndpointClient`.
**Impact:** Reduced memory allocations. Benchmark `BenchmarkTestEndpoint-4` showed reduction from 64 allocs/op to 63 allocs/op and time improved from ~138k ns/op to ~136k ns/op.
