/** Calculate after Analyze reports the analysis (src/ui/pcb/analysis-link.ts, live trial Oct 2026). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analysisStackInput, boardSpecPatch, FAB_FIELDS } from '../src/ui/pcb/analysis-link.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

// The 360° camera board as the tool priced it on the live trial (China, Oct 2026).
const camera = {
  partName: '8-layer 20×20mm FPD-Link III automotive camera module PCB',
  bom: [
    { refDes: 'Capacitor', description: 'Ceramic Capacitor', qty: 49, unitPriceGBP: 0.0603, priceSource: 'class-range' },
    { refDes: 'Integrated circuit', description: 'FPD-Link III serializer', partNumber: 'DS90UB935-Q1', qty: 1, unitPriceGBP: 1.43, priceSource: 'class-range' },
    { refDes: 'Sensor', description: 'Image sensor', qty: 1, unitPriceGBP: 0.449, priceSource: 'class-range' },
  ],
  _selectedCountryBreakdown: { totalPerBoard: 16.74, pcbFabPerBoard: 0.64, assemblyPerBoard: 3.26, bomCostPerBoard: 11.97, logisticsPerBoard: 0.59,
    breakdown: { energy: 0.05, packaging: 0.06, yieldLoss: 0.17 }, countryName: 'China (Shenzhen / Suzhou)', countryId: 'cn' },
};

describe('Calculate after Analyze = the analysis', () => {
  it('the costing input passes validation and its total is the analysis headline exactly', () => {
    const input = analysisStackInput(camera);
    expect(validateStackInput(input, DEFAULT_RATE_LIBRARY).valid).toBe(true);
    const res = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    expect(res.total).toBeCloseTo(16.74, 6);
    expect(res.breakdown.overhead).toBe(0);                // supplier prices — no second overhead
    expect(res.breakdown.margin).toBe(0);                  // nor margin
  });
  it('the material bucket is itemised: every BOM line at the country price, plus the bare board and the assembly', () => {
    const input = analysisStackInput(camera);
    const lines = input.rawMaterial.lines!;
    const sum = lines.reduce((t, l) => t + l.qty * l.unitCost, 0);
    expect(sum).toBeCloseTo(11.97 + 0.64 + 3.26, 2);
    // A BOM's category column ("Capacitor") is not a designator: the part number, or a dash.
    expect(lines.map(l => l.ref)).toEqual(['—', 'DS90UB935-Q1', '—', 'PCB', 'ASM']);
  });
  it('lines print at the analysis price; the EMS material burden is its own line (it was a ×1.05 "sourcing factor" on every line)', () => {
    // 2 lines priced £10.00, burden 5% = £0.50 → components £10.50
    const r = { bom: [{ refDes: 'U1', qty: 1, unitPriceGBP: 8 }, { refDes: 'C1-C20', qty: 20, unitPriceGBP: 0.1 }],
      _selectedCountryBreakdown: { totalPerBoard: 13, pcbFabPerBoard: 1, assemblyPerBoard: 1.5, bomCostPerBoard: 10.5, logisticsPerBoard: 0,
        breakdown: { materialBurden: 0.5, materialBurdenPct: 0.05 }, countryName: 'China', countryId: 'cn' } };
    const lines = analysisStackInput(r).rawMaterial.lines!;
    expect(lines.find(l => l.ref === 'U1')!.unitCost).toBe(8);
    expect(lines.find(l => l.ref === 'C1-C20')!.unitCost).toBe(0.1);
    const ems = lines.find(l => l.ref === 'EMS')!;
    expect(ems.unitCost).toBe(0.5);
    expect(ems.description).toMatch(/5% of the components/);
    expect(computeUniversalStack(analysisStackInput(r), DEFAULT_RATE_LIBRARY).total).toBeCloseTo(13, 6);
  });
  it('refuses to report an analysis that has no country breakdown', () => {
    expect(() => analysisStackInput({ bom: [], _selectedCountryBreakdown: null })).toThrow(/run Analyze/);
  });
});

describe('an edited field is the engineer\'s figure', () => {
  it('typed outer copper carries user evidence and replaces the model\'s per-layer list (the gate struck it back to 1 oz)', () => {
    const fake = { getElementById: (id: string) => (id === 'pcbf-outer-cu' ? { value: '2', type: 'number' } : null) } as unknown as Document;
    const p = boardSpecPatch(['pcbf-outer-cu'], fake);
    expect(p.spec).toMatchObject({ copperWeightOz: 2, copperEvidence: 'user', copperOzByLayer: [] });
  });
  const fakeDoc = (vals: Record<string, string>) => ({ getElementById: (id: string) => (id in vals ? { value: vals[id], type: 'text' } : null) }) as unknown as Document;
  it('size, layers and vias edits are marked measured; an automotive quality grade costs the board as automotive', () => {
    const p = boardSpecPatch(['pcbf-board-w', 'pcbf-layers', 'pcbf-vias', 'pcbf-quality'], fakeDoc({ 'pcbf-board-w': '20', 'pcbf-layers': '6', 'pcbf-vias': '90', 'pcbf-quality': 'auto_grade1' }));
    expect(p.spec).toMatchObject({ widthMm: 20, estimatedLayers: 6, throughVias: 90, dimensionsSource: 'measured', layersSource: 'measured', viasSource: 'measured', qualityGrade: 'auto_grade1' });
    expect(p.domain).toBe('automotive_adas');
    expect(boardSpecPatch(['pcbf-quality'], fakeDoc({ 'pcbf-quality': 'consumer' })).domain).toBe('general');
  });
  it('every mapped field exists on the PCB fab form', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    for (const f of FAB_FIELDS) expect(main, f.id).toContain(`'${f.id}'`);
  });
});
