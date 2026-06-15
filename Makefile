.PHONY: start stop restart logs open status update

# ── Start the app (guided first-run setup + launch) ───────────────────────────
start:
	@./start.sh

# ── Stop the app ─────────────────────────────────────────────────────────────
stop:
	@echo "Stopping CostVision..."
	@docker compose down
	@echo "  ✅ Stopped."

# ── Restart ──────────────────────────────────────────────────────────────────
restart:
	@docker compose restart
	@echo "  ✅ Restarted → http://localhost:5174/calculator/"

# ── View live logs ────────────────────────────────────────────────────────────
logs:
	@docker compose logs -f

# ── Container status ──────────────────────────────────────────────────────────
status:
	@docker compose ps

# ── Open in browser (macOS) ───────────────────────────────────────────────────
open:
	@open http://localhost:5174/calculator/

# ── Pull latest code + force full rebuild ─────────────────────────────────────
update:
	@echo "⬇  Pulling latest code..."
	@git pull origin claude/new-session-ts4byp
	@echo "🛑 Stopping old container..."
	@docker compose down --remove-orphans
	@docker rm -f costvision 2>/dev/null || true
	@echo "🐳 Rebuilding with latest code..."
	@docker compose up -d --build
	@echo "✅ Done → http://localhost:5174/calculator/"
	@open http://localhost:5174/calculator/ 2>/dev/null || true
