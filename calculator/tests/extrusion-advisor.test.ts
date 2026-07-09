import { describe, it, expect } from 'vitest';
import {
  estimateExtrusionLineRate, estimateExtrusionSpecificEnergy, estimateExtrusionDieCost,
  estimateDieSwellPct, analyseExtrusionDFM, extrusionFamilyOf,
} from '../src/engine/modules/extrusion-advisor.js';
import { computeExtrusionDrivers } from '../src/engine/modules/extrusion.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, EXTRUSION_COUNTRY_PRICES } from '../src/engine/regional-rates.js';

describe('extrusion advisor — line rate (screw output vs cooling limit)', () => {
  it('thin-wall is screw-output-limited; thick-wall becomes cooling-limited', () => {
    const thin = estimateExtrusionLineRate({ screwDiameterMm: 90, family: 'pe', wallThicknessMm: 1, profileKgPerM: 0.2, cooling: 'water-bath' });
    const thick = estimateExtrusionLineRate({ screwDiameterMm: 90, family: 'pe', wallThicknessMm: 12, profileKgPerM: 3.0, cooling: 'water-bath' });
    expect(thick.limitedBy).toBe('cooling');
    // cooling limit falls with wall thickness
    expect(thick.coolingLimitedKgHr!).toBeLessThan(thick.outputLimitedKgHr);
    expect(thin.lineRateKgHr).toBeGreaterThan(0);
  });
  it('twin-screw pushes more mass than single of the same diameter', () => {
    const single = estimateExtrusionLineRate({ screwDiameterMm: 90, family: 'pe', screwType: 'single' });
    const twin = estimateExtrusionLineRate({ screwDiameterMm: 90, family: 'pe', screwType: 'twin' });
    expect(twin.outputLimitedKgHr).toBeGreaterThan(single.outputLimitedKgHr);
  });
  it('rigid PVC runs slower than PE at the same screw', () => {
    const pe = estimateExtrusionLineRate({ screwDiameterMm: 75, family: 'pe' });
    const pvc = estimateExtrusionLineRate({ screwDiameterMm: 75, family: 'rigid-pvc' });
    expect(pvc.outputLimitedKgHr).toBeLessThan(pe.outputLimitedKgHr);
  });
});

describe('extrusion advisor — energy, die swell, die cost', () => {
  it('specific energy: high-melt PC > PVC, twin adds shear energy', () => {
    expect(estimateExtrusionSpecificEnergy('pc')).toBeGreaterThan(estimateExtrusionSpecificEnergy('rigid-pvc'));
    expect(estimateExtrusionSpecificEnergy('pe', 'twin')).toBeGreaterThan(estimateExtrusionSpecificEnergy('pe', 'single'));
  });
  it('die swell: PE >> PC', () => {
    expect(estimateDieSwellPct('pe')).toBeGreaterThan(estimateDieSwellPct('pc'));
  });
  it('die cost: complex > simple, co-ex adds a per-layer manifold', () => {
    const simple = estimateExtrusionDieCost({ process: 'profile', sizeMm: 60, complexity: 'simple' });
    const complex = estimateExtrusionDieCost({ process: 'profile-complex', sizeMm: 60, complexity: 'complex' });
    expect(complex.total).toBeGreaterThan(simple.total);
    const mono = estimateExtrusionDieCost({ process: 'coex', sizeMm: 60, layers: 1 });
    const three = estimateExtrusionDieCost({ process: 'coex', sizeMm: 60, layers: 3 });
    expect(three.layers).toBeGreaterThan(mono.layers);
    expect(three.total).toBeGreaterThan(mono.total);
    expect(complex.calibration).toBeGreaterThan(0);
  });
  it('family classifier maps grades sensibly', () => {
    expect(extrusionFamilyOf('uPVC Pipe Compound')).toBe('rigid-pvc');
    expect(extrusionFamilyOf('PVC Cable Compound (flexible)')).toBe('flex-pvc');
    expect(extrusionFamilyOf('PE100 Pipe Grade')).toBe('pe');
    expect(extrusionFamilyOf('PA12 Extrusion')).toBe('pa');
  });
});

describe('extrusion advisor — DFM', () => {
  it('clean geometry scores 10 with no issues', () => {
    const r = analyseExtrusionDFM({ process: 'profile', family: 'rigid-pvc', wallThicknessMm: 2, minWallMm: 1.5, maxWallMm: 3, minInternalRadiusMm: 1.5, toleranceMm: 0.3 });
    expect(r.issues.length).toBe(0);
    expect(r.score).toBe(10);
  });
  it('flags thin wall, wall-ratio and sub-process tolerance', () => {
    const r = analyseExtrusionDFM({ process: 'profile', family: 'pe', wallThicknessMm: 2, minWallMm: 0.3, maxWallMm: 5, toleranceMm: 0.02 });
    const titles = r.issues.map(i => i.title).join(' | ');
    expect(titles).toMatch(/Min wall/);
    expect(titles).toMatch(/ratio/i);
    expect(titles).toMatch(/Tolerance/);
    expect(r.score).toBeLessThan(10);
  });
});

describe('extrusion engine — integration', () => {
  const base = () => ({
    materialId: 'mat-pe100-pipe', profileWeightKgPerM: 0.5, partLengthM: 6, lineRateKgPerHr: 0,
    extruderId: 'extruder-pipe-line', labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.95,
    startupScrapFraction: 0.03, dieCost: 0, amortizationVolume: 100000,
    family: 'pe' as const, process: 'pipe' as const, screwDiameterMm: 90, wallThicknessMm: 3, cooling: 'water-bath' as const,
  });

  it('auto-estimates line rate when lineRate ≤ 0 (cycle time is finite)', () => {
    const d = computeExtrusionDrivers(base());
    expect(d.operations[0].cycleTimeHr).toBeGreaterThan(0);
    expect(Number.isFinite(d.operations[0].cycleTimeHr)).toBe(true);
  });

  it('auto-estimates die cost when dieCost ≤ 0', () => {
    const d = computeExtrusionDrivers(base());
    expect(d.tooling.totalToolingCost).toBeGreaterThan(0);
  });

  it('adds a variable process-energy consumable', () => {
    const d = computeExtrusionDrivers({ ...base(), energyPricePerKwh: 0.25 });
    expect(d.rawMaterial.consumablesCostPerPart ?? 0).toBeGreaterThan(0);
  });

  it('colour/die changes raise gross weight (more scrap)', () => {
    const noChange = computeExtrusionDrivers({ ...base(), lineRateKgPerHr: 200, colourChangesPerDay: 0, dieChangesPerDay: 0 });
    const changes  = computeExtrusionDrivers({ ...base(), lineRateKgPerHr: 200, colourChangesPerDay: 6, dieChangesPerDay: 2 });
    expect(changes.rawMaterial.materialUtilization).toBeLessThan(noChange.rawMaterial.materialUtilization);
  });

  it('finishing op on by default; leak test opt-in', () => {
    const d1 = computeExtrusionDrivers(base());
    expect(d1.operations.some(o => o.operationName.includes('Cut-off'))).toBe(true);
    expect(d1.operations.some(o => o.operationName.includes('Leak'))).toBe(false);
    const d2 = computeExtrusionDrivers({ ...base(), includeLeakTest: true });
    expect(d2.operations.some(o => o.operationName.includes('Leak'))).toBe(true);
  });
});

describe('extrusion — authentic country prices (not multiplier-scaled)', () => {
  const lib = DEFAULT_RATE_LIBRARY;
  const matPrice = (l: typeof lib, id: string) => l.materials.find(m => m.id === id)!.pricePerKg;

  it('a country price replaces the family multiplier with the real regional quote', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    // CN PE100 pipe grade is the authentic 1.08 £/kg, NOT UK 1.35 × commodity factor.
    expect(matPrice(cn, 'mat-pe100-pipe')).toBeCloseTo(1.08, 6);
    expect(matPrice(cn, 'mat-pe100-pipe')).toBe(EXTRUSION_COUNTRY_PRICES['mat-pe100-pipe']!.CN);
    // And it is genuinely different from the UK base (a real regional price, not identity).
    expect(matPrice(cn, 'mat-pe100-pipe')).not.toBeCloseTo(matPrice(lib, 'mat-pe100-pipe'), 3);
  });

  it('every country price for a grade lands verbatim in that region library', () => {
    for (const [id, byRegion] of Object.entries(EXTRUSION_COUNTRY_PRICES)) {
      for (const [region, price] of Object.entries(byRegion)) {
        const rl = buildRegionalLibrary(lib, region as any);
        expect(matPrice(rl, id)).toBeCloseTo(price as number, 6);
      }
    }
  });

  it('spread is grade-specific: commodity PE swings wider by country than specialty PC', () => {
    const pe = EXTRUSION_COUNTRY_PRICES['mat-pe100-pipe']!;
    const pc = EXTRUSION_COUNTRY_PRICES['mat-pc-ext-sheet']!;
    const spread = (r: Record<string, number>, base: number) => {
      const vals = Object.values(r);
      return (Math.max(...vals) - Math.min(...vals)) / base;
    };
    const peSpread = spread(pe as Record<string, number>, matPrice(lib, 'mat-pe100-pipe'));
    const pcSpread = spread(pc as Record<string, number>, matPrice(lib, 'mat-pc-ext-sheet'));
    expect(peSpread).toBeGreaterThan(pcSpread);   // feedstock-linked resin moves more than a global specialty
  });

  it('scrap-recovery credit scales with the authentic/UK price ratio', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    const ukMat = lib.materials.find(m => m.id === 'mat-pe100-pipe')!;
    const cnMat = cn.materials.find(m => m.id === 'mat-pe100-pipe')!;
    const ratio = 1.08 / ukMat.pricePerKg;
    expect(cnMat.scrapRecoveryPricePerKg).toBeCloseTo(ukMat.scrapRecoveryPricePerKg * ratio, 6);
  });

  it('UK build leaves extrusion grades at their base price (no override for the base region)', () => {
    const uk = buildRegionalLibrary(lib, 'UK');
    expect(matPrice(uk, 'mat-pe100-pipe')).toBeCloseTo(matPrice(lib, 'mat-pe100-pipe'), 6);
    expect(matPrice(uk, 'mat-pc-ext-sheet')).toBeCloseTo(matPrice(lib, 'mat-pc-ext-sheet'), 6);
  });

  it('a non-extrusion material still uses the family multiplier (override is scoped)', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    // mat-pp is a general resin with no country override → still multiplier-scaled, below UK.
    expect(matPrice(cn, 'mat-pp')).toBeLessThan(matPrice(lib, 'mat-pp'));
  });
});
