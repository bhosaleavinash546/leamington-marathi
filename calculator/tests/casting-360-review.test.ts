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
    rawMaterial: { materialId: 'mat-gjs500', netWeightKg: 3.238, materialUtilization: 0.98, consumablesCostPerPart: 4.16,
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
