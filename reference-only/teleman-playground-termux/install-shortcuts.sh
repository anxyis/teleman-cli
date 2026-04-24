#!/bin/bash

# Arguments
DATA_DIR_PATH="${1:-$HOME/teleman/data}"
APP_ROOT_PATH="${2:-$HOME/teleman}"
SOURCE_DIR_PATH="${3:-$CURRENT_DIR}"

# Define paths
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
BIN_DIR="$PREFIX/bin"
START_CMD="$BIN_DIR/start-tg"
STOP_CMD="$BIN_DIR/stop-tg"
DEBUG_CMD="$BIN_DIR/debug-tg"
UPDATE_CMD="$BIN_DIR/update-tg"

echo "🔗 Installing Termux Shortcuts..."
echo "   App Location:   $APP_ROOT_PATH"
echo "   Data Directory: $DATA_DIR_PATH"
echo "   Source Repo:    $SOURCE_DIR_PATH"

# Ensure bin directory exists (standard in Termux)
if [ ! -d "$BIN_DIR" ]; then
    echo "❌ Error: $BIN_DIR does not exist. Are you running in Termux?"
    exit 1
fi

# Detect Shared Storage Root for Scanning
# If ~/storage/shared exists, that is the root of internal storage (/storage/emulated/0)
if [ -d "$HOME/storage/shared" ]; then
    SCAN_ROOT_PATH="$HOME/storage/shared"
else
    # Fallback to app data scan folder
    SCAN_ROOT_PATH="$DATA_DIR_PATH/scan-target"
fi

# Create start-tg
cat << EOF > "$START_CMD"
#!/bin/bash
SESSION="teleman"
export DATA_DIR="$DATA_DIR_PATH"
export SCAN_ROOT="$SCAN_ROOT_PATH"

# Ensure tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "📦 Installing tmux..."
    pkg install tmux -y
fi

# Check if session exists
if tmux has-session -t "\$SESSION" 2>/dev/null; then
    echo "✅ TeleMan is already running in background."
    echo "ℹ️  Attach with: tmux attach -t \$SESSION"
else
    echo "🚀 Starting TeleMan in background session '\$SESSION'..."

    TARGET_SCRIPT="$APP_ROOT_PATH/run-server.sh"

    if [ ! -f "\$TARGET_SCRIPT" ]; then
        echo "❌ Error: App not found at: \$TARGET_SCRIPT"
        echo "   Please re-run start.sh from the new location to update shortcuts."
        exit 1
    fi

    # Create detached session
    # We explicitly pass the env vars into the tmux session
    # We cd into APP_ROOT_PATH first to ensure relative paths work
    tmux new-session -d -s "\$SESSION" "cd '$APP_ROOT_PATH'; export DATA_DIR='$DATA_DIR_PATH'; export SCAN_ROOT='$SCAN_ROOT_PATH'; bash '\$TARGET_SCRIPT'; echo 'Press Enter to close session...'; read"

    echo "✅ TeleMan started!"
    echo "🌍 Web UI: http://localhost:3000"
    echo "📂 Scan:   $SCAN_ROOT_PATH"
    echo "ℹ️  Logs:   tmux attach -t \$SESSION"
    echo "🛑 Stop:   stop-tg"
fi
EOF

# Create stop-tg
cat << 'EOF' > "$STOP_CMD"
#!/bin/bash
SESSION="teleman"

echo "🛑 Stopping TeleMan..."

if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    echo "✅ Tmux session '$SESSION' killed."
else
    echo "⚠️  No running session found."
fi

# Release Wake Lock (Global cleanup)
if command -v termux-wake-unlock &> /dev/null; then
    termux-wake-unlock
    echo "🔋 Wake Lock released."
fi
EOF

# Create debug-tg
cat << EOF > "$DEBUG_CMD"
#!/bin/bash
SESSION="teleman"
LOG_FILE="\$HOME/storage/shared/teleman_debug.log"

echo "🐞 Generating Debug Report..."

{
    echo "=== TeleMan Debug Log ==="
    echo "Date: \$(date)"
    echo "Termux Info:"
    uname -a
    echo ""

    echo "=== Node/NPM ==="
    node -v
    npm -v
    echo ""

    echo "=== Processes ==="
    pgrep -af node
    echo ""

    echo "=== Tmux Session Logs ==="
    if tmux has-session -t "\$SESSION" 2>/dev/null; then
        # Capture scrollback history
        tmux capture-pane -pt "\$SESSION" -S -1000
    else
        echo "No running tmux session found."
    fi

} > "\$LOG_FILE"

echo "✅ Log saved to: \$LOG_FILE"
echo "   Please upload this file if reporting issues."
EOF

# Create update-tg
cat << EOF > "$UPDATE_CMD"
#!/bin/bash
set -e

APP_ROOT="$APP_ROOT_PATH"

echo "🔄 Updating TeleMan..."

# 1. Stop Server
if command -v stop-tg &> /dev/null; then
    stop-tg
    echo "🛑 Server Stopped."
fi

# 2. Update Code
cd "\$APP_ROOT"
echo "📂 Working Directory: \$APP_ROOT"

if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository. Cannot run 'git pull'."
    exit 1
fi

echo "⬇️ Pulling Changes..."
git pull

# 3. Build & Install
echo "🏗️ Installing & Building..."
npm install
npm run build

# 4. Start Server
echo "🚀 Starting Server..."
if command -v start-tg &> /dev/null; then
    start-tg
else
    echo "⚠️ start-tg command not found. Please run manually."
fi

echo "✅ Update Sequence Complete!"
EOF

# Make executable
chmod +x "$START_CMD" "$STOP_CMD" "$DEBUG_CMD" "$UPDATE_CMD"

echo "✅ Shortcuts installed:"
echo "   ▶️  start-tg   (Start server in background)"
echo "   🛑 stop-tg    (Stop server)"
echo "   🐞 debug-tg   (Save logs to shared storage)"
echo "   🔄 update-tg  (Pull, Backup, Build, Restart)"
