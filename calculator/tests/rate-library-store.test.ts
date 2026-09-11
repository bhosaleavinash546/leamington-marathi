import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import {
  getCompanyLibrary, setCompanyLibrary, clearCompanyLibrary,
  getRateSource, setRateSource, getOverrides, setOverride, deleteOverride, clearOverrides,
  recordRateLibraryVersion, listRateLibraryVersions, getRateLibraryVersion,
} from '../server/data/rate-library-store.js';
import { fingerprintRateLibrary } from '../server/utils/rate-library-fingerprint.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE rate_library (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE rate_overrides (id TEXT PRIMARY KEY, tbl TEXT NOT NULL, row_id TEXT NOT NULL, field TEXT NOT NULL, value REAL NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE rate_library_versions (
      id TEXT NOT NULL, library_id TEXT NOT NULL, version_no INTEGER NOT NULL, data TEXT NOT NULL,
      created_at TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (library_id, id));
  `);
});

describe('rate-library store — company library', () => {
  it('defaults to no company library and built-in source', () => {
    expect(getCompanyLibrary(db)).toBeNull();
    expect(getRateSource(db)).toBe('builtin');
  });

  it('stores and reads back a company library', () => {
    setCompanyLibrary(db, DEFAULT_RATE_LIBRARY, '2026-01-01', 'admin@x');
    const got = getCompanyLibrary(db);
    expect(got?.materials.length).toBe(DEFAULT_RATE_LIBRARY.materials.length);
  });

  it('upsert replaces the single shared library', () => {
    setCompanyLibrary(db, DEFAULT_RATE_LIBRARY, 't1', 'a');
    const two = { ...DEFAULT_RATE_LIBRARY, materials: DEFAULT_RATE_LIBRARY.materials.slice(0, 1) };
    setCompanyLibrary(db, two, 't2', 'b');
    expect(getCompanyLibrary(db)?.materials.length).toBe(1);
  });

  it('clear removes it', () => {
    setCompanyLibrary(db, DEFAULT_RATE_LIBRARY, 't', 'a');
    clearCompanyLibrary(db);
    expect(getCompanyLibrary(db)).toBeNull();
  });
});

describe('rate-library store — active source', () => {
  it('sets and reads the source', () => {
    setRateSource(db, 'company');
    expect(getRateSource(db)).toBe('company');
    setRateSource(db, 'builtin');
    expect(getRateSource(db)).toBe('builtin');
  });
});

describe('rate-library store — overrides', () => {
  it('sets, lists, updates and deletes an override', () => {
    setOverride(db, { table: 'materials', id: 'mat-x', field: 'pricePerKg', value: 5 }, 't', 'a');
    expect(getOverrides(db)).toHaveLength(1);
    // upsert on same table|id|field updates in place
    setOverride(db, { table: 'materials', id: 'mat-x', field: 'pricePerKg', value: 9 }, 't2', 'a');
    const ovs = getOverrides(db);
    expect(ovs).toHaveLength(1);
    expect(ovs[0].value).toBe(9);
    expect(deleteOverride(db, 'materials', 'mat-x', 'pricePerKg')).toBe(true);
    expect(getOverrides(db)).toHaveLength(0);
    expect(deleteOverride(db, 'materials', 'mat-x', 'pricePerKg')).toBe(false);
  });

  it('keeps different fields/rows as separate overrides and clears all', () => {
    setOverride(db, { table: 'materials', id: 'a', field: 'pricePerKg', value: 1 }, 't', 'u');
    setOverride(db, { table: 'machines', id: 'a', field: 'buildup.energy', value: 2 }, 't', 'u');
    expect(getOverrides(db)).toHaveLength(2);
    clearOverrides(db);
    expect(getOverrides(db)).toHaveLength(0);
  });
});

/**
 * Rate history — the thing that makes a costing reproducible.
 *
 * The library was one row, overwritten in place: change a rate and the book
 * that produced last quarter's numbers was gone, so a bulk run could be
 * explained but never re-derived. That is what blocked using the output for
 * anything audited.
 */
describe('rate-library store — history', () => {
  const withRate = (price: number) => ({
    ...DEFAULT_RATE_LIBRARY,
    materials: DEFAULT_RATE_LIBRARY.materials.map((m, i) => (i === 0 ? { ...m, pricePerKg: price } : m)),
  });

  it('keeps the old book when a new one is stored', () => {
    setCompanyLibrary(db, withRate(1), '2026-01-01', 'a@x');
    setCompanyLibrary(db, withRate(2), '2026-02-01', 'a@x');
    const versions = listRateLibraryVersions(db, 'company');
    expect(versions).toHaveLength(2);
    expect(versions[0].versionNo).toBe(2);          // newest first
    expect(versions[1].versionNo).toBe(1);
  });

  it('takes a stored book back by its fingerprint', () => {
    const v1 = setCompanyLibrary(db, withRate(1), '2026-01-01', 'a@x');
    setCompanyLibrary(db, withRate(2), '2026-02-01', 'a@x');
    const recovered = getRateLibraryVersion(db, v1.id);
    expect(recovered?.materials[0].pricePerKg).toBe(1);   // the OLD price, not the current one
  });

  it('does not churn the history when the same sheet is re-stored', () => {
    const a = setCompanyLibrary(db, withRate(1), '2026-01-01', 'a@x');
    const b = setCompanyLibrary(db, withRate(1), '2026-03-01', 'b@x');
    expect(b.id).toBe(a.id);
    expect(b.versionNo).toBe(a.versionNo);
    expect(listRateLibraryVersions(db, 'company')).toHaveLength(1);
  });

  it('lets the same content live under two library ids', () => {
    // An uploaded sheet with no cell overrides IS the resolved active book, so
    // the same fingerprint legitimately appears twice. A bare primary key on
    // the fingerprint made the second insert throw.
    setCompanyLibrary(db, withRate(1), '2026-01-01', 'a@x');
    expect(() => recordRateLibraryVersion(db, 'active', withRate(1), '2026-01-01', 'a@x', 'resolved'))
      .not.toThrow();
    expect(listRateLibraryVersions(db, 'active')).toHaveLength(1);
    expect(listRateLibraryVersions(db, 'company')).toHaveLength(1);
  });
});

describe('rate-library fingerprint', () => {
  it('is the same for the same rates however the object was built', () => {
    const a = { ...DEFAULT_RATE_LIBRARY };
    const b = JSON.parse(JSON.stringify(DEFAULT_RATE_LIBRARY));
    expect(fingerprintRateLibrary(b)).toBe(fingerprintRateLibrary(a));
  });

  it('ignores lastModified, which is a timestamp and not a rate', () => {
    // The upload route stamps it with `now`; including it would make the same
    // sheet fingerprint differently on every upload.
    const a = { ...DEFAULT_RATE_LIBRARY, lastModified: '2026-01-01' };
    const b = { ...DEFAULT_RATE_LIBRARY, lastModified: '2026-09-09' };
    expect(fingerprintRateLibrary(b)).toBe(fingerprintRateLibrary(a));
  });

  it('changes when a single rate changes', () => {
    const a = DEFAULT_RATE_LIBRARY;
    const b = { ...a, materials: a.materials.map((m, i) => (i === 0 ? { ...m, pricePerKg: m.pricePerKg + 0.01 } : m)) };
    expect(fingerprintRateLibrary(b)).not.toBe(fingerprintRateLibrary(a));
  });
});

/**
 * Every admin mutation records a version — including the reset.
 *
 * `/reset` was declared `(_req, res)` and then referenced `req.user` in its
 * body. The three state changes ran, the snapshot threw, and the route answered
 * 500: an admin pressing "Reset to built-in" saw an error for an action that
 * had in fact worked, and the audit trail lost the entry. Typecheck did not
 * catch it — `req` resolved to something ambient — so this asserts the shape of
 * every handler that snapshots instead of trusting the compiler.
 */
describe('the admin routes can all reach req.user', () => {
  it('never snapshots from a handler whose request is discarded', () => {
    const src = readFileSync(new URL('../server/routes/rate-library.ts', import.meta.url), 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('snapshotActive(')) continue;
      // Walk back to the handler this call sits in.
      let sig = '';
      for (let j = i; j >= 0; j--) {
        if (/^router\.(post|put|delete|get)\(/.test(lines[j])) { sig = lines[j]; break; }
      }
      if (!sig) continue;
      expect(sig.includes('_req'),
        `line ${i + 1} snapshots but its handler discards the request: ${sig.trim().slice(0, 70)}`)
        .toBe(false);
    }
  });
});
