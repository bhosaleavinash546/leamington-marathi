import { describe, it, expect } from 'vitest';
import { computeBlowMouldingDrivers } from '../src/engine/modules/blow-moulding.js';
import { computeExtrusionDrivers } from '../src/engine/modules/extrusion.js';
import { computeThermoformingDrivers } from '../src/engine/modules/thermoforming.js';
import { computeRotationalMouldingDrivers } from '../src/engine/modules/rotational-moulding.js';
import { computeInjectionMouldingDrivers } from '../src/engine/modules/injection-moulding.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const STACK_DEFAULTS = {
  partName: 'Test Part',
  packagingPerPart: 0.10,
  logisticsPerPart: 0.15,
  overheadPct: 0.10,
  marginPct: 0.08,
};

// ─── Blow Moulding ───────────────────────────────────────────────────────────

const BM_INPUTS = {
  materialId: 'mat-hdpe',
  partWeightKg: 0.05,
  flashWeightKg: 0.005,
  wallThicknessMm: 1.5,
  coolTimeFactorSPerMm2: 3.5,
  blowTimeSec: 5,
  openCloseSec: 5,
  parisonExtrusionTimeSec: 0,    // disable parison time to isolate cooling time in this test
  machineId: 'blow-ebm-100l',
  labourId: 'lab-uk-semiskilled',
  cavities: 2,
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.95,
  mouldCost: 8000,
  mouldLife: 1000000,
  amortizationVolume: 500000,
};

describe('Blow Moulding module', () => {
  it('cooling time = coolFactor × wall²', () => {
    const d = computeBlowMouldingDrivers(BM_INPUTS);
    const coolingTimeSec = 3.5 * 1.5 ** 2;           // 7.875s
    const cycleTimeSec = 5 + coolingTimeSec + 5;      // 17.875s
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(cycleTimeSec / 3600, 6);
  });

  it('material utilization = partWt / (partWt + flashWt)', () => {
    const d = computeBlowMouldingDrivers(BM_INPUTS);
    const expected = 0.05 / (0.05 + 0.005);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(expected, 6);
  });

  it('partsPerCycle = cavities', () => {
    const d = computeBlowMouldingDrivers(BM_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(2);
  });

  it('tooling = mouldCost × ceil(amortVol / (mouldLife × cavities))', () => {
    const d = computeBlowMouldingDrivers(BM_INPUTS);
    const numMoulds = Math.ceil(500000 / (1000000 * 2));  // = 1
    expect(d.tooling.totalToolingCost).toBeCloseTo(8000 * numMoulds, 2);
  });

  it('deflash operation added when deflashCycleTimeSec > 0', () => {
    const with_deflash = computeBlowMouldingDrivers({
      ...BM_INPUTS,
      deflashMachineId: 'bench-assembly',
      deflashLabourId: 'lab-uk-semiskilled',
      deflashCycleTimeSec: 6,
    });
    expect(with_deflash.operations).toHaveLength(2);
    expect(with_deflash.operations[1].operationName).toBe('Deflashing');
    expect(with_deflash.operations[1].cycleTimeHr).toBeCloseTo(6 / 3600, 8);
  });

  it('no deflash operation when deflashCycleTimeSec is 0', () => {
    const d = computeBlowMouldingDrivers({ ...BM_INPUTS, deflashMachineId: 'bench-assembly', deflashLabourId: 'lab-uk-semiskilled', deflashCycleTimeSec: 0 });
    expect(d.operations).toHaveLength(1);
  });

  it('full stack produces positive total', () => {
    const d = computeBlowMouldingDrivers(BM_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── Extrusion ───────────────────────────────────────────────────────────────

const EXT_INPUTS = {
  materialId: 'mat-hdpe',
  profileWeightKgPerM: 0.20,
  partLengthM: 2.0,
  lineRateKgPerHr: 250,
  extruderId: 'extruder-75mm',
  labourId: 'lab-uk-semiskilled',
  oee: 0.82,
  manning: 1,
  labourEfficiency: 0.95,
  startupScrapFraction: 0.03,
  dieCost: 3000,
  amortizationVolume: 100000,
};

describe('Extrusion module', () => {
  it('partWeightKg = profileKgPerM × partLengthM', () => {
    const d = computeExtrusionDrivers(EXT_INPUTS);
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(0.20 * 2.0, 6);
  });

  it('cycle time = grossWeightKg / lineRateKgPerHr (line runs the scrap mass too)', () => {
    const d = computeExtrusionDrivers(EXT_INPUTS);
    // Gross-weight based: the line must extrude the scrapped material as well.
    const grossKg = d.rawMaterial.netWeightKg / d.rawMaterial.materialUtilization;
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(grossKg / 250, 8);
  });

  it('material utilization reflects startup + steady-state scrap (default steady 0.02)', () => {
    const d = computeExtrusionDrivers(EXT_INPUTS);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(1 - (0.03 + 0.02), 4);
    // Isolating startup only (steady = 0) restores the pure-startup figure.
    const d0 = computeExtrusionDrivers({ ...EXT_INPUTS, steadyScrapFraction: 0 });
    expect(d0.rawMaterial.materialUtilization).toBeCloseTo(1 - 0.03, 4);
  });

  it('startup scrap clamped to 0.4999 maximum', () => {
    const d = computeExtrusionDrivers({ ...EXT_INPUTS, startupScrapFraction: 0.99 });
    expect(d.rawMaterial.materialUtilization).toBeGreaterThan(0.4);
  });

  it('tooling = dieCost amortized', () => {
    const d = computeExtrusionDrivers(EXT_INPUTS);
    expect(d.tooling.totalToolingCost).toBe(3000);
    expect(d.tooling.amortizationVolume).toBe(100000);
  });

  it('full stack produces positive total', () => {
    const d = computeExtrusionDrivers(EXT_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── Thermoforming ───────────────────────────────────────────────────────────

const TF_INPUTS = {
  materialId: 'mat-hips',
  sheetWeightKg: 1.2,
  partsPerSheet: 4,
  partWeightKg: 0.25,
  method: 'vacuum' as const,
  machineId: 'thermoform-small',
  labourId: 'lab-uk-semiskilled',
  heatTimeSec: 30,
  formTimeSec: 10,
  trimTimeSec: 20,
  indexTimeSec: 10,
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.92,
  toolCost: 5000,
  amortizationVolume: 50000,
};

describe('Thermoforming module', () => {
  it('material utilization = (partWt × partsPerSheet) / sheetWt', () => {
    const d = computeThermoformingDrivers(TF_INPUTS);
    const expected = (0.25 * 4) / 1.2;
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(expected, 6);
  });

  it('cycle time = sum of heat + form + trim + index in hours', () => {
    const d = computeThermoformingDrivers(TF_INPUTS);
    const expected = (30 + 10 + 20 + 10) / 3600;
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expected, 8);
  });

  it('partsPerCycle = partsPerSheet', () => {
    const d = computeThermoformingDrivers(TF_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(4);
  });

  it('net weight = partWeightKg per part', () => {
    const d = computeThermoformingDrivers(TF_INPUTS);
    expect(d.rawMaterial.netWeightKg).toBe(0.25);
  });

  it('full stack produces positive total', () => {
    const d = computeThermoformingDrivers(TF_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── Rotational Moulding ─────────────────────────────────────────────────────

const RM_INPUTS = {
  materialId: 'mat-lldpe',
  partWeightKg: 5.0,
  powderCostAdderPerKg: 0.25,
  numArms: 1,
  partsPerArm: 1,
  heatingTimeSec: 900,
  coolingTimeSec: 1200,
  loadUnloadTimeSec: 180,
  machineId: 'rotomould-biaxial',
  labourId: 'lab-uk-semiskilled',
  oee: 0.75,
  manning: 2,
  labourEfficiency: 0.92,
  mouldCost: 8000,
  mouldLife: 100000,
  amortizationVolume: 5000,
};

describe('Rotational Moulding module', () => {
  it('cycle time = heating + cooling + load/unload', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    const expected = (900 + 1200 + 180) / 3600;
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expected, 6);
  });

  it('material utilization is 0.99 (virtually no waste)', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    expect(d.rawMaterial.materialUtilization).toBe(0.99);
  });

  it('powder cost adder appears in consumablesCostPerPart', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.25 * 5.0, 4);
  });

  it('partsPerCycle = partsPerArm', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(1);
  });

  it('tooling = mouldCost × ceil(amortVol / (mouldLife × partsPerArm))', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    const numMoulds = Math.ceil(5000 / (100000 * 1));  // = 1
    expect(d.tooling.totalToolingCost).toBeCloseTo(8000 * numMoulds, 2);
  });

  it('higher powder adder raises total cost monotonically', () => {
    const base = computeRotationalMouldingDrivers(RM_INPUTS);
    const higher = computeRotationalMouldingDrivers({ ...RM_INPUTS, powderCostAdderPerKg: 0.40 });
    const rBase = computeUniversalStack({ ...STACK_DEFAULTS, ...base }, DEFAULT_RATE_LIBRARY);
    const rHigher = computeUniversalStack({ ...STACK_DEFAULTS, ...higher }, DEFAULT_RATE_LIBRARY);
    expect(rHigher.total).toBeGreaterThan(rBase.total);
  });

  it('full stack produces positive total', () => {
    const d = computeRotationalMouldingDrivers(RM_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── IMM tolerance & surface finish multipliers ──────────────────────────────

const IMM_BASE = {
  materialId: 'mat-pp',
  partWeightKg: 0.05,
  runnerWeightKg: 0.01,
  regrindFraction: 0.2,
  cavities: 2,
  projectedAreaCm2: 40,
  cavityPressureMPa: 30,
  wallThicknessMm: 2.0,
  coolTimeFactorSPerMm2: 3.16,
  fillTimeSec: 2,
  packTimeSec: 3,
  ejectTimeSec: 2,
  machineId: 'imm-200t',
  labourId: 'lab-uk-semiskilled',
  oee: 0.85,
  manning: 0.25,
  labourEfficiency: 0.95,
  mouldCost: 25000,
  mouldLife: 500000,
  amortizationVolume: 500000,
};

describe('IMM tolerance & surface finish multipliers', () => {
  it('standard tolerance (≥0.20mm) → ×1.0 mould cost', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const std  = computeInjectionMouldingDrivers({ ...IMM_BASE, toleranceMm: 0.20 });
    expect(std.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost, 2);
  });

  it('±0.10mm tolerance → ×1.2 mould cost', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const tight = computeInjectionMouldingDrivers({ ...IMM_BASE, toleranceMm: 0.10 });
    expect(tight.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.2, 2);
  });

  it('±0.05mm tolerance → ×1.5 mould cost', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const tight = computeInjectionMouldingDrivers({ ...IMM_BASE, toleranceMm: 0.05 });
    expect(tight.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.5, 2);
  });

  it('<0.05mm tolerance → ×2.0 mould cost', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const ultra = computeInjectionMouldingDrivers({ ...IMM_BASE, toleranceMm: 0.02 });
    expect(ultra.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 2.0, 2);
  });

  it('textured finish → ×1.1 mould cost', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const tex  = computeInjectionMouldingDrivers({ ...IMM_BASE, surfaceFinishGrade: 'textured' });
    expect(tex.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.1, 2);
  });

  it('high_gloss finish → ×1.4 mould cost and ×1.15 cooling time', () => {
    const base  = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const gloss = computeInjectionMouldingDrivers({ ...IMM_BASE, surfaceFinishGrade: 'high_gloss' });
    expect(gloss.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.4, 2);
    expect(gloss.operations[0].cycleTimeHr).toBeGreaterThan(base.operations[0].cycleTimeHr);
  });

  it('painted finish → ×1.6 mould cost, no cycle time change', () => {
    const base    = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const painted = computeInjectionMouldingDrivers({ ...IMM_BASE, surfaceFinishGrade: 'painted' });
    expect(painted.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.6, 2);
    expect(painted.operations[0].cycleTimeHr).toBeCloseTo(base.operations[0].cycleTimeHr, 8);
  });

  it('tolerance × finish multipliers combine multiplicatively', () => {
    const base = computeInjectionMouldingDrivers({ ...IMM_BASE });
    const both = computeInjectionMouldingDrivers({ ...IMM_BASE, toleranceMm: 0.05, surfaceFinishGrade: 'high_gloss' });
    expect(both.tooling.totalToolingCost).toBeCloseTo(base.tooling.totalToolingCost * 1.5 * 1.4, 2);
  });
});

// ─── New materials in library ─────────────────────────────────────────────────

describe('New plastic materials exist in DEFAULT_RATE_LIBRARY', () => {
  const ids = [
    'mat-ldpe', 'mat-lldpe', 'mat-pp-homo', 'mat-pp-impact',
    'mat-pet-bg', 'mat-pet-gf30', 'mat-upvc', 'mat-fpvc',
    'mat-gpps', 'mat-hips', 'mat-pc-abs',
    'mat-pa6', 'mat-pa6-gf30', 'mat-pa66',
    'mat-peek', 'mat-peek-gf30',
  ];
  for (const id of ids) {
    it(`material ${id} present`, () => {
      const mat = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id);
      expect(mat).toBeDefined();
      expect(mat!.pricePerKg).toBeGreaterThan(0);
    });
  }
});

describe('New machines exist in DEFAULT_RATE_LIBRARY', () => {
  const ids = [
    'blow-ebm-100l', 'blow-ebm-500l',
    'extruder-75mm', 'extruder-150mm',
    'thermoform-small', 'thermoform-large',
    'rotomould-biaxial',
    'ultrasonic-welder', 'hot-plate-welder', 'vibration-welder',
  ];
  for (const id of ids) {
    it(`machine ${id} present with positive rate`, () => {
      const m = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id);
      expect(m).toBeDefined();
      expect(m!.computedRatePerHr).toBeGreaterThan(0);
    });
  }
});
