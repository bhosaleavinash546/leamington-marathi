#!/bin/bash
# ================================================================
# CostLens — Start
# Double-click this file in Finder to launch CostLens
# ================================================================

cd "$(dirname "$0")"

# ── Check Docker Desktop is installed ───────────────────────────
if ! command -v docker &>/dev/null; then
  osascript -e 'display dialog "Docker Desktop is not installed.\n\nPlease:\n1. Go to https://www.docker.com/products/docker-desktop\n2. Download Docker Desktop for Mac (Apple Silicon)\n3. Install it (drag to Applications)\n4. Open Docker Desktop and wait for it to start\n5. Then double-click this file again" buttons {"OK"} default button "OK" with title "CostLens — Docker Required" with icon caution'
  exit 1
fi

# ── Check Docker Desktop is running ─────────────────────────────
if ! docker info &>/dev/null 2>&1; then
  osascript -e 'display dialog "Docker Desktop is installed but not running.\n\nPlease:\n1. Open Docker Desktop from your Applications folder\n2. Wait for the whale icon to appear in your menu bar\n3. Then double-click this file again" buttons {"OK"} default button "OK" with title "CostLens — Start Docker First" with icon caution'
  open -a "Docker"
  exit 1
fi

echo "================================================"
echo "  🔭 CostLens — Starting up..."
echo "================================================"
echo ""

# ── Start all services ───────────────────────────────────────────
echo "▶ Starting database and app servers..."
docker compose up --build -d

if [ $? -ne 0 ]; then
  osascript -e 'display dialog "Something went wrong starting CostLens.\n\nPlease check that Docker Desktop is fully running (the whale icon in menu bar should be steady, not animated)." buttons {"OK"} default button "OK" with title "CostLens — Error" with icon stop'
  exit 1
fi

# ── Wait for the app to be ready ────────────────────────────────
echo ""
echo "▶ Waiting for CostLens to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 >/dev/null 2>&1; then
    break
  fi
  echo "  Still starting... ($i/30)"
  sleep 3
done

echo ""
echo "================================================"
echo "  ✅  CostLens is running!"
echo "================================================"
echo ""
echo "  Opening browser..."
echo ""
echo "  Login details:"
echo "  Email:    avinash.bhosale@costlens.io"
echo "  Password: password"
echo ""

# ── Open browser ────────────────────────────────────────────────
sleep 1
open "http://localhost:5173"

echo "  To stop CostLens, double-click 'Stop CostLens.command'"
echo ""
echo "  (You can close this window now)"
