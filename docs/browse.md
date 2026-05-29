# Teleman Interactive Browser (`teleman browse`)

Teleman features a lightning-fast, terminal-native interactive browser built using the `charmbracelet/bubbletea` library. It allows you to explore configured remotes, navigate through directory structures, inspect folder/file sizes, and download files directly without needing to pull down indices manually.

---

## Launching the Browser

To start the interactive terminal user interface (TUI), run:
```bash
teleman browse
```
This opens the browser in full-terminal alternate screen mode.

---

## 1. Interface and Layout

The TUI consists of two primary screens:

### Target Selection Screen
When you launch `browse`, you are presented with a list of all your configured remote targets (aliases) parsed directly from your Teleman configuration.
- Select a target and press `Enter` to connect and load its file tree.

### File Tree Explorer
Once a target is selected, Teleman dynamically builds a nested tree layout of your files and folders on that remote target.
- **Directory Metrics:** Displays total file count and accumulated byte sizes for directories instantly, reading from local index snapshots.
- **File Metrics:** Displays individual file sizes next to filenames.

---

## 2. Navigation & Controls

The browser supports industry-standard Vim-style keybindings for high-speed navigation without taking your hands off the keyboard.

| Key | Action |
|---|---|
| `j` or `Down` | Move selection down |
| `k` or `Up` | Move selection up |
| `l` or `Right` or `Enter` | Enter folder / Select target |
| `h` or `Left` or `Esc` | Go back (exit folder / return to targets list) |
| `Space` | Toggle multi-select highlight on file/folder |
| `/` | Open search filter |
| `d` | Quick download selected file/folder (or queue selected items) |
| `delete` | Batch delete selected items (or active cursor item if none selected) |
| `x` | Cancel active download |
| `r` | Refresh index from Telegram |
| `q` or `Ctrl+C` | Quit the browser |

---

## 3. Quick Filtering (`/`)

If a remote target has hundreds of files, you can press `/` to open a real-time search prompt at the bottom of the interface.
- As you type, the file tree instantly filters to show only files or directories whose names match your search query.
- Press `Enter` to lock in the filter and resume tree navigation.
- Press `Esc` to clear the active search filter.

---

## 4. Multi-Select & Batch Operations (`Space`)

To perform actions on multiple files at once, `teleman browse` features a fully integrated multi-selection mode:
- **Toggling Selection:** Press `Space` on any file or directory. The item will instantly light up with a solid background color indicating selection, rather than using clumsy brackets.
- **Selective Actions:** If one or more files are selected, batch commands (download or delete) will apply to **all** selected files instead of the single file under the cursor.
- **No Cursor Advancement:** Selecting an item does not push your cursor down, allowing you to easily toggle selection on specific items.

---

## 5. Inline Quick-Download & Queueing (`d`)

One of the most powerful features of `teleman browse` is the ability to instantly download files.

When you select a file in the tree explorer and press `d`:
1. **Lazy Connection:** The TUI dynamically initializes the Telegram connection in the background on the first press of `d`, preserving instant startup and local offline directory navigation.
2. **Inline Progress Animation:** The download starts in a background goroutine and streams progress updates directly into the TUI. You will see a progress percentage (e.g., `↓ 45%`) next to the file's description without any terminal flickering or command suspension.
3. **Download Queue (Single Concurrency):** To avoid network congestion and race conditions, downloads run sequentially. If you select multiple files via `Space` and press `d`, they are added to a download queue. The footer displays progress for the active download and shows the number of queued items (e.g., `(+3 queued)`).
4. **Session-Local Completion Status:** Once the download completes successfully, a green checkmark `✓` is shown next to the file name to indicate that it has been downloaded during the current session.
5. **Security Support:** Passwords for encrypted files are securely parsed from the `TELEMAN_PASSWORD` environment variable if configured.
6. **Background Operations & Context Cancellation:** You can safely navigate away to other folders while a download continues in the background. Pressing `x` will instantly cancel the active download, gracefully tear down the download context, and automatically clean up the temporary `.partial` file.
7. **Relative Path Preservation:** Files are downloaded preserving their relative directory structure rather than being flattened, keeping your workspace clean.

---

## 6. Centered Batch Deletions (`delete`)

If you want to clean up remote files directly from the TUI:
1. **Selection:** Select one or more files/folders using `Space`. If no items are selected, pressing `delete` will target the item currently under your cursor.
2. **Centered Pop-up Dialog:** A beautiful, high-visibility popup styled with `lipgloss` will appear in the center of your screen, showing the exact files or number of items targeted for deletion and prompting you for confirmation `(y/n)`.
3. **Atomic Index Lock/Push:** When confirmed, Teleman groups all deletions and invokes `core.RunDelete` sequentially or in grouped virtual index blocks. It locks the remote index, processes all deletions, and pushes the updated index to Telegram in a single, extremely fast transaction rather than pushing 50 times.
4. **Automatic Tree Refresh:** After completion, the virtual file tree is hot-reloaded automatically.

---

## 7. Live Index Refresh (`r`)

Because the browser primarily navigates offline index snapshots for instantaneous performance, changes made on the remote (such as new files uploaded elsewhere) won't show up immediately. 
- Press `r` at any time to trigger a network sync of the index for your current remote.
- Teleman will hot-swap the directory tree live in the background while keeping your exact directory position and navigation history intact!

