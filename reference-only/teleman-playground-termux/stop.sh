#!/bin/bash
echo "🛑 Stopping TeleMan..."

# Find process running server.ts (likely via tsx or node)
# Using pkill -f matches against the full command line
if pkill -f "server.ts"; then
    echo "   Server process killed."
else
    echo "   No running server process found."
fi

# Release Wake Lock
if command -v termux-wake-unlock &> /dev/null; then
    echo "🔋 Releasing Wake Lock..."
    termux-wake-unlock
fi

echo "✅ TeleMan Stopped."
