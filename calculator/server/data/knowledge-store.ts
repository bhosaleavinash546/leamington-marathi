/**
 * Knowledge base store — the tool's permanent memory of past analyses (Step 1 of
 * the self-learning capability). Every costing is stored as a "case" with a part
 * fingerprint; similarity search over these cases powers auto-suggestions and
 * proactive insights for future similar parts.
 *
 * Unlike projects (private per user), knowledge is ORGANISATIONAL: writes record
 * the author, but reads span all users — that sharing is the point. Cases are
 * upserted by (normalised part name, commodity) so recalculating a part updates
 * its case instead of duplicating it.
 *
 * Pure data-access over a better-sqlite3 handle — unit-tests in-memory.
 */

import type { Database } from 'better-sqlite3';
import type { KnowledgeCase, PartFingerprint } from '../../src/engine/part-similarity.js';

interface CaseRow {
  id: string; user_id: string; part_key: string; part_name: string; commodity: string;
  fingerprint: string; total_cost: number; currency: string; breakdown: string | null;
  actual_cost: number | null; user_adjusted: number; dfm_issue_count: number | null;
  saved_at: number; updated_at: number;
}

export function ensureKnowledgeTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_cases (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      part_key        TEXT NOT NULL UNIQUE,
      part_name       TEXT NOT NULL,
      commodity       TEXT NOT NULL,
      fingerprint     TEXT NOT NULL,
      total_cost      REAL NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'GBP',
      breakdown       TEXT,
      actual_cost     REAL,
      user_adjusted   INTEGER NOT NULL DEFAULT 0,
      dfm_issue_count INTEGER,
      saved_at        INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_commodity ON knowledge_cases(commodity);
  `);
}

const partKey = (partName: string, commodity: string) =>
  `${commodity}::${partName.trim().toLowerCase().replace(/\s+/g, ' ')}`;

function toCase(r: CaseRow): KnowledgeCase {
  let fingerprint: PartFingerprint = { commodity: r.commodity };
  let breakdown: Record<string, number> | undefined;
  try { fingerprint = JSON.parse(r.fingerprint) as PartFingerprint; } catch { /* keep minimal */ }
  try { breakdown = r.breakdown ? JSON.parse(r.breakdown) as Record<string, number> : undefined; } catch { /* omit */ }
  return {
    id: r.id, savedAt: r.saved_at, partName: r.part_name, fingerprint,
    totalCost: r.total_cost, currency: r.currency, breakdown,
    actualCost: r.actual_cost ?? undefined,
    userAdjusted: r.user_adjusted === 1,
    dfmIssueCount: r.dfm_issue_count ?? undefined,
  };
}

export interface UpsertCaseInput {
  partName: string;
  fingerprint: PartFingerprint;
  totalCost: number;
  currency: string;
  breakdown?: Record<string, number>;
  actualCost?: number;
  userAdjusted?: boolean;
  dfmIssueCount?: number;
}

/** Insert or update the case for this (part, commodity). Returns the stored case. */
export function upsertCase(db: Database, userId: string, c: UpsertCaseInput, now = Date.now()): KnowledgeCase {
  const key = partKey(c.partName, c.fingerprint.commodity);
  const existing = db.prepare('SELECT * FROM knowledge_cases WHERE part_key = ?').get(key) as CaseRow | undefined;
  if (existing) {
    db.prepare(`UPDATE knowledge_cases SET part_name=?, fingerprint=?, total_cost=?, currency=?, breakdown=?,
                actual_cost=COALESCE(?, actual_cost), user_adjusted=MAX(user_adjusted, ?), dfm_issue_count=?, updated_at=? WHERE part_key=?`)
      .run(c.partName, JSON.stringify(c.fingerprint), c.totalCost, c.currency, c.breakdown ? JSON.stringify(c.breakdown) : null,
        c.actualCost ?? null, c.userAdjusted ? 1 : 0, c.dfmIssueCount ?? null, now, key);
    return toCase(db.prepare('SELECT * FROM knowledge_cases WHERE part_key = ?').get(key) as CaseRow);
  }
  const id = now.toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(`INSERT INTO knowledge_cases (id, user_id, part_key, part_name, commodity, fingerprint, total_cost, currency,
              breakdown, actual_cost, user_adjusted, dfm_issue_count, saved_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, key, c.partName, c.fingerprint.commodity, JSON.stringify(c.fingerprint), c.totalCost, c.currency,
      c.breakdown ? JSON.stringify(c.breakdown) : null, c.actualCost ?? null, c.userAdjusted ? 1 : 0, c.dfmIssueCount ?? null, now, now);
  return toCase(db.prepare('SELECT * FROM knowledge_cases WHERE id = ?').get(id) as CaseRow);
}

/** All cases (org-wide), optionally by commodity, newest first, bounded. */
export function listCases(db: Database, commodity?: string, limit = 1000): KnowledgeCase[] {
  const rows = commodity
    ? db.prepare('SELECT * FROM knowledge_cases WHERE commodity = ? ORDER BY updated_at DESC LIMIT ?').all(commodity, limit)
    : db.prepare('SELECT * FROM knowledge_cases ORDER BY updated_at DESC LIMIT ?').all(limit);
  return (rows as CaseRow[]).map(toCase);
}

/** Attach a real quoted/PO price to a case (feeds calibration + suggestions). */
export function recordActual(db: Database, partName: string, commodity: string, actualCost: number, now = Date.now()): boolean {
  const res = db.prepare('UPDATE knowledge_cases SET actual_cost = ?, updated_at = ? WHERE part_key = ?')
    .run(actualCost, now, partKey(partName, commodity));
  return res.changes > 0;
}

// ── Drift-finding dismissals ───────────────────────────────────────────────────
// Findings are computed live from the knowledge base (always fresh); a dismissal
// marks one as handled so the autonomous monitor doesn't re-raise it.

export function ensureDriftTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS drift_dismissals (
      finding_key  TEXT PRIMARY KEY,
      dismissed_at INTEGER NOT NULL
    );
  `);
}

const findingKey = (partName: string, commodity: string, kind: string) =>
  `${kind}::${partKey(partName, commodity)}`;

export function dismissFinding(db: Database, partName: string, commodity: string, kind: string, now = Date.now()): void {
  db.prepare('INSERT OR REPLACE INTO drift_dismissals (finding_key, dismissed_at) VALUES (?, ?)')
    .run(findingKey(partName, commodity, kind), now);
}

export function isDismissed(db: Database, partName: string, commodity: string, kind: string): boolean {
  return !!db.prepare('SELECT 1 FROM drift_dismissals WHERE finding_key = ?').get(findingKey(partName, commodity, kind));
}

export interface KnowledgeStats { total: number; withActuals: number; byCommodity: Record<string, number>; }

export function knowledgeStats(db: Database): KnowledgeStats {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM knowledge_cases').get() as { n: number }).n;
  const withActuals = (db.prepare('SELECT COUNT(*) AS n FROM knowledge_cases WHERE actual_cost IS NOT NULL').get() as { n: number }).n;
  const rows = db.prepare('SELECT commodity, COUNT(*) AS n FROM knowledge_cases GROUP BY commodity').all() as Array<{ commodity: string; n: number }>;
  const byCommodity: Record<string, number> = {};
  for (const r of rows) byCommodity[r.commodity] = r.n;
  return { total, withActuals, byCommodity };
}
