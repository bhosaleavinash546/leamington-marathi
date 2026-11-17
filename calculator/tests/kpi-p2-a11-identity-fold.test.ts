/**
 * Phase 2 · A-11 (P1, part): the part-number / programme-code folding function and the read-only dry
 * run of what it would group. The folded key is NOT switched on (grouping, identity and KPIs are
 * unchanged) — switching it on needs the user's approval (Stop 2).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { foldIdentityCode, normalisePartNumber, classifyRecords, type KpiRecord } from '../src/engine/kpi-dashboard';
import { identityDryRun, runDryRun } from '../scripts/kpi-identity-dry-run';
import { ensureKpiTables, insertRecord, fxContext, type RecordInput } from '../server/data/kpi-store';

const rec = (id: string, p: Partial<KpiRecord>): KpiRecord => ({
  id, sourceTool: 'CSS System', sourceRef: id, ownerId: 'u1', ownerName: 'U', partNumber: 'P-1', componentName: 'Part', commodity: 'Casting',
  programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'GB', status: 'completed', costingDate: '2026-10-01',
  createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', shouldCost: 5, shouldCcy: 'GBP', shouldTerms: 'DAP',
  currentCost: 6, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, costUnit: 'piece', annualVolume: null, volumeValidated: false,
  savingStatus: null, savingPerPiece: null, savingCcy: null, fx: {}, gbpShould: 5, gbpCurrent: 6, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
});

describe('A-11 foldIdentityCode', () => {
  it('LR-VAR-100, LRVAR100, LR_VAR_100, lr.var/100 and "LR VAR 100" give one key', () => {
    const keys = ['LR-VAR-100', 'LRVAR100', 'LR_VAR_100', 'lr.var/100', 'LR VAR 100', ' lr-var_100 '].map(foldIdentityCode);
    expect(new Set(keys)).toEqual(new Set(['LRVAR100']));
  });
  it('Q900 and q900 give one key', () => {
    expect(foldIdentityCode('Q900')).toBe(foldIdentityCode('q900'));
    expect(foldIdentityCode('q900')).toBe('Q900');
  });
  it('keeps every other character (letters, digits, other punctuation are not folded)', () => {
    expect(foldIdentityCode('LR-100A')).not.toBe(foldIdentityCode('LR-100B'));
    expect(foldIdentityCode('LR#100')).toBe('LR#100');
    expect(foldIdentityCode('LR+100')).not.toBe(foldIdentityCode('LR100'));
  });
  it('nothing left → null', () => {
    expect(foldIdentityCode(' -_./ ')).toBeNull();
    expect(foldIdentityCode('')).toBeNull();
    expect(foldIdentityCode(null)).toBeNull();
    expect(foldIdentityCode(undefined)).toBeNull();
  });
  it('is NOT switched on: normalisePartNumber and the application grouping are unchanged', () => {
    expect(normalisePartNumber('LR-VAR-100')).toBe('LR-VAR-100');
    expect(normalisePartNumber('lr var 100')).toBe('LRVAR100');
    const rs = classifyRecords([rec('a', { partNumber: 'LR-VAR-100' }), rec('b', { partNumber: 'LRVAR100' }), rec('c', { partNumber: 'LR_VAR_100' }),
      rec('d', { partNumber: 'P16', programme: 'Q900' }), rec('e', { partNumber: 'P16', programme: 'q900', ownerId: 'u2' })]);
    expect(rs.map(r => r.role)).toEqual(['current', 'current', 'current', 'current', 'current']);
  });
});

describe('A-11 dry run', () => {
  it('lists which records a folded key would group, and what would become current', () => {
    const recs = [
      rec('v1', { partNumber: 'LR-VAR-100', costingDate: '2026-10-01' }),
      rec('v2', { partNumber: 'LRVAR100', costingDate: '2026-10-02' }),
      rec('v3', { partNumber: 'LR_VAR_100', costingDate: '2026-10-03' }),
      rec('q1', { partNumber: 'P16-CASE', programme: 'Q900' }),
      rec('q2', { partNumber: 'P16-CASE', programme: 'q900', ownerId: 'u2', createdAt: '2026-10-01T10:00:00Z' }),
      rec('alone', { partNumber: 'LR-OTHER' }),
      rec('gone', { partNumber: 'LR.VAR.100', deleted: true }),
    ];
    const d = identityDryRun(recs);
    expect(d.summary).toMatchObject({ records: 7, includedRecords: 6, applicationsNow: 6, applicationsFolded: 3, mergingGroups: 2, recordsInMergingGroups: 5, currentRecordsNow: 6, currentRecordsFolded: 3 });
    const g = d.groups.find(x => x.foldedKey.startsWith('LRVAR100|'))!;
    expect(g.records.map(r => [r.id, r.partNumber, r.roleNow, r.roleFolded])).toEqual([
      ['v1', 'LR-VAR-100', 'current', 'superseded'], ['v2', 'LRVAR100', 'current', 'superseded'], ['v3', 'LR_VAR_100', 'current', 'current'],
    ]);
    expect(d.groups.find(x => x.foldedKey.startsWith('P16CASE|Q900|'))!.records.map(r => r.programme)).toEqual(['Q900', 'q900']);
    // an excluded (deleted / test / invalid) record is listed apart, never grouped
    expect(d.excludedRecordsWithFoldedMatch.map(r => r.id)).toEqual(['gone']);
  });

  it('the script opens the database read-only and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-kpi-p2-a11-'));
    const path = join(dir, 'dry-run.db');
    const db = new Database(path);
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT); CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    ensureKpiTables(db);
    const base: RecordInput = { sourceTool: 'CSS System', sourceRef: 'x', ownerId: 'u1', ownerLabel: 'U', partNumber: 'LR-VAR-100', componentName: 'P', commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'GB', status: 'completed', costingDate: '2026-10-01', shouldCost: 5, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 6, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null, isTest: false, notes: '' };
    const ctx = fxContext(db, '2026-11-17T00:00:00Z');
    insertRecord(db, base, ctx, 'r1');
    insertRecord(db, { ...base, sourceRef: 'y', partNumber: 'LRVAR100' }, ctx, 'r2');
    db.close();
    const before = { size: statSync(path).size, mtime: statSync(path).mtimeMs, bytes: readFileSync(path) };
    const out = await runDryRun(path);
    expect(out.summary).toMatchObject({ records: 2, mergingGroups: 1, recordsInMergingGroups: 2 });
    expect(statSync(path).size).toBe(before.size);
    expect(statSync(path).mtimeMs).toBe(before.mtime);
    expect(readFileSync(path).equals(before.bytes)).toBe(true);
    // fileMustExist + readonly: a path that does not exist is refused, never created
    await expect(runDryRun(join(dir, 'missing.db'))).rejects.toThrow();
  });
});
