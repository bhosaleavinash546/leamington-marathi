import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getCompanyLibrary, setCompanyLibrary, clearCompanyLibrary,
  getRateSource, setRateSource, getOverrides, setOverride, deleteOverride, clearOverrides,
} from '../server/data/rate-library-store.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE rate_library (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE rate_overrides (id TEXT PRIMARY KEY, tbl TEXT NOT NULL, row_id TEXT NOT NULL, field TEXT NOT NULL, value REAL NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
