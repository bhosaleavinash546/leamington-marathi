/**
 * Storage for the shared company rate library, admin cell-overrides, and which
 * source (built-in vs company) is active. One shared library for the whole team.
 * Pure data-access over a better-sqlite3 handle — unit-testable in memory.
 */
import type { Database } from 'better-sqlite3';
import type { RateLibrary } from '../../src/engine/types.js';
import type { SWRateLibrary } from '../../src/engine/sw-rate-library.js';
import { fingerprintRateLibrary } from '../utils/rate-library-fingerprint.js';
import type { RateOverride, RateSource, RateTable } from '../../src/engine/rate-library-merge.js';

const COMPANY_ID = 'company';
const SOURCE_KEY = 'rate_source';
const SW_COMPANY_ID = 'sw_company';
const SW_SOURCE_KEY = 'sw_rate_source';

export function getCompanyLibrary(db: Database): RateLibrary | null {
  const row = db.prepare('SELECT data FROM rate_library WHERE id = ?').get(COMPANY_ID) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as RateLibrary; } catch { return null; }
}

export interface RateLibraryVersion {
  /** Content fingerprint — the id a costing records to be reproducible. */
  id: string;
  libraryId: string;
  versionNo: number;
  createdAt: string;
  createdBy: string;
  note: string;
}

/**
 * Keep the book that is being replaced, then move the pointer.
 *
 * The old behaviour overwrote a single row, so changing one rate destroyed the
 * book that produced every costing before it — a run could be explained but not
 * reproduced, which is what blocked using bulk output for anything audited.
 *
 * Re-uploading an identical sheet is not a new version: the id is the content
 * fingerprint, so it collapses onto the existing row rather than churning the
 * history with duplicates.
 */
export function recordRateLibraryVersion(
  db: Database, libraryId: string, lib: RateLibrary, now: string, by: string, note = '',
): RateLibraryVersion {
  const id = fingerprintRateLibrary(lib);
  const existing = db.prepare(
    'SELECT id, library_id, version_no, created_at, created_by, note FROM rate_library_versions WHERE id = ? AND library_id = ?',
  ).get(id, libraryId) as {
    id: string; library_id: string; version_no: number; created_at: string; created_by: string; note: string;
  } | undefined;
  if (existing) {
    return { id: existing.id, libraryId: existing.library_id, versionNo: existing.version_no,
             createdAt: existing.created_at, createdBy: existing.created_by, note: existing.note };
  }
  const next = (db.prepare('SELECT MAX(version_no) AS n FROM rate_library_versions WHERE library_id = ?')
    .get(libraryId) as { n: number | null }).n ?? 0;
  const versionNo = next + 1;
  db.prepare(`INSERT INTO rate_library_versions (id, library_id, version_no, data, created_at, created_by, note)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, libraryId, versionNo, JSON.stringify(lib), now, by, note);
  return { id, libraryId, versionNo, createdAt: now, createdBy: by, note };
}

/** Newest first. Metadata only — the blobs are large and rarely all wanted. */
export function listRateLibraryVersions(db: Database, libraryId = COMPANY_ID): RateLibraryVersion[] {
  return (db.prepare(
    `SELECT id, library_id, version_no, created_at, created_by, note
       FROM rate_library_versions WHERE library_id = ? ORDER BY version_no DESC`,
  ).all(libraryId) as Array<{
    id: string; library_id: string; version_no: number; created_at: string; created_by: string; note: string;
  }>).map(r => ({ id: r.id, libraryId: r.library_id, versionNo: r.version_no,
                  createdAt: r.created_at, createdBy: r.created_by, note: r.note }));
}

/** The book behind a fingerprint — this is what makes a run reproducible. */
export function getRateLibraryVersion(db: Database, versionId: string): RateLibrary | null {
  const row = db.prepare('SELECT data FROM rate_library_versions WHERE id = ?')
    .get(versionId) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as RateLibrary; } catch { return null; }
}

export function setCompanyLibrary(db: Database, lib: RateLibrary, now: string, by: string, note = ''): RateLibraryVersion {
  const version = recordRateLibraryVersion(db, COMPANY_ID, lib, now, by, note);
  db.prepare(`
    INSERT INTO rate_library (id, data, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(COMPANY_ID, JSON.stringify(lib), now, by);
  return version;
}

export function clearCompanyLibrary(db: Database): void {
  db.prepare('DELETE FROM rate_library WHERE id = ?').run(COMPANY_ID);
}

export function getRateSource(db: Database): RateSource {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SOURCE_KEY) as { value: string } | undefined;
  return row?.value === 'company' ? 'company' : 'builtin';
}

export function setRateSource(db: Database, source: RateSource): void {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(SOURCE_KEY, source === 'company' ? 'company' : 'builtin');
}

const ovKey = (t: string, id: string, f: string) => `${t}|${id}|${f}`;

export function getOverrides(db: Database): RateOverride[] {
  const rows = db.prepare('SELECT tbl, row_id, field, value FROM rate_overrides').all() as
    Array<{ tbl: string; row_id: string; field: string; value: number }>;
  return rows.map(r => ({ table: r.tbl as RateTable, id: r.row_id, field: r.field, value: r.value }));
}

export function setOverride(db: Database, ov: RateOverride, now: string, by: string): void {
  db.prepare(`
    INSERT INTO rate_overrides (id, tbl, row_id, field, value, updated_at, updated_by)
    VALUES (@id, @tbl, @row, @field, @value, @now, @by)
    ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run({ id: ovKey(ov.table, ov.id, ov.field), tbl: ov.table, row: ov.id, field: ov.field, value: ov.value, now, by });
}

export function deleteOverride(db: Database, table: string, id: string, field: string): boolean {
  return db.prepare('DELETE FROM rate_overrides WHERE id = ?').run(ovKey(table, id, field)).changes > 0;
}

export function clearOverrides(db: Database): void {
  db.prepare('DELETE FROM rate_overrides').run();
}

// ─── SW Should-Cost rate library (Slice 2) ─────────────────────────────────────

export function getSWCompanyLibrary(db: Database): Partial<SWRateLibrary> | null {
  const row = db.prepare('SELECT data FROM rate_library WHERE id = ?').get(SW_COMPANY_ID) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data) as Partial<SWRateLibrary>; } catch { return null; }
}

export function setSWCompanyLibrary(db: Database, lib: Partial<SWRateLibrary>, now: string, by: string): void {
  db.prepare(`
    INSERT INTO rate_library (id, data, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(SW_COMPANY_ID, JSON.stringify(lib), now, by);
}

export function clearSWCompanyLibrary(db: Database): void {
  db.prepare('DELETE FROM rate_library WHERE id = ?').run(SW_COMPANY_ID);
}

export function getSWRateSource(db: Database): RateSource {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SW_SOURCE_KEY) as { value: string } | undefined;
  return row?.value === 'company' ? 'company' : 'builtin';
}

export function setSWRateSource(db: Database, source: RateSource): void {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(SW_SOURCE_KEY, source === 'company' ? 'company' : 'builtin');
}

// ── PCB country-rate overrides (audit fix: country DB is admin-editable) ─────
const PCB_COUNTRY_OV_KEY = 'pcb_country_overrides';

export function getPCBCountryOverrides(db: Database): Record<string, unknown> {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(PCB_COUNTRY_OV_KEY) as { value: string } | undefined;
  if (!row) return {};
  try { return JSON.parse(row.value) as Record<string, unknown>; } catch { return {}; }
}

export function setPCBCountryOverrides(db: Database, overrides: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(PCB_COUNTRY_OV_KEY, JSON.stringify(overrides ?? {}));
}

export function clearPCBCountryOverrides(db: Database): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(PCB_COUNTRY_OV_KEY);
}
