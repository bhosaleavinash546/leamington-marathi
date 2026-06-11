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

# ── First-run: create .env if it does not exist ─────────────────
if [ ! -f ".env" ]; then
  echo "# CostLens environment — created by Start CostLens.command" > .env
  echo "ANTHROPIC_API_KEY=" >> .env
  echo "ANTHROPIC_MODEL=claude-sonnet-4-6" >> .env
  echo "SMTP_HOST=" >> .env
  echo "SMTP_PORT=587" >> .env
  echo "SMTP_USER=" >> .env
  echo "SMTP_PASS=" >> .env
  echo "SMTP_FROM=costlens@no-reply.local" >> .env
fi

# ── Check whether an Anthropic API key is already set ───────────
CURRENT_KEY=$(grep '^ANTHROPIC_API_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '[:space:]"'"'" )

if [ -z "$CURRENT_KEY" ]; then
  CHOICE=$(osascript <<'APPLESCRIPT'
set theResult to display dialog "CostLens uses Claude AI for cost analysis insights.\n\nDo you have an Anthropic API key?\n\n• With a key → AI buttons generate real, personalised insights\n• Without a key → AI buttons still work using built-in demo responses\n\nYou can add or change your key anytime by double-clicking\n\"Configure CostLens.command\"" buttons {"Skip (use demo AI)", "Enter my API key"} default button "Enter my API key" with title "CostLens — AI Setup" with icon note
return button returned of theResult
APPLESCRIPT
  )

  if [ "$CHOICE" = "Enter my API key" ]; then
    API_KEY=$(osascript <<'APPLESCRIPT'
set theResult to display dialog "Paste your Anthropic API key below.\n\nGet one at: https://console.anthropic.com/\n(It starts with sk-ant-...)" default answer "" with hidden answer with title "CostLens — Enter API Key" buttons {"Cancel", "Save & Start"} default button "Save & Start"
if button returned of theResult is "Cancel" then return ""
return text returned of theResult
APPLESCRIPT
    )

    API_KEY=$(echo "$API_KEY" | tr -d '[:space:]')
    if [ -n "$API_KEY" ]; then
      # Write the key into .env (replace or add)
      if grep -q '^ANTHROPIC_API_KEY=' .env; then
        sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${API_KEY}|" .env
      else
        echo "ANTHROPIC_API_KEY=${API_KEY}" >> .env
      fi
      echo "  ✅  API key saved to .env"
    else
      echo "  ⚠  No key entered — using demo AI mode."
    fi
  else
    echo "  ℹ  Skipping AI key — using demo AI mode."
  fi
fi

echo ""
echo "================================================"
echo "  🔭 CostLens — Starting up..."
echo "================================================"
echo ""

# ── Load .env so docker compose picks it up ─────────────────────
export $(grep -v '^#' .env | grep -v '^[[:space:]]*$' | xargs) 2>/dev/null || true

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

# Show whether real AI is active
ACTIVE_KEY=$(grep '^ANTHROPIC_API_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '[:space:]"'"'" )
if [ -n "$ACTIVE_KEY" ]; then
  AI_STATUS="✅  Real Claude AI active (${ACTIVE_KEY:0:12}...)"
else
  AI_STATUS="ℹ  Demo AI mode (no API key set)"
fi

echo ""
echo "================================================"
echo "  ✅  CostLens is running!"
echo "================================================"
echo ""
echo "  $AI_STATUS"
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
echo "  To change your API key, double-click 'Configure CostLens.command'"
echo ""
echo "  (You can close this window now)"
