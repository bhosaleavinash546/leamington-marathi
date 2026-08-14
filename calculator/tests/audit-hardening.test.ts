/**
 * Defects found in the 360° review, pinned so they cannot return.
 *
 * Both were the same class: a number that looked authoritative and wasn't. One
 * was irreproducible, the other was NaN wearing a success flag. Neither was a
 * maths error — the arithmetic was fine in both cases — which is why the test
 * suite had 2,011 passing tests and caught neither.
 */
import { describe, it, expect } from 'vitest';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { computeSWProgram, defaultSWProgramInputs } from '../src/engine/sw-should-cost.js';

const machining = (over: Record<string, unknown> = {}) => ({
  materialId: 'mat-al6061', netWeightKg: 0.5, stockWeightKg: 0.77, materialUtilization: 0.65,
  operations: [{
    operationName: 'Mill', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1,
    labourTimeHr: 0.12, labourEfficiency: 0.92,
  }],
  setup: { setupTimeHr: 1.5, batchSize: 500, machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' },
  programmingNRE: 2000, toolingCost: 15000, amortizationVolume: 50000,
  ...over,
});

describe('the agent cost path cannot return NaN as a success', () => {
  it('a valid part still costs correctly', () => {
    const r = executeCalculateCost({ commodity: 'machining', params: machining(), partName: 'x' });
    expect(r.success).toBe(true);
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });

  it('ONE missing mandatory field is an error, not a confident NaN', () => {
    // This is the defect. `programmingNRE` omitted propagated `undefined`
    // through the arithmetic and the tool returned success:true, total:NaN.
    // On a path where an LLM chooses the params, an omitted field is a likely
    // event — and a NaN a caller will format and report is worse than an error.
    const p = machining();
    delete (p as Record<string, unknown>).programmingNRE;
    const r = executeCalculateCost({ commodity: 'machining', params: p, partName: 'x' });
    expect(r.success).toBe(false);
    expect(Number.isFinite(r.total)).toBe(true);   // 0, not NaN
    expect(r.error).toBeTruthy();
  });

  it('every bucket is finite on every failure path', () => {
    for (const p of [machining({ programmingNRE: undefined }),
                     machining({ operations: [] }),
                     machining({ materialId: 'mat-nope' })]) {
      const r = executeCalculateCost({ commodity: 'machining', params: p, partName: 'x' });
      for (const [k, v] of Object.entries(r.breakdown)) {
        expect(Number.isFinite(v), `${k} non-finite`).toBe(true);
      }
      expect(Number.isFinite(r.total)).toBe(true);
    }
  });

  it('errors name the offending field so an agent can correct itself', () => {
    const r = executeCalculateCost({
      commodity: 'machining',
      params: machining({ operations: [{ ...machining().operations[0], machineId: 'mach-nope' }] }),
      partName: 'x',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/machineId/);
    expect(r.error).toMatch(/mach-nope/);
  });

  it('an unknown commodity is still rejected with the valid list', () => {
    const r = executeCalculateCost({ commodity: 'teleportation', params: {}, partName: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown commodity/);
  });
});

describe('the software programme band is reproducible', () => {
  it('five identical runs give an identical Monte Carlo band', () => {
    // It used raw Math.random(), so P50 moved ~£4M between runs on a £494M
    // programme. A confidence interval a customer cannot reproduce is not a
    // confidence interval. Now uses the same seeded generator as the
    // physical-parts bands (uncertainty.ts).
    const runs = Array.from({ length: 5 }, () => {
      const r = computeSWProgram(defaultSWProgramInputs());
      const mc = (r as unknown as { monteCarlo: Record<string, number> }).monteCarlo;
      return JSON.stringify({ p10: mc.p10, p50: mc.p50, p90: mc.p90, mean: mc.mean });
    });
    expect(new Set(runs).size).toBe(1);
  });

  it('and the deterministic core was never the problem', () => {
    const a = computeSWProgram(defaultSWProgramInputs()).summary.grandTotal;
    const b = computeSWProgram(defaultSWProgramInputs()).summary.grandTotal;
    expect(a).toBe(b);
  });
});
