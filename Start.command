#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — Double-click to launch on macOS
#  Works from Finder: just double-click this file.
# ──────────────────────────────────────────────────────────────────────────────

# Move into the folder this file lives in (works wherever you store it)
cd "$(dirname "$0")" || exit 1

clear
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   CostVision — AI Cost Intelligence           ║"
echo "  ║   Starting up...                              ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ── Pull latest code ──────────────────────────────────────────────────────────
BRANCH="claude/new-session-ts4byp"
CODE_CHANGED=false

if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
  echo "  🔄 Checking for updates..."
  git fetch origin "$BRANCH" --quiet 2>/dev/null || true

  CURRENT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$CURRENT" != "$BRANCH" ]; then
    echo "  🔀 Switching to branch: $BRANCH"
    git checkout "$BRANCH" --quiet 2>/dev/null || true
    CODE_CHANGED=true
  fi

  LOCAL=$(git rev-parse HEAD 2>/dev/null)
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "  ⬇  Pulling latest changes..."
    git pull origin "$BRANCH" --quiet 2>/dev/null || true
    CODE_CHANGED=true
    echo "  ✅ Code updated — will rebuild Docker image"
  else
    echo "  ✅ Already on latest version"
  fi
else
  echo "  ⚠️  Git not found — skipping update check"
fi

echo ""

# ── If code changed, force stop the old container so start.sh rebuilds it ────
# (start.sh skips rebuild if container is already running — we avoid that here)
if [ "$CODE_CHANGED" = true ]; then
  echo "  🛑 Stopping old container to apply code update..."
  docker compose down --remove-orphans 2>/dev/null || true
  docker rm -f costvision 2>/dev/null || true
  echo ""
fi

# ── Launch via the main start script ─────────────────────────────────────────
./start.sh

# ── Keep window open ──────────────────────────────────────────────────────────
echo ""
echo "  ─────────────────────────────────────────────────────"
echo "  CostVision is running in the background."
echo "  You can close this window — the app stays active."
echo "  To stop it later, run:  make stop"
echo "  ─────────────────────────────────────────────────────"
echo ""
read -r -p "  Press Enter to close this window... " _
