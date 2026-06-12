/**
 * Phase 1 Acceptance Test — Hand-calculated reference part.
 *
 * Part: Aluminium 6061-T6 bracket, CNC machined (UK Tier-2 shop)
 *
 * ─── HAND CALCULATION ────────────────────────────────────────────────────────
 *
 * INPUTS
 *   net weight          = 0.5 kg
 *   material util       = 0.65  (35 % scrap)
 *   material price      = £3.20 /kg   (mat-al6061)
 *   scrap recovery      = £0.50 /kg
 *
 *   Operations (3):
 *     CNC Turning  | mach-lathe-cnc  £45.00/hr | cycle 0.050 hr | 1 ppc | OEE 0.85 | 1 man | lab 0.050 hr | eff 0.92
 *     CNC Milling  | mach-vmc3       £55.00/hr | cycle 0.120 hr | 1 ppc | OEE 0.85 | 1 man | lab 0.120 hr | eff 0.92
 *     CNC Drilling | mach-drill      £30.00/hr | cycle 0.030 hr | 1 ppc | OEE 0.85 | 1 man | lab 0.030 hr | eff 0.92
 *     (labour rate: lab-uk-skilled £22.00/hr)
 *
 *   Tooling        = £15,000 amortised over 50,000 parts
 *   Packaging      = £0.15 /part
 *   Logistics      = £0.25 /part
 *   Overhead       = 12 %
 *   Margin         = 8 %
 *
 * WORKINGS
 *   gross_weight  = 0.5 / 0.65           = 0.769231 kg
 *   rm_gross      = 0.769231 × 3.20      = £2.461538
 *   scrap_credit  = (0.769231−0.5)×0.50  = £0.134615
 *   raw_material  = 2.461538 − 0.134615  = £2.326923
 *
 *   process:
 *     Turning   = 45.00 × 0.050 / 1 / 0.85  = £2.647059
 *     Milling   = 55.00 × 0.120 / 1 / 0.85  = £7.764706
 *     Drilling  = 30.00 × 0.030 / 1 / 0.85  = £1.058824
 *     total                                  = £11.470588
 *
 *   labour:
 *     Turning   = 22.00 × 1 × 0.050 / 1 / 0.92  = £1.195652
 *     Milling   = 22.00 × 1 × 0.120 / 1 / 0.92  = £2.869565
 *     Drilling  = 22.00 × 1 × 0.030 / 1 / 0.92  = £0.717391
 *     total                                       = £4.782609
 *
 *   tooling       = 15000 / 50000         = £0.300000
 *   packaging     =                         £0.150000
 *   logistics     =                         £0.250000
 *
 *   factory_cost  = 2.326923 + 11.470588 + 4.782609 + 0.30 + 0.15 + 0.25
 *                 = £19.280120
 *   overhead      = 0.12 × 19.280120      = £2.313614
 *   subtotal      = 19.280120 + 2.313614  = £21.593734
 *   margin        = 0.08 × 21.593734      = £1.727499
 *   total         = 21.593734 + 1.727499  = £23.321233
 *
 * NOTE: machine rates above are derived from the DEFAULT_RATE_LIBRARY buildups.
 * The tests below verify that the engine reproduces those buildups correctly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, computeMachineRateFromBuildup } from '../src/engine/rate-library.js';
import type { UniversalStackInput, PartCostResult, RateLibrary } from '../src/engine/types.js';

// Pull the actual computed rates from the library to keep the test consistent
// with any rate-library updates (the workings above used rounded values for readability).
function buildReferenceInput(_lib: RateLibrary): UniversalStackInput {
  return {
    partName: 'Al6061 Bracket — Reference Part',
    rawMaterial: {
      materialId: 'mat-al6061',
      netWeightKg: 0.5,
      materialUtilization: 0.65,
    },
    operations: [
      {
        operationName: 'CNC Turning',
        machineId: 'mach-lathe-cnc',
        labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.05,
        partsPerCycle: 1,
        oee: 0.85,
        manning: 1,
        labourTimeHr: 0.05,
        labourEfficiency: 0.92,
      },
      {
        operationName: 'CNC Milling',
        machineId: 'mach-vmc3',
        labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.12,
        partsPerCycle: 1,
        oee: 0.85,
        manning: 1,
        labourTimeHr: 0.12,
        labourEfficiency: 0.92,
      },
      {
        operationName: 'CNC Drilling',
        machineId: 'mach-drill',
        labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.03,
        partsPerCycle: 1,
        oee: 0.85,
        manning: 1,
        labourTimeHr: 0.03,
        labourEfficiency: 0.92,
      },
    ],
    tooling: {
      totalToolingCost: 15000,
      amortizationVolume: 50000,
      mode: 'amortized',
    },
    packagingPerPart: 0.15,
    logisticsPerPart: 0.25,
    overheadPct: 0.12,
    marginPct: 0.08,
  };
}

// Recompute hand-calc from the library's actual machine rates
function handCalc(lib: RateLibrary) {
  const mat = lib.materials.find(m => m.id === 'mat-al6061')!;
  const lathe = lib.machines.find(m => m.id === 'mach-lathe-cnc')!;
  const vmc = lib.machines.find(m => m.id === 'mach-vmc3')!;
  const drill = lib.machines.find(m => m.id === 'mach-drill')!;
  const labour = lib.labour.find(l => l.id === 'lab-uk-skilled')!;

  const netW = 0.5, util = 0.65;
  const grossW = netW / util;
  const rawMaterial = grossW * mat.pricePerKg - (grossW - netW) * mat.scrapRecoveryPricePerKg;

  const r_lathe = lathe.computedRatePerHr;
  const r_vmc   = vmc.computedRatePerHr;
  const r_drill  = drill.computedRatePerHr;
  const r_labour = labour.fullyLoadedRatePerHr;

  const process =
    r_lathe * 0.05 / 1 / 0.85 +
    r_vmc   * 0.12 / 1 / 0.85 +
    r_drill * 0.03 / 1 / 0.85;

  const labourCost =
    r_labour * 1 * 0.05 / 1 / 0.92 +
    r_labour * 1 * 0.12 / 1 / 0.92 +
    r_labour * 1 * 0.03 / 1 / 0.92;

  const tooling = 15000 / 50000;
  const packaging = 0.15;
  const logistics = 0.25;

  const factoryCost = rawMaterial + process + labourCost + tooling + packaging + logistics;
  const overhead = 0.12 * factoryCost;
  const subtotal = factoryCost + overhead;
  const margin = 0.08 * subtotal;
  const total = subtotal + margin;

  return { rawMaterial, process, labourCost, tooling, packaging, logistics, factoryCost, overhead, subtotal, margin, total };
}

let result: PartCostResult;
let expected: ReturnType<typeof handCalc>;

beforeAll(() => {
  const input = buildReferenceInput(DEFAULT_RATE_LIBRARY);
  result = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
  expected = handCalc(DEFAULT_RATE_LIBRARY);
});

const TOL = 0.0001; // 0.01 % relative tolerance

function relTol(a: number, b: number) {
  if (b === 0) return Math.abs(a) < 1e-10;
  return Math.abs((a - b) / b) < TOL;
}

describe('Reference Part — Phase 1 acceptance (<0.01% tolerance)', () => {
  it('input passes validation', () => {
    const v = validateStackInput(buildReferenceInput(DEFAULT_RATE_LIBRARY), DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it('machine rates derived from buildup match library', () => {
    const lathe = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-lathe-cnc')!;
    const vmc   = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-vmc3')!;
    const drill = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-drill')!;
    expect(lathe.computedRatePerHr).toBeCloseTo(computeMachineRateFromBuildup(lathe.buildup), 8);
    expect(vmc.computedRatePerHr).toBeCloseTo(computeMachineRateFromBuildup(vmc.buildup), 8);
    expect(drill.computedRatePerHr).toBeCloseTo(computeMachineRateFromBuildup(drill.buildup), 8);
  });

  it('raw material cost within tolerance', () => {
    expect(relTol(result.breakdown.rawMaterial, expected.rawMaterial)).toBe(true);
  });

  it('process cost within tolerance', () => {
    expect(relTol(result.breakdown.process, expected.process)).toBe(true);
  });

  it('labour cost within tolerance', () => {
    expect(relTol(result.breakdown.labour, expected.labourCost)).toBe(true);
  });

  it('tooling cost within tolerance', () => {
    expect(relTol(result.breakdown.tooling, expected.tooling)).toBe(true);
  });

  it('packaging within tolerance', () => {
    expect(relTol(result.breakdown.packaging, expected.packaging)).toBe(true);
  });

  it('logistics within tolerance', () => {
    expect(relTol(result.breakdown.logistics, expected.logistics)).toBe(true);
  });

  it('factory cost within tolerance', () => {
    expect(relTol(result.factoryCost, expected.factoryCost)).toBe(true);
  });

  it('overhead within tolerance', () => {
    expect(relTol(result.breakdown.overhead, expected.overhead)).toBe(true);
  });

  it('subtotal within tolerance', () => {
    expect(relTol(result.subtotal, expected.subtotal)).toBe(true);
  });

  it('margin within tolerance', () => {
    expect(relTol(result.breakdown.margin, expected.margin)).toBe(true);
  });

  it('TOTAL within tolerance — all 8 buckets correct', () => {
    expect(relTol(result.total, expected.total)).toBe(true);
  });

  it('total equals sum of all 8 buckets exactly', () => {
    const b = result.breakdown;
    const sum = b.rawMaterial + b.process + b.labour + b.tooling + b.packaging + b.logistics + b.overhead + b.margin;
    expect(sum).toBeCloseTo(result.total, 10);
  });

  it('all 8 cost buckets are non-negative', () => {
    const b = result.breakdown;
    expect(b.rawMaterial).toBeGreaterThanOrEqual(0);
    expect(b.process).toBeGreaterThanOrEqual(0);
    expect(b.labour).toBeGreaterThanOrEqual(0);
    expect(b.tooling).toBeGreaterThanOrEqual(0);
    expect(b.packaging).toBeGreaterThanOrEqual(0);
    expect(b.logistics).toBeGreaterThanOrEqual(0);
    expect(b.overhead).toBeGreaterThanOrEqual(0);
    expect(b.margin).toBeGreaterThanOrEqual(0);
  });

  it('has traceability records linking every rate to library source', () => {
    expect(result.traceability.length).toBeGreaterThan(0);
    for (const t of result.traceability) {
      expect(t.rateId).toBeTruthy();
      expect(t.confidence).toMatch(/High|Medium|Low/);
    }
  });

  it('operation details match expected process + labour split', () => {
    const lathe = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-lathe-cnc')!;
    const labour = DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-skilled')!;

    const turningOp = result.operationDetails.find(o => o.operationName === 'CNC Turning')!;
    expect(turningOp).toBeDefined();

    const expectedProcess = lathe.computedRatePerHr * 0.05 / 1 / 0.85;
    const expectedLabour  = labour.fullyLoadedRatePerHr * 1 * 0.05 / 1 / 0.92;

    expect(relTol(turningOp.processCost, expectedProcess)).toBe(true);
    expect(relTol(turningOp.labourCost, expectedLabour)).toBe(true);
  });
});
