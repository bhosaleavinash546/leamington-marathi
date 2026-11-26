#!/usr/bin/env bash
# Restore a CostVision database backup. Stops the app, checks the backup, keeps the current database beside it
# (should-cost.db.before-restore-<time>), puts the backup in place, starts the app.
#   ./restore.sh backups/should-cost-20261126T021500Z.db
set -euo pipefail
cd "$(dirname "$0")"
FILE="${1:?usage: ./restore.sh <backup.db>}"
[ -f "$FILE" ] || { echo "no such file: $FILE"; exit 1; }
if [ -f "${FILE}.sha256" ]; then ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" ); fi
ABS="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose stop costvision
# A one-off container on the same volume, as root only for the file move; the app itself never runs as root.
docker compose run --rm --no-deps --user 0 -v "${ABS}:/restore/in.db:ro" --entrypoint sh costvision -c "
  set -e
  node scripts/ops/db-check.mjs /restore/in.db
  cd /app/data
  if [ -f should-cost.db ]; then mv should-cost.db should-cost.db.before-restore-${TS}; fi
  rm -f should-cost.db-wal should-cost.db-shm
  cp /restore/in.db should-cost.db
  chown 10001:10001 should-cost.db
  node /app/scripts/ops/db-check.mjs /app/data/should-cost.db
"
docker compose start costvision
echo "restored $FILE (the previous database is kept as should-cost.db.before-restore-${TS} in the data volume)"
