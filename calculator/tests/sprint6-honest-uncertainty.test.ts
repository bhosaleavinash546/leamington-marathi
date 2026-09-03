/**
 * Honest uncertainty and real savings.
 *
 * - The Monte-Carlo band used to come from one scalar CV derived from the
 *   rate library's confidence grades; a B-rep-measured weight and a hand-typed
 *   one got identical spread. Now the DRIVERS are perturbed by their provenance
 *   and the whole stack is run per trial.
 * - Idea levers used to be bounded percentages on bucket shares. Every lever
 *   with a driver transform is now re-costed through the stack; one whose
 *   arithmetic shows no saving is dropped.
 * - The tornado now carries geometry drivers.
 * - A DFM finding's job price (the naked feature line) can be restated as the
 *   piece-price delta through the whole stack.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { computeCostUncertainty, DRIVER_CV } from '../src/engine/uncertainty.js';
import { runSensitivity } from '../src/engine/sensitivity.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { recostLevers } from '../src/engine/idea-levers.js';
import { restackFindingCosts } from '../src/engine/dfm-geometry/index.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import type { CostOptimisation } from '../src/engine/dfm-dfa.js';

const lib = DEFAULT_RATE_LIBRARY;
const input: UniversalStackInput = {
  partName: 'bracket',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
  operations: [{ operationName: 'Mill', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 }],
  tooling: { totalToolingCost: 15_000, amortizationVolume: 50_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08, annualVolume: 50_000,
};
const result = computeUniversalStack(input, lib);

describe('provenance-aware Monte Carlo', () => {
  it('a measured part gets a narrower band than the same part hand-typed with defaults', () => {
    const measured = computeCostUncertainty(result, input, { library: lib, provenance: {
      netWeightKg: 'geometry_exact', materialUtilization: 'rule', cycleTimeHr: ['rule'], toolingCost: 'engineer', packaging: 'engineer', logistics: 'engineer' } });
    const typed = computeCostUncertainty(result, input, { library: lib, provenance: {
      netWeightKg: 'default', materialUtilization: 'default', cycleTimeHr: ['default'], toolingCost: 'default', packaging: 'default', logistics: 'default' } });
    expect(measured.plusMinusPct).toBeLessThan(typed.plusMinusPct);
    expect(typed.plusMinusPct / measured.plusMinusPct).toBeGreaterThan(1.5);
    // Both still centre on the deterministic total.
    expect(Math.abs(measured.p50 - result.total) / result.total).toBeLessThan(0.05);
    expect(Math.abs(typed.p50 - result.total) / result.total).toBeLessThan(0.08);
  });

  it('is reproducible, and the seed is the same generator as before', () => {
    const a = computeCostUncertainty(result, input, { library: lib, provenance: { netWeightKg: 'geometry_exact' } });
    const b = computeCostUncertainty(result, input, { library: lib, provenance: { netWeightKg: 'geometry_exact' } });
    expect(a).toEqual(b);
  });

  it('a calibrated CV override still wins (real accuracy data beats provenance)', () => {
    // With an override the bucket path runs, provenance or not — byte-identical.
    const cal = computeCostUncertainty(result, input, { library: lib, provenance: { netWeightKg: 'geometry_exact' }, baseCvOverride: 0.30 });
    const plain = computeCostUncertainty(result, input, { baseCvOverride: 0.30 });
    expect(cal).toEqual(plain);
  });

  it('the CV table says what it means', () => {
    expect(DRIVER_CV.geometry_exact).toBeLessThan(DRIVER_CV.rule);
    expect(DRIVER_CV.rule).toBeLessThan(DRIVER_CV.ai);
    expect(DRIVER_CV.ai).toBeLessThan(DRIVER_CV.default);
  });

  it('without a library the bucket path still runs unchanged', () => {
    const u = computeCostUncertainty(result, input);
    expect(u.p10).toBeLessThan(u.p50); expect(u.p50).toBeLessThan(u.p90);
  });
});

describe('geometry drivers in the tornado', () => {
  it('net weight and utilisation are drivers, labelled as measured geometry', () => {
    const s = runSensitivity(input, lib, 10);
    const names = s.drivers.map(d => d.parameter);
    expect(names).toContain('rawMaterial.netWeightKg');
    expect(names).toContain('rawMaterial.materialUtilization');
    const nw = s.drivers.find(d => d.parameter === 'rawMaterial.netWeightKg')!;
    expect(nw.driver).toMatch(/measured geometry/);
    expect(nw.range).toBeGreaterThan(0);
  });
});

describe('idea levers re-costed through the stack', () => {
  it('levers with a driver transform report Δ£ from the real stack; those without say heuristic', () => {
    const d = generateDFMDFA(result, input, 'machining', { region: 'UK', volumeProvided: true, pkgLogisticsEstimated: false, library: lib });
    const recosted = d.costOptimisations.filter(o => o.savingBasis === 'recosted');
    const heuristic = d.costOptimisations.filter(o => o.savingBasis === 'heuristic');
    expect(recosted.length).toBeGreaterThan(0);
    expect(heuristic.length).toBeGreaterThan(0);
    for (const o of recosted) {
      expect(o.savingGBP).toBeGreaterThan(0);
      expect(o.recostBasis).toMatch(/through the rate library/);
      // The percentage IS the delta over the total, not a formula.
      expect(o.expectedSavingPct).toBeCloseTo((o.savingGBP! / result.total) * 100, 0);
    }
  });

  it('a lever whose re-cost shows no saving is dropped', () => {
    const levers: CostOptimisation[] = [{ title: 'Consumables Rationalisation (Cores, Patterns, Shell)', description: '', expectedSavingPct: 5, technicalJustification: '', risk: 'Low' as const, timeframe: 'Quick Win' as const },
                    { title: 'Payment Terms / Early-Settlement Discount', description: '', expectedSavingPct: 2, technicalJustification: '', risk: 'Low' as const, timeframe: 'Quick Win' as const }];
    // No consumables on this part → the transform returns null → heuristic, kept.
    recostLevers(levers, result, input, lib);
    expect(levers.find(l => l.title.startsWith('Consumables'))?.savingBasis).toBe('heuristic');
    expect(levers.find(l => l.title.startsWith('Payment'))?.savingBasis).toBe('heuristic');
    // A transform that changes nothing is dropped.
    const noop: CostOptimisation[] = [{ title: 'Returnable Packaging Loop', description: '', expectedSavingPct: 3, technicalJustification: '', risk: 'Low' as const, timeframe: 'Quick Win' as const }];
    recostLevers(noop, result, { ...input, packagingPerPart: 0 }, lib);
    expect(noop.length).toBe(0);
  });

  it('without a library nothing is re-costed and the old percentages stand', () => {
    const d = generateDFMDFA(result, input, 'machining', { region: 'UK', volumeProvided: true, pkgLogisticsEstimated: false });
    expect(d.costOptimisations.every(o => o.savingBasis === undefined)).toBe(true);
  });
});

describe('DFM finding restated through the whole stack', () => {
  it('a feature-cost finding moves the piece price by more than its naked line (overhead + margin)', () => {
    const grouped = [{ ruleId: 'machining.hole.depth-beyond-standard-drill', totalCostGBP: 0.5, worst: { costImpact: { kind: 'feature_cost' } } }];
    const [r] = restackFindingCosts(grouped, input, lib);
    expect(r.jobGBP).toBe(0.5);
    expect(r.stackGBP).toBeGreaterThan(0.5);            // overhead 12% and margin 8% on top
    expect(r.stackGBP).toBeLessThan(0.5 * 1.6);         // OEE/efficiency scale the charged hours, then overhead + margin
    expect(r.basis).toMatch(/off Mill through the stack/);
  });
  it('unpriced findings stay unpriced', () => {
    expect(restackFindingCosts([{ ruleId: 'casting.draft.insufficient', totalCostGBP: 0, worst: {} }], input, lib)).toEqual([]);
  });
});
