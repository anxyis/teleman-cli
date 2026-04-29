# Installation Guide

This guide provides detailed instructions on how to install and set up Teleman on various platforms.

## 🪟 Windows Installation {#windows}

The easiest way to use Teleman on Windows is to download the pre-compiled binary.

1.  **Download**: Get the `teleman-windows-amd64.exe` from the [Releases](https://github.com/anxyis/teleman-cli/releases) page.
2.  **Rename (Optional)**: Rename the file to `teleman.exe` for easier use.
3.  **Path**: Move it to a folder that is in your System PATH (e.g., `C:\Windows\System32` or a custom tools folder).
4.  **Verify**: Open PowerShell or Command Prompt and run:
    ```powershell
    teleman --version
    ```

## 🐧 Linux Installation {#linux}

1.  **Download**: Get the `teleman-linux-amd64` from the [Releases](https://github.com/anxyis/teleman-cli/releases) page.
2.  **Permissions**: Make the binary executable:
    ```bash
    chmod +x teleman-linux-amd64
    ```
3.  **Install**: Move it to your local bin directory:
    ```bash
    sudo mv teleman-linux-amd64 /usr/local/bin/teleman
    ```
4.  **Verify**:
    ```bash
    teleman --version
    ```

## 📱 Termux (Android) Installation {#termux}

1.  **Download**: Get the `teleman-linux-arm64` from the [Releases](https://github.com/anxyis/teleman-cli/releases) page.
2.  **Permissions**:
    ```bash
    chmod +x teleman-linux-arm64
    ```
3.  **Install**:
    ```bash
    mv teleman-linux-arm64 $PREFIX/bin/teleman
    ```
4.  **Verify**:
    ```bash
    teleman --version
    ```

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
