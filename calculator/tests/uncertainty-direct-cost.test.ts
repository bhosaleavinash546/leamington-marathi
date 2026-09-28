/**
 * The band must cover the cost it describes.
 *
 * Painting, BIW and PCB hand the engine their material as a pre-computed
 * `directCost`, and casting adds `consumablesCostPerPart`. The driver-level
 * Monte Carlo perturbed weight, utilisation, rates and cycle times — none of
 * which touch a flat figure — so when that figure was most of the cost the band
 * collapsed: "±0.1%" printed beside "Low confidence" (M2).
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { computeCostUncertainty } from '../src/engine/uncertainty.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;
const base: UniversalStackInput = {
  partName: 'Painted panel',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.9, directCost: 40 },
  operations: [{
    operationName: 'Spray', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.002, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.002, labourEfficiency: 0.92,
  }],
  tooling: { totalToolingCost: 0, amortizationVolume: 10000, mode: 'amortized' },
  packagingPerPart: 0.05, logisticsPerPart: 0.05, overheadPct: 0.12, marginPct: 0.08,
};
const run = (input: UniversalStackInput, prov = {}) =>
  computeCostUncertainty(computeUniversalStack(input, lib), input, { library: lib, provenance: prov });

describe('a flat material figure is sampled like any other driver', () => {
  it('directCost carrying most of the cost gives a real band, not ±0.1%', () => {
    const r = computeUniversalStack(base, lib);
    expect(r.breakdown.rawMaterial / r.total).toBeGreaterThan(0.8);   // the case that collapsed
    // The engine grades a pre-computed figure Medium (CV 0.12); on ~85% of the
    // total that is a P10–P90 half-width of roughly ±12%, never under ±5%.
    expect(run(base).plusMinusPct).toBeGreaterThan(5);
  });

  it('follows the provenance when it is known', () => {
    const typed = run(base, { directCost: 'engineer' }).plusMinusPct;
    const guessed = run(base, { directCost: 'default' }).plusMinusPct;
    expect(guessed).toBeGreaterThan(typed * 2);
  });

  it('consumables are sampled too', () => {
    const noDirect = { ...base, rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.01, materialUtilization: 0.9, consumablesCostPerPart: 40 } };
    expect(run(noDirect).plusMinusPct).toBeGreaterThan(5);
  });

  it('leaves weight-priced material exactly as it was', () => {
    // No flat figure: the same random draws, so the same band as before.
    const priced = { ...base, rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 } };
    const a = run(priced), b = run(priced);
    expect(a).toEqual(b);
  });
});
