import { describe, it, expect } from 'vitest';
import {
  nearNetMachiningCeilingHr,
  capNearNetMachiningHr,
  applyNearNetMachiningCap,
  NEAR_NET_COMMODITIES,
} from '../server/utils/cad-machining-guard.js';
import { computeCastingDrivers } from '../src/engine/modules/casting.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeRegionalComparison } from '../src/engine/regional-rates.js';
import type { CastingInputs } from '../src/engine/modules/casting.js';

describe('near-net machining ceiling', () => {
  it('scales with mass: setup + finish/kg', () => {
    // 0.10 h setup + 0.07 h/kg
    expect(nearNetMachiningCeilingHr(2.8)).toBeCloseTo(0.296, 3);
    expect(nearNetMachiningCeilingHr(0)).toBeCloseTo(0.10, 3);
    expect(nearNetMachiningCeilingHr(10)).toBeCloseTo(0.80, 3);
  });
});

describe('capNearNetMachiningHr', () => {
  it('caps a machined-from-solid time on a near-net cast part', () => {
    // The reported bug: a 2.8 kg gravity die-cast part charged ~0.9 h machining
    const r = capNearNetMachiningHr(0.9, 2.8, 'cast_and_machine');
    expect(r.capped).toBe(true);
    expect(r.machiningHr).toBeCloseTo(0.296, 2);
    expect(r.reason).toMatch(/finish machining/i);
  });

  it('leaves an already-low finish time untouched', () => {
    const r = capNearNetMachiningHr(0.15, 2.8, 'cast_and_machine');
    expect(r.capped).toBe(false);
    expect(r.machiningHr).toBe(0.15);
  });

  it('skips the cap when weight is unknown — never collapses to bare setup time', () => {
    const r = capNearNetMachiningHr(0.9, 0, 'cast_and_machine');
    expect(r.capped).toBe(false);
    expect(r.machiningHr).toBe(0.9);
  });

  it('does NOT cap machined-from-solid commodities (their estimate is correct)', () => {
    const r = capNearNetMachiningHr(0.9, 2.8, 'machining');
    expect(r.capped).toBe(false);
    expect(r.machiningHr).toBe(0.9);
  });

  it('covers the near-net commodity set', () => {
    expect(NEAR_NET_COMMODITIES.has('cast_and_machine')).toBe(true);
    expect(NEAR_NET_COMMODITIES.has('forging')).toBe(true);
    expect(NEAR_NET_COMMODITIES.has('machining')).toBe(false);
  });
});

describe('applyNearNetMachiningCap — mutates the analysis + scales operations', () => {
  it('caps the cycle time and scales machining ops proportionally', () => {
    const analysis = {
      costInputSuggestions: {
        recommendedCommodity: 'cast_and_machine',
        netWeightKg: 2.8,
        estimatedCycleTimeHr: 0.9,
        estimatedOperations: [
          { name: 'Turn journal', machineId: 'mach-lathe-cnc', cycleTimeHr: 0.4 },
          { name: 'Mill + drill', machineId: 'mach-vmc3', cycleTimeHr: 0.5 },
        ],
      },
    };
    const warnings = applyNearNetMachiningCap(analysis);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('near_net_machining_capped');
    expect(analysis.costInputSuggestions.estimatedCycleTimeHr).toBeCloseTo(0.296, 2);
    // ops scaled by 0.296/0.9 ≈ 0.329 → sum still ≈ capped total
    const opSum = analysis.costInputSuggestions.estimatedOperations.reduce((s, o) => s + o.cycleTimeHr, 0);
    expect(opSum).toBeCloseTo(0.296, 2);
  });

  it('is a no-op for a machined-from-solid part', () => {
    const analysis = { costInputSuggestions: { recommendedCommodity: 'machining', netWeightKg: 2.8, estimatedCycleTimeHr: 0.9, estimatedOperations: [] } };
    expect(applyNearNetMachiningCap(analysis)).toHaveLength(0);
    expect(analysis.costInputSuggestions.estimatedCycleTimeHr).toBe(0.9);
  });

  it('scales the machining process-recommendation for display consistency, leaves the casting rec alone', () => {
    const analysis = {
      costInputSuggestions: { recommendedCommodity: 'cast_and_machine', netWeightKg: 2.8, estimatedCycleTimeHr: 0.9, estimatedOperations: [] },
      processRecommendations: [
        { process: 'Gravity Die Casting', commodityType: 'cast_and_machine', estimatedCycleTimeHr: 0.08 },
        { process: 'CNC finish machining', commodityType: 'machining', estimatedCycleTimeHr: 0.9 },
      ],
    };
    applyNearNetMachiningCap(analysis);
    // casting rec untouched…
    expect(analysis.processRecommendations[0].estimatedCycleTimeHr).toBe(0.08);
    // …machining rec scaled down to match the capped cost (~0.296 h)
    expect(analysis.processRecommendations[1].estimatedCycleTimeHr).toBeCloseTo(0.296, 2);
  });
});

describe('tunable ceiling', () => {
  it('accepts an override envelope for calibration against actuals', () => {
    const tighter = nearNetMachiningCeilingHr(2.8, { setupHr: 0.08, finishHrPerKg: 0.05 });
    expect(tighter).toBeCloseTo(0.22, 3);
  });
});

// End-to-end: the reported £116 comes from ~0.9 h machining on the casting.
// After the near-net cap the same part lands at a realistic should-cost.
describe('gravity die-cast stub axle — should-cost after the cap', () => {
  const STACK = { packagingPerPart: 0.05, logisticsPerPart: 0.10, overheadPct: 0.10, marginPct: 0.07 };
  const base: CastingInputs = {
    subtype: 'gravity', materialId: 'mat-adc12', partWeightKg: 2.8, castingYield: 0.85, rejectRate: 0.05,
    labourId: 'lab-uk-foundry', oee: 0.80, manning: 1, labourEfficiency: 0.92, amortizationVolume: 100000,
    gravity: { machineId: 'grav-die-cast-std', cycleTimeHr: 0.08, mouldCost: 22000, mouldLife: 50000 },
  };
  const totalWith = (machiningHr: number) => {
    const d = computeCastingDrivers(base);
    if (machiningHr > 0) {
      d.operations.push({ operationName: 'Finish machining', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
        cycleTimeHr: machiningHr, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: machiningHr, labourEfficiency: 0.92 } as any);
    }
    const r = computeUniversalStack({ partName: 'stub axle', ...d, ...STACK } as any, DEFAULT_RATE_LIBRARY);
    const cn = computeRegionalComparison(r.breakdown, { regions: ['CN'], baseRegion: 'UK', landed: true })[0];
    return { uk: r.total, cnLanded: cn.total };
  };

  it('reproduces the ~£116 over-cost at the un-capped ~0.9 h machining time', () => {
    const t = totalWith(0.9);
    expect(t.uk).toBeGreaterThan(100); // the reported symptom
  });

  it('lands at a realistic should-cost once machining is capped to the near-net envelope', () => {
    const capped = capNearNetMachiningHr(0.9, 2.8, 'cast_and_machine').machiningHr; // ≈ 0.296 h
    const t = totalWith(capped);
    expect(t.uk).toBeLessThan(55);       // was ~£117
    expect(t.cnLanded).toBeLessThan(40); // realistic China landed for a machined Al casting
    expect(t.cnLanded).toBeGreaterThan(20);
  });

  it('bare casting alone is already sensible (~£15 landed in China)', () => {
    const t = totalWith(0);
    expect(t.cnLanded).toBeGreaterThan(12);
    expect(t.cnLanded).toBeLessThan(20);
  });
});
