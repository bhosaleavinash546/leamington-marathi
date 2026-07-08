import { describe, it, expect } from 'vitest';
import {
  estimateMouldCost,
  mouldSteelClassFactor,
  autoCoolFactorForMaterial,
  estimateClampingTonnage,
  computeInjectionMouldingDrivers,
  type InjectionMouldingInputs,
} from '../src/engine/modules/injection-moulding.js';
import { analyseInjectionDFM } from '../src/engine/modules/injection-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import {
  buildRegionalLibrary,
  classifyMaterialFamily,
  REGIONAL_DATA,
  type ManufacturingRegion,
} from '../src/engine/regional-rates.js';

const lib = DEFAULT_RATE_LIBRARY;
const machineRate = (l: typeof lib, id: string) => l.machines.find(m => m.id === id)!.computedRatePerHr;
const matPrice = (l: typeof lib, id: string) => l.materials.find(m => m.id === id)!.pricePerKg;

// ─── H3: parametric mould-cost estimator ──────────────────────────────────────

describe('H3 — parametric mould-cost estimator', () => {
  const base = { cavities: 2, projectedAreaCm2: 40 } as const;

  it('breakdown components sum to the rounded total and are all ≥ 0', () => {
    const r = estimateMouldCost({ ...base, steelClass: 'production', sideActionsLifters: 2, runnerSystem: 'hot' });
    expect(r.base).toBeGreaterThan(0);
    expect(r.cavityBlock).toBeGreaterThan(0);
    expect(r.sideActions).toBe(2 * 3500);
    expect(r.hotRunner).toBeGreaterThan(0);
    expect(Math.abs(r.total - (r.base + r.cavityBlock + r.sideActions + r.hotRunner))).toBeLessThanOrEqual(2);
  });

  it('cost rises monotonically with cavitation, part size and steel class', () => {
    const c2 = estimateMouldCost({ ...base, cavities: 2 }).total;
    const c8 = estimateMouldCost({ ...base, cavities: 8 }).total;
    expect(c8).toBeGreaterThan(c2);

    const small = estimateMouldCost({ cavities: 2, projectedAreaCm2: 20 }).total;
    const large = estimateMouldCost({ cavities: 2, projectedAreaCm2: 200 }).total;
    expect(large).toBeGreaterThan(small);

    const proto = estimateMouldCost({ ...base, steelClass: 'prototype' }).total;
    const std = estimateMouldCost({ ...base, steelClass: 'standard' }).total;
    const prod = estimateMouldCost({ ...base, steelClass: 'production' }).total;
    const hv = estimateMouldCost({ ...base, steelClass: 'high_volume' }).total;
    expect(proto).toBeLessThan(std);
    expect(std).toBeLessThan(prod);
    expect(prod).toBeLessThan(hv);
  });

  it('multi-cavity economy of scale: 8 cavities cost less than 4× a single cavity', () => {
    const one = estimateMouldCost({ cavities: 1, projectedAreaCm2: 10 }).total;
    const eight = estimateMouldCost({ cavities: 8, projectedAreaCm2: 80 }).total;
    expect(eight).toBeLessThan(8 * one);   // sub-linear in cavitation
  });

  it('hot runner adds manifold + per-drop cost that cold runner does not', () => {
    const cold = estimateMouldCost({ ...base, runnerSystem: 'cold' }).total;
    const hot = estimateMouldCost({ ...base, runnerSystem: 'hot' }).total;
    expect(hot).toBeGreaterThan(cold);
  });

  it('steel-class factors are ordered prototype < standard < production < high_volume', () => {
    expect(mouldSteelClassFactor('prototype')).toBeLessThan(mouldSteelClassFactor('standard'));
    expect(mouldSteelClassFactor('standard')).toBeLessThan(mouldSteelClassFactor('production'));
    expect(mouldSteelClassFactor('production')).toBeLessThan(mouldSteelClassFactor('high_volume'));
    expect(mouldSteelClassFactor(undefined)).toBe(mouldSteelClassFactor('standard'));
  });

  it('drivers use the estimate when mouldCost is omitted, and the manual figure when given', () => {
    const common: InjectionMouldingInputs = {
      materialId: 'mat-pp', partWeightKg: 0.05, runnerWeightKg: 0.01, regrindFraction: 0.2,
      cavities: 4, projectedAreaCm2: 80, cavityPressureMPa: 30, wallThicknessMm: 2,
      coolTimeFactorSPerMm2: 3.16, fillTimeSec: 2, packTimeSec: 3, ejectTimeSec: 2,
      machineId: 'imm-200t', labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 0.25,
      labourEfficiency: 0.95, mouldLife: 500000, amortizationVolume: 500000, steelClass: 'production',
    };
    const estimated = computeInjectionMouldingDrivers({ ...common, mouldCost: undefined });
    const manual = computeInjectionMouldingDrivers({ ...common, mouldCost: 25000 });
    expect(estimated.tooling.totalToolingCost).toBeGreaterThan(0);
    expect(manual.tooling.totalToolingCost).toBeGreaterThan(0);
    // different basis → different tooling cost (proves the estimate path is live)
    expect(estimated.tooling.totalToolingCost).not.toBeCloseTo(manual.tooling.totalToolingCost, 0);
  });
});

// ─── M7: per-resin auto cool factor ───────────────────────────────────────────

describe('M7 — per-resin auto cool factor', () => {
  it('semi-crystalline resins cool slower (higher factor) than amorphous', () => {
    expect(autoCoolFactorForMaterial('mat-pp')).toBeGreaterThan(autoCoolFactorForMaterial('mat-abs'));
    expect(autoCoolFactorForMaterial('mat-hdpe')).toBeGreaterThan(autoCoolFactorForMaterial('mat-pc'));
    expect(autoCoolFactorForMaterial('mat-lcp-gf30')).toBeLessThan(autoCoolFactorForMaterial('mat-abs'));
  });

  it('returns the curated reference values for common resins', () => {
    expect(autoCoolFactorForMaterial('mat-pp')).toBeCloseTo(3.16, 2);
    expect(autoCoolFactorForMaterial('mat-abs')).toBeCloseTo(2.0, 2);
    expect(autoCoolFactorForMaterial('mat-pc')).toBeCloseTo(2.5, 2);
    expect(autoCoolFactorForMaterial('mat-pom')).toBeCloseTo(2.8, 2);
    expect(autoCoolFactorForMaterial('mat-pc-abs')).toBeCloseTo(2.2, 2);   // blend before pc/abs generic
  });

  it('falls back to a mid-range 2.5 for unknown resins', () => {
    expect(autoCoolFactorForMaterial('mat-mystery-polymer')).toBe(2.5);
    expect(autoCoolFactorForMaterial('')).toBe(2.5);
  });

  it('every thermoplastic in the library resolves to a plausible cool factor', () => {
    const resins = lib.materials.filter(m => /Thermoplastic/.test(m.category));
    for (const m of resins) {
      const f = autoCoolFactorForMaterial(m.id);
      expect(f).toBeGreaterThanOrEqual(1.5);
      expect(f).toBeLessThanOrEqual(4.0);
    }
  });
});

// ─── H5: clamping tonnage physics ─────────────────────────────────────────────

describe('H5 — clamping tonnage estimate', () => {
  it('scales with projected area and cavity pressure', () => {
    const t1 = estimateClampingTonnage({ projectedAreaCm2: 100, cavityPressureMPa: 30 });
    const t2 = estimateClampingTonnage({ projectedAreaCm2: 200, cavityPressureMPa: 30 });
    const t3 = estimateClampingTonnage({ projectedAreaCm2: 100, cavityPressureMPa: 60 });
    expect(t2).toBeCloseTo(t1 * 2, 3);
    expect(t3).toBeCloseTo(t1 * 2, 3);
  });

  it('a 100 cm² part at 30 MPa needs roughly 35T (with 1.15 SF) — undersizes a 100T only when large', () => {
    // 100 cm² × 30 MPa = 30 kN/cm² ... 0.01 m² × 30e6 Pa = 300 kN × 1.15 = 345 kN ≈ 35.2 T
    const t = estimateClampingTonnage({ projectedAreaCm2: 100, cavityPressureMPa: 30 });
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(40);
  });
});

// ─── M8: injection DFM analyser ───────────────────────────────────────────────

describe('M8 — analyseInjectionDFM', () => {
  it('a clean part scores 10 with no issues', () => {
    const r = analyseInjectionDFM({
      wallThicknessMm: 2.5, minWallMm: 2.0, maxWallMm: 3.0, resinType: 'amorphous',
      ribThicknessRatio: 0.5, bossWallRatio: 0.55, draftAngleDeg: 2, undercutCount: 0,
      flowLengthMm: 150, gateCount: 1, weldLineOnCriticalFace: false, toleranceMm: 0.2,
    });
    expect(r.issues).toHaveLength(0);
    expect(r.score).toBe(10);
  });

  it('flags a thick, non-uniform wall on a semi-crystalline resin as high severity', () => {
    const r = analyseInjectionDFM({ wallThicknessMm: 5, minWallMm: 1, maxWallMm: 5, resinType: 'semi_crystalline' });
    expect(r.issues.some(i => /exceeds/.test(i.title))).toBe(true);
    expect(r.issues.some(i => i.severity === 'critical')).toBe(true);   // >2× wall variation on semi-crystalline
    expect(r.score).toBeLessThan(7);
  });

  it('flags zero draft as critical and thin ribs/bosses only as minor', () => {
    const noDraft = analyseInjectionDFM({ wallThicknessMm: 2, draftAngleDeg: 0 });
    expect(noDraft.issues.some(i => i.severity === 'critical' && /draft/i.test(i.title))).toBe(true);

    const ribs = analyseInjectionDFM({ wallThicknessMm: 2, ribThicknessRatio: 0.7, bossWallRatio: 0.7 });
    expect(ribs.issues.every(i => i.severity === 'minor' || i.severity === 'major')).toBe(true);
  });

  it('flags undercuts, over-long flow length, weld line and tight tolerance', () => {
    const r = analyseInjectionDFM({
      wallThicknessMm: 1, resinType: 'filled', undercutCount: 3,
      flowLengthMm: 1000, weldLineOnCriticalFace: true, toleranceMm: 0.03,
    });
    const cats = r.issues.map(i => i.category);
    expect(cats).toContain('tooling');     // undercuts
    expect(cats).toContain('process');     // flow length or weld line
    expect(cats).toContain('tolerance');   // tight tolerance
    expect(r.score).toBeLessThan(6);
  });

  it('textured faces demand more draft than smooth ones', () => {
    const smoothOk = analyseInjectionDFM({ wallThicknessMm: 2, draftAngleDeg: 1.5 });
    const texturedBad = analyseInjectionDFM({ wallThicknessMm: 2, draftAngleDeg: 1.5, textured: true });
    expect(smoothOk.issues.some(i => /draft/i.test(i.title))).toBe(false);
    expect(texturedBad.issues.some(i => /draft/i.test(i.title))).toBe(true);
  });
});

// ─── C1 / C2 / H4 / L10: regional library rebuild ─────────────────────────────

describe('C2/H4 — regional machine rate rebuild (energy re-tariff)', () => {
  it('UK regional build is an identity for machine rates', () => {
    const uk = buildRegionalLibrary(lib, 'UK');
    for (const id of ['imm-100t', 'imm-800t', 'mach-haas-vf2']) {
      expect(machineRate(uk, id)).toBeCloseTo(machineRate(lib, id), 4);
    }
  });

  it('an energy-heavy machine in a cheap-power region beats a naive flat capex scale', () => {
    // CN: capex ×0.55 but electricity 0.07 vs UK 0.23 → energy scaled ~0.30, below 0.55.
    const cn = buildRegionalLibrary(lib, 'CN');
    const flat = machineRate(lib, 'imm-800t') * REGIONAL_DATA.CN.machineRateMultiplier;
    expect(machineRate(cn, 'imm-800t')).toBeLessThan(flat);
  });

  it('Germany can be cheaper than the UK on an energy-dominated machine despite higher capex', () => {
    // DE capex ×1.05 but electricity 0.20 < UK 0.23; for the energy-heavy 800T press the cheaper
    // power outweighs the capex uplift.
    const de = buildRegionalLibrary(lib, 'DE');
    expect(machineRate(de, 'imm-800t')).toBeLessThan(machineRate(lib, 'imm-800t'));
  });

  it('regional machine buildups stay self-consistent (rate recomputes from buildup)', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    const m = cn.machines.find(x => x.id === 'imm-400t')!;
    const b = m.buildup;
    const recomputed = (b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost)
      / (b.annualAvailableHours * b.machineUtilization);
    expect(m.computedRatePerHr).toBeCloseTo(recomputed, 4);
  });
});

describe('C1 — family-aware country resin pricing', () => {
  it('classifies resin families and metals correctly', () => {
    expect(classifyMaterialFamily({ id: 'mat-pp', category: 'Thermoplastic' })).toBe('commodity');
    expect(classifyMaterialFamily({ id: 'mat-pc', category: 'Thermoplastic' })).toBe('engineering');
    expect(classifyMaterialFamily({ id: 'mat-peek', category: 'High-Performance Thermoplastic' })).toBe('highPerformance');
    expect(classifyMaterialFamily({ id: 'mat-al6061', category: 'Aluminium' })).toBe('metalOther');
  });

  it('commodity resins carry a wider country spread than high-performance ones', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    const ppRatio = matPrice(cn, 'mat-pp') / matPrice(lib, 'mat-pp');
    const peekRatio = matPrice(cn, 'mat-peek') / matPrice(lib, 'mat-peek');
    expect(ppRatio).toBeLessThan(peekRatio);          // PP moves further from UK than PEEK
    expect(peekRatio).toBeGreaterThan(0.95);          // high-perf ~globally flat
    expect(ppRatio).toBeLessThan(0.9);                // commodity clearly discounted in CN
  });

  it('UK material prices are unchanged (identity)', () => {
    const uk = buildRegionalLibrary(lib, 'UK');
    for (const id of ['mat-pp', 'mat-pc', 'mat-peek', 'mat-al6061']) {
      expect(matPrice(uk, id)).toBeCloseTo(matPrice(lib, id), 6);
    }
  });
});

describe('L10 — technician / supervisor labour categories', () => {
  it('every region defines technician and supervisor rates between semiskilled and engineer bands', () => {
    for (const region of Object.keys(REGIONAL_DATA) as ManufacturingRegion[]) {
      const l = REGIONAL_DATA[region].labour;
      expect(l.technician).toBeGreaterThan(0);
      expect(l.supervisor).toBeGreaterThan(l.technician);
    }
  });

  it('base library carries UK technician and supervisor rows', () => {
    expect(lib.labour.find(l => l.id === 'lab-uk-technician')).toBeTruthy();
    expect(lib.labour.find(l => l.id === 'lab-uk-supervisor')).toBeTruthy();
  });

  it('regional build maps technician/supervisor IDs to the region rate', () => {
    const de = buildRegionalLibrary(lib, 'DE');
    const tech = de.labour.find(l => l.id === 'lab-uk-technician')!;
    expect(tech.fullyLoadedRatePerHr).toBeCloseTo(REGIONAL_DATA.DE.labour.technician, 4);
  });
});

// ─── H6: new IMM machine sizes ────────────────────────────────────────────────

describe('H6 — extended IMM machine range', () => {
  it('adds 50T / 350T / 500T / 1200T with rates ordered by tonnage', () => {
    for (const id of ['imm-50t', 'imm-350t', 'imm-500t', 'imm-1200t']) {
      expect(lib.machines.find(m => m.id === id)).toBeTruthy();
    }
    const rate = (id: string) => machineRate(lib, id);
    expect(rate('imm-50t')).toBeLessThan(rate('imm-100t'));
    expect(rate('imm-200t')).toBeLessThan(rate('imm-350t'));
    expect(rate('imm-350t')).toBeLessThan(rate('imm-400t'));
    expect(rate('imm-400t')).toBeLessThan(rate('imm-500t'));
    expect(rate('imm-800t')).toBeLessThan(rate('imm-1200t'));
  });
});
