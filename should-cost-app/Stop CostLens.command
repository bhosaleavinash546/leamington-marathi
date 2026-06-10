#!/bin/bash
# ================================================================
# CostLens — Stop
# Double-click this file in Finder to stop CostLens
# ================================================================

cd "$(dirname "$0")"

echo "================================================"
echo "  🔭 CostLens — Stopping..."
echo "================================================"
echo ""

docker compose down

echo ""
echo "  ✅  CostLens has been stopped."
echo "  (You can close this window)"
