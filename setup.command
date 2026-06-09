#!/bin/bash

# AutoCost AI — First-Time Setup for macOS
# Run this ONCE after downloading the project

cd "$(dirname "$0")"

clear
echo "================================================"
echo "  AutoCost AI — First-Time Setup"
echo "================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed."
  echo ""
  echo "Please:"
  echo "  1. Go to https://nodejs.org"
  echo "  2. Download and install the LTS version"
  echo "  3. Close and reopen Terminal"
  echo "  4. Run this script again"
  echo ""
  osascript -e 'display alert "Node.js not found" message "Please install Node.js from nodejs.org (LTS version), then run setup again." buttons {"OK"} default button "OK" as critical' 2>/dev/null
  exit 1
fi

NODE_VER=$(node --version)
echo "✅ Node.js found: $NODE_VER"
echo ""
echo "Installing packages (this may take 1-2 minutes)..."
echo ""

npm install

if [ $? -eq 0 ]; then
  echo ""
  echo "================================================"
  echo "  ✅ Setup complete!"
  echo ""
  echo "  From now on, just double-click:"
  echo "  👉  start.command"
  echo "  to launch AutoCost AI."
  echo "================================================"
  echo ""
  osascript -e 'display alert "Setup Complete! ✅" message "AutoCost AI is ready.\n\nFrom now on, just double-click start.command to launch the app." buttons {"Got it!"} default button "Got it!"' 2>/dev/null
else
  echo ""
  echo "❌ Setup failed. Please check the errors above."
fi
