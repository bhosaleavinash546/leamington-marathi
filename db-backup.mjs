/**
 * SQLite backup with rotation — the first item on the production known-gaps
 * list (docs/OPERATIONS.md). Uses better-sqlite3's online backup API, so a
 * live database is copied consistently without locking writers.
 *
 *   backupNow(db, dir, { now })                 → path of the backup written
 *   startBackups(db, dir, { intervalMs, keep }) → timer (unref'd); runs one
 *                                                 backup immediately, then on
 *                                                 the interval, pruning to the
 *                                                 newest `keep` copies
 *
 * Restore: stop the server, copy the chosen backup over $DATA_DIR/brainspark.db.
 * Disable entirely with BRAINSPARK_BACKUPS=0 (the server checks before wiring).
 */
import fs from 'fs';
import path from 'path';

const stamp = (d) => d.toISOString().replace(/[:T]/g, '-').slice(0, 19);

export async function backupNow(db, dir, { now = () => new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `brainspark-${stamp(now())}.db`);
  await db.backup(dest);
  return dest;
}

export function pruneBackups(dir, keep = 7) {
  let files;
  try { files = fs.readdirSync(dir).filter(f => /^brainspark-.*\.db$/.test(f)).sort(); } catch { return []; }
  const excess = files.slice(0, Math.max(0, files.length - keep));   // sorted asc = oldest first
  for (const f of excess) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* */ } }
  return excess;
}

export function startBackups(db, dir, { intervalMs = 24 * 60 * 60 * 1000, keep = 7, log = () => {} } = {}) {
  const run = async () => {
    try {
      const dest = await backupNow(db, dir);
      const pruned = pruneBackups(dir, keep);
      log(`[Backup] wrote ${dest}${pruned.length ? ` · pruned ${pruned.length} old` : ''}`);
    } catch (e) { log(`[Backup] FAILED: ${e?.message}`); }
  };
  run();   // one at boot — a restore point always exists
  const timer = setInterval(run, intervalMs);
  timer.unref?.();   // never keeps the process alive
  return timer;
}
