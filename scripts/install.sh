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

# Ensure GitHub CLI is installed
if ! command -v gh >/dev/null 2>&1; then
    echo "Error: GitHub CLI (gh) is required."
    echo "Please install it: https://cli.github.com/"
    exit 1
fi

echo "Checking for latest release..."
LATEST_TAG=$(gh release view -R "$REPO" --json tagName -q .tagName 2>/dev/null || echo "")

if [ -n "$LATEST_TAG" ]; then
    if command -v teleman >/dev/null 2>&1; then
        LOCAL_VERSION=$(teleman --version | awk '{print $3}')
        if [ "$LOCAL_VERSION" = "$LATEST_TAG" ]; then
            echo "Teleman is already up-to-date ($LOCAL_VERSION). Skipping update."
            exit 0
        fi
    fi
    echo "Updating to $LATEST_TAG..."
fi

echo "Downloading $TARGET..."
# Download the asset via gh to handle private repo auth
gh release download -R "$REPO" -p "$TARGET" --clobber -D .
mv "$TARGET" teleman_tmp
chmod +x teleman_tmp

echo "Installing to $INSTALL_DIR/teleman..."
$SUDO mv teleman_tmp "$INSTALL_DIR/teleman"

echo "Teleman installed/updated successfully! Run 'teleman --help' to get started."
