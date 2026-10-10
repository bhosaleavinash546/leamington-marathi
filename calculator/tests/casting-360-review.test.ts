/**
 * Casting 360 review (10 Oct 2026, docs/cad/casting-360-review-2026-10-10.md): the knuckle / stub axle / bracket costed
 * live in India at 100k — each fix to the costing or the reports is pinned here.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { printPDF } from '../src/export/pdf.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;

/** The PDF's text as drawn (jsPDF writes uncompressed content streams), parentheses unescaped. */
export function pdfText(render: () => void): string {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  let out = '';
  api.save = function (this: jsPDF) { out = this.output(); return this; };
  try { render(); } finally { api.save = orig; }
  const parts = [...out.matchAll(/\((.*?)(?<!\\)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1'));
  return parts.join('\n');
}

export function sandCastingResult() {
  const input: UniversalStackInput = {
    partName: 'Steering knuckle',
    rawMaterial: { materialId: 'mat-gjs500', netWeightKg: 3.238, materialUtilization: 0.98, lossIsNotScrap: true, consumablesCostPerPart: 4.16,
      consumablesItems: [{ label: 'NDT', gbp: 1.8 }, { label: 'cores', gbp: 0.42 }] } as never,
    operations: [
      { operationName: 'Sand Casting — Moulding', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0.0343, partsPerCycle: 1, oee: 0.8, manning: 4, labourTimeHr: 0.0343, labourEfficiency: 0.92 },
      { operationName: 'Fettling (gate / riser removal, grind)', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.1031, labourEfficiency: 0.92, benchOperation: true },
    ],
    tooling: { totalToolingCost: 30297, amortizationVolume: 100000, mode: 'amortized' },
    packagingPerPart: 0.1, logisticsPerPart: 0.4, overheadPct: 0.09, marginPct: 0.08,
  };
  return { input, result: computeUniversalStack(input, lib) };
}

describe('X1 / X6 — the PDF names its currency and shows bench work as bench work', () => {
  const { input, result } = sandCastingResult();
  const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', []));
  it('prints INR, never a bare number with the sign deleted', () => {
    expect(text).toMatch(/INR \d/);
  });
  it('a bench operation has no machine, rate or OEE in §4A', () => {
    expect(text.replace(/\n/g, ' ')).toMatch(/bench \(no machine\s+time\)/);
  });
});

describe('X10 / X11 / X21 / X27 — the report says what the costing holds', () => {
  const { input, result } = sandCastingResult();
  const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
    { geometrySource: 'occt', measuredVolumeCm3: 356.1, measuredWeightKg: 2.528, annualVolume: 100000 } as never)).replace(/\n/g, ' ');
  it('gross − net is melt loss, not runner weight, when the melt shop remelts the gating', () => {
    expect(text).toMatch(/Melt Loss \(metal lost\)/);
    expect(text).not.toMatch(/Scrap \/ Runner Weight/);
  });
  it('no negative zero', () => { expect(text).not.toMatch(/-INR 0\.00|-0\.00/); });
  it('the provenance box does not call prices and stock "not an estimate"', () => {
    expect(text).not.toMatch(/not an estimate/);
    expect(text).toMatch(/machining stock/);
  });
});

import { metalShareOf } from '../src/engine/idea-levers.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';

describe('X7 / X8 / X9 — cost-reduction texts quote the lines the costing holds', () => {
  const { input, result } = sandCastingResult();
  it('the metal share excludes the consumables and energy in the material bucket', () => {
    const metal = metalShareOf(result, input);
    expect(metal).toBeLessThan(result.breakdown.rawMaterial / result.total);
    expect(metal).toBeCloseTo((result.breakdown.rawMaterial - 4.16) / result.total, 3);
  });
  it('the consumables finding names the lines the costing holds, not "shell, filters"', () => {
    const r = generateDFMDFA(result, input, 'cast_and_machine');
    const f = r.dfm.issues.find(i => /Consumables dominate/.test(i.title));
    expect(f).toBeTruthy();
    expect(f!.description).toMatch(/NDT \d+%/);
    expect(f!.description).not.toMatch(/shell, filters/);
  });
});

import * as XLSX from 'xlsx';
import { exportToExcelBlob } from '../src/export/excel.js';

describe('X14 / X15 — labour is printed by role, and the trace says its source column is in GBP', () => {
  const { input, result } = sandCastingResult();
  it('the PDF prints no UK labour key on a costing in India, and labels the recorded £ column', () => {
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [])).replace(/\n/g, ' ');
    expect(text).not.toMatch(/lab-uk-/);
    expect(text).toMatch(/foundry \(role\)/);
    expect(text).toMatch(/as recorded, GBP/);
  });
  it('the Excel prints no UK labour key, and lists only the roles the costing used', async () => {
    const blob = await exportToExcelBlob(result, input, lib, 'INR', 127.1941, null);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const all = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(all).not.toMatch(/lab-uk-/);
    expect(all).not.toMatch(/ALL AVAILABLE LABOUR RATES/);
    expect(all).toMatch(/foundry \(role\)/);
  });
});
