/**
 * KPI dashboard at a realistic volume: 50,000 saved costings (a large OEM's several years
 * of should-costing) through the engine, and 20,000 through the SQLite store. The limits
 * are generous so CI noise does not fail them; the measured times are printed.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildDashboard, classifyRecords, selectRecords, parseRecordQuery, DEFAULT_FILTERS, type KpiRecord } from '../src/engine/kpi-dashboard';
import { ensureKpiTables, insertRecord, listRecords, fxContext, type RecordInput } from '../server/data/kpi-store';

const COMS = ['Casting', 'Machining', 'Forging', 'Injection moulding', 'PCBA', 'Pressed sheet metal', 'Rubber', 'Composites'];
const PROGS = ['L460', 'L461', 'L663', 'EMA', 'JEA'];
const PTS = ['MHEV', 'Petrol PHEV', 'Diesel PHEV', 'Petrol', 'BEV'];
const CCY = ['GBP', 'EUR', 'USD', 'INR', 'CNY'];
const RATE: Record<string, number> = { GBP: 1, EUR: 0.84, USD: 0.75, INR: 0.0091, CNY: 0.105 };

function synth(n: number): KpiRecord[] {
  const out: KpiRecord[] = [];
  for (let i = 0; i < n; i++) {
    const c = CCY[i % 5]; const should = 5 + (i % 97); const cur = should * (0.9 + (i % 7) * 0.05);
    const day = new Date(Date.UTC(2025, 11, 1) + (i % 340) * 86400000).toISOString().slice(0, 10);
    out.push({
      id: `r${i}`, sourceTool: i % 3 ? 'CostVision' : 'CSS System', sourceRef: `s${i}`, ownerId: `u${i % 40}`, ownerName: `User ${i % 40}`,
      partNumber: `LR${i % 12000}`, componentName: `Part ${i}`, commodity: COMS[i % 8], programme: PROGS[i % 5], modelYear: 2025 + (i % 4),
      powertrain: PTS[i % 5], country: 'UK', status: (['draft', 'completed', 'reviewed', 'approved'] as const)[i % 4], costingDate: day,
      createdAt: day + 'T00:00:00Z', updatedAt: day + 'T00:00:00Z', shouldCost: should, shouldCcy: 'GBP', shouldTerms: 'DAP',
      currentCost: cur / RATE[c], currentCcy: c, currentTerms: 'DAP', currentSource: 'quote', costUnit: 'piece',
      annualVolume: 10000, volumeValidated: i % 2 === 0, savingStatus: null, savingPerPiece: null, savingCcy: null,
      fx: {}, gbpShould: should, gbpCurrent: cur, gbpSaving: null, isTest: false, deleted: false, notes: '',
    });
  }
  return out;
}

describe('KPI dashboard performance', () => {
  it('builds the full dashboard for 50,000 records in well under the request budget', () => {
    const recs = synth(50_000);
    const t0 = performance.now();
    const d = buildDashboard(recs, DEFAULT_FILTERS, { today: '2026-11-11', nowIso: '2026-11-11T00:00:00Z', fxPolicy: 'monthly', approvedRates: 0, referenceLabel: 'r' });
    const t1 = performance.now();
    const all = classifyRecords(recs);
    const page = selectRecords(all, { ...DEFAULT_FILTERS, commodity: ['Casting'] }, parseRecordQuery({ sort: 'gapGbp', search: 'LR1' }), '2026-11-11');
    const t2 = performance.now();
    console.log(`[perf] 50k dashboard ${(t1 - t0).toFixed(0)} ms, filtered+searched+sorted table ${(t2 - t1).toFixed(0)} ms`);
    expect(d.operational.totalRecords).toBeGreaterThan(40_000);
    expect(page.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(8000);
    expect(t2 - t1).toBeLessThan(8000);
  });

  it('stores and reads 20,000 records through SQLite', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT); CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    ensureKpiTables(db);
    const ctx = fxContext(db, '2026-11-11T00:00:00Z');
    const t0 = performance.now();
    db.transaction(() => {
      for (const r of synth(20_000)) {
        const input: RecordInput = { ...r, ownerLabel: r.ownerName, sourceTool: r.sourceTool, sourceRef: r.sourceRef };
        insertRecord(db, input, ctx, r.id);
      }
    })();
    const t1 = performance.now();
    const back = listRecords(db);
    const t2 = performance.now();
    console.log(`[perf] 20k inserts ${(t1 - t0).toFixed(0)} ms, read ${(t2 - t1).toFixed(0)} ms`);
    expect(back).toHaveLength(20_000);
    // every non-GBP current cost was frozen through the reference (no approved table loaded)
    expect(back.filter(r => r.currentCcy !== 'GBP').every(r => r.fx.current && r.fx.current.approved === false)).toBe(true);
    expect(t2 - t1).toBeLessThan(8000);
  });
});
