#!/usr/bin/env bash
# Apply all missing schema migrations and comprehensive demo data
# to an EXISTING Docker Postgres volume (one-shot, idempotent).
#
# Usage:
#   cd should-cost-app
#   bash migrate_existing_db.sh
#
set -e

echo "======================================================"
echo "  CostLens — DB Migration & Demo Data Loader"
echo "======================================================"

FILES=(
  "backend/src/db/schema_v6.sql"
  "backend/src/db/schema_v7.sql"
  "backend/src/db/schema_v8.sql"
  "backend/src/db/schema_v9.sql"
  "backend/src/db/seed_part_families.sql"
  "backend/src/db/seed_should_cost_detail.sql"
  "backend/src/db/seed_comprehensive_demo.sql"
  "backend/src/db/seed_comprehensive_demo_expansion.sql"
  "backend/src/db/seed_commodity_2025_2026.sql"
)

for f in "${FILES[@]}"; do
  echo "  → Applying $f ..."
  docker compose exec -T db psql -U postgres -d should_cost_db < "$f"
done

echo ""
echo "======================================================"
echo "  Done! Rebuild the backend to pick up changes:"
echo "  docker compose up -d --build"
echo "======================================================"
