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
    expect(lines.map(l => l.ref)).toEqual(['Capacitor', 'Integrated circuit', 'Sensor', 'PCB', 'ASM']);
  });
  it('refuses to report an analysis that has no country breakdown', () => {
    expect(() => analysisStackInput({ bom: [], _selectedCountryBreakdown: null })).toThrow(/run Analyze/);
  });
});

describe('an edited field is the engineer\'s figure', () => {
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
