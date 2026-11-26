#!/usr/bin/env node
/**
 * Check a CostVision database file: SQLite integrity and the row counts a person can compare before and after a restore.
 *   node scripts/ops/db-check.mjs <file.db>
 */
import Database from 'better-sqlite3';
import { pathToFileURL } from 'node:url';

const COUNTED = ['users', 'scenarios', 'projects', 'costing_records', 'kpi_audit'];

export function checkDb(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = String(db.pragma('integrity_check', { simple: true }));
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    const rows = {};
    for (const t of COUNTED) if (tables.has(t)) rows[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    return { ok: integrity === 'ok', integrity, tables: tables.size, rows };
  } finally { db.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/ops/db-check.mjs <file.db>'); process.exit(2); }
  const r = checkDb(file);
  console.log(JSON.stringify({ file, ...r }));
  process.exit(r.ok ? 0 : 1);
}
