#!/bin/bash
# TeleMan Playground Installer - Bulletproof Edition

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="$HOME/teleman-playground-termux"
REPO_URL="git@github.com:anxyis/teleman-playground-termux.git"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🚀 TeleMan Playground Installer                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# CLEANUP OLD SHORTCUTS FIRST
echo -e "${BLUE}ℹ${NC} Cleaning up old shortcuts..."
for profile in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$profile" ]; then
        # Remove ALL TeleMan-related shortcuts
        sed -i '/# TeleMan Shortcuts/,/teleman-logs/d' "$profile" 2>/dev/null || true
        sed -i '/alias start-tg=/d' "$profile" 2>/dev/null || true
        sed -i '/alias stop-tg=/d' "$profile" 2>/dev/null || true
        sed -i '/alias teleman-/d' "$profile" 2>/dev/null || true
    fi
done
echo -e "${GREEN}✓${NC} Old shortcuts removed"

# INSTALL PREREQUISITES
echo ""
echo -e "${BLUE}ℹ${NC} Checking prerequisites..."

if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} Installing git..."
    pkg install git -y
fi

# Force reinstall Node.js to fix broken installations
echo -e "${YELLOW}⚠${NC} Fixing Node.js installation..."
pkg uninstall nodejs nodejs-lts -y 2>/dev/null || true
pkg install nodejs -y --force

if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} Installing ffmpeg..."
    pkg install ffmpeg -y
fi

echo -e "${GREEN}✓${NC} Prerequisites installed"

# CLONE REPO
echo ""
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠${NC} Removing old installation..."
    cd ~
    rm -rf "$INSTALL_DIR"
fi

echo -e "${BLUE}ℹ${NC} Cloning repository..."
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
echo -e "${GREEN}✓${NC} Repository cloned"

# INSTALL DEPENDENCIES
echo ""
echo -e "${BLUE}ℹ${NC} Installing npm dependencies (this may take a few minutes)..."
cd "$INSTALL_DIR"
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"

# SETUP ENVIRONMENT
echo ""
echo -e "${BLUE}ℹ${NC} Setting up environment..."
if [ ! -f ".env" ]; then
    cp .env.example .env 2>/dev/null || cat > .env << EOF
VITE_BOT_TOKEN=
VITE_API_BASE_URL=http://localhost:3000
TEMP_WORK_DIR=./temp_work
EOF
fi

mkdir -p data/backgrounds data/logs data/avatars data/themes data/fonts temp_work
echo -e "${GREEN}✓${NC} Environment configured"

# CREATE SHORTCUTS
echo ""
echo -e "${BLUE}ℹ${NC} Creating shortcuts..."

cat >> "$HOME/.bashrc" << 'EOF'

# TeleMan Shortcuts
alias start-tg='cd ~/teleman-playground-termux && npm run server'
alias stop-tg='pkill -f "node.*server" || echo "TeleMan stopped"'
alias teleman-logs='tail -f ~/teleman-playground-termux/data/logs/*.log 2>/dev/null || echo "No logs found"'
EOF

source "$HOME/.bashrc" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Shortcuts created"

# DONE
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ Installation Complete!                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Quick Start:${NC}"
echo ""
echo "  ${BLUE}start-tg${NC}"
echo ""
echo "  Then open ${BLUE}http://localhost:3000${NC} in your browser"
echo ""
echo -e "${YELLOW}If start-tg doesn't work:${NC}"
echo "  ${BLUE}source ~/.bashrc${NC}"
echo "  ${BLUE}start-tg${NC}"
echo ""
echo -e "${CYAN}Enjoy TeleMan! 🎉${NC}"
echo ""
