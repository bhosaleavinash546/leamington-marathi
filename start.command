#!/bin/bash

# AutoCost AI — macOS Launcher
# Double-click this file to start the app

# Go to the folder where this script lives
cd "$(dirname "$0")"

# Check Node.js is installed
if ! command -v node &> /dev/null; then
  osascript -e 'display alert "Node.js not found" message "Please install Node.js first.\n\n1. Go to nodejs.org\n2. Download and install the LTS version\n3. Then double-click this file again." buttons {"OK"} default button "OK" as critical'
  exit 1
fi

# Pull the latest code for the current branch (skips quietly if offline / has local edits)
if command -v git &> /dev/null && [ -d ".git" ]; then
  echo "Checking for updates..."
  LOCK_BEFORE="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"
  git pull --ff-only 2>/dev/null && echo "Up to date with latest." || echo "Skipped pull (offline or local changes) — using current code."
  LOCK_AFTER="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"
else
  LOCK_BEFORE=""; LOCK_AFTER=""
fi

# Install packages on first run, OR when the pull changed dependencies
if [ ! -d "node_modules" ]; then
  osascript -e 'display notification "Installing packages for the first time — this takes about 2 minutes. Do not close this window." with title "AutoCost AI — Setting Up..."'
  npm install
elif [ -n "$LOCK_BEFORE" ] && [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  osascript -e 'display notification "New dependencies detected — updating packages..." with title "AutoCost AI — Updating..."'
  npm install
fi

# Kill anything already running on our ports
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Start the app
osascript -e 'display notification "Starting AutoCost AI..." with title "AutoCost AI"'
npm run dev &
APP_PID=$!

# Wait for the server to be ready then open browser
echo "Waiting for AutoCost AI to start..."
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Open in default browser
open http://localhost:5173

osascript -e 'display notification "AutoCost AI is running! Opening in your browser now." with title "AutoCost AI ✅"'

echo ""
echo "================================================"
echo "  AutoCost AI is running!"
echo "  Browser: http://localhost:5173"
echo "  To STOP: close this window or press Ctrl+C"
echo "================================================"
echo ""

# Keep running until window is closed
wait $APP_PID
