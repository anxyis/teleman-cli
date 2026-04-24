#!/bin/bash
set -e

echo "🚀 TeleMan Setup & Launcher"
echo "---------------------------"

# --- Detect Strategy ---
CURRENT_DIR=$(pwd)
case "$CURRENT_DIR" in
  /storage/emulated/*)
    # Running from Shared Storage
    # App must be installed to Internal Storage
    SHARED_DATA_DIR="$CURRENT_DIR/data"
    APP_ROOT="$HOME/teleman"

    echo "⚠️  Running from Shared Storage detected."
    echo "   Android does not support symlinks here."
    echo "   The app code will be copied to: $APP_ROOT"
    echo "   Your data will remain here: $SHARED_DATA_DIR"

    # 0. BOOTSTRAP COPY
    if [ ! -f "package.json" ]; then
        echo "❌ Error: package.json not found in current directory."
        exit 1
    fi

    mkdir -p "$APP_ROOT"
    echo "📂 Copying application files to internal storage..."
    cp package.json package-lock.json tsconfig*.json vite.config.ts server.ts "$APP_ROOT/"
    cp index.html tailwind.config.js postcss.config.js eslint.config.js .env.example "$APP_ROOT/" 2>/dev/null || true
    cp -r src public "$APP_ROOT/" 2>/dev/null || true
    cp start.sh stop.sh run-server.sh install-shortcuts.sh "$APP_ROOT/"
    echo "✅ Files copied."
    ;;
  *)
    # Running from Internal Storage
    SHARED_DATA_DIR="$CURRENT_DIR/data"
    APP_ROOT="$CURRENT_DIR"
    echo "✅ Running from Internal Storage: $APP_ROOT"
    ;;
esac

# 1. Install Shortcuts (Pass Data Dir + App Root + Source Dir)
if [ -f "./install-shortcuts.sh" ]; then
    # We pass CURRENT_DIR as the Source Directory (Git Repo location)
    bash ./install-shortcuts.sh "$SHARED_DATA_DIR" "$APP_ROOT" "$CURRENT_DIR"
fi

echo ""
echo "🔄 Handing over to background manager..."

# 2. Check if we need to bootstrap `run-server.sh` permission (in target)
if [ -f "$APP_ROOT/run-server.sh" ]; then
    chmod +x "$APP_ROOT/run-server.sh"
fi

# 3. Invoke start-tg
if command -v start-tg &> /dev/null; then
    start-tg
else
    echo "⚠️  start-tg not found in PATH yet (might need shell restart)."
    echo "   Running manually..."

    # Ensure tmux
    if ! command -v tmux &> /dev/null; then pkg install tmux -y; fi

    SESSION="teleman"
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "✅ Already running."
    else
        # Launch using the INSTALLED app root
        tmux new-session -d -s "$SESSION" "cd '$APP_ROOT'; export DATA_DIR='$SHARED_DATA_DIR'; export SCAN_ROOT='$SHARED_DATA_DIR/scan-target'; bash ./run-server.sh; echo 'Press Enter...'; read"
        echo "✅ Started in background (Session: $SESSION)"
        echo "📂 Data: $SHARED_DATA_DIR"
    fi
fi

echo ""
echo "ℹ️  You can now close this terminal."
echo "   Control the app anytime with: start-tg / stop-tg / debug-tg"
