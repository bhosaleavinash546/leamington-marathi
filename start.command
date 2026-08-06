#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — double-click launcher (macOS Finder)
#
#  Double-click this file. Terminal opens, the app starts, and your browser
#  opens at http://localhost:5174/calculator/ — nothing else to do.
#
#  Deliberately a THIN WRAPPER around start.sh, matching the pattern
#  Start-Dev.command → dev-start.sh already uses. Every launch decision (Node
#  vs Docker, .env creation, the API-key prompt, opening the browser) lives in
#  start.sh alone. This file used to carry its own copy of the boot sequence
#  and fell two weeks behind the real one — a single source of truth is what
#  stops that happening again.
#
#  Stop the app later with:  make stop
# ──────────────────────────────────────────────────────────────────────────────
set -u

# Finder runs .command files from the user's home folder, so step into the
# directory this file actually lives in before touching anything.
cd "$(dirname "$0")" || {
  echo "  ❌ Could not enter the CostVision folder."
  read -r -p "  Press Enter to close... " _
  exit 1
}

# ── Optional safe refresh ─────────────────────────────────────────────────────
# Fast-forward only, never on a dirty tree, never fatal: a launcher must not be
# able to lose someone's work, and must still start the app when the network is
# down. Set COSTVISION_NO_UPDATE=1 to skip this entirely.
if [ "${COSTVISION_NO_UPDATE:-0}" != "1" ] && command -v git >/dev/null 2>&1 && [ -d .git ]; then
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "  ℹ️  You have local changes — skipping the update, launching as-is."
  else
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
    if [ -n "$BRANCH" ] && [ "$BRANCH" != "HEAD" ]; then
      printf "  🔄 Checking for updates on %s … " "$BRANCH"
      if git fetch --quiet origin "$BRANCH" 2>/dev/null \
         && git merge --ff-only --quiet "origin/$BRANCH" 2>/dev/null; then
        echo "up to date"
      else
        echo "skipped (offline, or the branch has diverged)"
      fi
    fi
  fi
fi

# ── Hand over to the real launcher ────────────────────────────────────────────
if [ ! -f start.sh ]; then
  echo "  ❌ start.sh is missing from $(pwd)"
  echo "     Keep this file in the CostVision folder, next to start.sh."
  read -r -p "  Press Enter to close... " _
  exit 1
fi

# `bash start.sh` rather than `./start.sh`, so a lost execute bit — common after
# a zip download or a copy between machines — cannot stop the app starting.
exec bash start.sh
