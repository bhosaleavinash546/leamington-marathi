.PHONY: start stop restart logs open status

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
	@echo "  ✅ Restarted → http://localhost:5173"

# ── View live logs ────────────────────────────────────────────────────────────
logs:
	@docker compose logs -f

# ── Container status ──────────────────────────────────────────────────────────
status:
	@docker compose ps

# ── Open in browser (macOS) ───────────────────────────────────────────────────
open:
	@open http://localhost:5173
