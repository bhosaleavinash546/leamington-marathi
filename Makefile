.PHONY: start stop restart logs setup open

# ── First-time setup ──────────────────────────────────────────────────────────
setup:
	@echo "Setting up CostVision..."
	@if [ ! -f calculator/.env ]; then \
		cp calculator/.env.example calculator/.env; \
		echo ""; \
		echo "  ✅ Created calculator/.env"; \
		echo "  ⚠️  Open calculator/.env and add your ANTHROPIC_API_KEY + JWT_SECRET"; \
		echo ""; \
	else \
		echo "  ✅ calculator/.env already exists"; \
	fi

# ── Start the app ─────────────────────────────────────────────────────────────
start:
	@echo "Starting CostVision..."
	@if [ ! -f calculator/.env ]; then make setup; fi
	docker compose up -d --build
	@echo ""
	@echo "  ✅ CostVision is running!"
	@echo "  🌐 Open: http://localhost:5173"
	@echo ""

# ── Stop the app ─────────────────────────────────────────────────────────────
stop:
	@echo "Stopping CostVision..."
	docker compose down
	@echo "  ✅ Stopped."

# ── Restart ──────────────────────────────────────────────────────────────────
restart:
	docker compose restart
	@echo "  ✅ Restarted → http://localhost:5173"

# ── View live logs ────────────────────────────────────────────────────────────
logs:
	docker compose logs -f

# ── Open in browser (macOS) ───────────────────────────────────────────────────
open:
	open http://localhost:5173
