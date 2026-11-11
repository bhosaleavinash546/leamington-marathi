/**
 * KPI dashboard screen builders + Excel report: escaping, honest labels (no "saving" from a
 * gap, "Not tracked" without status data), and the workbook's reconciliation formulas point
 * at the right columns of the exported records.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDashboard, classifyRecords, DEFAULT_FILTERS, toGbp, type KpiRecord, type FxApplied } from '../src/engine/kpi-dashboard';
import { kpiCardsHtml, recordsTableHtml, chipsHtml, multiSelectHtml, insightsHtml, drillHtml, currencyTotalsHtml, esc, gbp, type RecordRowView } from '../src/ui/kpi-dashboard/kpi-builders';
import { buildExcel, kpiRows, pdfSafe, type ExportRow } from '../src/ui/kpi-dashboard/kpi-export';

const NOW = '2026-11-11T09:00:00Z';
const fx = (c: string, r: number): FxApplied => ({ currency: c, gbpPerUnit: r, source: 'Treasury', effectiveDate: '2026-11', retrievedAt: NOW, method: c === 'GBP' ? 'identity' : 'monthly', approved: true });
function rec(id: string, p: Partial<KpiRecord>): KpiRecord {
  const r: KpiRecord = {
    id, sourceTool: 'CostVision', sourceRef: 'sc-' + id, ownerId: 'u1', ownerName: 'A <b>Able</b>', partNumber: 'P-' + id, componentName: `<img src=x onerror=alert(1)>`,
    commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01',
    createdAt: NOW, updatedAt: NOW, shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'EUR', currentTerms: 'DAP', currentSource: 'quote',
    costUnit: 'piece', annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null,
    fx: { should: fx('GBP', 1), current: fx('EUR', 0.85) }, gbpShould: null, gbpCurrent: null, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
  };
  r.gbpShould = toGbp(r.shouldCost, r.fx.should); r.gbpCurrent = toGbp(r.currentCost, r.fx.current);
  return r;
}
const records = [rec('a', {}), rec('b', { programme: 'L461', shouldCost: 30, currentCost: 30, currentCcy: 'GBP', fx: { should: fx('GBP', 1), current: fx('GBP', 1) } }), rec('c', { currentCost: null, currentCcy: null })];
const opts = { today: '2026-11-11', nowIso: NOW, fxPolicy: 'monthly' as const, approvedRates: 1, referenceLabel: 'ref' };
const summary = buildDashboard(records, { ...DEFAULT_FILTERS, datePreset: 'all' }, opts);
const rows = classifyRecords(records) as unknown as (RecordRowView & ExportRow)[];

describe('screen builders', () => {
  it('escapes every user / file string', () => {
    const html = recordsTableHtml(rows, 'costingDate', 'desc', 'gbp');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x');
    expect(chipsHtml({ ...DEFAULT_FILTERS, createdBy: ['"><script>'] })).not.toContain('<script>');
    expect(multiSelectHtml('createdBy', [{ value: '<x>', count: 1 }], [], true, '')).toContain('&lt;x&gt;');
    expect(esc(`'"&`)).toBe('&#39;&quot;&amp;');
  });
  it('never calls a gap a saving and says "Not tracked" without status data', () => {
    const html = kpiCardsHtml(summary);
    expect(html).toContain('Not tracked');
    expect(html).toMatch(/NOT programme spend or an annual saving/);
    expect(html).toContain('Not annualised');
    // 12 × 0.85 − 10 = 0.20 opportunity on record a
    expect(html).toContain(gbp(0.2));
  });
  it('a missing cost shows its reason, never 0', () => {
    const html = recordsTableHtml(rows, 'costingDate', 'desc', 'gbp');
    expect(html).toContain('No current cost');
  });
  it('original-currency totals keep each currency on its own row', () => {
    const html = currencyTotalsHtml(summary.currencyTotals);
    expect(html).toContain('12.00 EUR');
    expect(html).toContain('30.00 GBP');
  });
  it('insights and drill-down render with the data', () => {
    expect(insightsHtml(summary)).toContain('Most costing activity: Casting');
    expect(drillHtml('commodity', [], [])).toContain('No current records at this level');
  });
  it('PDF text drops characters the built-in font cannot draw', () => {
    expect(pdfSafe('−£4 Σ ≥ 15%')).toBe('-£4 Sum  >= 15%');
  });
});

describe('Excel report', () => {
  it('F-08: "Costing records" holds current records only; revisions and duplicates on their own sheet', async () => {
    const recs = classifyRecords([rec('p1', { partNumber: 'P', costingDate: '2026-09-01' }), rec('p2', { partNumber: 'P', costingDate: '2026-10-01' }), rec('p3', { partNumber: 'P', ownerId: 'u2', costingDate: '2026-08-01' })]) as unknown as ExportRow[];
    const sum = buildDashboard(recs as unknown as KpiRecord[], { ...DEFAULT_FILTERS, datePreset: 'all' }, opts);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildExcel(sum, recs)).arrayBuffer());
    expect(wb.getWorksheet('Costing records')!.rowCount).toBe(2);                 // header + p2
    expect(wb.getWorksheet('Older revisions & duplicates')!.rowCount).toBe(3);    // header + p1 + p3
  });

  it('has the required sheets and reconciliation formulas over the right columns', async () => {
    const blob = await buildExcel(summary, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const names = wb.worksheets.map(w => w.name);
    for (const n of ['Executive summary', 'Commodity analysis', 'Programme analysis', 'Powertrain analysis', 'Costing records', 'Older revisions & duplicates', 'Data quality', 'Reconciliation', 'Original currencies', 'Method & FX']) expect(names).toContain(n);
    const recs = wb.getWorksheet('Costing records')!;
    const header = recs.getRow(1).values as string[];
    const letter = (h: string) => recs.getColumn(header.indexOf(h)).letter;   // values[] is 1-based
    const rc = wb.getWorksheet('Reconciliation')!;
    expect((rc.getCell('C3').value as { formula: string }).formula).toBe(`SUMIFS('Costing records'!$${letter('GBP current cost')}$2:$${letter('GBP current cost')}$4,'Costing records'!$${letter('Financial eligibility')}$2:$${letter('Financial eligibility')}$4,"eligible")`);
    expect(rc.getCell('B3').value).toBeCloseTo(summary.financial.sumCurrentGbp, 9);
    const ex = wb.getWorksheet('Executive summary')!;
    const kpis: string[] = []; ex.eachRow(r => kpis.push(String(r.getCell(1).value)));
    for (const [k] of kpiRows(summary)) expect(kpis).toContain(k);
  });
});

describe('F-10: chart colour follows the entity', () => {
  it('a powertrain keeps its slot whatever else is in the view', async () => {
    const { slotFor } = await import('../src/ui/kpi-dashboard/kpi-charts');
    const { STANDARD_POWERTRAINS } = await import('../src/engine/kpi-dashboard');
    expect(slotFor('BEV', STANDARD_POWERTRAINS)).toBe(4);
    expect(slotFor('MHEV', STANDARD_POWERTRAINS)).toBe(0);
    expect(slotFor('Hydrogen', STANDARD_POWERTRAINS)).toBe(slotFor('Hydrogen', STANDARD_POWERTRAINS));
    expect(slotFor('Hydrogen', STANDARD_POWERTRAINS)).toBeGreaterThanOrEqual(5);
  });
});

describe('F-13: the drill-down path is visible and removable', () => {
  it('renders a drill chip with a leave button', () => {
    const html = chipsHtml(DEFAULT_FILTERS, [{ level: 'commodity', key: 'Casting', label: 'Casting' }, { level: 'programme', key: 'L460', label: 'L460' }]);
    expect(html).toContain('Drill-down:');
    expect(html).toContain('Casting › L460');
    expect(html).toContain('data-drill-to="-1"');
    expect(chipsHtml(DEFAULT_FILTERS)).not.toContain('Drill-down');
  });
});

describe('F-16: record links', () => {
  it('round-trips a record id through the address and refuses anything else', async () => {
    const { recordLinkFor, recordIdFromHash } = await import('../src/ui/kpi-dashboard/kpi-view');
    const link = recordLinkFor('rec-1fa04ad4-3e4f', { origin: 'https://cv.example', pathname: '/calculator/', search: '' });
    expect(link).toBe('https://cv.example/calculator/#kpi-record=rec-1fa04ad4-3e4f');
    expect(recordIdFromHash('#kpi-record=rec-1fa04ad4-3e4f')).toBe('rec-1fa04ad4-3e4f');
    expect(recordIdFromHash('#kpi-record=<script>')).toBeNull();
    expect(recordIdFromHash('#other')).toBeNull();
  });
});

describe('F-20: weighted gap % per commodity', () => {
  it('is Σ gap ÷ Σ current of the row', async () => {
    const { weightedPct } = await import('../src/ui/kpi-dashboard/kpi-charts');
    expect(weightedPct({ key: 'Casting', count: 2, currentGbp: 43.432773, gapGbp: 1.523680 })).toBe('+3.5%');
    expect(weightedPct({ key: 'Forging', count: 1, currentGbp: 14.0458, gapGbp: -1.1542 })).toBe('−8.2%');
    expect(weightedPct({ key: 'X', count: 0, currentGbp: 0, gapGbp: 0 })).toBe('—');
  });
});
