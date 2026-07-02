#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — One-click launcher  (macOS)
#  Double-click Start.command, or run:  ./start.sh
# ──────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

URL="http://localhost:5174/calculator/"
ENV_FILE="calculator/.env"

clear
echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │   CostVision · AI Cost Intelligence          │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# ── 1. Create .env if missing ─────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cp calculator/.env.example "$ENV_FILE"

  # Auto-generate JWT secret
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')"
  sed -i '' "s|replace-with-a-strong-random-secret|$SECRET|" "$ENV_FILE" 2>/dev/null || \
  sed -i    "s|replace-with-a-strong-random-secret|$SECRET|" "$ENV_FILE" 2>/dev/null || true

  echo "  ✅ Config file created"
fi

# ── 2. Prompt for API key only if missing ─────────────────────────────────────
CURRENT_KEY="$(grep '^ANTHROPIC_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d ' ')"
if [ -z "$CURRENT_KEY" ] || [ "$CURRENT_KEY" = "sk-ant-..." ]; then
  echo "  🔑 Enter your Anthropic API key (or press Enter to skip — AI features disabled)"
  echo "     Get one free at: https://console.anthropic.com/settings/keys"
  echo ""
  printf "  API key: "
  read -r USER_KEY
  if [ -n "$USER_KEY" ]; then
    # Replace or append
    if grep -q "^ANTHROPIC_API_KEY=" "$ENV_FILE"; then
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$USER_KEY|" "$ENV_FILE" 2>/dev/null || \
      sed -i    "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$USER_KEY|" "$ENV_FILE" 2>/dev/null || true
    else
      echo "ANTHROPIC_API_KEY=$USER_KEY" >> "$ENV_FILE"
    fi
    echo "  ✅ API key saved"
  fi
  echo ""
fi

# ── Helper: open browser ──────────────────────────────────────────────────────
open_browser() {
  sleep 1
  command -v open    >/dev/null 2>&1 && open    "$URL" && return
  command -v xdg-open>/dev/null 2>&1 && xdg-open "$URL" && return
}

# ── Helper: wait for app to respond ──────────────────────────────────────────
wait_for_app() {
  printf "  ⏳ Starting"
  for _ in $(seq 1 45); do
    if curl -fsS "$URL" >/dev/null 2>&1; then
      echo ""
      echo "  ✅ CostVision is running!"
      echo "  🌐 Opening $URL"
      open_browser
      return 0
    fi
    printf "."
    sleep 2
  done
  echo ""
  echo "  ⚠️  Taking longer than expected — opening browser anyway."
  echo "     If the page is blank, wait 10 s and refresh."
  open_browser
  return 0
}

# ── 3. If already running, just open it ──────────────────────────────────────
if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "  ✅ CostVision is already running!"
  echo "  🌐 Opening $URL"
  open_browser
  echo ""
  read -r -p "  Press Enter to close this window... " _
  exit 0
fi

# ── 4a. Try Node.js (fastest — no Docker needed) ─────────────────────────────
if command -v npm >/dev/null 2>&1; then
  echo "  🟢 Starting with Node.js..."

  # Kill any old instances
  pkill -f "vite"       2>/dev/null || true
  pkill -f "tsx server" 2>/dev/null || true
  sleep 1

  cd calculator

  # Install dependencies if node_modules is missing
  if [ ! -d node_modules ]; then
    echo "  📦 Installing packages (first run only, ~1 min)..."
    npm install --silent
  fi

  # Load .env and start both servers in background
  set -a; [ -f .env ] && . .env; set +a
  nohup npm run dev:full > /tmp/costvision.log 2>&1 &
  echo $! > /tmp/costvision.pid
  cd ..

  wait_for_app
  echo ""
  echo "  ─────────────────────────────────────────────"
  echo "  CostVision is running in the background."
  echo "  Close this window anytime — the app stays up."
  echo "  To stop:  kill \$(cat /tmp/costvision.pid 2>/dev/null)"
  echo "  ─────────────────────────────────────────────"
  echo ""
  read -r -p "  Press Enter to close this window... " _
  exit 0
fi

# ── 4b. Fall back to Docker ───────────────────────────────────────────────────
echo "  🐳 Node.js not found — trying Docker..."
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "  ❌ Neither Node.js nor Docker is installed."
  echo ""
  echo "  Easiest fix — install Node.js (free, no account needed):"
  echo "  → https://nodejs.org  (click the LTS download button)"
  echo ""
  echo "  Then double-click Start.command again."
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "  Press Enter to close... " _
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "  ❌ Docker is installed but not running."
  echo "     Open the Docker Desktop app, wait for the whale icon to appear"
  echo "     in the menu bar, then double-click Start.command again."
  open -a "Docker" 2>/dev/null || true
  read -r -p "  Press Enter to close... " _
  exit 1
fi

echo "  🐳 Building & starting (first run: 2-3 min)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

wait_for_app
echo ""
echo "  ─────────────────────────────────────────────"
echo "  CostVision is running in the background."
echo "  Close this window anytime — the app stays up."
echo "  To stop:  docker compose down"
echo "  ─────────────────────────────────────────────"
echo ""
read -r -p "  Press Enter to close this window... " _
