/**
 * Phase 3 commodity module tests — Forging, Painting, BIW/Assembly.
 */
import { describe, it, expect } from 'vitest';
import { computeForgingDrivers } from '../src/engine/modules/forging.js';
import { computePaintingDrivers, coatWetVolumeLitres } from '../src/engine/modules/painting.js';
import { computeBIWDrivers } from '../src/engine/modules/biw-assembly.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { ForgingInputs } from '../src/engine/modules/forging.js';
import type { PaintingInputs } from '../src/engine/modules/painting.js';
import type { BIWAssemblyInputs } from '../src/engine/modules/biw-assembly.js';

const STACK_DEFAULTS = { packagingPerPart: 0.00, logisticsPerPart: 0.00, overheadPct: 0.10, marginPct: 0.07 };

// ─── Forging ─────────────────────────────────────────────────────────────────

const FORGE_INPUTS: ForgingInputs = {
  materialId: 'mat-steel1020',
  partWeightKg: 1.5,
  flashAndScaleKg: 0.4,
  yieldFraction: 0.92,
  forgeId: 'forge-press-500t',
  labourId: 'lab-uk-skilled',
  strokesToForm: 3,
  cycleTimeHr: 0.008,
  oee: 0.80,
  manning: 2,
  labourEfficiency: 0.92,
  heatingEnergyKwhPerKg: 0.4,
  dieLife: 50000,
  dieCost: 80000,
  amortizationVolume: 100000,
};

describe('Forging module', () => {
  it('billet weight = (part + flash) / yield', () => {
    const d = computeForgingDrivers(FORGE_INPUTS);
    const billetWt = (FORGE_INPUTS.partWeightKg + FORGE_INPUTS.flashAndScaleKg) / FORGE_INPUTS.yieldFraction;
    const expectedUtil = FORGE_INPUTS.partWeightKg / billetWt;
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(expectedUtil, 6);
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(FORGE_INPUTS.partWeightKg, 6);
  });

  it('utilization is in range (0, 1]', () => {
    const d = computeForgingDrivers(FORGE_INPUTS);
    expect(d.rawMaterial.materialUtilization).toBeGreaterThan(0);
    expect(d.rawMaterial.materialUtilization).toBeLessThanOrEqual(1);
  });

  it('drivers pass validation', () => {
    const d = computeForgingDrivers(FORGE_INPUTS);
    const v = validateStackInput({ partName: 'Forge Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computeForgingDrivers(FORGE_INPUTS);
    const r = computeUniversalStack({ partName: 'Forge Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('heat treat moves to rawMaterial consumables; die life drives tooling count', () => {
    const withHT: ForgingInputs = {
      ...FORGE_INPUTS,
      heatTreatCostPerKg: 0.80,
      amortizationVolume: 100000,
    };
    const d = computeForgingDrivers(withHT);
    const r = computeUniversalStack({ partName: 'Forge HT', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    // Die life=50000, amortVol=100000 → 2 die sets → tooling = dieCost×2 / amortVol
    const numSets = Math.ceil(withHT.amortizationVolume / FORGE_INPUTS.dieLife);
    expect(r.breakdown.tooling).toBeCloseTo((FORGE_INPUTS.dieCost * numSets) / withHT.amortizationVolume, 3);
    // Heat treat is a per-part recurring cost → appears in rawMaterial, not tooling
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.80 * FORGE_INPUTS.partWeightKg, 4);
  });
});

// ─── Painting ────────────────────────────────────────────────────────────────

const PAINT_INPUTS: PaintingInputs = {
  surfaceAreaM2: 0.8,
  coats: [
    {
      coatType: 'e_coat',
      materialId: 'mat-paint-ecoat',
      dftMicrons: 20,
      solidsPct: 0.20,
      transferEfficiency: 0.95,
      paintDensityKgPerL: 1.3,
      pricePerL: 4.55,
    },
    {
      coatType: 'basecoat',
      materialId: 'mat-paint-basecoat',
      dftMicrons: 15,
      solidsPct: 0.35,
      transferEfficiency: 0.70,
      paintDensityKgPerL: 1.25,
      pricePerL: 10.25,
    },
  ],
  lineId: 'paint-line-std',
  labourId: 'lab-uk-skilled',
  lineRatePartsPerHr: 60,
  oee: 0.85,
  manning: 4,
  labourEfficiency: 0.95,
  rejectReworkPct: 0.03,
  toolingCost: 5000,
  amortizationVolume: 100000,
};

describe('Painting module', () => {
  it('coatWetVolumeLitres computes correctly', () => {
    const coat = PAINT_INPUTS.coats[0];
    const vol = coatWetVolumeLitres(coat, PAINT_INPUTS.surfaceAreaM2);
    // wet_L = area × DFT_m / (solids × transfer) × 1000
    const expected = (0.8 * 20e-6) / (0.20 * 0.95) * 1000;
    expect(vol).toBeCloseTo(expected, 6);
  });

  it('uses directCost for raw material', () => {
    const d = computePaintingDrivers(PAINT_INPUTS);
    expect(d.rawMaterial.directCost).toBeDefined();
    expect(d.rawMaterial.directCost).toBeGreaterThan(0);
  });

  it('rework uplift increases raw material cost', () => {
    const base = computePaintingDrivers({ ...PAINT_INPUTS, rejectReworkPct: 0 });
    const with_rework = computePaintingDrivers({ ...PAINT_INPUTS, rejectReworkPct: 0.10 });
    expect(with_rework.rawMaterial.directCost!).toBeCloseTo(
      base.rawMaterial.directCost! * 1.10,
      4
    );
  });

  it('drivers pass validation', () => {
    const d = computePaintingDrivers(PAINT_INPUTS);
    const v = validateStackInput({ partName: 'Paint Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computePaintingDrivers(PAINT_INPUTS);
    const r = computeUniversalStack({ partName: 'Paint Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('cycle time = 1 / lineRatePartsPerHr × (1 + rejectReworkPct)', () => {
    const d = computePaintingDrivers(PAINT_INPUTS);
    const expected = (1 / 60) * (1 + PAINT_INPUTS.rejectReworkPct);
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expected, 8);
  });
});

// ─── BIW Assembly ─────────────────────────────────────────────────────────────

const BIW_INPUTS: BIWAssemblyInputs = {
  subPartTotalCost: 45.00,
  joining: [
    { type: 'spot_weld', count: 120, costPerJoint: 0.05 },
    { type: 'adhesive_m', count: 0.8, costPerJoint: 1.20 },
  ],
  stations: [
    {
      stationName: 'Framing Station',
      machineId: 'robot-weld-station',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 1 / 60,
      oee: 0.85,
      manning: 1,
      labourEfficiency: 0.92,
    },
    {
      stationName: 'Finishing Station',
      machineId: 'robot-weld-station',
      labourId: 'lab-uk-semiskilled',
      cycleTimeHr: 0.5 / 60,
      oee: 0.85,
      manning: 1,
      labourEfficiency: 0.92,
    },
  ],
  fixturingToolingCost: 200000,
  amortizationVolume: 50000,
};

describe('BIW Assembly module', () => {
  it('directCost = subPartTotalCost + joiningCostPerPart (joining folded into directCost)', () => {
    const d = computeBIWDrivers(BIW_INPUTS);
    const joiningCostPerPart = 120 * 0.05 + 0.8 * 1.20;  // 6.96
    expect(d.rawMaterial.directCost).toBeCloseTo(BIW_INPUTS.subPartTotalCost + joiningCostPerPart, 4);
  });

  it('joining in directCost not consumables; tooling = fixturing cost only', () => {
    const d = computeBIWDrivers(BIW_INPUTS);
    const r = computeUniversalStack({ partName: 'BIW Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    // Tooling = fixturing only (joining is a recurring cost, amortized into directCost)
    expect(r.breakdown.tooling).toBeCloseTo(BIW_INPUTS.fixturingToolingCost / BIW_INPUTS.amortizationVolume, 4);
    // Joining cost moved to directCost, so consumablesCostPerPart is now undefined
    expect(d.rawMaterial.consumablesCostPerPart).toBeUndefined();
  });

  it('station count = number of operations', () => {
    const d = computeBIWDrivers(BIW_INPUTS);
    expect(d.operations).toHaveLength(2);
  });

  it('drivers pass validation', () => {
    const d = computeBIWDrivers(BIW_INPUTS);
    const v = validateStackInput({ partName: 'BIW Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computeBIWDrivers(BIW_INPUTS);
    const r = computeUniversalStack({ partName: 'BIW Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});
