# Teleman Advanced Filtering System (`.telemanfilter`)

Teleman features a unified, highly optimized file-selection pipeline that supports advanced path globs, file sizes, modification dates, and dynamic media presets.

This filtering engine runs directly during directory traversal, allowing excluded folders to be skipped entirely. This significantly reduces disk I/O and speeds up transfers on large workspaces.

---

## The Rule Pipeline Logic

Teleman's filtering system is built on a few core design principles to guarantee correctness and ease of use:

1. **Top-to-Bottom Processing:** Rules are evaluated in the order they are written or defined.
2. **Last Match Wins:** Later rules take precedence over earlier rules. This allows you to write general exclusions and selectively override them with subsequent inclusions.
3. **Default to Include:** If a file matches no rules, it is included.
4. **Strict Whitelisting (Opt-in):** If you want a strict whitelist, place `exclude *` at the top of your rules list and explicitly `include` only the files you want to sync.
5. **CLI & Filter Parity:** Both `.telemanfilter` and CLI flags feed into the exact same internal rule engine, meaning they share the same features and predictable behavior. CLI flags are appended *after* file rules, acting as top-level overrides.

---

## 1. Syntax & Rule Types

A `.telemanfilter` file is a plain-text file where each non-empty, non-comment line represents a rule. Lines starting with `#` are comments.

Each line follows the structure:
```text
<keyword> <value>
```

### Folder and File Exclusions / Inclusions
- `exclude <pattern>`: Excludes matching paths or files.
- `include <pattern>`: Explicitly includes matching paths or files.

Patterns can be direct paths or shell globs:
```text
# Exclude folders
exclude node_modules/
exclude bin/

# Exclude specific extensions
exclude *.log
exclude *.tmp

# Include a specific file inside an excluded folder
exclude build/
include build/production/assets/
```

### Advanced Glob Matching
Teleman uses the `doublestar` globbing library. This supports recursive wildcard matching (`**`):
```text
# Exclude all .DS_Store files anywhere in the workspace
exclude **/.DS_Store

# Include all .mp3 files inside any nested music folder
include **/music/**/*.mp3
```

### Regex Matching
For advanced power users, you can use raw regular expressions:
```text
# Exclude folders or files matching a regular expression
exclude regex:^S\d+E\d+
```

### Size Constraints
Size filters apply only to files (folders are skipped).
- `max-size <limit>`: Excludes files larger than the specified size.
- `min-size <limit>`: Excludes files smaller than the specified size.

Supported sizes: `B` (Bytes), `K` / `KB` (Kilobytes), `M` / `MB` (Megabytes), `G` / `GB` (Gigabytes).
```text
# Exclude files larger than 1.5 Gigabytes
max-size 1.5G

# Exclude files smaller than 10 Kilobytes
min-size 10K
```

### Date Constraints
Date filters apply to file modification timestamps (`mtime`).
- `modified-after <YYYY-MM-DD>`: Excludes files modified on or before the specified date.
- `modified-before <YYYY-MM-DD>`: Excludes files modified on or after the specified date.

```text
# Only transfer files modified after January 1st, 2026
modified-after 2026-01-01

# Only transfer files modified before June 15th, 2025
modified-before 2025-06-15
```

---

## 2. Dynamic Media Presets

Teleman includes built-in dynamic presets for common workloads so you don't have to write long filter lists by hand.

When first initialized, Teleman generates these preset files in your global configuration directory (`~/.config/teleman/presets/` on Linux/macOS or `%APPDATA%\teleman\presets\` on Windows). You can view, copy, or edit these files to customize your global presets.

The four default presets are:

### `photos`
```text
include *.jpg
include *.jpeg
include *.png
include *.gif
include *.webp
include *.heic
exclude *
```

### `videos`
```text
include *.mp4
include *.mkv
include *.avi
include *.mov
include *.webm
exclude *
```

### `music`
```text
include *.mp3
include *.flac
include *.ogg
include *.m4a
include *.wav
exclude *
```

### `documents`
```text
include *.pdf
include *.docx
include *.xlsx
include *.pptx
include *.txt
include *.md
exclude *
```

You can activate these presets from the CLI using flags like `--photos`, `--videos`, `--music`, or `--documents`.

---

## 3. CLI Integration & Overrides

Any filter rule supported in `.telemanfilter` has a direct CLI counterpart flag. You can combine them in any transfer command (`copy`, `move`, `sync`):

| CLI Flag | Syntax Example | Equivalent Filter Rule |
|---|---|---|
| `--include` | `--include "*.flac"` | `include *.flac` |
| `--exclude` | `--exclude "temp/"` | `exclude temp/` |
| `--min-size` | `--min-size 50M` | `min-size 50M` |
| `--max-size` | `--max-size 2G` | `max-size 2G` |
| `--modified-after` | `--modified-after 2026-01-01` | `modified-after 2026-01-01` |
| `--modified-before` | `--modified-before 2026-01-01` | `modified-before 2026-01-01` |

### Top-Level Overrides
Since CLI flags are appended to the rule pipeline last, they act as top-level overrides.
```bash
# Sync files, using rules inside the directory's .telemanfilter,
# BUT force exclude all node_modules/ even if .telemanfilter includes them.
teleman sync ./my-project/ remote:backup/ --exclude "node_modules/"
```

---

## 4. Backwards Compatibility (`.telemanignore`)

If a `.telemanfilter` file is not present in the source directory, Teleman automatically looks for a legacy `.telemanignore` file.

The engine parses the legacy `.telemanignore` file and translates it into standard `exclude` rules, with negation lines (prefixed with `!`) translated into `include` rules. This guarantees 100% backwards compatibility with your existing workspaces.

---

## 5. Dry-Run Visual Debugging

Debugging layered filter rules can sometimes be tricky. Teleman's `--dry-run` flag combined with verbose mode (`-v`) provides detailed, real-time logging explaining exactly why each file was included or excluded, and which specific rule matched it.

### Example Dry-Run Output
```bash
$ teleman sync ./Photos/ remote:backup/ --dry-run -v
[DRY-RUN] INCLUDED: Vacation.png (reason: default behavior (no matching rule))
[DRY-RUN] EXCLUDED: cache.tmp (reason: exclude: *.tmp)
[DRY-RUN] EXCLUDED: heavy_movie.mp4 (reason: exclude: max-size 50M)
[DRY-RUN] INCLUDED: info.txt (reason: include: *.txt)
```
