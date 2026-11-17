/**
 * Phase 2 · A-27 (P3): ONE sign-first formatter for negative money — the screen's rule, "−£4.03" — on the screen, in
 * the engine's insights and in the exports. Phase 1: insights printed "£-4.03", the screen "−£4.03", Excel "-£4.03".
 * The PDF's built-in font cannot draw U+2212, so pdfSafe prints "-£4.03" (still sign-first).
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDashboard, classifyRecords, DEFAULT_FILTERS, KPI_FMT, toGbp, gbpSigned, type KpiRecord, type FxApplied } from '../src/engine/kpi-dashboard';
import { gbp } from '../src/ui/kpi-dashboard/kpi-builders';
import { buildExcel, kpiRows, pdfSafe, type ExportRow } from '../src/ui/kpi-dashboard/kpi-export';

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
  return r;
}
// a: +£2.00 (+16.7 %); b: current £5.97 v should £10.00 → −£4.03 (−67.5 %)
const records = [rec('a', {}), rec('b', { partNumber: 'P-NEG', programme: 'L461', currentCost: 5.97 })];
const opts = { today: '2026-11-11', nowIso: NOW, fxPolicy: 'monthly' as const, approvedRates: 1, referenceLabel: 'ref' };
const summary = buildDashboard(records, { ...DEFAULT_FILTERS, datePreset: 'all' }, opts);

describe('A-27: one sign-first formatter for negative money', () => {
  it('the engine formatter is the screen formatter', () => {
    expect(gbpSigned(-4.03)).toBe('−£4.03');
    expect(gbpSigned(1234.5)).toBe('£1,234.50');
    expect(gbpSigned(-1234.5, 0)).toBe('−£1,235');
    expect(KPI_FMT.gbp2(-4.03)).toBe('−£4.03');
    expect(KPI_FMT.gbp0(-1234.4)).toBe('−£1,234');
    for (const n of [-4.03, -0.5, 0, 2, 1234567.891]) expect(KPI_FMT.gbp2(n)).toBe(gbp(n));
  });
  it('insights print a negative gap as −£4.03, never £-4.03', () => {
    const sig = summary.insights.find(i => i.id === 'significant-gaps')!;
    expect(sig.detail).toContain('P-NEG: −£4.03');
    expect(sig.detail).not.toMatch(/£-/);
  });
  it('the export KPI rows and the PDF text are sign-first', () => {
    const unf = kpiRows(summary).find(r => r[0].startsWith('Unfavourable'))!;
    expect(unf[1]).toBe('−£4.03');
    expect(pdfSafe(unf[1])).toBe('-£4.03');
    expect(pdfSafe(summary.insights.find(i => i.id === 'significant-gaps')!.detail)).toContain('P-NEG: -£4.03');
  });
  it('every GBP number format in the workbook puts the sign first, as −£', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildExcel(summary, classifyRecords(records) as unknown as ExportRow[])).arrayBuffer());
    const fmts = new Set<string>();
    wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => { if (c.numFmt?.includes('£')) fmts.add(c.numFmt); })));
    expect(fmts.size).toBeGreaterThan(0);
    for (const f of fmts) expect(f, f).toMatch(/^£#,##0\.00;(\[Red\])?"−"£#,##0\.00$/);
    const ex = wb.getWorksheet('Executive summary')!;
    let unf: unknown; ex.eachRow(r => { if (String(r.getCell(1).value).startsWith('Unfavourable')) unf = r.getCell(2).value; });
    expect(unf).toBe('−£4.03');
  });
});
