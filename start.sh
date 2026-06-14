#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — One-Command Installer & Launcher  (macOS / Linux)
#  Usage:  ./start.sh
# ──────────────────────────────────────────────────────────────────────────────
set -e

ENV_FILE="calculator/.env"
EXAMPLE_FILE="calculator/.env.example"
URL="http://localhost:5173"

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   CostVision — AI Cost Intelligence        ║"
echo "  ║   One-command setup & launch               ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# ── 1. Check Docker is installed & running ────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "  ❌ Docker is not installed."
  echo "     Install Docker Desktop for Mac:  https://www.docker.com/products/docker-desktop/"
  echo "     Then re-run:  ./start.sh"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "  ❌ Docker is installed but not running."
  echo "     ➜ Open the Docker Desktop app, wait for it to start, then re-run ./start.sh"
  exit 1
fi
echo "  ✅ Docker is ready"

# ── 1b. Give the launcher a CostVision icon (macOS, once, best-effort) ─────────
ICON="assets/CostVision-icon.png"
LAUNCHER="CostVision.command"
if [ -f "$ICON" ] && [ ! -f ".costvision-icon-set" ] && command -v osascript >/dev/null 2>&1; then
  ABS_ICON="$(cd "$(dirname "$ICON")" && pwd)/$(basename "$ICON")"
  ABS_LAUNCH="$(pwd)/$LAUNCHER"
  osascript - "$ABS_ICON" "$ABS_LAUNCH" >/dev/null 2>&1 <<'OSA' && touch .costvision-icon-set
use framework "Foundation"
use framework "AppKit"
use scripting additions
on run argv
  set iconPath to item 1 of argv
  set targetPath to item 2 of argv
  set img to current application's NSImage's alloc()'s initWithContentsOfFile:iconPath
  current application's NSWorkspace's sharedWorkspace()'s setIcon:img forFile:targetPath options:0
end run
OSA
fi

# ── Helper: set or replace a KEY=value line in .env (portable) ────────────────
set_env_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      BEGIN{FS="="} $1==k{print k"="v; next} {print}
    ' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

# ── 2. First-time .env setup ──────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "  ✅ Created $ENV_FILE"
fi

# ── 3. Auto-generate JWT_SECRET if still placeholder ──────────────────────────
if grep -q "^JWT_SECRET=replace-with" "$ENV_FILE" 2>/dev/null || ! grep -q "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null; then
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')"
  set_env_var "JWT_SECRET" "$SECRET"
  echo "  ✅ Generated a secure JWT_SECRET (no action needed)"
fi

# ── 4. Prompt for the Anthropic API key if still placeholder ──────────────────
CURRENT_KEY="$(grep '^ANTHROPIC_API_KEY=' "$ENV_FILE" | cut -d= -f2-)"
if [ -z "$CURRENT_KEY" ] || [ "$CURRENT_KEY" = "sk-ant-..." ]; then
  echo ""
  echo "  🔑 Paste your Anthropic API key (starts with sk-ant-...)."
  echo "     (Find/create one at https://console.anthropic.com/settings/keys)"
  echo "     Your existing key from any other app works fine."
  echo ""
  printf "  API key: "
  read -r USER_KEY
  if [ -n "$USER_KEY" ]; then
    set_env_var "ANTHROPIC_API_KEY" "$USER_KEY"
    echo "  ✅ Saved API key to $ENV_FILE"
  else
    echo "  ⚠️  No key entered — AI features will be disabled until you add one to $ENV_FILE"
  fi
fi

# ── 5. Build & start (stop stale container first if port is occupied) ─────────

# Helper to open the browser
open_browser() {
  ( command -v open >/dev/null 2>&1 && open "$URL" ) || \
  ( command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" ) || \
  echo "     ➜ Open this in your browser:  $URL"
}

# If the app is already running, just open it and exit
if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "  ✅ CostVision is already running!"
  echo "  🌐 Opening $URL ..."
  open_browser
  exit 0
fi

# Tear down any stale containers that may be holding port 5173
echo ""
echo "  🔄 Stopping any previous CostVision containers..."
docker compose down 2>/dev/null || true

echo ""
echo "  🐳 Building & starting (first run may take 2-3 minutes)..."
docker compose up -d --build

# ── 6. Wait for the app to respond, then open the browser ─────────────────────
echo ""
printf "  ⏳ Waiting for CostVision to come online (up to 3 min on first run)"
for _ in $(seq 1 90); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo ""
    echo "  ✅ CostVision is running!"
    echo "  🌐 Opening $URL ..."
    open_browser
    exit 0
  fi
  printf "."
  sleep 2
done

echo ""
echo "  ⚠️  Still starting — opening browser anyway (page will load when ready)..."
echo "     $URL"
open_browser
echo ""
echo "     If nothing loads after 30 s, check logs with:  make logs"
