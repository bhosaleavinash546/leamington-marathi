#!/usr/bin/env bash
# Back up the CostVision database while it runs (SQLite online backup), check the copy, keep the newest $KEEP.
#   ./backup.sh                    # into ./backups
#   BACKUP_DIR=/srv/backups/costvision KEEP=30 ./backup.sh
# Schedule nightly (root's crontab):  15 2 * * * cd /opt/costvision/deploy/jlr && ./backup.sh >> backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="should-cost-${TS}.db"
mkdir -p "$BACKUP_DIR"
# 1. A consistent copy inside the container (checked there: integrity + row counts).
docker compose exec -T costvision node scripts/ops/db-backup.mjs "/app/data/backups/${NAME}"
# 2. Out of the container, then removed from the volume.
docker compose cp "costvision:/app/data/backups/${NAME}" "${BACKUP_DIR}/${NAME}"
docker compose exec -T costvision rm -f "/app/data/backups/${NAME}"
( cd "$BACKUP_DIR" && sha256sum "$NAME" > "${NAME}.sha256" )
echo "backup: ${BACKUP_DIR}/${NAME} ($(du -h "${BACKUP_DIR}/${NAME}" | cut -f1))"
# 3. Keep the newest $KEEP.
ls -1t "$BACKUP_DIR"/should-cost-*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "${old}.sha256"; done
