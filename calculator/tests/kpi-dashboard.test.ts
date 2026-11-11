/**
 * KPI dashboard reporting model — every expected figure below is worked by hand from the
 * fixture (comments show the arithmetic), never read back from the code under test.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDashboard, classifyRecords, resolveFx, toGbp, dateWindow, parseFilters, selectRecords,
  parseRecordQuery, pageOf, drillGroups, recordsCsv, DEFAULT_FILTERS, normalisePartNumber,
  isIsoCurrency, type KpiRecord, type FxApplied, type FxRateRow,
} from '../src/engine/kpi-dashboard';

const TODAY = '2026-11-11';
const NOW = '2026-11-11T09:00:00.000Z';
const OPTS = { today: TODAY, nowIso: NOW, fxPolicy: 'monthly' as const, approvedRates: 0, referenceLabel: 'ref' };

const fx = (currency: string, gbpPerUnit: number, approved = true): FxApplied =>
  ({ currency, gbpPerUnit, source: 'test', effectiveDate: '2026-10', retrievedAt: NOW, method: currency === 'GBP' ? 'identity' : 'monthly', approved });

let seq = 0;
function rec(p: Partial<KpiRecord> & { shouldCost?: number | null; currentCost?: number | null }): KpiRecord {
  const shouldCcy = p.shouldCcy ?? (p.shouldCost === null || p.shouldCost === undefined ? null : 'GBP');
  const currentCcy = p.currentCcy ?? (p.currentCost === null || p.currentCost === undefined ? null : 'GBP');
  const fxS = p.fx?.should ?? (shouldCcy ? fx(shouldCcy, shouldCcy === 'GBP' ? 1 : NaN) : null);
  const fxC = p.fx?.current ?? (currentCcy ? fx(currentCcy, currentCcy === 'GBP' ? 1 : NaN) : null);
  const base: KpiRecord = {
    id: `r${++seq}`, sourceTool: 'CostVision', sourceRef: `sc-${seq}`, ownerId: 'u1', ownerName: 'User One',
    partNumber: null, componentName: 'Part', commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV',
    country: 'UK', status: 'completed', costingDate: '2026-06-01', createdAt: '2026-06-01T10:00:00Z', updatedAt: '2026-06-01T10:00:00Z',
    shouldCost: null, shouldCcy: null, shouldTerms: 'DAP', currentCost: null, currentCcy: null, currentTerms: 'DAP', currentSource: 'quote',
    costUnit: 'piece', annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null,
    fx: {}, gbpShould: null, gbpCurrent: null, gbpSaving: null, isTest: false, deleted: false, notes: '',
  };
  const r = { ...base, ...p, shouldCcy, currentCcy } as KpiRecord;
  r.fx = { should: fxS, current: fxC, saving: p.fx?.saving ?? null };
  r.gbpShould = p.gbpShould !== undefined ? p.gbpShould : toGbp(r.shouldCost, fxS);
  r.gbpCurrent = p.gbpCurrent !== undefined ? p.gbpCurrent : toGbp(r.currentCost, fxC);
  r.gbpSaving = p.gbpSaving !== undefined ? p.gbpSaving : toGbp(r.savingPerPiece, r.fx.saving);
  return r;
}

function fixture(): KpiRecord[] {
  seq = 0;
  return [
    // A0 / A1 / A2 — one application (P-100 · L460 · 2027 · BEV)
    rec({ id: 'A0', partNumber: 'P-100', costingDate: '2026-03-01', shouldCost: 9, currentCost: 12 }),
    rec({ id: 'A1', partNumber: 'p 100'.replace(' ', '-'), costingDate: '2026-06-01', shouldCost: 10, currentCost: 12 }),
    rec({ id: 'A2', partNumber: 'P-100', ownerId: 'u2', ownerName: 'User Two', costingDate: '2026-05-01', shouldCost: 11, currentCost: 12 }),
    // B — EUR current cost at 0.85: 100 × 0.85 = £85; gap 85 − 20 = 65; × 1,000 validated = 65,000
    rec({ id: 'B', partNumber: 'P-200', programme: 'L461', powertrain: 'MHEV', commodity: 'Machining', ownerId: 'u2', ownerName: 'User Two',
      status: 'approved', costingDate: '2026-09-10', shouldCost: 20, currentCost: 100, currentCcy: 'EUR',
      fx: { current: fx('EUR', 0.85), saving: fx('EUR', 0.85) }, annualVolume: 1000, volumeValidated: true,
      savingStatus: 'validated', savingPerPiece: 5, savingCcy: 'EUR' }),
    // C — unfavourable: 40 − 50 = −10
    rec({ id: 'C', partNumber: 'P-300', programme: 'L663', modelYear: 2026, powertrain: 'Petrol', commodity: 'Machining', status: 'reviewed', costingDate: '2026-10-01', shouldCost: 50, currentCost: 40 }),
    // D — draft, no current cost
    rec({ id: 'D', partNumber: 'P-400', programme: 'EMA', modelYear: 2028, status: 'draft', costingDate: '2026-10-20', shouldCost: 5 }),
    // E — both in INR at 0.0095: should 1000 → £9.50, current 1200 → £11.40; gap £1.90; EXW both
    rec({ id: 'E', partNumber: 'P-500', programme: 'JEA', modelYear: 2028, commodity: 'PCB', ownerId: 'u2', ownerName: 'User Two', costingDate: '2026-10-05',
      shouldCost: 1000, shouldCcy: 'INR', currentCost: 1200, currentCcy: 'INR', shouldTerms: 'EXW', currentTerms: 'EXW',
      fx: { should: fx('INR', 0.0095), current: fx('INR', 0.0095) }, annualVolume: 5000, volumeValidated: false }),
    // F — basis mismatch (DAP should v EXW current)
    rec({ id: 'F', partNumber: 'P-600', costingDate: '2026-08-01', shouldCost: 10, currentCost: 11, currentTerms: 'EXW' }),
    // G — invalid currency code
    rec({ id: 'G', partNumber: 'P-700', costingDate: '2026-08-01', shouldCost: 10, currentCost: 15, currentCcy: 'ABC', gbpCurrent: null }),
    rec({ id: 'H', partNumber: 'P-710', costingDate: '2026-08-01', shouldCost: 10, currentCost: 15, isTest: true }),
    rec({ id: 'I', partNumber: 'P-720', costingDate: '2026-08-01', shouldCost: 10, currentCost: 15, deleted: true }),
    // J — no part number: own application, flagged unidentified; gap 4 − 3 = 1
    rec({ id: 'J', componentName: 'Bracket', costingDate: '2026-07-01', shouldCost: 3, currentCost: 4 }),
    // K — outside the 12-month window
    rec({ id: 'K', partNumber: 'P-800', costingDate: '2025-01-01', shouldCost: 1, currentCost: 2 }),
    // L — VND current cost with no rate
    rec({ id: 'L', partNumber: 'P-900', costingDate: '2026-07-15', shouldCost: 7, currentCost: 50000, currentCcy: 'VND', gbpCurrent: null }),
  ];
}

describe('classification', () => {
  const c = classifyRecords(fixture());
  const by = (id: string) => c.find(r => r.id === id)!;

  it('picks the newest non-draft as current; same owner = superseded, other owner = duplicate', () => {
    expect(by('A1').role).toBe('current');
    expect(by('A0').role).toBe('superseded');
    expect(by('A2').role).toBe('duplicate');
    expect(by('A2').duplicateOf).toBe('A1');
  });
  it('excludes deleted, test and invalid records with a reason', () => {
    expect(by('G').excluded).toBe('invalid');
    expect(by('G').invalidReasons.join()).toMatch(/currency "ABC"/);
    expect(by('H').excluded).toBe('test');
    expect(by('I').excluded).toBe('deleted');
  });
  it('never treats a missing value as zero', () => {
    expect(by('D').ineligible).toBe('missing-current-cost');
    expect(by('D').gapGbp).toBeNull();
    expect(by('L').ineligible).toBe('missing-fx');
    expect(by('F').ineligible).toBe('basis-mismatch');
  });
  it('a record without a part number is its own application — never merged by name', () => {
    const twins = classifyRecords([rec({ id: 'x1', componentName: 'Bracket', shouldCost: 1, currentCost: 2 }), rec({ id: 'x2', componentName: 'Bracket', shouldCost: 1, currentCost: 2 })]);
    expect(twins.map(r => r.role)).toEqual(['current', 'current']);
  });
  it('the same part on two programmes is two applications', () => {
    const two = classifyRecords([rec({ id: 'p1', partNumber: 'Q1', programme: 'L460', shouldCost: 1 }), rec({ id: 'p2', partNumber: 'Q1', programme: 'L461', shouldCost: 1 })]);
    expect(two.every(r => r.role === 'current')).toBe(true);
  });
  it("an owner's own older costing is a revision even when another user's is current", () => {
    const r = classifyRecords([
      rec({ id: 'a-old', partNumber: 'K', ownerId: 'u1', costingDate: '2026-01-01', shouldCost: 1 }),
      rec({ id: 'a-new', partNumber: 'K', ownerId: 'u1', costingDate: '2026-02-01', shouldCost: 1 }),
      rec({ id: 'b', partNumber: 'K', ownerId: 'u2', costingDate: '2026-03-01', shouldCost: 1 }),
    ]);
    const role = (id: string) => r.find(x => x.id === id)!.role;
    expect([role('b'), role('a-new'), role('a-old')]).toEqual(['current', 'duplicate', 'superseded']);
  });
  it('a newer draft does not displace a completed costing', () => {
    const r = classifyRecords([
      rec({ id: 'done', partNumber: 'Z', status: 'approved', costingDate: '2026-01-01', shouldCost: 1 }),
      rec({ id: 'wip', partNumber: 'Z', status: 'draft', costingDate: '2026-10-01', shouldCost: 2 }),
    ]);
    expect(r.find(x => x.id === 'done')!.role).toBe('current');
    expect(r.find(x => x.id === 'wip')!.role).toBe('superseded');
  });
  it('part numbers normalise case and spaces only', () => {
    expect(normalisePartNumber(' ab 12-c ')).toBe('AB12-C');
    expect(normalisePartNumber('')).toBeNull();
  });
});

describe('KPIs (hand-reconciled)', () => {
  const d = buildDashboard(fixture(), DEFAULT_FILTERS, OPTS);

  it('financial: Σ current £152.40, Σ should £92.50, weighted gap', () => {
    // Eligible current: A1 (12, 10), B (85, 20), C (40, 50), E (11.40, 9.50), J (4, 3)
    // Σ current = 12 + 85 + 40 + 11.40 + 4 = 152.40 ; Σ should = 10 + 20 + 50 + 9.50 + 3 = 92.50
    expect(d.financial.eligible).toBe(5);
    expect(d.financial.sumCurrentGbp).toBeCloseTo(152.40, 9);
    expect(d.financial.sumShouldGbp).toBeCloseTo(92.50, 9);
    expect(d.financial.sumGapGbp).toBeCloseTo(59.90, 9);
    // weighted, not the mean of percentages: 59.90 / 152.40 = 39.304…%
    expect(d.financial.weightedGapPct!).toBeCloseTo((59.9 / 152.4) * 100, 9);
    // opportunity = 2 + 65 + 1.90 + 1 = 69.90 (4); unfavourable = −10 (1)
    expect(d.financial.opportunity).toEqual({ n: 4, gbp: expect.closeTo(69.9, 9) });
    expect(d.financial.unfavourable).toEqual({ n: 1, gbp: -10 });
    // annualised only where the volume is validated: B 65 × 1,000; E's 5,000 is not validated
    expect(d.financial.annualised).toEqual({ n: 1, gbp: 65000 });
    // validated saving: 5 EUR × 0.85 = 4.25
    expect(d.financial.validatedSavings.n).toBe(1);
    expect(d.financial.validatedSavings.gbp).toBeCloseTo(4.25, 9);
    expect(d.financial.implementedSavings).toEqual({ n: 0, gbp: 0 });
  });

  it('operational', () => {
    // in window, not excluded: A0 A1 A2 B C D E F J L = 10; current: A1 B C D E F J L = 8
    expect(d.operational.totalRecords).toBe(10);
    expect(d.operational.currentRecords).toBe(8);
    expect(d.operational.uniqueComponents).toBe(7); // P-100 200 300 400 500 600 900
    expect(d.operational.unidentified).toBe(1);     // J
    expect(d.operational.completedRecords).toBe(7); // all current but D (draft)
    expect(d.operational.commodities).toBe(3);      // Casting, Machining, PCB
    expect(d.operational.programmes).toBe(5);       // L460 L461 L663 EMA JEA
    expect(d.operational.awaitingReview).toBe(5);   // completed: A1 E F J L
    expect(d.operational.awaitingApproval).toBe(1); // reviewed: C
    expect(d.operational.needsReview).toBe(6);
  });

  it('data quality', () => {
    const q = d.dataQuality;
    expect(q.retrieved).toBe(13); // 10 included + G H I
    expect(q.excluded).toBe(3);
    expect(q.excludedBy).toEqual({ deleted: 1, test: 1, invalid: 1 });
    expect(q.financiallyEligible).toBe(5);
    expect(q.missingCurrentCost).toBe(1);
    expect(q.missingFx).toBe(1);
    expect(q.basisMismatch).toBe(1);
    expect(q.duplicateCandidates).toBe(1);
    expect(q.supersededRevisions).toBe(1);
    expect(q.missingClassification.partNumber).toBe(1);
  });

  it('original-currency totals never add currencies together', () => {
    const t = Object.fromEntries(d.currencyTotals.map(x => [x.currency, x]));
    expect(Object.keys(t).sort()).toEqual(['EUR', 'GBP', 'INR', 'VND']);
    // GBP current: A1 12, C 40, F 11, J 4
    expect(t.GBP.currentRecords).toBe(4); expect(t.GBP.sumCurrent).toBe(67);
    // GBP should: A1 10, B 20, C 50, D 5, F 10, J 3, L 7
    expect(t.GBP.shouldRecords).toBe(7); expect(t.GBP.sumShould).toBe(105);
    // same-currency, same-basis gap in GBP: A1 +2, C −10, J +1 (F differs in terms)
    expect(t.GBP.sameCcyRecords).toBe(3); expect(t.GBP.sumGap).toBe(-7);
    expect(t.INR).toMatchObject({ sumCurrent: 1200, sumShould: 1000, sameCcyRecords: 1, sumGap: 200 });
    expect(t.EUR).toMatchObject({ currentRecords: 1, sumCurrent: 100, shouldRecords: 0 });
  });

  it('charts reconcile with the KPIs', () => {
    const opp = d.charts.opportunityByCommodity.reduce((s, r) => s + r.opportunityGbp!, 0);
    expect(opp).toBeCloseTo(d.financial.opportunity.gbp, 9);
    const cur = d.charts.costByCommodity.reduce((s, r) => s + r.currentGbp!, 0);
    expect(cur).toBeCloseTo(d.financial.sumCurrentGbp, 9);
    expect(d.charts.byCommodity.reduce((s, r) => s + r.count, 0)).toBe(d.operational.totalRecords);
    expect(d.charts.byStatus.reduce((s, r) => s + r.count, 0)).toBe(d.operational.currentRecords);
    expect(d.charts.heatmap.cells.reduce((s, c) => s + c.count, 0)).toBe(d.operational.currentRecords);
    expect(d.charts.activity.reduce((s, p) => s + p.count, 0)).toBe(d.operational.totalRecords);
    expect(d.charts.byProgramme.map(r => r.key).slice(0, 5)).toEqual(['L460', 'L461', 'L663', 'EMA', 'JEA']);
  });

  it('a filter never promotes an old revision to current', () => {
    const f = buildDashboard(fixture(), { ...DEFAULT_FILTERS, createdBy: ['User Two'] }, OPTS);
    // u2 owns A2 (duplicate of A1), B and E (current) → eligible B and E only
    expect(f.financial.eligible).toBe(2);
    expect(f.financial.sumGapGbp).toBeCloseTo(65 + 1.9, 9);
    expect(f.dataQuality.duplicateCandidates).toBe(1);
  });

  it('currency filter matches either original currency', () => {
    const f = buildDashboard(fixture(), { ...DEFAULT_FILTERS, currency: ['EUR'] }, OPTS);
    expect(f.operational.totalRecords).toBe(1);
  });

  it('options are read from the data with faceted counts', () => {
    const progs = d.options.programme.map(o => o.value);
    expect(progs.slice(0, 5)).toEqual(['L460', 'L461', 'L663', 'EMA', 'JEA']);
    expect(d.options.currency.map(o => o.value)).toContain('VND');
  });

  it('insights state only what the data shows', () => {
    const ids = d.insights.map(i => i.id);
    expect(ids).toContain('top-opportunity');
    expect(d.insights.find(i => i.id === 'top-opportunity')!.detail).toMatch(/Not an annual saving/);
    expect(buildDashboard([], DEFAULT_FILTERS, OPTS).insights).toEqual([]);
  });
});

describe('FX', () => {
  const table: FxRateRow[] = [
    { currency: 'EUR', period: '2026-10', gbpPerUnit: 0.86, source: 'JLR Treasury Oct', loadedAt: NOW },
    { currency: 'EUR', period: '2026-11', gbpPerUnit: 0.87, source: 'JLR Treasury Nov', loadedAt: NOW },
    { currency: 'USD', period: '2026-10-01', gbpPerUnit: 0.75, source: 'daily', loadedAt: NOW },
    { currency: 'USD', period: '2026-10-20', gbpPerUnit: 0.76, source: 'daily', loadedAt: NOW },
  ];
  const ref = { rates: { EUR: 0.8358, JPY: 0.005 }, source: 'Built-in reference', effectiveDate: '2026-10-30' };

  it('monthly policy takes the costing month', () => {
    const r = resolveFx('EUR', '2026-10-15', 'monthly', table, ref, NOW);
    expect(r).toMatchObject({ ok: true, fx: { gbpPerUnit: 0.86, approved: true, effectiveDate: '2026-10' } });
  });
  it('costing-date policy takes the latest daily rate on or before the date', () => {
    expect(resolveFx('USD', '2026-10-19', 'costing-date', table, ref, NOW)).toMatchObject({ ok: true, fx: { gbpPerUnit: 0.75 } });
    expect(resolveFx('USD', '2026-10-20', 'costing-date', table, ref, NOW)).toMatchObject({ ok: true, fx: { gbpPerUnit: 0.76 } });
  });
  it('reporting-date policy takes the latest loaded rate', () => {
    expect(resolveFx('EUR', '2026-01-01', 'reporting-date', table, ref, NOW)).toMatchObject({ ok: true, fx: { gbpPerUnit: 0.87 } });
  });
  it('falls back to the built-in reference, labelled not approved', () => {
    const r = resolveFx('JPY', '2026-10-15', 'monthly', table, ref, NOW);
    expect(r).toMatchObject({ ok: true, fx: { gbpPerUnit: 0.005, approved: false, source: 'Built-in reference' } });
  });
  it('never 1:1 — unsupported or rateless currencies are flagged', () => {
    expect(resolveFx('ABC', '2026-10-15', 'monthly', table, ref, NOW)).toEqual({ ok: false, reason: 'unsupported-currency' });
    expect(resolveFx('MNT', '2026-10-15', 'monthly', table, ref, NOW)).toEqual({ ok: false, reason: 'no-rate' });
    expect(resolveFx('GBP', '2026-10-15', 'monthly', table, ref, NOW)).toMatchObject({ ok: true, fx: { gbpPerUnit: 1, method: 'identity' } });
  });
  it('ISO 4217 comes from the runtime, not a hand list', () => {
    expect(isIsoCurrency('VND')).toBe(true);
    expect(isIsoCurrency('MNT')).toBe(true);
    expect(isIsoCurrency('ABC')).toBe(false);
    expect(isIsoCurrency('gbp')).toBe(false);
  });
});

describe('filters, table, drill, CSV', () => {
  it('12 months runs from the day after a year ago to today', () => {
    expect(dateWindow({ datePreset: '12m' }, TODAY)).toEqual({ from: '2025-11-12', to: TODAY });
    expect(dateWindow({ datePreset: '7d' }, TODAY)).toEqual({ from: '2026-11-05', to: TODAY });
    expect(dateWindow({ datePreset: 'ytd' }, TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(dateWindow({ datePreset: 'all' }, TODAY)).toEqual({ from: null, to: null });
  });
  it('parses untrusted filters', () => {
    const f = parseFilters({ commodity: ['Casting', 'Machining'], programme: 'Body, trim', datePreset: 'evil', status: [1, 'draft'], junk: 'x' });
    expect(f.commodity).toEqual(['Casting', 'Machining']);
    expect(f.programme).toEqual(['Body, trim']);
    expect(f.datePreset).toBe('12m');
    expect(f.status).toEqual(['draft']);
    expect((f as unknown as Record<string, unknown>).junk).toBeUndefined();
  });
  it('sorts with nulls last and pages', () => {
    const all = classifyRecords(fixture());
    const q = parseRecordQuery({ sort: 'gapGbp', dir: 'desc', pageSize: '5' });
    const rows = selectRecords(all, DEFAULT_FILTERS, q, TODAY);
    expect(rows.map(r => r.id).slice(0, 5)).toEqual(['B', 'A1', 'E', 'J', 'C']);
    expect(rows.slice(-3).every(r => r.gapGbp === null)).toBe(true);
    const p = pageOf(rows, 2, 5);
    expect(p).toMatchObject({ total: 8, page: 2, pages: 2 });
    expect(p.rows).toHaveLength(3);
  });
  it('excluded scope lists only excluded records', () => {
    const all = classifyRecords(fixture());
    const rows = selectRecords(all, DEFAULT_FILTERS, parseRecordQuery({ scope: 'excluded' }), TODAY);
    expect(rows.map(r => r.id).sort()).toEqual(['G', 'H', 'I']);
  });
  it('drills commodity → programme → powertrain → model year → component', () => {
    const all = classifyRecords(fixture());
    const l1 = drillGroups(all, DEFAULT_FILTERS, {}, TODAY);
    expect(l1.level).toBe('commodity');
    const mach = l1.groups.find(g => g.key === 'Machining')!;
    expect(mach.opportunityGbp).toBe(65);
    const l2 = drillGroups(all, DEFAULT_FILTERS, { commodity: 'Machining' }, TODAY);
    expect(l2.level).toBe('programme');
    expect(l2.groups.map(g => g.key).sort()).toEqual(['L461', 'L663']);
    const l5 = drillGroups(all, DEFAULT_FILTERS, { commodity: 'Machining', programme: 'L461', powertrain: 'MHEV', modelYear: '2027' }, TODAY);
    expect(l5.level).toBe('component');
    expect(l5.groups[0]).toMatchObject({ key: 'P-200', count: 1 });
  });
  it('CSV escapes formula injection and quotes', () => {
    const r = classifyRecords([rec({ id: 'c1', componentName: '=HYPERLINK("x")', partNumber: 'A,1', shouldCost: 1 })]);
    const csv = recordsCsv(r);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"A,1"');
    expect(csv.startsWith('﻿Costing ID,')).toBe(true);
  });
});
