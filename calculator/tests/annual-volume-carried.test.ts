/**
 * `annualVolume` must reach UniversalStackInput.
 *
 * The UI's getUniversalTail() used to omit it: the #annual-volume field was read
 * only as an amortisation fallback inside each commodity collector and never put
 * on the input. `input.annualVolume` was therefore undefined on every costing the
 * UI produced, which is why the report header printed "Annual volume: —" even
 * when the engineer had typed 150,000.
 *
 * The display was the symptom people noticed. These tests pin the consequences
 * that actually change output:
 *
 *   · SuggestionContext.volumeProvided goes false, so every volume-dependent
 *     lever is downgraded to a confirm-first note;
 *   · the learning-curve lever is gated on volumeProvided === true, so it could
 *     never fire at all;
 *   · computeUniversalStack silently skips the learning curve.
 */
import { describe, it, expect } from 'vitest';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { generateInsights } from '../src/engine/insights.js';
import { generateIdeaLevers } from '../src/engine/idea-levers.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const BASE: UniversalStackInput = {
  partName: 'Volume carrier',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 1.2, materialUtilization: 0.62 },
  operations: [{
    operationName: 'CNC Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.35, partsPerCycle: 1, oee: 0.80, manning: 1,
    labourTimeHr: 0.35, labourEfficiency: 0.92,
  }],
  tooling: { totalToolingCost: 12_000, amortizationVolume: 100_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
};

describe('annualVolume on the costing input', () => {
  it('is optional on the type, so a costing without it still computes', () => {
    const r = computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('does not change the cost on its own — it is context, not a driver', () => {
    const without = computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY).total;
    const with150k = computeUniversalStack({ ...BASE, annualVolume: 150_000 }, DEFAULT_RATE_LIBRARY).total;
    expect(with150k).toBeCloseTo(without, 10);
  });

  it('enables the learning curve, which is a silent no-op without it', () => {
    const lc = { enabled: true, curvePct: 85, referenceVolume: 1_000 };
    const noVol = computeUniversalStack({ ...BASE, learningCurve: lc }, DEFAULT_RATE_LIBRARY);
    const withVol = computeUniversalStack(
      { ...BASE, learningCurve: lc, annualVolume: 150_000 }, DEFAULT_RATE_LIBRARY);
    // Without annualVolume the curve cannot apply, so labour is untouched.
    expect(noVol.breakdown.labour).toBeCloseTo(
      computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY).breakdown.labour, 10);
    // With it, Wright's law pulls labour down.
    expect(withVol.breakdown.labour).toBeLessThan(noVol.breakdown.labour);
  });
});

describe('volumeProvided gating, derived from annualVolume', () => {
  const ctxFor = (annualVolume?: number) => ({
    region: 'UK',
    volumeProvided: !!annualVolume,
  });

  it('downgrades the tooling-volume lever to a note when volume is unknown', () => {
    // Tooling must exceed the 8% machining benchmark for this branch to fire,
    // so amortise the same tool over 2,000 parts rather than 100,000.
    const toolHeavy: UniversalStackInput = {
      ...BASE,
      tooling: { totalToolingCost: 12_000, amortizationVolume: 2_000, mode: 'amortized' },
    };
    const result = computeUniversalStack(toolHeavy, DEFAULT_RATE_LIBRARY);
    const toolPct = (result.breakdown.tooling / result.total) * 100;
    expect(toolPct, 'fixture must be tooling-heavy for this branch to be reachable').toBeGreaterThan(8);

    const find = (vol?: number) =>
      generateInsights(result, toolHeavy, DEFAULT_RATE_LIBRARY, 'machining', ctxFor(vol))
        .find(i => i.category === 'tooling');

    const assumed = find(undefined);
    const known = find(150_000);
    expect(assumed, 'tooling insight should fire in both cases').toBeDefined();
    expect(known).toBeDefined();

    // Unknown volume: an advisory note that says so. Known volume: an instruction.
    expect(assumed!.title).toMatch(/volume is assumed/i);
    expect(assumed!.type).toBe('info');
    expect(assumed!.impact).toBe('Medium');
    expect(assumed!.finding).toMatch(/confirm it before acting/i);

    expect(known!.title).not.toMatch(/assumed/i);
    expect(known!.type).toBe('warning');
    expect(known!.impact).toBe('High');
  });

  it('the learning-curve lever can only fire when volume is provided', () => {
    // A labour-heavy part, so the lever's labPct > 20 precondition is met.
    const labourHeavy: UniversalStackInput = {
      ...BASE,
      operations: [{
        ...BASE.operations[0], cycleTimeHr: 2.2, labourTimeHr: 2.2, manning: 2,
      }],
      tooling: { totalToolingCost: 0, amortizationVolume: 100_000, mode: 'amortized' },
    };
    const result = computeUniversalStack(labourHeavy, DEFAULT_RATE_LIBRARY);
    const labPct = (result.breakdown.labour / result.total) * 100;
    expect(labPct, 'fixture must be labour-heavy for this lever to be reachable').toBeGreaterThan(20);

    const sig = {
      matPct: (result.breakdown.rawMaterial / result.total) * 100,
      procPct: (result.breakdown.process / result.total) * 100,
      labPct,
      toolPct: (result.breakdown.tooling / result.total) * 100,
      oheadPct: (result.breakdown.overhead / result.total) * 100,
      mgnPct: (result.breakdown.margin / result.total) * 100,
      opCount: labourHeavy.operations.length,
      avgOEE: 0.80,
      matUtil: labourHeavy.rawMaterial.materialUtilization,
    };
    const withVol = generateIdeaLevers(result, labourHeavy, 'machining', ctxFor(150_000), sig);
    const noVol = generateIdeaLevers(result, labourHeavy, 'machining', ctxFor(undefined), sig);
    const hasCurve = (ls: ReturnType<typeof generateIdeaLevers>) =>
      ls.some(l => /learning curve|wright/i.test(l.title + ' ' + (l.description ?? '')));

    expect(hasCurve(withVol), 'learning-curve lever should be offered at a known volume').toBe(true);
    expect(hasCurve(noVol), 'and withheld when the volume is unknown').toBe(false);
  });
});
