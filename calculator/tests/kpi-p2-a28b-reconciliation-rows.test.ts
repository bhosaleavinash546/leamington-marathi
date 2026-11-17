/**
 * Phase 2 · A-28 (b) (P3): the Excel "Reconciliation" sheet re-adds EVERY headline figure from the exported records —
 * it lacked the annualised opportunity and the validated / implemented savings. "Costing records" now carries each
 * record's saving status and GBP saving, and three rows re-add those figures with live formulas, each with the
 * ✓ / ✗ check against the dashboard figure. (A-28 (a), a current cost of exactly 0, is NOT built: undecided.)
 * The LibreOffice recalculation (0 formula errors, every row ✓) is in phase2-evidence/A-28.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDashboard, classifyRecords, DEFAULT_FILTERS, toGbp, type KpiRecord, type FxApplied } from '../src/engine/kpi-dashboard';
import { buildExcel, type ExportRow } from '../src/ui/kpi-dashboard/kpi-export';

const NOW = '2026-11-11T09:00:00Z';
const fx = (c: string, r: number): FxApplied => ({ currency: c, gbpPerUnit: r, source: 'Treasury', effectiveDate: '2026-11', retrievedAt: NOW, method: c === 'GBP' ? 'identity' : 'monthly', approved: true });
function rec(id: string, p: Partial<KpiRecord>): KpiRecord {
  const r: KpiRecord = {
    id, sourceTool: 'CostVision', sourceRef: 'sc-' + id, ownerId: 'u1', ownerName: 'A', partNumber: 'P-' + id, componentName: 'Part',
    commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01',
    createdAt: NOW, updatedAt: NOW, shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: 'quote',
    costUnit: 'piece', annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null,
    fx: { should: fx('GBP', 1), current: fx('GBP', 1) }, gbpShould: null, gbpCurrent: null, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
  };
  r.gbpShould = toGbp(r.shouldCost, r.fx.should); r.gbpCurrent = toGbp(r.currentCost, r.fx.current);
  r.gbpSaving = r.savingPerPiece === null ? null : toGbp(r.savingPerPiece, r.savingCcy === 'EUR' ? fx('EUR', 0.85) : fx('GBP', 1));
  return r;
}
const records = [
  rec('a', { annualVolume: 60000, volumeValidated: true, savingStatus: 'validated', savingPerPiece: 0.8, savingCcy: 'GBP' }),          // gap +2 × 60k
  rec('b', { programme: 'L461', currentCost: 11.5, annualVolume: 40000, volumeValidated: true, savingStatus: 'implemented', savingPerPiece: 1.5, savingCcy: 'EUR' }), // +1.5 × 40k
  rec('c', { programme: 'L462', annualVolume: 99999, volumeValidated: false }),                 // not validated → not annualised
  rec('d', { programme: 'L663', currentCost: 8, annualVolume: 10000, volumeValidated: true }),  // below should-cost → not annualised
  rec('e', { programme: 'EMA', currentCost: null, currentCcy: null, savingStatus: 'validated', savingPerPiece: 0.25, savingCcy: 'GBP' }), // ineligible, saving still counts
];
const opts = { today: '2026-11-11', nowIso: NOW, fxPolicy: 'monthly' as const, approvedRates: 1, referenceLabel: 'ref' };
const summary = buildDashboard(records, { ...DEFAULT_FILTERS, datePreset: 'all' }, opts);
const rows = classifyRecords(records) as unknown as ExportRow[];

async function book() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await buildExcel(summary, rows)).arrayBuffer());
  return wb;
}

describe('A-28 (b): the Reconciliation sheet re-adds every headline figure', () => {
  it('the dashboard has the figures this test re-adds', () => {
    expect(summary.financial.annualised).toEqual({ n: 2, gbp: 2 * 60000 + 1.5 * 40000 });
    expect(summary.financial.validatedSavings.n).toBe(2);
    expect(summary.financial.validatedSavings.gbp).toBeCloseTo(1.05, 12);
    expect(summary.financial.implementedSavings).toEqual({ n: 1, gbp: 1.5 * 0.85 });
  });
  it('"Costing records" carries the saving status and the GBP saving', async () => {
    const ws = (await book()).getWorksheet('Costing records')!;
    const h = ws.getRow(1).values as string[];
    expect(h).toContain('Saving status');
    expect(h).toContain('GBP saving (per piece)');
  });
  it('three new rows with live formulas over the right columns, dashboard figure beside them, and a check', async () => {
    const wb = await book();
    const recs = wb.getWorksheet('Costing records')!;
    const h = recs.getRow(1).values as string[];
    const L = (name: string) => recs.getColumn(h.indexOf(name)).letter;
    const n = recs.rowCount;
    const rng = (name: string) => `'Costing records'!$${L(name)}$2:$${L(name)}$${n}`;
    const rc = wb.getWorksheet('Reconciliation')!;
    const byLabel = new Map<string, ExcelJS.Row>(); rc.eachRow(r => byLabel.set(String(r.getCell(1).value), r));
    const ann = byLabel.get('Annualised opportunity (validated volumes)')!;
    const val = byLabel.get('Validated savings')!;
    const imp = byLabel.get('Implemented savings')!;
    for (const r of [ann, val, imp]) expect(r, 'row present').toBeDefined();
    expect((ann.getCell(3).value as { formula: string }).formula).toBe(
      `SUMPRODUCT((${rng('Financial eligibility')}="eligible")*(${rng('GBP cost gap')}>0)*(${rng('Volume validated')}="yes")*(${rng('Annual volume')}>0),${rng('GBP cost gap')},${rng('Annual volume')})`);
    expect((val.getCell(3).value as { formula: string }).formula).toBe(`SUMIFS(${rng('GBP saving (per piece)')},${rng('Saving status')},"validated",${rng('GBP saving (per piece)')},">=0")`);
    expect((imp.getCell(3).value as { formula: string }).formula).toBe(`SUMIFS(${rng('GBP saving (per piece)')},${rng('Saving status')},"implemented",${rng('GBP saving (per piece)')},">=0")`);
    expect(ann.getCell(2).value).toBe(summary.financial.annualised.gbp);
    expect(val.getCell(2).value).toBe(summary.financial.validatedSavings.gbp);
    expect(imp.getCell(2).value).toBe(summary.financial.implementedSavings.gbp);
    for (const r of [ann, val, imp]) expect((r.getCell(4).value as { formula: string }).formula).toBe(`IF(ABS(N(B${r.number})-N(C${r.number}))<0.005,"✓","✗")`);
  });
  it('re-adding the exported cells by those rules gives the dashboard figures', async () => {
    const recs = (await book()).getWorksheet('Costing records')!;
    const h = recs.getRow(1).values as string[];
    const v = (r: ExcelJS.Row, name: string) => r.getCell(h.indexOf(name)).value;
    let ann = 0, val = 0, imp = 0;
    recs.eachRow((r, i) => {
      if (i === 1) return;
      const gap = v(r, 'GBP cost gap'), vol = v(r, 'Annual volume'), sav = v(r, 'GBP saving (per piece)');
      if (v(r, 'Financial eligibility') === 'eligible' && typeof gap === 'number' && gap > 0 && v(r, 'Volume validated') === 'yes' && typeof vol === 'number' && vol > 0) ann += gap * vol;
      if (typeof sav === 'number' && sav >= 0 && v(r, 'Saving status') === 'validated') val += sav;
      if (typeof sav === 'number' && sav >= 0 && v(r, 'Saving status') === 'implemented') imp += sav;
    });
    expect(ann).toBeCloseTo(summary.financial.annualised.gbp, 6);
    expect(val).toBeCloseTo(summary.financial.validatedSavings.gbp, 9);
    expect(imp).toBeCloseTo(summary.financial.implementedSavings.gbp, 9);
  });
  it('the existing rows keep their place (C3 / C5 are referenced by the weighted gap row)', async () => {
    const rc = (await book()).getWorksheet('Reconciliation')!;
    expect(rc.getCell('A3').value).toBe('Σ GBP current cost');
    expect(rc.getCell('A5').value).toBe('Σ GBP cost gap');
    expect(rc.getCell('A8').value).toBe('Weighted cost gap %');
  });
});
