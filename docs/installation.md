# Installation Guide

This guide provides detailed instructions on how to install and set up Teleman on various platforms.

## 🪟 Windows Installation & Updating {#windows}

You can install or update to the latest version with a single command in PowerShell. It will automatically download the binary and add it to your PATH.

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/anxyis/teleman-cli/main/scripts/install.ps1" -UseBasicParsing | Invoke-Expression
```

*(Alternatively, you can manually download `teleman-windows-amd64.exe` from the [Releases](https://github.com/anxyis/teleman-cli/releases) page and place it in your PATH).*

## 🐧 Linux Installation & Updating {#linux}

You can install or update to the latest version by running this script. It will download the binary and place it in `/usr/local/bin` (requires `sudo` if not run as root).

```bash
curl -fsSL https://raw.githubusercontent.com/anxyis/teleman-cli/main/scripts/install.sh | bash
```

*(Alternatively, download the `teleman-linux-amd64` binary manually from [Releases](https://github.com/anxyis/teleman-cli/releases) and move it to `/usr/local/bin/teleman`)*

## 📱 Termux (Android) Installation & Updating {#termux}

In Termux, use the exact same script as Linux. It will automatically detect Termux and install the ARM64 version to your `$PREFIX/bin` without needing `sudo`.

```bash
curl -fsSL https://raw.githubusercontent.com/anxyis/teleman-cli/main/scripts/install.sh | bash
```

*(Alternatively, download the `teleman-linux-arm64` binary manually from [Releases](https://github.com/anxyis/teleman-cli/releases) and move it to `$PREFIX/bin/teleman`)*

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
