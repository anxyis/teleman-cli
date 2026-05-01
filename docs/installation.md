# Installation Guide

This guide provides detailed instructions on how to install and set up Teleman on various platforms.

## 🪟 Windows Installation {#windows}

To install Teleman for the first time, download the binary and place it in your PATH. Since the repository is private, you can use the GitHub CLI (`gh`):

```powershell
gh release download -R anxyis/teleman-cli -p "teleman-windows-amd64.exe" -O teleman.exe
```

*(Alternatively, manually download `teleman-windows-amd64.exe` from the [Releases](https://github.com/anxyis/teleman-cli/releases) page).*

## 🐧 Linux Installation {#linux}

To install Teleman for the first time, download the binary and place it in `/usr/local/bin`.

```bash
gh release download -R anxyis/teleman-cli -p "teleman-linux-amd64" -O teleman
chmod +x teleman
sudo mv teleman /usr/local/bin/
```

*(Alternatively, download the `teleman-linux-amd64` binary manually from [Releases](https://github.com/anxyis/teleman-cli/releases))*

## 📱 Termux (Android) Installation {#termux}

In Termux, download the ARM64 version to your `$PREFIX/bin`.

```bash
gh release download -R anxyis/teleman-cli -p "teleman-linux-arm64" -O teleman
chmod +x teleman
mv teleman $PREFIX/bin/
```

---

## 🔄 Updating Teleman

Teleman features a **Native Go Self-Update System** (introduced in v1.1.2). You no longer need to manually download binaries or pipe installation scripts.

Simply run:
```bash
teleman update
```

This command will automatically:
1. Detect your OS and Architecture.
2. Check the GitHub API for the latest release.
3. Securely download the correct binary directly to a temporary folder.
4. Perform an in-place atomic replacement of the currently running executable (including automatic `sudo` escalation on Linux if write permissions are denied, and `.old` renaming on Windows).

---

## 🛠️ Building from Source

If you have Go installed (1.21+ recommended), you can build Teleman manually:

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/anxyis/teleman-cli.git
    cd teleman-cli
    ```
2.  **Build**:
    ```bash
    go build -o teleman .
    ```
3.  **Automated Build Script**:
    We provide scripts to build for all platforms at once:
    *   **Windows**: `.\scripts\build.ps1`
    *   **Linux**: `./scripts/build.sh`

---

## ⚙️ Initial Configuration

Once installed, you must run the interactive configuration wizard to link your Telegram Bot:

```bash
teleman config
```

You will need:
- Your **Bot Token** from [@BotFather](https://t.me/BotFather).
- A **Dedicated Index Channel ID** where Teleman will store its virtual filesystem metadata.
