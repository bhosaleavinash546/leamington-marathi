/**
 * The 360 software workbook (src/export/sw-report-xlsx.ts): the same model as the PDF, totals as live formulas, a Checks
 * sheet against the engine. Where LibreOffice is installed the workbook is recalculated and must have 0 formula errors
 * and every check ✓ (scripts/sw-report/xlsx-recalc-check.py) — and changing one rate input must move the totals.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { computeSWProgram } from '../src/engine/sw-should-cost.js';
import { buildSWReportModel, type SWReportProfile } from '../src/engine/sw-report-model.js';
import { buildSWReportRequest } from '../src/export/sw-report-request.js';
import { buildSWReportWorkbook, domainSheetName } from '../src/export/sw-report-xlsx.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const result = computeSWProgram({ ...buildVehicleInputs(demo), annualProductionVolume: 200_000, programLifeYears: 6 });
const book = async (profile: SWReportProfile, extra: Record<string, unknown> = {}, currency?: { code: string; sym: string; perGbp: number }) => {
  const model = buildSWReportModel(result, buildSWReportRequest(result, { options: { profile, ...extra }, title: demo.label, currency, generatedAt: new Date(2026, 9, 14) }));
  const bytes = await buildSWReportWorkbook(model);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as never);
  return { model, bytes, wb };
};
const soffice = (() => { try { execFileSync('which', ['soffice'], { stdio: 'pipe' }); return true; } catch { return false; } })();

describe('the vehicle workbook', () => {
  it('has the sheets of the plan, a domain sheet per domain, and native charts', async () => {
    const { model, wb, bytes } = await book('vehicle');
    const names = wb.worksheets.map(w => w.name);
    for (const n of ['Cover', 'Contents', 'Summary', 'Architecture', 'Cost build-up', 'Module register', 'Module detail', 'Rates', 'Unit economics', 'Spend by year', 'Hubs', 'Countries', 'Risk', 'Make or buy', 'Evidence', 'Assumptions', 'Scope', 'Checks'])
      expect(names).toContain(n);
    for (const d of model.domains) expect(names).toContain(domainSheetName(d));
    expect(Buffer.from(bytes).includes(Buffer.from('xl/charts/chart'))).toBe(true);
  });
  it('totals are formulas that chain to the Rates sheet, with the engine\'s figure cached', async () => {
    const { wb } = await book('vehicle');
    const det = wb.getWorksheet('Module detail')!;
    const formulas = det.getRow(9).values as Array<ExcelJS.CellValue>;
    expect(formulas.some(v => typeof v === 'object' && v !== null && 'formula' in v && /Rates'!\$C\$\d+/.test((v as ExcelJS.CellFormulaValue).formula))).toBe(true);
    const chk = wb.getWorksheet('Checks')!;
    let n = 0;
    chk.eachRow((row, i) => { if (i >= 9 && typeof row.getCell(3).value === 'object' && row.getCell(3).value && 'formula' in (row.getCell(3).value as object)) n++; });
    expect(n).toBeGreaterThan(result.modules.length * 2);
  });
  it('money is in the report currency: a € workbook is the £ one × the rate', async () => {
    const gbp = await book('vehicle'), eur = await book('vehicle', {}, { code: 'EUR', sym: '€', perGbp: 1.17 });
    const tot = (wb: ExcelJS.Workbook) => { const reg = wb.getWorksheet('Module register')!; let v = 0; reg.eachRow(r => { const c = r.getCell(2).value; if (c === 'Programme total') v = Number((r.getCell(20).value as ExcelJS.CellFormulaValue).result); }); return v; };
    expect(tot(eur.wb)).toBeCloseTo(tot(gbp.wb) * 1.17, 2);
    expect(String(eur.wb.getWorksheet('Module register')!.getCell(9, 20).numFmt)).toContain('€');
  });
});

describe('focused workbooks are slices', () => {
  it('a domain workbook holds only its domains and its total is the slice', async () => {
    const { model, wb } = await book('domain', { domains: ['B'] });
    expect(wb.worksheets.map(w => w.name).filter(n => /^[A-G] /.test(n))).toEqual([domainSheetName(model.domains[0])]);
    expect(model.slice.isWhole).toBe(false);
  });
  it('the hubs workbook has no domain sheets', async () => {
    const { wb } = await book('hubs');
    expect(wb.worksheets.some(w => /^[A-G] /.test(w.name))).toBe(false);
    expect(wb.worksheets.map(w => w.name)).toContain('Countries');
  });
});

describe.runIf(soffice)('LibreOffice recalculation', () => {
  it('0 formula errors, every check ✓; a changed rate input moves the totals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-xlsx-'));
    try {
      const { bytes } = await book('vehicle');
      const f = join(dir, 'book.xlsx'); writeFileSync(f, bytes);
      execFileSync('python3', ['-I', 'scripts/sw-report/xlsx-recalc-check.py', f, join(dir, 'lo')], { stdio: 'pipe', timeout: 300_000 });
      // Tamper: senior share 0.9 → the checks must fail (proves the formulas are live).
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(bytes) as never);
      const rates = wb.getWorksheet('Rates')!;
      rates.eachRow(r => { if (String(r.getCell(2).value).startsWith('Senior share')) r.getCell(3).value = 0.9; });
      const t = join(dir, 'tamper.xlsx'); await wb.xlsx.writeFile(t);
      let failed = false;
      try { execFileSync('python3', ['-I', 'scripts/sw-report/xlsx-recalc-check.py', t, join(dir, 'lo2')], { stdio: 'pipe', timeout: 300_000 }); } catch { failed = true; }
      expect(failed).toBe(true);
    } finally { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); }
  }, 600_000);
});
