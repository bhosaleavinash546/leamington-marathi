import { describe, it, expect } from 'vitest';
import {
  estimateExtrusionLineRate, estimateExtrusionSpecificEnergy, estimateExtrusionDieCost,
  estimateDieSwellPct, analyseExtrusionDFM, extrusionFamilyOf,
} from '../src/engine/modules/extrusion-advisor.js';
import { computeExtrusionDrivers } from '../src/engine/modules/extrusion.js';

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
