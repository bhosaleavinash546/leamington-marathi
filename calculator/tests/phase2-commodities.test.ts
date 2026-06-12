/**
 * Phase 2 commodity module tests — Sheet Metal, Injection Moulding, Casting.
 * Each module is tested: schema present, drivers computed, full stack positive, key formulas.
 */
import { describe, it, expect } from 'vitest';
import { computeSheetMetalDrivers, estimateTonnageKN } from '../src/engine/modules/sheet-metal.js';
import { computeInjectionMouldingDrivers } from '../src/engine/modules/injection-moulding.js';
import { computeCastingDrivers } from '../src/engine/modules/casting.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import type { InjectionMouldingInputs } from '../src/engine/modules/injection-moulding.js';
import type { CastingInputs } from '../src/engine/modules/casting.js';

// ─── Sheet Metal ─────────────────────────────────────────────────────────────

const SM_INPUTS: SheetMetalInputs = {
  materialId: 'mat-dc01',
  netWeightKg: 0.15,
  blankLengthMm: 200,
  blankWidthMm: 150,
  thicknessMm: 1.2,
  perimeterMm: 700,
  shearStrengthMPa: 280,
  stripWidthMm: 160,
  pitchMm: 210,
  partsPerStroke: 1,
  pressId: 'press-100t',
  labourId: 'lab-uk-semiskilled',
  strokesPerMin: 80,
  oee: 0.85,
  manning: 0.25,
  labourEfficiency: 0.95,
  numOperations: 3,
  dieType: 'progressive',
  dieLife: 500000,
  dieCostEstimate: 45000,
  amortizationVolume: 500000,
};

const STACK_DEFAULTS = { packagingPerPart: 0.05, logisticsPerPart: 0.10, overheadPct: 0.10, marginPct: 0.07 };

describe('Sheet Metal module', () => {
  it('computes strip utilization from blank area / strip cell', () => {
    const d = computeSheetMetalDrivers(SM_INPUTS);
    const expected = (200 * 150) / (160 * 210);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(expected, 6);
  });

  it('cycle time = 1/(SPM × 60)', () => {
    const d = computeSheetMetalDrivers(SM_INPUTS);
    const expected = 1 / (80 * 60);
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expected, 8);
  });

  it('tonnage estimate is physically plausible', () => {
    const kN = estimateTonnageKN({ perimeterMm: 700, thicknessMm: 1.2, shearStrengthMPa: 280 });
    expect(kN).toBeGreaterThan(0);
    expect(kN).toBeLessThan(5000); // 5 MN sanity cap
  });

  it('drivers pass validation', () => {
    const d = computeSheetMetalDrivers(SM_INPUTS);
    const v = validateStackInput({ partName: 'SM Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computeSheetMetalDrivers(SM_INPUTS);
    const r = computeUniversalStack({ partName: 'SM Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('tooling per part = dieCost / amortizationVolume', () => {
    const d = computeSheetMetalDrivers(SM_INPUTS);
    const r = computeUniversalStack({ partName: 'SM Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    const expected = SM_INPUTS.dieCostEstimate / SM_INPUTS.amortizationVolume;
    expect(r.breakdown.tooling).toBeCloseTo(expected, 6);
  });
});

// ─── Injection Moulding ───────────────────────────────────────────────────────

const IMM_INPUTS: InjectionMouldingInputs = {
  materialId: 'mat-pp',
  partWeightKg: 0.05,
  runnerWeightKg: 0.01,
  regrindFraction: 0.20,
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

describe('Injection Moulding module', () => {
  it('cycle time = (fill + pack + cool + eject) / 3600', () => {
    const d = computeInjectionMouldingDrivers(IMM_INPUTS);
    const cool = 3.16 * 2.0 ** 2;
    const expected = (2 + 3 + cool + 2) / 3600;
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expected, 8);
  });

  it('material utilization = partWeight / (partWeight + runnerWaste/cavities)', () => {
    const d = computeInjectionMouldingDrivers(IMM_INPUTS);
    const runnerWaste = (0.01 / 2) * (1 - 0.20);
    const gross = 0.05 + runnerWaste;
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(0.05 / gross, 6);
  });

  it('partsPerCycle equals number of cavities', () => {
    const d = computeInjectionMouldingDrivers(IMM_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(2);
  });

  it('full stack produces positive total', () => {
    const d = computeInjectionMouldingDrivers(IMM_INPUTS);
    const r = computeUniversalStack({ partName: 'IMM Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── Casting ─────────────────────────────────────────────────────────────────

const HPDC_INPUTS: CastingInputs = {
  subtype: 'hpdc',
  materialId: 'mat-adc12',
  partWeightKg: 1.2,
  castingYield: 0.75,
  rejectRate: 0.03,
  labourId: 'lab-uk-skilled',
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.92,
  amortizationVolume: 200000,
  hpdc: {
    machineId: 'hpdc-800t',
    cycleTimeSec: 45,
    cavities: 2,
    dieCost: 120000,
    dieLife: 200000,
  },
};

describe('Casting module — HPDC', () => {
  it('materialUtilization = castingYield', () => {
    const d = computeCastingDrivers(HPDC_INPUTS);
    expect(d.rawMaterial.materialUtilization).toBe(HPDC_INPUTS.castingYield);
  });

  it('reject uplift increases effective net weight', () => {
    const d = computeCastingDrivers(HPDC_INPUTS);
    const expected = HPDC_INPUTS.partWeightKg / (1 - HPDC_INPUTS.rejectRate);
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(expected, 6);
  });

  it('cycle time in hr = cycleTimeSec / 3600', () => {
    const d = computeCastingDrivers(HPDC_INPUTS);
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(45 / 3600, 8);
  });

  it('partsPerCycle = cavities', () => {
    const d = computeCastingDrivers(HPDC_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(2);
  });

  it('full stack produces positive total', () => {
    const d = computeCastingDrivers(HPDC_INPUTS);
    const r = computeUniversalStack({ partName: 'HPDC Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

describe('Casting module — Sand', () => {
  const sandInputs: CastingInputs = {
    subtype: 'sand',
    materialId: 'mat-gjl250',
    partWeightKg: 8.0,
    castingYield: 0.65,
    rejectRate: 0.05,
    labourId: 'lab-uk-skilled',
    oee: 0.80,
    manning: 2,
    labourEfficiency: 0.90,
    amortizationVolume: 10000,
    sand: {
      mouldLineId: 'sand-cast-line',
      cycleTimeHr: 0.5,
      patternCost: 5000,
      patternLife: 10000,
      coreCostPerPart: 1.50,
    },
  };

  it('toolingPerPart = patternCost/vol + coreCostPerPart', () => {
    const d = computeCastingDrivers(sandInputs);
    const r = computeUniversalStack({ partName: 'Sand Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    const expected = 5000 / 10000 + 1.50;
    expect(r.breakdown.tooling).toBeCloseTo(expected, 4);
  });

  it('full stack produces positive total', () => {
    const d = computeCastingDrivers(sandInputs);
    const r = computeUniversalStack({ partName: 'Sand Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});
