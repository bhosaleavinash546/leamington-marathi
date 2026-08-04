/**
 * The routing optimiser — machine choice as arithmetic, pinned by hand.
 *
 * Library rates these pins use (rate-library.ts, computed £/hr):
 *   mach-lathe-cnc £40 · mach-vmc3 £55 · mach-vmc5 £85 · mach-drill £30
 *   mach-haas-vf2 £45 · mach-haas-umc500 £75 · mach-dmg-dmu50 £95 · mach-mazak-qt200 £50
 *
 * Cost model per candidate:
 *   cost = millingHr×rate(primary) + drillHr×rate(drill)
 *        + setups × (45/60) × rate(primary) / batch          (batch setup)
 *        + setups × (0.8/60) × rate(primary)                 (per-part handling)
 */
import { describe, it, expect } from 'vitest';
import {
  optimiseMachiningRouting, costRoutingAsGiven, classifyOpName, standardBatchSize,
} from '../src/engine/routing-optimiser.js';

describe('optimiseMachiningRouting — the cheapest capable routing wins, with the maths shown', () => {
  it('4-direction part at production batch: 3-axis split beats 5-axis (rate premium outweighs setups)', () => {
    const r = optimiseMachiningRouting({
      millingHr: 0.30, drillHr: 0.05,
      principalDirections: 4, axisymmetric: false,
      bboxSortedMm: [300, 200, 100], batchSize: 1000,
    });
    // split: 0.30×45 + 0.05×30 + 5×0.75×45/1000 + 5×(0.8/60)×45 = 13.5+1.5+0.169+3.0 = 18.169
    // consolidated: 0.35×75 + 0.75×75/1000 + (0.8/60)×75 = 26.25+0.056+1.0 = 27.306
    expect(r.chosen.label).toBe('split-3axis');
    expect(r.chosen.primaryMachineId).toBe('mach-haas-vf2');   // £45 beats the £55 generic VMC
    expect(r.chosen.drillMachineId).toBe('mach-drill');
    expect(r.chosen.setups).toBe(5);
    expect(r.chosen.costPerPart).toBeCloseTo(18.169, 2);
    const consolidated = r.alternatives.find(a => a.label === 'consolidated-5axis')!;
    expect(consolidated.costPerPart).toBeCloseTo(27.306, 2);
    expect(r.basis).toContain('cost-ranked');
    expect(r.basis).toContain('split-3axis');
  });

  it('short-cycle part at prototype batch: 5-axis consolidation wins (setups dominate)', () => {
    const r = optimiseMachiningRouting({
      millingHr: 0.05, drillHr: 0.02,
      principalDirections: 4, axisymmetric: false,
      bboxSortedMm: [300, 200, 100], batchSize: 5,
    });
    // split: 0.05×45 + 0.02×30 + 5×0.75×45/5 + 5×(0.8/60)×45 = 2.25+0.6+33.75+3.0 = 39.6
    // consolidated: 0.07×75 + 0.75×75/5 + (0.8/60)×75 = 5.25+11.25+1.0 = 17.5
    expect(r.chosen.label).toBe('consolidated-5axis');
    expect(r.chosen.primaryMachineId).toBe('mach-haas-umc500'); // £75 beats £85/£95 5-axis
    expect(r.chosen.setups).toBe(1);
    expect(r.chosen.costPerPart).toBeCloseTo(17.5, 2);
    expect(r.savingVsNext).toBeGreaterThan(0);
  });

  it('axisymmetric part: turning-led routing wins on the cheapest capable lathe', () => {
    const r = optimiseMachiningRouting({
      millingHr: 0.20, drillHr: 0.03,
      principalDirections: 2, axisymmetric: true,
      bboxSortedMm: [400, 120, 120], batchSize: 1000,
    });
    // turned: 0.2×40 + 0.03×30 + 2×0.75×40/1000 + 2×(0.8/60)×40 = 8+0.9+0.06+1.067 = 10.027
    expect(r.chosen.label).toBe('turned');
    expect(r.chosen.primaryMachineId).toBe('mach-lathe-cnc');   // £40 beats the £50 Mazak
    expect(r.chosen.costPerPart).toBeCloseTo(10.027, 2);
  });

  it('envelope feasibility: a part too big for the VF-2 lands on the generic VMC instead', () => {
    const r = optimiseMachiningRouting({
      millingHr: 0.4, drillHr: 0,
      principalDirections: 2, axisymmetric: false,
      bboxSortedMm: [900, 600, 500], batchSize: 1000,
    });
    const split = r.alternatives.find(a => a.label === 'split-3axis')!;
    expect(split.primaryMachineId).toBe('mach-vmc3');           // VF-2 (762 mm) cannot take 900 mm
  });

  it('is deterministic: identical inputs, identical choice and identical basis text', () => {
    const args = {
      millingHr: 0.13, drillHr: 0.04, principalDirections: 3,
      axisymmetric: false, bboxSortedMm: [250, 180, 90] as const, batchSize: 500,
    };
    const a = optimiseMachiningRouting(args);
    const b = optimiseMachiningRouting(args);
    expect(a).toEqual(b);
  });
});

describe('costRoutingAsGiven — pricing somebody else\'s machine assignment honestly', () => {
  it('costs a two-machine routing with the same conventions the optimiser ranks with', () => {
    const r = costRoutingAsGiven(
      [
        { name: 'Milling', machineId: 'mach-vmc3', cycleTimeHr: 0.2 },
        { name: 'Drilling', machineId: 'mach-drill', cycleTimeHr: 0.05 },
      ],
      1000,
    );
    // 0.2×55 + 0.05×30 + 2×0.75×55/1000 + 2×(0.8/60)×55 = 11+1.5+0.0825+1.467 = 14.049
    expect(r).not.toBeNull();
    expect(r!.setups).toBe(2);
    expect(r!.costPerPart).toBeCloseTo(14.049, 2);
  });

  it('returns null on an unknown machine id rather than inventing a rate', () => {
    expect(costRoutingAsGiven([{ name: 'x', machineId: 'mach-imaginary', cycleTimeHr: 0.1 }], 100)).toBeNull();
  });
});

describe('classifyOpName — the report\'s own operation names classify correctly', () => {
  it.each([
    ['Rough turn shaft/journal', 'turn'],
    ['Mill flange face, holes & boss', 'mill3'],
    ['Drill/tap 21 holes + threads', 'drill'],
    ['5-axis finish cross-bore/undercuts', 'mill5'],
    ['Cylindrical Grinding — Bearing Journal', 'grind'],
    ['Face Mill', 'mill3'],
  ] as const)('%s → %s', (name, cap) => {
    expect(classifyOpName(name)).toBe(cap);
  });
});

describe('standardBatchSize — one convention for machining setup amortisation', () => {
  it('clamps annualVolume/20 to [50, 5000] and defaults a missing volume', () => {
    expect(standardBatchSize(100_000)).toBe(5000);
    expect(standardBatchSize(40_000)).toBe(2000);
    expect(standardBatchSize(600)).toBe(50);
    expect(standardBatchSize(0)).toBe(500);   // 10k default volume / 20
  });
});
