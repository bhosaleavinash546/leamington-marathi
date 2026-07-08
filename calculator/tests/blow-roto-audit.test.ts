import { describe, it, expect } from 'vitest';
import { computeBlowMouldingDrivers, type BlowMouldingInputs } from '../src/engine/modules/blow-moulding.js';
import { computeRotationalMouldingDrivers, type RotationalMouldingInputs } from '../src/engine/modules/rotational-moulding.js';
import { estimateBlowMouldCost, analyseBlowDFM, blowMouldMaterialFactor } from '../src/engine/modules/blow-advisor.js';
import { estimateRotoCycle, estimateRotoMouldCost, analyseRotoDFM } from '../src/engine/modules/roto-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const lib = DEFAULT_RATE_LIBRARY;

const BLOW: BlowMouldingInputs = {
  materialId: 'mat-hdpe-bm', partWeightKg: 0.05, flashWeightKg: 0.005, wallThicknessMm: 1.5,
  coolTimeFactorSPerMm2: 3.0, blowTimeSec: 5, openCloseSec: 5, machineId: 'blow-ebm-2head',
  labourId: 'lab-uk-blow', cavities: 2, oee: 0.8, manning: 1, labourEfficiency: 0.95,
  mouldCost: 8000, mouldLife: 1000000, amortizationVolume: 500000,
};

const ROTO: RotationalMouldingInputs = {
  materialId: 'mat-lldpe-roto', partWeightKg: 5, powderCostAdderPerKg: 0.25, numArms: 3, partsPerArm: 1,
  heatingTimeSec: 900, coolingTimeSec: 1200, loadUnloadTimeSec: 180, machineId: 'rotomould-biaxial',
  labourId: 'lab-uk-roto', oee: 0.75, manning: 2, labourEfficiency: 0.92,
  mouldCost: 8000, mouldLife: 100000, amortizationVolume: 5000,
};

// ─── Blow process label bug fix ───────────────────────────────────────────────

describe('Blow — process label matches the real machine-id prefixes', () => {
  it('IBM and SBM machines are no longer mislabelled Extrusion Blow Moulding', () => {
    const ebm = computeBlowMouldingDrivers({ ...BLOW, machineId: 'blow-ebm-2head' });
    const ibm = computeBlowMouldingDrivers({ ...BLOW, machineId: 'blow-ibm-rotary' });
    const sbm = computeBlowMouldingDrivers({ ...BLOW, machineId: 'blow-sbm-2stage' });
    expect(ebm.operations[0].operationName).toBe('Extrusion Blow Moulding');
    expect(ibm.operations[0].operationName).toBe('Injection Blow Moulding');
    expect(sbm.operations[0].operationName).toBe('Stretch Blow Moulding');
  });
});

// ─── Blow mould estimator + consumables ───────────────────────────────────────

describe('Blow — parametric mould estimator + adders', () => {
  it('estimates mould cost when omitted; steel dearer than aluminium; rises with cavities/volume', () => {
    const al = estimateBlowMouldCost({ process: 'ebm', cavities: 2, partVolumeL: 1, mouldMaterial: 'aluminium' }).total;
    const steel = estimateBlowMouldCost({ process: 'sbm', cavities: 2, partVolumeL: 1, mouldMaterial: 'steel-h13' }).total;
    expect(steel).toBeGreaterThan(al);
    const c2 = estimateBlowMouldCost({ process: 'ebm', cavities: 2, partVolumeL: 1 }).total;
    const c8 = estimateBlowMouldCost({ process: 'ebm', cavities: 8, partVolumeL: 1 }).total;
    expect(c8).toBeGreaterThan(c2);
    expect(blowMouldMaterialFactor('steel-h13')).toBeGreaterThan(blowMouldMaterialFactor('aluminium'));
  });

  it('engine uses the estimate when mouldCost omitted', () => {
    const est = computeBlowMouldingDrivers({ ...BLOW, mouldCost: undefined, partVolumeL: 1 });
    const manual = computeBlowMouldingDrivers({ ...BLOW, mouldCost: 8000 });
    expect(est.tooling.totalToolingCost).toBeGreaterThan(0);
    expect(est.tooling.totalToolingCost).not.toBeCloseTo(manual.tooling.totalToolingCost, 0);
  });

  it('SBM preform cost and masterbatch flow into material consumables', () => {
    const base = computeBlowMouldingDrivers(BLOW);
    const withAdders = computeBlowMouldingDrivers({ ...BLOW, preformCostPerPart: 0.03, masterbatchCostPerKg: 0.5 });
    expect(base.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
    expect(withAdders.rawMaterial.consumablesCostPerPart ?? 0).toBeCloseTo(0.03 + 0.5 * BLOW.partWeightKg, 4);
  });
});

describe('Blow — DFM analyser', () => {
  it('clean part scores 10; high BUR + sharp corner + thin wall drop it', () => {
    const clean = analyseBlowDFM({ process: 'ebm', wallThicknessMm: 1.5, blowUpRatio: 2.5, minCornerRadiusMm: 4, toleranceMm: 0.5 });
    expect(clean.score).toBe(10);
    const bad = analyseBlowDFM({ process: 'ebm', wallThicknessMm: 0.3, blowUpRatio: 5, minCornerRadiusMm: 0.2, handleOrWeldLine: true, toleranceMm: 0.05 });
    expect(bad.score).toBeLessThan(6);
    expect(bad.issues.some(i => /blow-up/i.test(i.title))).toBe(true);
  });
});

// ─── Roto cycle predictor / mould estimator / DFM ─────────────────────────────

describe('Roto — cycle-time predictor', () => {
  it('heating rises with wall and material; PA12 slowest; cooling method scales cooling', () => {
    const thin = estimateRotoCycle({ wallThicknessMm: 2, material: 'pe' }).heatingSec;
    const thick = estimateRotoCycle({ wallThicknessMm: 6, material: 'pe' }).heatingSec;
    expect(thick).toBeGreaterThan(thin);
    const pe = estimateRotoCycle({ wallThicknessMm: 4, material: 'pe' }).heatingSec;
    const pa12 = estimateRotoCycle({ wallThicknessMm: 4, material: 'pa12' }).heatingSec;
    expect(pa12).toBeGreaterThan(pe);
    const air = estimateRotoCycle({ wallThicknessMm: 4, material: 'pe', coolingMethod: 'forced-air' }).coolingSec;
    const water = estimateRotoCycle({ wallThicknessMm: 4, material: 'pe', coolingMethod: 'water-spray' }).coolingSec;
    expect(water).toBeLessThan(air);
  });

  it('engine predicts times when heating/cooling ≤0 (longer cycle → higher machine cost)', () => {
    const manual = computeRotationalMouldingDrivers({ ...ROTO, heatingTimeSec: 900, coolingTimeSec: 1200 });
    const predicted = computeRotationalMouldingDrivers({ ...ROTO, heatingTimeSec: 0, coolingTimeSec: 0, wallThicknessMm: 8, rotoMaterial: 'pa12' });
    expect(predicted.operations[0].cycleTimeHr).toBeGreaterThan(manual.operations[0].cycleTimeHr);
  });
});

describe('Roto — mould estimator + DFM + adders', () => {
  it('estimates mould cost by type; CNC dearer than cast; engine uses it when omitted', () => {
    const cast = estimateRotoMouldCost({ projectedAreaCm2: 600, mouldType: 'cast-al' }).total;
    const cnc = estimateRotoMouldCost({ projectedAreaCm2: 600, mouldType: 'cnc-al' }).total;
    expect(cnc).toBeGreaterThan(cast);
    const est = computeRotationalMouldingDrivers({ ...ROTO, mouldCost: 0, projectedAreaCm2: 600, mouldType: 'cast-al' });
    expect(est.tooling.totalToolingCost).toBeGreaterThan(0);
  });

  it('masterbatch adds to consumables on top of the powder grinding premium', () => {
    const base = computeRotationalMouldingDrivers(ROTO);
    const mb = computeRotationalMouldingDrivers({ ...ROTO, masterbatchCostPerKg: 0.4 });
    expect((mb.rawMaterial.consumablesCostPerPart ?? 0)).toBeGreaterThan((base.rawMaterial.consumablesCostPerPart ?? 0));
  });

  it('DFM flags enclosed-no-vent as critical and thin wall / sharp radius', () => {
    const clean = analyseRotoDFM({ wallThicknessMm: 4, minInternalRadiusMm: 15, draftAngleDeg: 2, flatUnsupportedSpanMm: 200 });
    expect(clean.score).toBe(10);
    const bad = analyseRotoDFM({ wallThicknessMm: 1, minInternalRadiusMm: 1, draftAngleDeg: 0, flatUnsupportedSpanMm: 800, enclosedNoVent: true });
    expect(bad.issues.some(i => i.severity === 'critical')).toBe(true);
    expect(bad.score).toBeLessThan(5);
  });
});

// ─── Library additions ────────────────────────────────────────────────────────

describe('Library — new blow/roto materials, machines, labour', () => {
  it('adds blow grades and a roto material family', () => {
    for (const id of ['mat-ldpe-bm', 'mat-lldpe-bm', 'mat-pet-preform', 'mat-tritan-bm', 'mat-biope-bm', 'mat-rhdpe-bm', 'mat-rpp-bm']) {
      expect(lib.materials.find(m => m.id === id)).toBeTruthy();
    }
    const rotoGrades = lib.materials.filter(m => m.category === 'Rotational Moulding');
    expect(rotoGrades.length).toBeGreaterThanOrEqual(8);
    for (const id of ['mat-lldpe-roto', 'mat-xlpe-roto', 'mat-pa12-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto', 'mat-cond-pe-roto', 'mat-rpe-roto']) {
      expect(lib.materials.find(m => m.id === id)).toBeTruthy();
    }
  });

  it('adds roto machine classes and blow/roto labour rows', () => {
    for (const id of ['rotomould-lab-1arm', 'rotomould-shuttle', 'rotomould-rocknroll', 'rotomould-carousel-4arm']) {
      expect(lib.machines.find(m => m.id === id)).toBeTruthy();
    }
    expect(lib.labour.find(l => l.id === 'lab-uk-blow')).toBeTruthy();
    expect(lib.labour.find(l => l.id === 'lab-uk-roto')).toBeTruthy();
  });
});
