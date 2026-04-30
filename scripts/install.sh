#!/bin/sh
set -e

REPO="anxyis/teleman-cli"

# Detect OS and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Linux" ]; then
    echo "Error: This script only supports Linux."
    exit 1
fi

if [ "$ARCH" = "x86_64" ]; then
    TARGET="teleman-linux-amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    TARGET="teleman-linux-arm64"
else
    echo "Error: Unsupported architecture $ARCH."
    exit 1
fi

# Determine install path
INSTALL_DIR="/usr/local/bin"
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    # Termux
    INSTALL_DIR="$PREFIX/bin"
    SUDO=""
else
    # Linux (requires sudo if not root and writing to /usr/local/bin)
    if [ "$(id -u)" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            echo "Error: sudo is required to install to $INSTALL_DIR"
            exit 1
        fi
    else
        SUDO=""
    fi
fi

# Fetch latest release URL
echo "Fetching latest release information..."
if command -v curl >/dev/null 2>&1; then
    LATEST_RELEASE_URL=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep "browser_download_url.*$TARGET\"" | cut -d : -f 2,3 | tr -d \" | xargs)
elif command -v wget >/dev/null 2>&1; then
    LATEST_RELEASE_URL=$(wget -qO- "https://api.github.com/repos/$REPO/releases/latest" | grep "browser_download_url.*$TARGET\"" | cut -d : -f 2,3 | tr -d \" | xargs)
else
    echo "Error: curl or wget is required."
    exit 1
fi

if [ -z "$LATEST_RELEASE_URL" ]; then
    echo "Error: Could not find download URL for $TARGET in the latest release."
    exit 1
fi

echo "Downloading $TARGET..."
if command -v curl >/dev/null 2>&1; then
    curl -L -o teleman_tmp "$LATEST_RELEASE_URL"
else
    wget -qO teleman_tmp "$LATEST_RELEASE_URL"
fi
chmod +x teleman_tmp

echo "Installing to $INSTALL_DIR/teleman..."
$SUDO mv teleman_tmp "$INSTALL_DIR/teleman"

echo "Teleman installed/updated successfully! Run 'teleman --help' to get started."
