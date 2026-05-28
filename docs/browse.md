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
| `/` | Open search filter |
| `d` | Quick download selected file/folder |
| `q` or `Ctrl+C` | Quit the browser |

---

## 3. Quick Filtering (`/`)

If a remote target has hundreds of files, you can press `/` to open a real-time search prompt at the bottom of the interface.
- As you type, the file tree instantly filters to show only files or directories whose names match your search query.
- Press `Enter` to lock in the filter and resume tree navigation.
- Press `Esc` to clear the active search filter.

---

## 4. Seamless Quick-Download (`d`)

One of the most powerful features of `teleman browse` is the ability to instantly download files.

When you select a file or folder in the tree explorer and press `d`:
1. The interactive TUI is temporarily **suspended**.
2. Teleman invokes the core download engine (`teleman download`) behind the scenes.
3. The terminal displays the original **rich progress bars**, detailing download speeds, chunk statuses, and ETA.
4. Once the download completes and the file is verified on disk, Teleman automatically **resumes** the TUI.
5. You are returned exactly where you left off in the remote tree explorer.

This ensures you get full, beautiful progress feedback and safety verification during downloads without having to exit the TUI or write out complicated CLI target paths manually.
