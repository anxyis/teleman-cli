# TeleMan Playground

**TeleMan** is a powerful all-in-one toolkit for Telegram Bot developers and power users. It combines a raw API playground, a mass-media batch uploader, and an advanced automated sync engine to manage Telegram channels and archives efficiently.

---

## ⚡ Quick Install (One Command)

**For Termux/Android:**

**With SSH (Recommended if you have SSH keys configured):**
```bash
git clone git@github.com:anxyis/teleman-playground-termux.git && cd teleman-playground-termux && bash install
```

**With HTTPS (if you use username/password or token):**
```bash
git clone https://github.com/anxyis/teleman-playground-termux.git && cd teleman-playground-termux && bash install
```

**⚠ If Node.js is broken (common issue):**

Run these commands IN ORDER:
```bash
pkg upgrade
pkg install libicu -y
pkg uninstall nodejs nodejs-lts npm -y
pkg install nodejs -y
```

Then run the installation command above.

That's it! The script will:
- ✅ Install prerequisites (git, nodejs, ffmpeg)
- ✅ Clone the repository
- ✅ Install all dependencies
- ✅ Build the app
- ✅ Set up configuration
- ✅ Create shortcuts (`start-tg`, `stop-tg`)

**After installation:**
```bash
start-tg
# Open http://localhost:3000 in your browser
```

**If start-tg doesn't work:**
```bash
source ~/.bashrc
start-tg
```

---

## 🚀 Core Features

### 1. 🎮 API Playground
A developer-centric tool to interact with the raw Telegram Bot API without writing scripts.
*   **Request Builder**: Execute any method (e.g., `sendMessage`, `getUpdates`, `sendPhoto`) with custom parameters.
*   **Complex Payloads**: Support for nested JSON parameters and **file attachments** (upload directly from your device).
*   **Visual Feedback**:
    *   Real-time JSON response viewer with syntax highlighting.
    *   Immediate Success 🟢 / Failure 🔴 status indicators.
*   **Local History**: Automatically saves your recent method calls for quick re-execution.

### 2. 📦 Batch Sender
A production-grade mass uploader designed for distributing large collections of media.
*   **Mass Distribution**: Send files to Users, Groups, or **Forum Topics**.
*   **Smart Queue**:
    *   **Serial Processing**: files are sent one by one to ensure order.
    *   **Rate Limiting**: Configurable delay (100ms - 5s) between messages to avoid flooding limits.
    *   **Large File Splitting**: Automatically detects files larger than 2GB (Telegram's limit) and splits them into uploadable parts seamlessly.
*   **Media Intelligence**:
    *   **Audio**: Extracts ID3 tags (Title, Artist) and embedded **Cover Art** to send as native Telegram Audio messages.
    *   **Video**: Extracts duration and dimensions to ensure videos are streamable.
    *   **Smart Captions**: Auto-generates captions like `Artist - Title` or `Filename (Resolution)`.
*   **Customization**:
    *   **Spoiler Mode**: Hide media behind a spoiler animation.
    *   **Timestamping**: Option to append original file modification time to captions.

### 3. 🔄 Auto Syncer (The Engine)
An advanced filesystem watcher and synchronization engine (currently manual trigger) designed for archiving local storage to Telegram.
*   **Structure**: Organize your syncs into **Folders** and **Presets**.
*   **Deep Scanning**: Recursively crawls directories to find every file.
*   **Intelligent Uploads**:
    *   Automatically maps extensions to Telegram types (e.g., `sendVideo` for .mp4, `sendAudio` for .flac).
    *   **Rich Metadata**: Uses `ffprobe` to extract video thumbnails, audio duration, and even cover art from FLAC/MP3 files.
*   **Safety & Integrity**:
    *   **Fingerprinting**: Hashes every file to prevent duplicate uploads, even if filenames change.
    *   **Undo Session**: Accidentally synced the wrong folder? One-click **undo** deletes all messages sent in that session.
*   **Management**:
    *   **Presets**: Define rules like "Only .mkv > 500MB" or "Exclude .txt files".
    *   **Regex Filtering**: Advanced file inclusion/exclusion patterns.

---

## 🛠 Tech Stack

*   **Frontend**: React 18, Vite, TypeScript, TailwindCSS
*   **Backend**: Node.js + Express (Lightweight local server for filesystem access)
*   **Database**: SQLite (prefers native `sqlite3` + `sqlite` wrapper, with automatic `sql.js` fallback) for robust job history and file registry.
*   **Media Processing**: `fluent-ffmpeg` & `ffprobe` for metadata extraction.

---

## 📂 Project Structure

```
teleman/
├── src/
│   ├── pages/
│   │   ├── Playground.tsx   # API Interaction UI
│   │   ├── BatchSender.tsx  # Mass Upload Logic
│   │   └── AutoSyncer.tsx   # Sync Engine Dashboard
│   ├── backend/
│   │   ├── autosyncer.ts    # Core Sync Engine Logic
│   │   └── db.ts            # SQLite Database Layer
│   └── components/          # Reusable UI (BotSwitcher, SettingsModal)
├── server.ts                # Local Backend (API Proxy + File Scanning)
└── data/                    # Persistent storage (DB, Configs)
```

## 🚀 Getting Started

### Option 1: One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/anxyis/teleman-playground-termux/main/install | bash
```

This automated script handles everything for Termux/Android users.

### Option 2: Manual Installation

#### Prerequisites
*   **Node.js** (v18+)
*   **FFmpeg** (for metadata extraction)
*   **Git**

#### Installation Steps

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/anxyis/teleman-playground-termux.git
    cd teleman-playground-termux
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env with your bot token and settings
    nano .env
    ```

4.  **Start the Server**:
    ```bash
    npm run server
    ```

5.  **Access**: Open `http://localhost:3000` in your browser.

---

## 💡 Usage Tips

*   **Shortcuts**: After installation, use `start-tg` and `stop-tg` commands for quick server control.
*   **Environment**: Create a `.env` file or use the Settings UI to manage your Bot Tokens.
*   **Persistence**: All configuration (saved bots, sync history, registry) is stored in the `data/` folder. Back up this folder to save your state.
*   **Logs**: Check `data/logs/` for saved log files and auto-saved shutdown logs.
