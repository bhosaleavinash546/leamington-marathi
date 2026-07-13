import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseNegotiationTemplate } from '../src/export/negotiation-template.js';

/** Build an .xlsx File from named AOA sheets, as the parser would receive on upload. */
function fileFromSheets(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([new Uint8Array(buf)], 'quote.xlsx');
}

const HEADER = ['Section', 'Parameter', 'Unit', 'Supplier value', 'Ref (do not edit)'];
const fullDetailed = (): unknown[][] => [
  ['CostVision — AI Cost Intelligence'], [],
  HEADER,
  ['MATERIAL', '', '', '', ''],
  ['Material', 'Part shot weight', 'kg', 1.2, 'mat.netWeightKg'],
  ['Material', 'Material yield (runner/regrind)', '%', 75, 'mat.utilizationPct'],
  ['Material', 'Resin price', '£/kg', '£5.80', 'mat.pricePerKg'],
  ['OPERATION 1: Injection', '', '', '', 'op.0.name=Injection'],
  ['Process', 'Injection cycle time', 's', '54 s', 'op.0.cycleTimeSec'],
  ['Process', 'Press rate (tonnage-based)', '£/hr', '£70.00', 'op.0.machineRate'],
  ['Process', 'Cavitation (cavities)', 'cavities', 2, 'op.0.partsPerCycle'],
  ['Process', 'Press OEE', '%', 80, 'op.0.oeePct'],
  ['Labour', 'Labour time', 's', 40, 'op.0.labourTimeSec'],
  ['TOOLING & COMMERCIAL', '', '', '', ''],
  ['Tooling', 'Tooling (amortised per part)', '£/part', 1.1, 'tooling.perPart'],
  ['Commercial', 'Overhead / SG&A', '%', 0.15, 'overhead.pct'],   // fraction, not 15
  ['Commercial', 'Margin', '%', 11, 'margin.pct'],
];

describe('negotiation template parser', () => {
  it('round-trips a filled template and cleans messy values', async () => {
    const p = await parseNegotiationTemplate(fileFromSheets({ Detailed: fullDetailed() }));
    expect(p.detail.material?.netWeightKg).toBe(1.2);
    expect(p.detail.material?.utilization).toBeCloseTo(0.75, 3);
    expect(p.detail.material?.pricePerKg).toBeCloseTo(5.8, 3);     // "£5.80" cleaned
    const op = p.detail.operations?.[0];
    expect(op?.name).toBe('Injection');
    expect(op?.cycleTimeHr).toBeCloseTo(54 / 3600, 5);            // "54 s" → hours
    expect(op?.machineRate).toBeCloseTo(70, 3);                    // "£70.00" cleaned
    expect(op?.partsPerCycle).toBe(2);
    expect(op?.oee).toBeCloseTo(0.8, 3);
    expect(op?.labourTimeHr).toBeCloseTo(40 / 3600, 5);
    expect(p.detail.toolingPerPart).toBe(1.1);
    expect(p.detail.marginPct).toBeCloseTo(0.11, 3);
  });

  it('treats a fraction typed for a percent field as that percent, with a warning', async () => {
    const p = await parseNegotiationTemplate(fileFromSheets({ Detailed: fullDetailed() }));
    expect(p.detail.overheadPct).toBeCloseTo(0.15, 3);            // 0.15 read as 15%, not 0.15%
    expect(p.warnings.some(w => /overhead/i.test(w))).toBe(true);
  });

  it('parses even when the Ref column has been deleted (matches by section + label)', async () => {
    const noRef = fullDetailed().map(r => r.slice(0, 4)); // drop the Ref column
    const p = await parseNegotiationTemplate(fileFromSheets({ Detailed: noRef }));
    expect(p.warnings.some(w => /ref/i.test(w))).toBe(true);
    expect(p.detail.material?.netWeightKg).toBe(1.2);
    expect(p.detail.material?.pricePerKg).toBeCloseTo(5.8, 3);
    const op = p.detail.operations?.[0];
    expect(op?.name).toBe('Injection');
    expect(op?.cycleTimeHr).toBeCloseTo(54 / 3600, 5);
    expect(op?.machineRate).toBeCloseTo(70, 3);
    expect(op?.labourTimeHr).toBeCloseTo(40 / 3600, 5);           // labour time via Section=Labour
  });

  it('finds the sheet case-insensitively and ignores extra sheets', async () => {
    const p = await parseNegotiationTemplate(fileFromSheets({ Instructions: [['hi']], detailed: fullDetailed() }));
    expect(p.detail.material?.netWeightKg).toBe(1.2);
    expect(p.rowsFilled).toBeGreaterThan(5);
  });

  it('rejects a file that is not a quote template', async () => {
    await expect(parseNegotiationTemplate(fileFromSheets({ Sheet1: [['hello', 'world'], [1, 2]] })))
      .rejects.toThrow();
  });
});
