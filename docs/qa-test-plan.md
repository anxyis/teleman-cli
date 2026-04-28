# Teleman CLI — QA Test Plan

**Targets used:** `siya` (user DM), `test_channel` (saved channel alias)  
**Dataset:** documents, images, music, videos — mixed file types  
**Binary:** `teleman.exe` built from current source

---

## Pre-Flight Checks

- [ ] `teleman config` — verify `siya` and `test_channel` aliases exist
- [ ] `teleman ls siya:` — confirm index loads without error on fresh run
- [ ] `teleman ls test_channel:` — confirm target isolation (should not share files with `siya`)
- [ ] Verify `TELEMAN_PASSWORD` env var is unset before password-path tests

---

## Section 1: `ls` Command

### TC-LS-01 — List empty target root
```
teleman ls siya:
```
- **Expected:** `(No files found)` message, exit 0
- **NOT expected:** crash, nil pointer panic, wrong target's files shown

### TC-LS-02 — List after files exist
```
teleman ls test_channel:
```
- **Expected:** rows of `[size] [virtual_path]` per uploaded file
- **NOT expected:** files from `siya` namespace appearing here (namespace isolation)

### TC-LS-03 — List a sub-path
```
teleman ls test_channel:documents/
teleman ls siya:music/
```
- **Expected:** only files under that prefix
- **NOT expected:** `documents/reports/` matching `documents_extra/file.txt` (boundary collision)

### TC-LS-04 — List non-existent alias
```
teleman ls ghost:
```
- **Expected:** error `target alias 'ghost' not found`, exit non-zero
- **NOT expected:** `os.Exit` before defers fire (now uses `RunE`)

### TC-LS-05 — List with verbose
```
teleman ls test_channel: -v
```
- **Expected:** pipeline steps printed (`=> Loading Virtual Index...`), file rows
- **NOT expected:** verbose output when `-q` is set

### TC-LS-06 — List invalid format (no colon)
```
teleman ls test_channel
```
- **Expected:** `invalid target format. Use alias:virtual/path`
- **NOT expected:** panic or hang

---

## Section 2: `copy` Command

### TC-COPY-01 — Single document upload
```
teleman copy ./dataset/documents/report.txt siya:docs/
```
- **Expected:** `[1/1] docs/report.txt (N bytes)`, index committed, exit 0
- **NOT expected:** duplicate entry in index on re-run without `--force`

### TC-COPY-02 — Skip identical file (dedup)
```
teleman copy ./dataset/documents/report.txt siya:docs/
teleman copy ./dataset/documents/report.txt siya:docs/
```
- **Expected:** second run logs `[Skipped] docs/report.txt (Unchanged)`
- **NOT expected:** re-upload consumes bandwidth

### TC-COPY-03 — Force re-upload
```
teleman copy ./dataset/documents/report.txt siya:docs/ --force
```
- **Expected:** file uploaded even though index entry exists
- **NOT expected:** skip despite `--force` flag

### TC-COPY-04 — Whole documents directory
```
teleman copy ./dataset/documents/ test_channel:documents/
```
- **Expected:** all `.txt .pdf .docx .xlsx .md .csv` files uploaded, summary shows correct count
- **NOT expected:** directory itself appears as a file entry

### TC-COPY-05 — Images directory
```
teleman copy ./dataset/images/ test_channel:images/
```
- **Expected:** `.jpg .png .gif .jpeg` all uploaded as raw documents (no --media flag)
- **NOT expected:** Telegram treats them as photos (that only happens with `--media`)

### TC-COPY-06 — Dry run (no upload)
```
teleman copy ./dataset/documents/ siya:docs/ --dry-run
```
- **Expected:** `[DRY RUN] Would upload N files:` list printed, zero Telegram API calls, index unchanged
- **NOT expected:** any actual upload occurring, index version incrementing

### TC-COPY-07 — Encrypt single file via env var
```
$env:TELEMAN_PASSWORD = "qa-test-secret"
teleman copy ./dataset/documents/report.txt siya:encrypted/ --encrypt
```
- **Expected:** upload succeeds, chunk `Encrypted: true` in index, log shows `[Encryption] AES-256-GCM enabled`
- **NOT expected:** password visible in process list

### TC-COPY-08 — Encrypt with flag (warn expected)
```
teleman copy ./dataset/documents/report.txt siya:encrypted/ --encrypt --password "qa-test-secret"
```
- **Expected:** upload succeeds, warning logged about `--password` flag visibility
- **NOT expected:** silent use of flag with no warning

### TC-COPY-09 — Encrypt without any password source
```
teleman copy ./dataset/documents/report.txt siya:encrypted/ --encrypt
```
*(run with no env var and non-TTY stdin, e.g. piped)*
- **Expected:** error `--encrypt requires a password`
- **NOT expected:** upload with zero-padded key (old behavior)

### TC-COPY-10 — ZIP archive mode
```
teleman copy ./dataset/documents/ test_channel:archives/ --zip
```
- **Expected:** single `documents.zip` virtual entry in index, streaming (no temp file on disk)
- **NOT expected:** individual files uploaded, temp zip file left behind

### TC-COPY-11 — TGZ archive mode
```
teleman copy ./dataset/documents/ test_channel:archives/ --tgz
```
- **Expected:** single `documents.tar.gz` entry in index
- **NOT expected:** `--zip` and `--tgz` both active simultaneously producing two archives

### TC-COPY-12 — Media mode — audio files
```
teleman copy ./dataset/music/ test_channel:music/ --media
```
- **Expected:** `.mp3/.flac/.m4a/.ogg` with valid ID3 tags routed via `sendAudio` (title + performer in Telegram UI); files with no tags fallback to `sendDocument`
- **NOT expected:** chunked/multi-part audio files sent via `sendAudio` (only single-chunk eligible)
- **NOT expected:** encrypted files sent via media endpoint (must be unencrypted)

### TC-COPY-13 — Media mode — images
```
teleman copy ./dataset/images/ test_channel:photos/ --media
```
- **Expected:** `.jpg .jpeg .png .gif` routed via `sendPhoto`
- **NOT expected:** `.gif` treated as animation (Telegram handles that server-side)

### TC-COPY-14 — Media mode — videos
```
teleman copy ./dataset/videos/ test_channel:videos/ --media
```
- **Expected:** `.mp4 .mov .avi .mkv` routed via `sendVideo`
- **Edge case:** `.wav` is audio but large — will likely exceed single-chunk → falls back to `sendDocument` as multi-part

### TC-COPY-15 — Media mode + encrypt (should NOT use media endpoint)
```
$env:TELEMAN_PASSWORD = "qa-test-secret"
teleman copy ./dataset/music/ test_channel:enc-music/ --media --encrypt
```
- **Expected:** all files upload as raw documents (media endpoint skipped because encrypted)
- **NOT expected:** encrypted bytes sent to `sendAudio`

### TC-COPY-16 — Concurrency flags
```
teleman copy ./dataset/ test_channel:perf-test/ -t 8 -c 16
```
- **Expected:** parallel uploads, summary shows correct counts
- **NOT expected:** race condition in index (mutex guards this)

### TC-COPY-17 — Invalid chunk size
```
teleman copy ./dataset/documents/ siya:docs/ --cz 0M
```
- **Expected:** early error `chunk size must be positive`
- **NOT expected:** silent upload with wrong chunk size

### TC-COPY-18 — Both `--zip` and `--tgz` set
```
teleman copy ./dataset/documents/ siya:docs/ --zip --tgz
```
- **Expected:** `--tgz` takes precedence (TgzMode checked first in code), single `.tar.gz` produced
- **Edge case to flag:** behavior should be explicitly documented or mutually exclusive via cobra `MarkFlagsMutuallyExclusive`

---

## Section 3: `sync` Command

### TC-SYNC-01 — First-time sync (all files new)
```
teleman sync ./dataset/documents/ test_channel:sync-docs/
```
- **Expected:** all files uploaded, summary `N Uploaded, 0 Skipped, 0 Errors`
- **NOT expected:** index lock left held after completion

### TC-SYNC-02 — Second run (all identical)
```
teleman sync ./dataset/documents/ test_channel:sync-docs/
```
- **Expected:** `Target is perfectly in sync. Nothing to do (Skipped N files).`
- **NOT expected:** any re-upload

### TC-SYNC-03 — One file changed
- Modify `report.txt` content on disk, re-run sync
- **Expected:** only `report.txt` re-uploaded, rest skipped
- **NOT expected:** full re-sync triggered

### TC-SYNC-04 — Dry run sync
```
teleman sync ./dataset/documents/ test_channel:sync-docs/ --dry-run
```
- **Expected:** `[DRY RUN] Would upload N files:` printed, no uploads, index unchanged
- **NOT expected:** lock acquired and not released

### TC-SYNC-05 — Sync with force
```
teleman sync ./dataset/documents/ test_channel:sync-docs/ --force
```
- **Expected:** all files re-uploaded regardless of index state
- **NOT expected:** dedup skip occurring

### TC-SYNC-06 — Sync with parallel workers
```
teleman sync ./dataset/ test_channel:full-sync/ -t 4 -c 8
```
- **Expected:** checkers and transfer goroutines both active, no data races
- **NOT expected:** deadlock on `tasksChan` or `uploadChan`

### TC-SYNC-07 — SIGINT during sync (graceful shutdown)
- Start a large sync, press `Ctrl+C` mid-transfer
- **Expected:** `Received signal — shutting down gracefully` printed, partial index committed, lock released
- **NOT expected:** lock left held permanently, partial files finalized without index update

### TC-SYNC-08 — Sync with ZIP mode
```
teleman sync ./dataset/documents/ test_channel:sync-archives/ --zip
```
- **Expected:** single streaming `.zip` uploaded, existing zip entry replaced on next sync
- **NOT expected:** individual files + zip both uploaded

---

## Section 4: `move` Command

### TC-MOVE-01 — Move single file
```
teleman copy ./dataset/documents/report.txt siya:move-test/   # pre-populate
teleman move ./dataset/documents/report.txt siya:move-test/ --force
```
- **Expected:** `report.txt` uploaded (or skipped if identical), index committed, then `report.txt` deleted from disk
- **NOT expected:** file deleted before index commit

### TC-MOVE-02 — Move entire directory
```
teleman move ./dataset/images/ test_channel:moved-images/
```
- **Expected:** all images uploaded, index committed, then local image files deleted, empty dirs cleaned up
- **NOT expected:** partial deletion if any upload fails

### TC-MOVE-03 — Dry run (source preserved)
```
teleman move ./dataset/videos/ test_channel:moved-videos/ --dry-run
```
- **Expected:** `[DRY RUN] Would move N files` printed, zero deletions, zero uploads
- **NOT expected:** any file removed from disk

### TC-MOVE-04 — SIGINT safety (source files preserved)
- Start a large move, press `Ctrl+C` mid-upload
- **Expected:** source files NOT deleted (index commit never happened), warning printed
- **NOT expected:** partial deletions leaving data in neither location

### TC-MOVE-05 — Move with encryption
```
$env:TELEMAN_PASSWORD = "qa-test-secret"
teleman move ./dataset/documents/ siya:encrypted-docs/ --encrypt
```
- **Expected:** files encrypted, uploaded, index committed, then deleted locally
- **NOT expected:** plaintext uploaded then source deleted

### TC-MOVE-06 — Move already-synced files (skipped = still deleted)
- Pre-copy files to target, then run move with identical files
- **Expected:** files skipped by diff engine but still added to `successfulMoves` list → deleted after commit
- **NOT expected:** skipped files left on disk (they are confirmed on remote)

### TC-MOVE-07 — Move to non-existent alias
```
teleman move ./dataset/documents/ ghost:docs/
```
- **Expected:** error `target alias 'ghost' not found`, no files deleted
- **NOT expected:** crash or partial deletion

---

## Section 5: `download` Command

### TC-DL-01 — Download single file
```
teleman download test_channel:documents/report.txt ./restored/
```
- **Expected:** `restored/report.txt` written, hash verified, exit 0
- **NOT expected:** `.partial` file left behind on success

### TC-DL-02 — Download virtual directory
```
teleman download test_channel:documents/ ./restored-docs/
```
- **Expected:** full directory tree recreated under `restored-docs/`, all files hash-verified
- **NOT expected:** path collision between `documents/` and `documents_extra/` (boundary check)

### TC-DL-03 — Download entire target root
```
teleman download test_channel: ./full-restore/
```
- **Expected:** all files from `test_channel` namespace restored
- **NOT expected:** files from `siya` namespace appearing

### TC-DL-04 — Dry run download
```
teleman download test_channel:documents/ ./restored/ --dry-run
```
- **Expected:** `[DRY RUN] Would download N files:` listed, no files written to disk
- **NOT expected:** any `.partial` files created

### TC-DL-05 — Download encrypted file — correct password
```
TELEMAN_PASSWORD=qa-test-secret teleman download siya:encrypted/ ./decrypted/
```
- **Expected:** files decrypted and written correctly, byte-for-byte match with originals
- **NOT expected:** garbled output, decryption error on correct password

### TC-DL-06 — Download encrypted file — wrong password
```
teleman download siya:encrypted/ ./decrypted/ --password "wrong-password"
```
- **Expected:** `decryption failed` error per chunk, download aborted, no corrupted output file finalized
- **NOT expected:** partial file written to final path (atomic write prevents this)

### TC-DL-07 — Download unencrypted file with password provided
```
teleman download test_channel:documents/ ./restored/ --password "qa-test-secret"
```
- **Expected:** chunks that are not encrypted (`Encrypted: false`) skip decryption, download succeeds
- **NOT expected:** error trying to decrypt unencrypted bytes

### TC-DL-08 — Download non-existent virtual path
```
teleman download test_channel:phantom/path/ ./restored/
```
- **Expected:** `(No files matched path 'phantom/path/')`, exit 0
- **NOT expected:** crash or panic

### TC-DL-09 — SIGINT during download
- Start large directory download, press `Ctrl+C`
- **Expected:** `Download interrupted after N/M files`, summary printed, `.partial` files left for manual cleanup
- **NOT expected:** half-written files finalized at their final path

### TC-DL-10 — Download with path boundary safety
```
# If "media" and "media_test" both exist as virtual prefixes
teleman download test_channel:media/ ./restored/
```
- **Expected:** only files under `media/` downloaded, `media_test/` files NOT included
- **NOT expected:** `media_test/file.txt` downloaded into `restored/`

### TC-DL-11 — Re-download (no dedup — always overwrites)
- Run the same download twice to the same local dest
- **Expected:** files re-downloaded and overwritten (download has no skip logic by design)
- **NOT expected:** second run skips without re-verifying

### TC-DL-12 — Download with verbose
```
teleman download test_channel:music/ ./restored-music/ -v
```
- **Expected:** `[Chunk N/M] Hash verified ✓` per chunk visible in output
- **NOT expected:** hash log missing in verbose mode

---

## Section 6: Flag Combination Matrix

| Command | Flags | Expected | Risk |
|---------|-------|----------|------|
| `copy` | `--encrypt --zip` | Single `.zip` blob, AES-encrypted | Correct |
| `copy` | `--encrypt --tgz` | Single `.tar.gz` blob, AES-encrypted | Correct |
| `copy` | `--media --encrypt` | Falls back to `sendDocument` | Correct |
| `copy` | `--zip --tgz` | Only `--tgz` takes effect | ⚠️ Undocumented precedence |
| `copy` | `--force --dry-run` | Dry run wins, no uploads | Correct |
| `sync` | `--force --dry-run` | Dry run wins, no uploads | Correct |
| `copy` | `-t 1 -c 1` | Sequential upload, slowest mode | Should still work |
| `copy` | `-t 16 -c 32` | Max parallelism, rate limit risk on cloud API | Test carefully |
| `download` | `--dry-run --password` | Password read but unused (no download) | Minor waste |
| `move` | `--encrypt --force` | Re-uploads encrypted even if identical, then deletes | Correct |

---

## Section 7: Failure Scenarios

### FS-01 — Network drop mid-upload
- Simulate by disconnecting network during `copy` of large video
- **Expected:** upload error logged, that file counted as error, index committed for successful files only
- **NOT expected:** index committed with a broken chunk entry

### FS-02 — Invalid bot token in config
- Manually corrupt `~/.config/teleman/config.json` token
- **Expected:** `API connectivity failed: Telegram API Error: Unauthorized`
- **NOT expected:** silent failure or wrong error message

### FS-03 — Index channel ID wrong
- Set `index_channel_id` to a channel the bot is not in
- **Expected:** lock acquire or `PushVersion` fails with Telegram API error
- **NOT expected:** silent write to wrong channel

### FS-04 — Duplicate uploads without `--force`
- Upload same directory twice
- **Expected:** second run skips all files (size + modtime match)
- **Edge case:** if file is `touch`-ed (modtime changes, size same) → should re-upload

### FS-05 — Partial download recovery
- Kill process mid-download, check output directory
- **Expected:** `.partial` files present for in-progress files, completed files at final path
- **NOT expected:** `.partial` files at final path (atomic rename)

### FS-06 — Zero-byte file upload
- Create an empty file, attempt upload
- **Expected:** graceful handling — either 0-chunk entry or error (depends on `io.ReadFull` with 0 bytes)
- **Edge case to investigate:** `ProcessStreamCtx` with empty reader — chunks slice may be empty, `PushVersion` called with 0-chunk entry

### FS-07 — Very long virtual path
```
teleman copy ./file.txt siya:a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/
```
- **Expected:** file stored at deep virtual path, `ls` shows it
- **NOT expected:** path truncation or index key collision

### FS-08 — Filename with special characters
- Files with spaces, parentheses, unicode in name
- **Expected:** virtual path preserves name, download restores correctly
- **Edge case:** Windows path separator `\` replaced with `/` in virtual paths

### FS-09 — Lock held by crashed instance
- Manually insert a stale lock message (timestamp >5 min ago) into index channel
- **Expected:** `IsStale()` returns true, lock broken, operation proceeds
- **NOT expected:** permanent deadlock (old behavior, now fixed)

### FS-10 — Concurrent sync from two instances
- Run `teleman sync` from two terminals simultaneously to same target
- **Expected:** one acquires lock, other fails with `failed to acquire lock`
- **NOT expected:** split-brain index corruption

---

## Section 8: Dataset-Specific Tests

### Music files — `--media` routing
- `.mp3` with ID3 tags → `sendAudio` with title + performer ✅
- `.mp3` with NO tags → falls back to `sendDocument` ✅
- `.flac` → `sendAudio` if tagged, `sendDocument` if not ✅
- `.wav` large file (>49MB) → multi-chunk → NOT eligible for media endpoint, `sendDocument` ✅
- `.ogg` → `sendAudio` ✅

### Image files — `--media` routing
- `.jpg/.jpeg/.png` → `sendPhoto` ✅
- `.gif` → `sendPhoto` (Telegram converts to GIF/animation server-side)
- `.bmp/.webp` → `sendPhoto` per chunker code ✅

### Video files — `--media` routing
- `.mp4/.mov` small → `sendVideo` ✅
- `.mkv/.avi` → `sendVideo` ✅
- Large video (>49MB) → multi-chunk → NOT eligible, `sendDocument` ✅

### Documents
- All types treated as raw `sendDocument` regardless of `--media` flag ✅

---

## Section 9: Final Verdict

### ✅ Production Ready
- `ls` — basic listing, namespace isolation, prefix boundary matching
- `copy` — single file, directory, dedup skip, force re-upload
- `download` — hash verification, atomic writes, path boundary safety, encrypted decryption
- `--dry-run` — confirmed no mutations across all commands
- `--encrypt` via env var — password resolution chain works
- Context cancellation / SIGINT handling — graceful shutdown with lock release
- Error returns (`RunE`) — no `os.Exit` in command handlers, defers execute

### ⚠️ Questionable / Needs Verification
- **Lock implementation** — lock acquire uploads a JSON doc to index channel; release deletes it. Needs real concurrent test to verify atomicity
- **`--zip` + `--tgz` simultaneously** — `TgzMode` wins silently; should be `MarkFlagsMutuallyExclusive` in cobra
- **Zero-byte files** — `ProcessStreamCtx` with empty reader behavior is untested
- **`move` skip = delete** — files skipped by diff but confirmed on remote ARE deleted; this is correct but surprising UX for users
- **Rate limit handling** — exponential backoff exists but pipe-based body means retries on 429 fail; rate-limited uploads return error rather than retry

### 🔧 Needs Improvement
- `--zip` and `--tgz` should be cobra `MarkFlagsMutuallyExclusive` to give clear error
- `sync` does not yet delete remote files absent from local (documented as "In Development")
- No `-t`/`-c` flags on `download` — parallel download workers not yet wired
- Lock acquire does not check for existing locks before placing its own (true distributed check deferred)
- `copy` uses sequential loop, not the parallel transfer pool that `sync` uses — large directories are slower

### 🚫 Not Yet Production-Ready
- **True distributed locking** — current implementation places lock without reading existing messages first; two near-simultaneous runs can both acquire
- **Index fetch from Telegram** — `Load()` reads from local cache only; remote index changes from another machine are never seen
- **Resumable uploads** — no chunk offset tracking; interrupted large uploads start from scratch
- **`sync` remote deletion** — not implemented; `sync` is currently additive only (same as `copy` with workers)
