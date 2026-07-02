#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — Double-click launcher for macOS
#
#  Just double-click this file in Finder. It opens Terminal automatically,
#  sets everything up the first time, and launches the app in your browser.
# ──────────────────────────────────────────────────────────────────────────────

# Move into the folder this file lives in (so it works from anywhere)
cd "$(dirname "$0")" || exit 1

# Run the one-command installer/launcher
./start.sh

# Keep the window open so you can read any messages
echo ""
echo "  ──────────────────────────────────────────"
echo "  You can close this window now."
echo "  CostVision stays running in the background."
echo "  ──────────────────────────────────────────"
echo ""
