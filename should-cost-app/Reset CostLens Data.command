#!/bin/bash
# ================================================================
# CostLens — Reset Demo Data
# Double-click this file to wipe the database and reload the
# full demo dataset (10 parts × should-cost + current price +
# 2 supplier quotes), then restart CostLens.
# ================================================================

cd "$(dirname "$0")"

echo "================================================"
echo "  🔭 CostLens — Resetting demo data..."
echo "================================================"
echo ""

docker compose down -v
docker compose up --build -d

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
echo "  ✅  Fresh demo data loaded!"
echo ""
open "http://localhost:5173"
echo "  (You can close this window now)"
