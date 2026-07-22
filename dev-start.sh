#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
#  CostVision — local dev launcher (STEP-capable 3D viewer)
#  One command:   ./dev-start.sh      or:   make dev      or double-click Start-Dev.command
#
#  Runs the real dev stack (Vite UI :5174 + Express/tsx API :3002) in the
#  FOREGROUND so the sign-in OTP is visible, and auto-opens the browser. Unlike
#  `make start` (Docker/Alpine, STL only), this uses your local Python so STEP/
#  IGES render — provided cadquery is installed (it warns you if it isn't).
# ──────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

URL="http://localhost:5174/calculator/"
ENV_FILE="calculator/.env"

printf '\n  ┌─────────────────────────────────────────────┐\n'
printf   '  │   CostVision · local dev (3D viewer)         │\n'
printf   '  └─────────────────────────────────────────────┘\n\n'

# ── Already running? just open it ─────────────────────────────────────────────
if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "  ✅ Already running — opening $URL"
  command -v open     >/dev/null 2>&1 && open     "$URL" 2>/dev/null
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" 2>/dev/null
  exit 0
fi

# write ANTHROPIC_API_KEY=<key> into .env (portable across macOS + GNU sed)
set_env_key() {
  if grep -qE '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$1|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    printf '\nANTHROPIC_API_KEY=%s\n' "$1" >> "$ENV_FILE"
  fi
}

# ── 1) config (.env with a generated JWT secret) ──────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cp calculator/.env.example "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')"
  sed -i.bak "s|replace-with-a-strong-random-secret|$SECRET|" "$ENV_FILE" 2>/dev/null && rm -f "$ENV_FILE.bak"
  echo "  ✅ Created calculator/.env (JWT secret generated)"
fi

# ── 1b) Anthropic API key (for AI costing) ────────────────────────────────────
#   Enables AI CAD-to-Cost / PCB. The 3D viewer + STL files work without it.
#   Non-interactive:  ANTHROPIC_API_KEY=sk-ant-... ./dev-start.sh
CUR_KEY="$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' ')"
[ -n "$ANTHROPIC_API_KEY" ] && CUR_KEY="$ANTHROPIC_API_KEY"
case "$CUR_KEY" in sk-ant-*) : ;; *) CUR_KEY="" ;; esac   # blank or "sk-ant-..." placeholder → treat as unset
if [ -n "$ANTHROPIC_API_KEY" ] && [ -n "$CUR_KEY" ]; then
  set_env_key "$CUR_KEY"; echo "  ✅ API key taken from ANTHROPIC_API_KEY → calculator/.env"
elif [ -n "$CUR_KEY" ]; then
  echo "  ✅ API key already configured in calculator/.env"
elif [ -t 0 ]; then
  echo ""
  echo "  🔑 Anthropic API key (enables AI CAD-to-Cost & PCB; press Enter to skip —"
  echo "     the 3D viewer and STL files still work). Get one at:"
  echo "     https://console.anthropic.com/settings/keys"
  printf "  API key (sk-ant-…): "
  read -r ENTERED_KEY
  case "$ENTERED_KEY" in
    sk-ant-*) set_env_key "$ENTERED_KEY"; echo "  ✅ API key saved to calculator/.env" ;;
    "")       echo "  ⏭  Skipped — set it later with:  ANTHROPIC_API_KEY=sk-ant-… ./dev-start.sh" ;;
    *)        echo "  ⚠️  That doesn't look like an Anthropic key (should start with sk-ant-) — skipped." ;;
  esac
fi

# ── 2) node dependencies ──────────────────────────────────────────────────────
if [ ! -d calculator/node_modules ]; then
  echo "  📦 Installing dependencies (first run, ~1 min)…"
  ( cd calculator && npm install ) || { echo "  ❌ npm install failed"; exit 1; }
fi

# ── 3) cadquery check — needed for STEP/IGES (STL works without it) ────────────
if python3 -c "import cadquery" >/dev/null 2>&1; then
  echo "  ✅ cadquery detected — STEP / IGES will render in 3D"
else
  echo "  ⚠️  cadquery NOT found — STEP/IGES won't open (STL files still work)."
  echo "     Enable STEP with:   pip install cadquery"
fi
echo ""

# ── 4) open the browser once the app answers (background waiter) ──────────────
(
  for _ in $(seq 1 60); do curl -fsS "$URL" >/dev/null 2>&1 && break; sleep 2; done
  command -v open     >/dev/null 2>&1 && open     "$URL" 2>/dev/null && exit 0
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" 2>/dev/null && exit 0
  command -v cmd.exe  >/dev/null 2>&1 && cmd.exe /c start "" "$URL"  2>/dev/null || true
) &

cat <<EOF
  🌐 Opening $URL automatically when it's ready…
  🔑 Sign-in code (OTP) PRINTS IN THIS WINDOW — look for:  📧 OTP for … : 123456
  🧊 Then: CAD-to-Cost → drop a .step / .stp (or .stl) → rotate & check the viewer
  ⛔ Stop with Ctrl-C
EOF
echo ""

# ── 5) run in the foreground so logs (and the OTP) are visible ────────────────
cd calculator && exec npm run dev:full
