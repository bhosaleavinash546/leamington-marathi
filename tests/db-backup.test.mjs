// Online backup + rotation: backups open as valid databases; pruning keeps the newest N.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { backupNow, pruneBackups } from '../db-backup.mjs';

test('backupNow writes a consistent, openable copy of a live db', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bak-src-'));
  const db = new Database(join(dir, 'src.db'));
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('alpha'), ('beta')");
  const dest = await backupNow(db, join(dir, 'backups'), { now: () => new Date('2026-07-21T10:00:00Z') });
  assert.match(dest, /brainspark-2026-07-21-10-00-00\.db$/);
  const copy = new Database(dest, { readonly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) c FROM t').get().c, 2);
  copy.close(); db.close();
});

test('pruneBackups keeps the newest N and ignores unrelated files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bak-rot-'));
  for (const d of ['01', '02', '03', '04', '05']) writeFileSync(join(dir, `brainspark-2026-07-${d}-00-00-00.db`), 'x');
  writeFileSync(join(dir, 'unrelated.txt'), 'x');
  const pruned = pruneBackups(dir, 3);
  assert.equal(pruned.length, 2);
  const left = readdirSync(dir).filter(f => f.endsWith('.db')).sort();
  assert.deepEqual(left, ['brainspark-2026-07-03-00-00-00.db', 'brainspark-2026-07-04-00-00-00.db', 'brainspark-2026-07-05-00-00-00.db'], 'oldest pruned, newest kept');
  assert.ok(readdirSync(dir).includes('unrelated.txt'));
  assert.deepEqual(pruneBackups(join(dir, 'missing')), [], 'missing dir is a no-op');
});
