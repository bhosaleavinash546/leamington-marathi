/**
 * The executive summary (Nov 2026): one model, page 2 of the PDF and the first sheet of the workbook. Every figure is
 * the costing's own — the lines add to the total, the movers are stack re-runs, the levers are re-costed levers only.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { runSensitivity } from '../src/engine/sensitivity.js';
import { buildExecutiveSummary } from '../src/export/executive-summary.js';
import { printPDF } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;
const input: UniversalStackInput = {
  partName: 'Machined block',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.45 },
  operations: [
    { operationName: 'Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.6, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9 },
    { operationName: 'Drilling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.02, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.02, labourEfficiency: 0.9 },
  ],
  tooling: { totalToolingCost: 40_000, amortizationVolume: 250_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
  annualVolume: 50_000, programmeYears: 5, deliveryTerms: 'EXW',
} as UniversalStackInput;
const result = computeUniversalStack(input, lib);
const ex = buildExecutiveSummary({ result, input, library: lib, commodity: 'machining', region: 'UK',
  band: { p10: result.total * 0.9, p90: result.total * 1.1, plusMinusPct: 10 }, stamp: 'United Kingdom rate book v2.2.0' });

describe('the executive summary model', () => {
  it('its cost lines are the costing\'s own and add to the total', () => {
    expect(ex.total).toBe(result.total);
    expect(ex.lines.length).toBeLessThanOrEqual(6);
    expect(ex.largestOperation?.label).toBeTruthy();
    expect(ex.lines.reduce((s, l) => s + l.gbp, 0)).toBeCloseTo(result.total, 3);
  });
  it('the movers are stack re-runs at ±10 %, largest first', () => {
    const sens = runSensitivity(input, lib, 10);
    expect(ex.movers.length).toBe(Math.min(3, sens.drivers.length));
    ex.movers.forEach((m, i) => {
      expect(sens.drivers[i].driver.startsWith(m.label.replace(/^Labour rate/, 'Labour Rate').replace(/^Machine rate/, 'Machine Rate').replace(/, shared by (\d+) operations/, ' — shared by $1 op'))).toBe(true);
      expect(m.plusGbp).toBeCloseTo(sens.drivers[i].plusCost - result.total, 3);
    });
  });
  it('lists only re-costed levers, at most three', () => {
    expect(ex.levers.length).toBeLessThanOrEqual(3);
    for (const l of ex.levers) expect(l.savingGbp).toBeGreaterThan(0);
  });
  it('says what it assumes, what is not in it, and that accuracy is not measured', () => {
    expect(ex.basis.join(' ')).toMatch(/50,000 parts a year, 5-year programme/);
    expect(ex.basis.join(' ')).toMatch(/Ex-works/);
    expect(ex.notIncluded[0]).toMatch(/Freight/);
    expect(ex.toConfirm.join(' ')).toMatch(/not yet been compared with a price paid/);
    expect(ex.annualSpend).toBeCloseTo(result.total * 50_000, 2);
  });
});

describe('both reports carry it', () => {
  it('the PDF draws "Executive Summary" on page 2', () => {
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const origSave = api.save;
    const pages: string[] = [];
    api.save = function (this: jsPDF) {
      const d = this as unknown as { internal: { pages: string[][] } };
      for (const p of d.internal.pages.slice(1)) pages.push((p ?? []).join('\n'));
      return this;
    };
    try {
      printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [], { annualVolume: 50_000 });
    } finally { api.save = origSave; }
    expect(pages[1]).toMatch(/Executive Summary/);
    expect(pages[1]).toMatch(/Where the money goes/);
    expect(pages[0]).not.toMatch(/Executive Summary/);
  });
  it('the workbook opens on "0-Executive" with the same total, and 1-Summary is unchanged', async () => {
    const blob = await exportToExcelBlob(result, input, lib, 'GBP', 1, null, null, null, null, null, 'machining');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
    expect(wb.worksheets[0].name).toBe('0-Executive');
    expect(wb.getWorksheet('1-Summary')).toBeDefined();
    let total: number | null = null;
    wb.worksheets[0].eachRow(r => { if (r.getCell(1).value === 'Should-cost a part') total = Number(r.getCell(2).value); });
    expect(total).toBeCloseTo(result.total, 4);
  });
});
