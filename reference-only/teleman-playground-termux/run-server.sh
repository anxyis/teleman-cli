#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "🚀 TeleMan Termux Runner"
echo "------------------------"

# This script is designed to run INSIDE the final installation directory.
# It assumes dependencies (pkg) and file copying are handled by start.sh.

CURRENT_DIR=$(pwd)
SHARED_DATA_DIR="${DATA_DIR:-$CURRENT_DIR/data}"

# Ensure Shared Data Directory Exists (redundant check)
if [ ! -d "$SHARED_DATA_DIR" ]; then
    echo "📁 Creating data directory: $SHARED_DATA_DIR"
    mkdir -p "$SHARED_DATA_DIR"
fi

# --- 2. Dependencies ---

echo "📦 Checking System Dependencies..."

# Function to check and install pkg
ensure_pkg() {
    if ! command -v "$1" &> /dev/null; then
        echo "   -> Installing $1..."
        pkg install "$2" -y
    fi
}

ensure_pkg node nodejs-lts
ensure_pkg ffmpeg ffmpeg
ensure_pkg magick imagemagick
ensure_pkg p7zip p7zip
# python is likely installed by nodejs, but good to ensure
ensure_pkg python python

echo "✅ System dependencies ready."
echo ""

# --- 3. App Installation ---

echo "📦 Checking App Dependencies (npm)..."

# NPM Install
if [ ! -d "node_modules" ]; then
    echo "   Running npm install..."
    npm install || { echo "❌ npm install failed. Check errors above."; exit 1; }
else
    echo "   node_modules found. Skipping full install."
fi

# Frontend Build
if [ ! -d "dist" ]; then
    echo "🏗️  Building Frontend..."
    npm run build || { echo "❌ Frontend build failed."; exit 1; }
else
    echo "   Frontend build found. Skipping build."
fi

echo "✅ App ready."
echo ""

# --- 4. Execution ---

# Acquire Wake Lock
if command -v termux-wake-lock &> /dev/null; then
    echo "🔋 Acquiring Wake Lock (prevents sleep during sync)..."
    termux-wake-lock
fi

echo "--------------------------"
echo "▶️  STARTING SERVER"
echo "   App Location:  $CURRENT_DIR"
echo "   Data Location: $SHARED_DATA_DIR"
echo "   Access URL:    http://localhost:3000"
echo "--------------------------"
echo "ℹ️  To stop, press Ctrl+C or run stop-tg"
echo ""

# Export env vars for server.ts
# If variables are already set (e.g. by start-tg), respect them.
export DATA_DIR="${DATA_DIR:-$SHARED_DATA_DIR}"
export SCAN_ROOT="${SCAN_ROOT:-$SHARED_DATA_DIR/scan-target}"

# Ensure scan root exists
mkdir -p "$SCAN_ROOT"

# Run
npm run server
