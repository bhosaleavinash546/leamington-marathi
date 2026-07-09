import { describe, it, expect } from 'vitest';
import {
  thermoformFamilyOf, estimateHeatTimeSec, estimateCoolTimeSec, estimateThermoformSpecificEnergy,
  estimateSagRisk, estimateWallThinning, estimateThermoformToolCost, analyseThermoformingDFM,
  formingPressureBar,
} from '../src/engine/modules/thermoforming-advisor.js';
import { computeThermoformingDrivers } from '../src/engine/modules/thermoforming.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, THERMOFORMING_COUNTRY_PRICES } from '../src/engine/regional-rates.js';

describe('thermoforming advisor — family classifier', () => {
  it('maps grade strings to families', () => {
    expect(thermoformFamilyOf('HIPS Thermoforming Sheet')).toBe('hips');
    expect(thermoformFamilyOf('APET Sheet (amorphous, food pack)')).toBe('petg');
    expect(thermoformFamilyOf('CPET Sheet (crystalline, dual-ovenable)')).toBe('pet-cryst');
    expect(thermoformFamilyOf('PMMA / Acrylic Sheet')).toBe('pmma');
    expect(thermoformFamilyOf('PC Thermoforming Sheet')).toBe('pc');
    expect(thermoformFamilyOf('PP Thermoforming Sheet (HMS)')).toBe('pp');
    expect(thermoformFamilyOf('PEI (Ultem) Sheet')).toBe('pei');
    expect(thermoformFamilyOf('PP/TPO Automotive Sheet')).toBe('tpo');
  });
});

describe('thermoforming advisor — heating & energy', () => {
  it('heat time rises with thickness and with higher-temp materials', () => {
    expect(estimateHeatTimeSec('hips', 3)).toBeGreaterThan(estimateHeatTimeSec('hips', 1));
    expect(estimateHeatTimeSec('pc', 2)).toBeGreaterThan(estimateHeatTimeSec('hips', 2));
  });
  it('specific oven energy: PC > HIPS, twin-sheet heats two webs', () => {
    expect(estimateThermoformSpecificEnergy('pc')).toBeGreaterThan(estimateThermoformSpecificEnergy('hips'));
    expect(estimateThermoformSpecificEnergy('hips', 'twin_sheet')).toBeGreaterThan(estimateThermoformSpecificEnergy('hips', 'vacuum') * 1.5);
  });
});

describe('thermoforming advisor — sag', () => {
  it('poor-melt-strength PP sags more than high-melt PMMA', () => {
    const pp = estimateSagRisk('pp', 2, 800);
    const pmma = estimateSagRisk('pmma', 2, 800);
    expect(pp.sagIndex).toBeGreaterThan(pmma.sagIndex);
  });
  it('thicker sheet sags less; wider span sags much more', () => {
    expect(estimateSagRisk('hips', 3, 600).sagIndex).toBeLessThan(estimateSagRisk('hips', 1.5, 600).sagIndex);
    expect(estimateSagRisk('hips', 2, 1200).sagIndex).toBeGreaterThan(estimateSagRisk('hips', 2, 600).sagIndex);
  });
  it('classifies a big thin PP span as high risk', () => {
    expect(estimateSagRisk('pp', 1, 1200).risk).toBe('high');
  });
});

describe('thermoforming advisor — cooling', () => {
  it('cool time rises with thickness²; a water-cooled tool cools faster than ambient', () => {
    expect(estimateCoolTimeSec('hips', 4)).toBeGreaterThan(estimateCoolTimeSec('hips', 2) * 3); // ~×4 for double thickness
    expect(estimateCoolTimeSec('hips', 3, 'water')).toBeLessThan(estimateCoolTimeSec('hips', 3, 'ambient'));
  });
});

describe('thermoforming advisor — wall thinning & forming pressure', () => {
  it('draw ratio = depth ÷ opening; corner wall is thinner than average', () => {
    const w = estimateWallThinning({ sheetThicknessMm: 1.0, depthMm: 100, minOpeningMm: 50, method: 'vacuum' });
    expect(w.drawRatio).toBeCloseTo(2.0, 3);
    expect(w.minWallMm).toBeLessThan(w.avgWallMm);
    expect(w.withinLimit).toBe(false);   // 2:1 exceeds the 1.5:1 vacuum-only limit
  });
  it('plug assist raises the draw limit', () => {
    const noPlug = estimateWallThinning({ sheetThicknessMm: 1, depthMm: 80, minOpeningMm: 40, method: 'vacuum', plugAssist: false });
    const plug = estimateWallThinning({ sheetThicknessMm: 1, depthMm: 80, minOpeningMm: 40, method: 'vacuum', plugAssist: true });
    expect(plug.drawLimit).toBeGreaterThan(noPlug.drawLimit);
    expect(plug.minWallMm).toBeGreaterThan(noPlug.minWallMm); // better distribution
  });
  it('pressure forming applies more bar than vacuum', () => {
    expect(formingPressureBar('pressure')).toBeGreaterThan(formingPressureBar('vacuum'));
  });
});

describe('thermoforming advisor — parametric tooling', () => {
  it('cost ordering steel > cnc-al > cast-al > epoxy at equal area/method', () => {
    const a = 400, opt = { projectedAreaCm2: a, method: 'vacuum' as const };
    const epoxy = estimateThermoformToolCost({ ...opt, mouldMaterial: 'epoxy' }).total;
    const cast = estimateThermoformToolCost({ ...opt, mouldMaterial: 'cast-al' }).total;
    const cnc = estimateThermoformToolCost({ ...opt, mouldMaterial: 'cnc-al' }).total;
    const steel = estimateThermoformToolCost({ ...opt, mouldMaterial: 'steel' }).total;
    expect(epoxy).toBeLessThan(cast);
    expect(cast).toBeLessThan(cnc);
    expect(cnc).toBeLessThan(steel);
  });
  it('pressure forming and multi-cavity raise tool cost; life follows mould material', () => {
    const vac = estimateThermoformToolCost({ projectedAreaCm2: 400, mouldMaterial: 'cnc-al', method: 'vacuum' });
    const press = estimateThermoformToolCost({ projectedAreaCm2: 400, mouldMaterial: 'cnc-al', method: 'pressure' });
    const four = estimateThermoformToolCost({ projectedAreaCm2: 400, mouldMaterial: 'cnc-al', method: 'vacuum', cavities: 4 });
    expect(press.total).toBeGreaterThan(vac.total);
    expect(four.total).toBeGreaterThan(vac.total);
    expect(estimateThermoformToolCost({ mouldMaterial: 'steel' }).lifeCycles)
      .toBeGreaterThan(estimateThermoformToolCost({ mouldMaterial: 'epoxy' }).lifeCycles);
  });
});

describe('thermoforming advisor — DFM', () => {
  it('flags an excessive draw ratio as critical', () => {
    const d = analyseThermoformingDFM({ method: 'vacuum', sheetThicknessMm: 1, depthMm: 200, minOpeningMm: 40 });
    expect(d.issues.some(i => i.severity === 'critical')).toBe(true);
    expect(d.score).toBeLessThan(7);
  });
  it('flags sharp internal radius and insufficient draft', () => {
    const d = analyseThermoformingDFM({ sheetThicknessMm: 3, minInternalRadiusMm: 1, draftAngleDeg: 0.5, minOpeningMm: 100, depthMm: 20 });
    expect(d.issues.some(i => i.title.includes('radius'))).toBe(true);
    expect(d.issues.some(i => i.title.toLowerCase().includes('draft'))).toBe(true);
  });
  it('flags undercuts as a tooling issue', () => {
    const d = analyseThermoformingDFM({ hasUndercut: true, minOpeningMm: 100, depthMm: 20, sheetThicknessMm: 2 });
    expect(d.issues.some(i => i.category === 'tooling')).toBe(true);
  });
  it('clean, shallow geometry scores high', () => {
    const d = analyseThermoformingDFM({ family: 'hips', method: 'pressure', sheetThicknessMm: 2, depthMm: 20, minOpeningMm: 200, unsupportedSpanMm: 300, minInternalRadiusMm: 5, draftAngleDeg: 5, plugAssist: true });
    expect(d.score).toBeGreaterThanOrEqual(9);
  });
});

// ─── Engine module ────────────────────────────────────────────────────────────

const base = () => ({
  materialId: 'mat-hips-tf', sheetWeightKg: 1.2, partsPerSheet: 4, partWeightKg: 0.25,
  method: 'vacuum' as const, machineId: 'thermoform-small', labourId: 'lab-uk-thermoform',
  heatTimeSec: 0, formTimeSec: 0, trimTimeSec: 20, indexTimeSec: 10,
  oee: 0.8, manning: 1, labourEfficiency: 0.92, toolCost: 0, amortizationVolume: 50000,
  sheetThicknessMm: 2,
});

describe('thermoforming engine — physics wiring', () => {
  it('adds a part-level oven-energy consumable', () => {
    const d = computeThermoformingDrivers(base());
    expect(d.rawMaterial.consumablesCostPerPart ?? 0).toBeGreaterThan(0);
  });
  it('twin-sheet consumes more heating energy than vacuum', () => {
    const vac = computeThermoformingDrivers({ ...base(), method: 'vacuum' });
    const twin = computeThermoformingDrivers({ ...base(), method: 'twin_sheet' });
    expect(twin.rawMaterial.consumablesCostPerPart!).toBeGreaterThan(vac.rawMaterial.consumablesCostPerPart!);
  });
  it('auto-fills heat + cool from thickness when left at 0 (cycle > pure trim/index)', () => {
    const d = computeThermoformingDrivers(base());
    // cycle includes auto heat + form + cool on top of trim(20)+index(10)
    expect(d.operations[0].cycleTimeHr).toBeGreaterThan((20 + 10) / 3600);
  });
  it('auto-estimates tooling when toolCost ≤ 0', () => {
    const d = computeThermoformingDrivers(base());
    expect(d.tooling.totalToolingCost).toBeGreaterThan(0);
  });
  it('optional inspection op is added on request', () => {
    expect(computeThermoformingDrivers(base()).operations.length).toBe(1);
    expect(computeThermoformingDrivers({ ...base(), includeInspection: true }).operations.length).toBe(2);
  });
  it('reject rate uplifts net weight and cycle time', () => {
    const clean = computeThermoformingDrivers({ ...base(), rejectRate: 0 });
    const rejects = computeThermoformingDrivers({ ...base(), rejectRate: 0.1 });
    expect(rejects.rawMaterial.netWeightKg).toBeCloseTo(0.25 / 0.9, 4);
    expect(rejects.operations[0].cycleTimeHr).toBeGreaterThan(clean.operations[0].cycleTimeHr);
  });
  it('produces a positive full-stack total on a real sheet grade', () => {
    const d = computeThermoformingDrivers(base());
    const r = computeUniversalStack({
      partName: 'Test Part', packagingPerPart: 0.10, logisticsPerPart: 0.15, overheadPct: 0.10, marginPct: 0.08,
      rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── Country prices ────────────────────────────────────────────────────────────

describe('thermoforming — authentic country prices (not multiplier-scaled)', () => {
  const lib = DEFAULT_RATE_LIBRARY;
  const matPrice = (l: typeof lib, id: string) => l.materials.find(m => m.id === id)!.pricePerKg;

  it('a country price replaces the family multiplier with the real regional quote', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    expect(matPrice(cn, 'mat-apet-tf')).toBeCloseTo(1.28, 6);
    expect(matPrice(cn, 'mat-apet-tf')).toBe(THERMOFORMING_COUNTRY_PRICES['mat-apet-tf']!.CN);
    expect(matPrice(cn, 'mat-apet-tf')).not.toBeCloseTo(matPrice(lib, 'mat-apet-tf'), 3);
  });
  it('every listed country price lands verbatim in that region library', () => {
    for (const [id, byRegion] of Object.entries(THERMOFORMING_COUNTRY_PRICES)) {
      for (const [region, price] of Object.entries(byRegion)) {
        const rl = buildRegionalLibrary(lib, region as any);
        expect(matPrice(rl, id)).toBeCloseTo(price as number, 6);
      }
    }
  });
  it('spread is grade-specific: commodity HIPS swings wider than specialty PC', () => {
    const spread = (r: Record<string, number>, b: number) => {
      const v = Object.values(r); return (Math.max(...v) - Math.min(...v)) / b;
    };
    const hipsSpread = spread(THERMOFORMING_COUNTRY_PRICES['mat-hips-tf'] as Record<string, number>, matPrice(lib, 'mat-hips-tf'));
    const pcSpread = spread(THERMOFORMING_COUNTRY_PRICES['mat-pc-tf'] as Record<string, number>, matPrice(lib, 'mat-pc-tf'));
    expect(hipsSpread).toBeGreaterThan(pcSpread);
  });
  it('UK build leaves thermoforming sheet grades at their base price', () => {
    const uk = buildRegionalLibrary(lib, 'UK');
    expect(matPrice(uk, 'mat-hips-tf')).toBeCloseTo(matPrice(lib, 'mat-hips-tf'), 6);
    expect(matPrice(uk, 'mat-pc-tf')).toBeCloseTo(matPrice(lib, 'mat-pc-tf'), 6);
  });
});
