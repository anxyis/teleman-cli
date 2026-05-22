# Installation Guide

This guide provides detailed instructions on how to install and set up Teleman on various platforms.

## 🪟 Windows Installation {#windows}

To install Teleman for the first time, download the pre-compiled binary from the [Releases](https://github.com/anxyis/teleman-cli/releases) page and place it in your `PATH`. 

Alternatively, you can download the latest binary directly via PowerShell:

```powershell
Invoke-WebRequest -Uri "https://github.com/anxyis/teleman-cli/releases/latest/download/teleman-windows-amd64.exe" -OutFile "teleman.exe"
```

*(If you have the GitHub CLI (`gh`) installed, you can also use: `gh release download -R anxyis/teleman-cli -p "teleman-windows-amd64.exe" -O teleman.exe`)*

## 🐧 Linux Installation {#linux}

To install Teleman for the first time, download the binary for your architecture and place it in `/usr/local/bin`.

Using `curl`:
```bash
curl -L -o teleman "https://github.com/anxyis/teleman-cli/releases/latest/download/teleman-linux-amd64"
chmod +x teleman
sudo mv teleman /usr/local/bin/
```

*(Alternatively, download the `teleman-linux-amd64` binary manually from the [Releases](https://github.com/anxyis/teleman-cli/releases) page, or via `gh`: `gh release download -R anxyis/teleman-cli -p "teleman-linux-amd64" -O teleman`)*

## 📱 Termux (Android) Installation {#termux}

In Termux, download the ARM64 version and place it in your `$PREFIX/bin`.

Using `curl`:
```bash
curl -L -o teleman "https://github.com/anxyis/teleman-cli/releases/latest/download/teleman-linux-arm64"
chmod +x teleman
mv teleman $PREFIX/bin/
```

---

## 🔄 Updating Teleman

Teleman features a **Zero-Dependency Native Self-Update System** (fully overhauled in v1.1.8). You no longer need to have the GitHub CLI (`gh`) installed, be authenticated, or manually download and replace binaries.

Simply run:
```bash
teleman update
```

This command will automatically:
1. Detect your OS and Architecture.
2. Query the public GitHub Releases API for the latest release version.
3. Securely download the correct pre-compiled binary directly into a temporary folder.
4. Perform an in-place atomic replacement of the currently running executable (with automated `sudo` escalation on Linux if write permissions are denied, and safe `.old` renaming on Windows).

## ℹ️ Checking Version

You can check your installed version at any time using:
```bash
teleman version
```

This will print your current version and automatically perform a lightweight, non-blocking check in the background to alert you if a newer version is available on GitHub.

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
