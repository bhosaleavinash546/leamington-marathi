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

# ── Anthropic API key ─────────────────────────────────────────────────────────
# Ask for the key on launch unless one is already available (shell environment,
# or a previously-saved .env). Saved once to .env (gitignored) so we don't nag on
# every start; the server reads .env as its ANTHROPIC_API_KEY fallback.
set_env_var() {
  local name="$1" value="$2" file=".env"
  touch "$file"
  grep -v -E "^${name}=" "$file" > "${file}.tmp" 2>/dev/null || true
  printf '%s=%s\n' "$name" "$value" >> "${file}.tmp"
  mv "${file}.tmp" "$file"
  chmod 600 "$file" 2>/dev/null
}

has_key() {
  [ -n "$ANTHROPIC_API_KEY" ] && return 0
  [ -f .env ] && grep -qE '^ANTHROPIC_API_KEY=.+' .env && return 0
  return 1
}

if ! has_key; then
  KEY=$(osascript <<'APPLESCRIPT' 2>/dev/null
try
  set dlg to display dialog "Enter your Anthropic API key to enable AI analysis.

It starts with \"sk-ant-\". Get one at console.anthropic.com.

Click Skip to add it later in the app's Settings page." default answer "" with hidden answer with title "AutoCost AI — API Key" buttons {"Skip", "Save & Continue"} default button "Save & Continue"
  if button returned of dlg is "Skip" then
    return ""
  else
    return text returned of dlg
  end if
on error
  return ""
end try
APPLESCRIPT
)
  # Trim surrounding whitespace
  KEY="$(printf '%s' "$KEY" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [ -n "$KEY" ]; then
    if ! printf '%s' "$KEY" | grep -qE '^sk-ant-'; then
      osascript -e 'display notification "That does not look like an sk-ant- key, but I saved it anyway. Fix it in Settings if AI analysis fails." with title "AutoCost AI — API Key"' 2>/dev/null
    fi
    set_env_var ANTHROPIC_API_KEY "$KEY"
    export ANTHROPIC_API_KEY="$KEY"
    echo "API key saved to .env (this folder, git-ignored)."
  else
    echo "No API key entered — you can add one later in the app's Settings page."
  fi
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
