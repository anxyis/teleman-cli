#!/bin/sh
set -e

REPO="anxyis/teleman-cli"

# Detect OS and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Linux" ]; then
    echo "Error: This script only supports Linux and Termux."
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
SUDO=""

if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    # Termux
    INSTALL_DIR="$PREFIX/bin"
elif command -v teleman >/dev/null 2>&1; then
    # Overwrite existing installation
    EXISTING_PATH=$(command -v teleman)
    INSTALL_DIR=$(dirname "$EXISTING_PATH")
    if [ ! -w "$INSTALL_DIR" ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            echo "Error: Write permission denied for $INSTALL_DIR and sudo is not available."
            exit 1
        fi
    fi
else
    # Default Linux
    if [ ! -w "$INSTALL_DIR" ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            echo "Error: Write permission denied for $INSTALL_DIR and sudo is not available."
            exit 1
        fi
    fi
fi

echo "Fetching latest release from $REPO..."
DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$TARGET"

echo "Downloading Teleman ($ARCH)..."
curl -fsSL "$DOWNLOAD_URL" -o teleman_tmp
chmod +x teleman_tmp

echo "Installing to $INSTALL_DIR/teleman..."
$SUDO mv teleman_tmp "$INSTALL_DIR/teleman"

echo "Teleman installed successfully! Run 'teleman --help' to get started."
