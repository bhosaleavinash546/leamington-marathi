import { createHash } from 'crypto';
import db from '../db.js';

/**
 * Persistent analysis cache — repeatability is a product promise: the same
 * inputs must return the IDENTICAL result on every run. A fresh LLM pass is
 * not bit-deterministic even with fixed prompts, so results are cached by a
 * SHA-256 of everything that shapes the analysis (file bytes + parameters),
 * with an in-memory L1 over a SQLite L2 that survives server restarts.
 *
 * Shared by the PCB Image-to-BOM and CAD-to-Cost pipelines (one table each).
 */
export interface AnalysisCache {
  buildKey(buffers: Buffer[]): string;
  get(key: string): unknown | null;
  set(key: string, payload: unknown): void;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createAnalysisCache(table: string, ttlMs: number = DEFAULT_TTL_MS): AnalysisCache {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`invalid cache table name: ${table}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      key TEXT PRIMARY KEY,
      ts  INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  db.prepare(`DELETE FROM ${table} WHERE ts < ?`).run(Date.now() - ttlMs);

  const l1 = new Map<string, { ts: number; payload: unknown }>();

  return {
    buildKey(buffers: Buffer[]): string {
      const h = createHash('sha256');
      for (const b of buffers) h.update(b);
      return h.digest('hex');
    },
    get(key: string): unknown | null {
      const e = l1.get(key);
      if (e && Date.now() - e.ts <= ttlMs) return e.payload;
      if (e) l1.delete(key);
      try {
        const row = db.prepare(`SELECT ts, payload FROM ${table} WHERE key = ?`).get(key) as { ts: number; payload: string } | undefined;
        if (!row) return null;
        if (Date.now() - row.ts > ttlMs) { db.prepare(`DELETE FROM ${table} WHERE key = ?`).run(key); return null; }
        const payload = JSON.parse(row.payload) as unknown;
        l1.set(key, { ts: row.ts, payload });
        return payload;
      } catch (err) {
        console.warn(`[cache/${table}] read failed:`, err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    set(key: string, payload: unknown): void {
      if (l1.size > 200) {
        const oldest = [...l1.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) l1.delete(oldest[0]);
      }
      l1.set(key, { ts: Date.now(), payload });
      try {
        db.prepare(`INSERT OR REPLACE INTO ${table} (key, ts, payload) VALUES (?, ?, ?)`)
          .run(key, Date.now(), JSON.stringify(payload));
      } catch (err) {
        console.warn(`[cache/${table}] write failed:`, err instanceof Error ? err.message : String(err));
      }
    },
  };
}
