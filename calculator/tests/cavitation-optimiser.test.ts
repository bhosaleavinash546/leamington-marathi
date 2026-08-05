/**
 * The cavitation optimiser — cavity count as arithmetic, pinned by hand.
 *
 * Conventions the pins assume (mirrors of what the mapper charges):
 *   machine+labour £/part = shotHr/(1−0.03) × (rate/0.80 + 19.80/0.92) / n
 *   tooling £/part = mouldCost(n) × ceil((amortVol/n)/life) / amortVol
 *   mouldCost(n) = estimateMouldCost({cavities:n, area×n, steelClassFor(vol×5/n)})
 * Expectations are composed from the exported estimators, not magic decimals,
 * so the tests state the arithmetic rather than freeze it.
 */
import { describe, it, expect } from 'vitest';
import { optimiseCavitation } from '../src/engine/cavitation-optimiser.js';
import {
  estimateMouldCost, estimateClampingTonnage, steelClassFor,
} from '../src/engine/modules/injection-moulding.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const rateOf = (id: string) => DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id)!.computedRatePerHr;
const LAB = 19.80;

/** The optimiser's own cost model, restated independently for cross-checks. */
function handCost(n: number, areaPerCav: number, mpa: number, shotSec: number, vol: number, slides = 0): number {
  const steel = steelClassFor((vol * 5) / n);
  const mould = estimateMouldCost({
    cavities: n, projectedAreaCm2: areaPerCav * n,
    steelClass: steel.cls, sideActionsLifters: slides, runnerSystem: 'cold',
  }).total;
  const clamp = Math.round(estimateClampingTonnage({ projectedAreaCm2: areaPerCav * n, cavityPressureMPa: mpa }));
  const press = clamp <= 50 ? 'imm-50t' : clamp <= 100 ? 'imm-100t' : clamp <= 200 ? 'imm-200t'
    : clamp <= 350 ? 'imm-350t' : clamp <= 400 ? 'imm-400t' : clamp <= 500 ? 'imm-500t'
    : clamp <= 800 ? 'imm-800t' : clamp <= 1200 ? 'imm-1200t' : clamp <= 2000 ? 'imm-2000t' : 'imm-3500t';
  const shotHr = (shotSec / 3600) / 0.97;
  const machineLabour = shotHr * (rateOf(press) / 0.80 + LAB / 0.92) / n;
  const tooling = mould * Math.max(1, Math.ceil((vol / n) / steel.life)) / vol;
  return machineLabour + tooling;
}

// A 60 g PP-class part: ~46 cm²/cavity at 30 MPa, 25.25 s shot, 200k/yr.
// The old mass ladder said 1 cavity (>50 g). The arithmetic disagrees.
const PART = { areaPerCavityCm2: 46, cavityPressureMPa: 30, shotSeconds: 25.25, sideActionsLifters: 0 };

describe('optimiseCavitation — the cheapest feasible cavitation wins, maths shown', () => {
  it('60 g part at 200k/yr: 2-up beats the ladder\'s 1 (and 4-up, and 8-up)', () => {
    const r = optimiseCavitation({ ...PART, annualVolume: 200_000 });
    expect(r.chosen.n).toBe(2);
    expect(r.savingVsNext).toBeGreaterThan(0);
    // every candidate's cost matches the independent restatement of the model
    for (const c of r.alternatives) {
      expect(c.costPerPart).toBeCloseTo(handCost(c.n, 46, 30, 25.25, 200_000), 3);
    }
    // ranked ascending, and every candidate priced in the basis
    const costs = r.alternatives.map(c => c.costPerPart);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
    for (const c of r.alternatives) expect(r.basis).toContain(`${c.n}-up`);
    expect(r.basis).toContain('cheaper than');
  });

  it('same part at 4k/yr: mould NRE dominates and 1-up wins — the volume-awareness the ladder never had', () => {
    const r = optimiseCavitation({ ...PART, annualVolume: 4_000 });
    expect(r.chosen.n).toBe(1);
    const two = r.alternatives.find(c => c.n === 2)!;
    expect(two.toolingPerPart).toBeGreaterThan(two.machineLabourPerPart);   // NRE dominates at 2-up
    expect(r.basis).toContain('1-up');
  });

  it('bumper-class footprint: multi-cavity is clamp-infeasible, 1-up stands with the tonnage named', () => {
    // 9000 cm² @ 35 MPa: 1-up = 3694 t (over the cap but always kept), 2-up = 7388 t.
    const r = optimiseCavitation({
      areaPerCavityCm2: 9000, cavityPressureMPa: 35, shotSeconds: 40,
      annualVolume: 200_000, sideActionsLifters: 3,
    });
    expect(r.chosen.n).toBe(1);
    expect(r.chosen.pressId).toBe('imm-3500t');
    expect(r.alternatives).toHaveLength(1);
    expect(r.savingVsNext).toBe(0);
    expect(r.infeasible.map(i => i.n)).toEqual([2, 4, 8]);
    expect(r.basis).toContain('infeasible');
    expect(r.basis).toContain('3,500 t largest press');
  });

  it('level calibration: with an OCCT figure, the 1-up mould cost IS the shipped geometric-mean blend', () => {
    const occt = 412_000;
    const r = optimiseCavitation({
      areaPerCavityCm2: 9000, cavityPressureMPa: 35, shotSeconds: 40,
      annualVolume: 200_000, sideActionsLifters: 3, occtMouldCostGBP: occt,
    });
    const est1 = estimateMouldCost({
      cavities: 1, projectedAreaCm2: 9000, steelClass: 'production',
      sideActionsLifters: 3, runnerSystem: 'cold',
    }).total;
    expect(r.chosen.mouldCostGBP).toBeCloseTo(Math.sqrt(est1 * occt), -1);
  });

  it('is deterministic: identical inputs, identical choice and words', () => {
    const args = { ...PART, annualVolume: 150_000 };
    expect(optimiseCavitation(args)).toEqual(optimiseCavitation(args));
  });

  it('steel class softens with cavitation and the chosen tool outlives its shots', () => {
    const r = optimiseCavitation({ ...PART, annualVolume: 200_000 });
    const one = r.alternatives.find(c => c.n === 1)!;
    const eight = r.alternatives.find(c => c.n === 8)!;
    // 1M shots at 1-up needs production steel; 125k shots at 8-up needs high... fewer
    expect(steelClassFor(1_000_000).cls).toBe(one.steelClass);
    expect(steelClassFor(125_000).cls).toBe(eight.steelClass);
    expect(r.chosen.mouldLife).toBeGreaterThanOrEqual(200_000 / r.chosen.n);
  });
});
