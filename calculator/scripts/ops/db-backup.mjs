#!/usr/bin/env node
/**
 * A consistent copy of the live CostVision database, taken while the server runs (SQLite online backup — no stop needed).
 * Used by deploy/jlr/backup.sh inside the container:  node scripts/ops/db-backup.mjs <destination.db>
 * The copy is checked (PRAGMA integrity_check) and its row counts printed, so a backup that cannot be restored is caught now.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { checkDb } from './db-check.mjs';

const dest = process.argv[2];
if (!dest) { console.error('usage: node scripts/ops/db-backup.mjs <destination.db>'); process.exit(2); }
const src = join(process.env.CV_DATA_DIR || join(process.cwd(), 'data'), 'should-cost.db');
if (!existsSync(src)) { console.error(`no database at ${src}`); process.exit(1); }
if (existsSync(dest)) { console.error(`refusing to overwrite ${dest}`); process.exit(1); }
const db = new Database(src, { readonly: true, fileMustExist: true });
await db.backup(dest);
db.close();
const r = checkDb(dest);
console.log(JSON.stringify({ backup: dest, ...r }));
process.exit(r.ok ? 0 : 1);
