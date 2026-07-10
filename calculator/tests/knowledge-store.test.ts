import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ensureKnowledgeTable, upsertCase, listCases, recordActual, knowledgeStats } from '../server/data/knowledge-store.js';

let db: Database.Database;
beforeEach(() => { db = new Database(':memory:'); ensureKnowledgeTable(db); });

const bracket = {
  partName: 'AL Bracket', totalCost: 40.5, currency: 'GBP',
  fingerprint: { commodity: 'machining', materialId: 'mat-al6061', materialFamily: 'Aluminium', netWeightKg: 0.85 },
  breakdown: { rawMaterial: 12, process: 18 },
};

describe('knowledge store', () => {
  it('inserts a case and reads it back with fingerprint + breakdown intact', () => {
    upsertCase(db, 'u1', bracket, 1000);
    const cases = listCases(db);
    expect(cases).toHaveLength(1);
    expect(cases[0].fingerprint.materialFamily).toBe('Aluminium');
    expect(cases[0].breakdown?.process).toBe(18);
  });

  it('upserts by (part, commodity) — recalculating updates, not duplicates', () => {
    upsertCase(db, 'u1', bracket, 1000);
    upsertCase(db, 'u2', { ...bracket, totalCost: 42.1 }, 2000);          // another user, same part
    const cases = listCases(db);
    expect(cases).toHaveLength(1);
    expect(cases[0].totalCost).toBe(42.1);
    // name normalisation: case/whitespace-insensitive key
    upsertCase(db, 'u1', { ...bracket, partName: '  al   bracket ' , totalCost: 43 }, 3000);
    expect(listCases(db)).toHaveLength(1);
  });

  it('an upsert without actualCost preserves a previously logged actual', () => {
    upsertCase(db, 'u1', { ...bracket, actualCost: 44 }, 1000);
    upsertCase(db, 'u1', { ...bracket, totalCost: 41 }, 2000);            // recalc, no actual passed
    expect(listCases(db)[0].actualCost).toBe(44);
  });

  it('recordActual attaches a real price and stats count it', () => {
    upsertCase(db, 'u1', bracket, 1000);
    upsertCase(db, 'u1', { ...bracket, partName: 'Housing', fingerprint: { ...bracket.fingerprint, commodity: 'casting' } }, 1000);
    expect(recordActual(db, 'AL Bracket', 'machining', 44.2)).toBe(true);
    expect(recordActual(db, 'Nope', 'machining', 9)).toBe(false);
    const s = knowledgeStats(db);
    expect(s.total).toBe(2);
    expect(s.withActuals).toBe(1);
    expect(s.byCommodity.machining).toBe(1);
    expect(s.byCommodity.casting).toBe(1);
  });

  it('listCases filters by commodity', () => {
    upsertCase(db, 'u1', bracket, 1000);
    upsertCase(db, 'u1', { ...bracket, partName: 'Housing', fingerprint: { ...bracket.fingerprint, commodity: 'casting' } }, 1000);
    expect(listCases(db, 'machining')).toHaveLength(1);
    expect(listCases(db, 'casting')[0].partName).toBe('Housing');
  });

  it('userAdjusted is sticky once set (a correction is knowledge)', () => {
    upsertCase(db, 'u1', { ...bracket, userAdjusted: true }, 1000);
    upsertCase(db, 'u1', bracket, 2000);
    expect(listCases(db)[0].userAdjusted).toBe(true);
  });
});

describe('drift dismissals', () => {
  it('dismissing a finding keeps it closed; keys are kind+part+commodity scoped', async () => {
    const { ensureDriftTable, dismissFinding, isDismissed } = await import('../server/data/knowledge-store.js');
    ensureDriftTable(db);
    expect(isDismissed(db, 'AL Bracket', 'machining', 'renegotiation')).toBe(false);
    dismissFinding(db, 'AL Bracket', 'machining', 'renegotiation');
    expect(isDismissed(db, 'AL Bracket', 'machining', 'renegotiation')).toBe(true);
    // different kind for the same part stays open
    expect(isDismissed(db, 'AL Bracket', 'machining', 'underwater')).toBe(false);
    // name normalisation matches the case key rules
    expect(isDismissed(db, '  al   bracket ', 'machining', 'renegotiation')).toBe(true);
  });
});
