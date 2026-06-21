#!/usr/bin/env bash
# Run this script from the should-cost-app/ directory to apply all missing
# schema migrations and seed data to an existing Docker Postgres volume.
#
# Usage:
#   cd should-cost-app
#   bash migrate_existing_db.sh
#
set -e

echo "Applying schema migrations v6 → v9 and seed data..."

for f in \
  backend/src/db/schema_v6.sql \
  backend/src/db/schema_v7.sql \
  backend/src/db/schema_v8.sql \
  backend/src/db/schema_v9.sql \
  backend/src/db/seed_part_families.sql \
  backend/src/db/seed_should_cost_detail.sql
do
  echo "  → $f"
  docker compose exec -T db psql -U postgres -d should_cost_db < "$f"
done

echo "Done. All tables and seed data are now in place."
