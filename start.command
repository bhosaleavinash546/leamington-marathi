#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — One-click launcher (macOS: double-click in Finder)
#
#  Pulls the latest code on the working branch, then builds & runs the
#  STEP-capable Docker image (glibc + cadquery 2.8.0 — Dockerfile.cad) so the
#  CAD-to-Cost pipeline can measure STEP/IGES files. Opens the app in your
#  browser when it is ready.
#
#  Requires Docker Desktop. Stop later with:  make stop  (or: docker compose down)
# ──────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

BRANCH="claude/new-session-ts4byp"
URL="http://localhost:5174/calculator/"
ENV_FILE="calculator/.env"

clear
echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │   CostVision · AI Should-Cost Intelligence   │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# ── 1. Pull the latest code on the working branch ─────────────────────────────
CODE_CHANGED=false
if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
  echo "  🔄 Checking for updates on $BRANCH …"
  git fetch origin "$BRANCH" --quiet 2>/dev/null || true
  if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" != "$BRANCH" ]; then
    echo "  🔀 Switching to $BRANCH"
    git checkout "$BRANCH" --quiet 2>/dev/null || true
    CODE_CHANGED=true
  fi
  if [ "$(git rev-parse HEAD 2>/dev/null)" != "$(git rev-parse "origin/$BRANCH" 2>/dev/null)" ]; then
    echo "  ⬇  Pulling latest changes …"
    git pull origin "$BRANCH" --quiet 2>/dev/null || true
    CODE_CHANGED=true
    echo "  ✅ Code updated"
  else
    echo "  ✅ Already on the latest version"
  fi
else
  echo "  ⚠️  Git not found — running whatever code is in this folder"
fi
echo ""

# ── 2. Config: create .env, prompt for the API key only if missing ────────────
if [ ! -f "$ENV_FILE" ] && [ -f "calculator/.env.example" ]; then
  cp calculator/.env.example "$ENV_FILE"
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')"
  sed -i '' "s|replace-with-a-strong-random-secret|$SECRET|" "$ENV_FILE" 2>/dev/null || \
  sed -i    "s|replace-with-a-strong-random-secret|$SECRET|" "$ENV_FILE" 2>/dev/null || true
  echo "  ✅ Config file created"
fi
CURRENT_KEY="$(grep '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' ')"
if [ -z "$CURRENT_KEY" ] || [ "$CURRENT_KEY" = "sk-ant-..." ]; then
  echo "  🔑 Paste your Anthropic API key (needed for CAD-to-Cost AI; Enter to skip)"
  echo "     Keys: https://console.anthropic.com/settings/keys"
  printf "  API key: "
  read -r USER_KEY
  if [ -n "$USER_KEY" ]; then
    if grep -q "^ANTHROPIC_API_KEY=" "$ENV_FILE" 2>/dev/null; then
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$USER_KEY|" "$ENV_FILE" 2>/dev/null || \
      sed -i    "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$USER_KEY|" "$ENV_FILE" 2>/dev/null || true
    else
      echo "ANTHROPIC_API_KEY=$USER_KEY" >> "$ENV_FILE"
    fi
    echo "  ✅ API key saved to calculator/.env (gitignored — never committed)"
  fi
  echo ""
fi

open_browser() {
  sleep 1
  command -v open     >/dev/null 2>&1 && open     "$URL" && return
  command -v xdg-open >/dev/null 2>&1 && xdg-open  "$URL" && return
}

# ── 3. Already running? Just open it. ─────────────────────────────────────────
if [ "$CODE_CHANGED" = false ] && curl -fsS "$URL" >/dev/null 2>&1; then
  echo "  ✅ CostVision is already running — opening $URL"
  open_browser
  read -r -p "  Press Enter to close this window… " _
  exit 0
fi

# ── 4. Require Docker (the STEP/CAD path needs the cadquery image) ─────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "  ❌ Docker Desktop is not installed."
  echo "     Install it (free): https://www.docker.com/products/docker-desktop/"
  echo "     Then double-click start.command again."
  command -v open >/dev/null 2>&1 && open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
  read -r -p "  Press Enter to close… " _
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "  ❌ Docker is installed but not running."
  echo "     Open Docker Desktop, wait for the whale icon in the menu bar,"
  echo "     then double-click start.command again."
  command -v open >/dev/null 2>&1 && open -a "Docker" 2>/dev/null || true
  read -r -p "  Press Enter to close… " _
  exit 1
fi

# ── 5. Build & start the STEP-capable image (rebuild picks up code updates) ───
echo "  🐳 Building & starting the CAD-capable container (first run: 2–3 min)…"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# ── 6. Wait for readiness, then open the browser ──────────────────────────────
printf "  ⏳ Starting"
for _ in $(seq 1 60); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo ""
    echo "  ✅ CostVision is running!  🌐 Opening $URL"
    open_browser
    break
  fi
  printf "."
  sleep 2
done
echo ""
echo "  ─────────────────────────────────────────────"
echo "  Upload BUMPER.stp → CAD-to-Cost → it auto-classifies Injection Moulding."
echo "  Close this window anytime — the app stays up."
echo "  To stop:  make stop   (or: docker compose down)"
echo "  ─────────────────────────────────────────────"
echo ""
read -r -p "  Press Enter to close this window… " _
