# Teleman v1.2.2 Release Notes

This release is a major architectural and user experience upgrade. It replaces the basic `.telemanignore` blacklist with a highly optimized, layered **Unified File Selection Pipeline**, and introduces a fully interactive, Vim-keybinding-powered **Terminal User Interface (TUI) Browser** (`teleman browse`).

---

## 🌟 Major Features & Improvements

### 1. Unified File Selection Pipeline (`filter.Pipeline`)
The basic ignore blacklist has been evolved into a robust, high-performance archive selection engine.
- **Layered Filtering (Last Match Wins):** Evaluates inclusion and exclusion rules from top-to-bottom. Later rules override earlier ones, allowing you to easily exclude entire folders but explicitly include single files inside them.
- **Recursive Globbing:** Powered by the `doublestar` library, supporting `**/*.flac` style multi-level pattern matching.
- **In-Flight Traversal Optimization:** Excluded directories are skipped during filesystem traversal (`filepath.SkipDir`), completely avoiding disk read I/O and significantly speeding up transfers for large datasets.
- **Size Constraints:** Easily filter files during traversal with `min-size <limit>` (exclude files smaller than limit) and `max-size <limit>` (exclude files larger than limit) rules.
- **Date Constraints:** Limit transfers by file modification times with `modified-after <YYYY-MM-DD>` and `modified-before <YYYY-MM-DD>`.
- **Legacy Fallback Compatibility:** Legacy `.telemanignore` files are automatically detected, compiled, and mapped to the new engine to guarantee 100% backwards compatibility out-of-the-box.

### 2. User-Editable Filter Presets
Common file filtering configurations are no longer hardcoded into the binary.
- On initialization, standard filter presets (`photos.preset`, `videos.preset`, `music.preset`, `documents.preset`) are automatically generated as plain text files in the user's config presets folder (`~/.config/teleman/presets` or `%APPDATA%\teleman\presets`).
- Users can customize, share, or duplicate preset files.
- Enable presets from the CLI using flags like `--photos`, `--videos`, `--music`, or `--documents`.

### 3. Absolute CLI & Filter Parity with Visual Dry-Runs
- All `.telemanfilter` capabilities are fully mapped to matching CLI options: `--include`, `--exclude`, `--min-size`, `--max-size`, `--modified-after`, and `--modified-before`.
- CLI flags are compiled and appended after file rules, acting as top-level overrides.
- **Visual Debugging:** Verbose dry-runs (`--dry-run -v`) now print the exact rule that caused each file's inclusion or exclusion (e.g. `cache.tmp (matched: exclude: *.tmp)`).

### 4. Interactive Remote Explorer TUI (`teleman browse`)
A lightning-fast, terminal-native file browser built with the `charmbracelet/bubbletea` library.
- **Target Selection Screen:** Inspect and select from all your configured remote targets dynamically.
- **Virtual Tree Explorer:** Explore files and directories nested inside your remote virtual drive.
- **Vim Power-User Keybindings:** Navigating feels natural with `j`/`k` (move selection), `h`/`l` / `Enter` (traverse directories), `/` (live search & filter explorer items in real-time), and `Esc` (go back).
- **Accurate Directory Metrics:** Displays individual file sizes and directory total file counts + accumulated byte sizes instantly.
- **TUI Multi-Select (`Space`):** Select multiple files or directories with solid background color highlights. No brackets, and selection does not push the cursor down.
- **Inline Background Downloads (`d`):** Pressing `d` downloads selected items asynchronously in background goroutines with real-time percentage updates (`↓ 45%`) displayed inline in the tree, without suspending the TUI or terminal flickering.
- **Download Queue (Single Concurrency):** Queues multiple files if batch-downloaded. The footer displays progress for the active download and shows the remaining queue size (e.g., `(+3 queued)`).
- **Centered Pop-up Deletion Confirmation:** Displays a beautiful, centered double-bordered pop-up dialog for deleting files.
- **Efficient Batch Deletions (`delete`):** Pressing `delete` deletes all selected items (or the cursor item) in a single atomic Telegram index push transaction via refactored backend logic.

---

## 🐛 Bug Fixes & Refactoring

- **MaxSize bug:** Fixed a critical bug in `max-size` rule evaluation where smaller files were erroneously excluded and larger files were included.
- **Date Boundary bugs:** Corrected `modified-after` and `modified-before` to act as proper exclusions rather than matching includes that still allowed outer files to pass under default behavior.
- **Metadata Test Build Conflict:** Resolved a `main` redeclaration conflict in `test_metadata.go` by reorganizing scripts into dedicated nested directories, allowing all package testing and building to succeed cleanly.
- **TUI Event Handling & Page-Down Scroll:** Fixed a bug where pressing `d` natively triggered `list.Model` page-down scrolling. Event bubbling has been correctly terminated.
- **TUI History Stack & Navigation:** Fixed navigation stack bugs where going back from a folder could sometimes trigger directory state corruption or folder back-navigation history losses.
- **TUI & CLI Bulk Deletions:** Updated CLI commands (`delete`/`purge`) and backend engine (`core.RunDelete` in `internal/core/delete.go`) to support multiple target paths, locking and pushing the index exactly once to avoid redundant network updates.

---

## 🛠 Usage & CLI Changes

### New Commands
- `teleman browse`: Launches the interactive TUI.
- `teleman delete <target1> <target2> ...`: Supports multiple target deletions in a single run.
- `teleman purge <target1> <target2> ...`: Supports multiple target purges in a single run.

### New Flags (`copy`, `move`, `sync`)
- `--include <pattern>`: Include files matching pattern (e.g. `*.flac`).
- `--exclude <pattern>`: Exclude files matching pattern (e.g. `node_modules/`).
- `--min-size <size>`: Exclude files smaller than size (e.g. `50M`).
- `--max-size <size>`: Exclude files larger than size (e.g. `2G`).
- `--modified-after <date>`: Exclude files modified on or before date (YYYY-MM-DD).
- `--modified-before <date>`: Exclude files modified on or after date (YYYY-MM-DD).
- `--photos`, `--videos`, `--music`, `--documents`: Applies the standard preset files.
