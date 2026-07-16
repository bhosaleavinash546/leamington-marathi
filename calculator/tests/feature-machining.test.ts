import { describe, it, expect } from 'vitest';
import { computeFeatureMachining, featureMinutesEach, defaultInclude } from '../src/engine/feature-machining.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';

const HOLES: FeatureRow[] = [
  { kind: 'hole', diaMm: 6, depthMm: 10, through: true, count: 8 },   // small through drills
  { kind: 'hole', diaMm: 16, depthMm: 20, through: false, count: 2 }, // blind bore (drill+ream)
];
const WITH_BOSS: FeatureRow[] = [
  ...HOLES,
  { kind: 'boss', diaMm: 40, depthMm: 25, through: null, count: 1 },  // turned boss
];

describe('computeFeatureMachining', () => {
  it('costs holes by default and excludes bosses (auto confidence)', () => {
    const r = computeFeatureMachining(WITH_BOSS, { machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' });
    // 8 + 2 holes counted; the boss (count 1) is NOT auto-included
    expect(r.featureCount).toBe(10);
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0].cycleTimeHr).toBeGreaterThan(0);
    expect(r.operations[0].operationName).toMatch(/geometry-measured/);
    const boss = r.lines.find(l => l.kind === 'boss')!;
    expect(boss.autoIncluded).toBe(false);
    expect(boss.included).toBe(false);
  });

  it('cycle time = sum of per-feature minutes / 60', () => {
    const r = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' });
    const expectedMin =
      featureMinutesEach(HOLES[0]) * 8 + featureMinutesEach(HOLES[1]) * 2;
    expect(r.totalCycleHr).toBeCloseTo(expectedMin / 60, 5);
  });

  it('near-net (default) removes NO material — machining time only', () => {
    const r = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' });
    expect(r.materialRemovedKg).toBe(0);
  });

  it('solid billet charges the feature volume as removed metal', () => {
    const r = computeFeatureMachining(HOLES, {
      machineId: 'm', labourId: 'l', stockCondition: 'solid_billet', densityKgPerCm3: 0.0078,
    });
    expect(r.materialRemovedKg).toBeGreaterThan(0);
  });

  it('includeFlags override lets the engineer confirm/deny per feature', () => {
    // include ONLY the boss (index 2), exclude both hole rows
    const r = computeFeatureMachining(WITH_BOSS, {
      machineId: 'm', labourId: 'l', includeFlags: [false, false, true],
    });
    expect(r.featureCount).toBe(1);            // just the boss
    expect(r.operations[0].operationName).toMatch(/Ø40/);
  });

  it('blind holes cost more than through holes of the same size', () => {
    const through = featureMinutesEach({ kind: 'hole', diaMm: 10, depthMm: 20, through: true, count: 1 });
    const blind = featureMinutesEach({ kind: 'hole', diaMm: 10, depthMm: 20, through: false, count: 1 });
    expect(blind).toBeGreaterThan(through);
  });

  it('larger bores cost more per unit depth (drill+ream vs drill)', () => {
    const drill = featureMinutesEach({ kind: 'hole', diaMm: 8, depthMm: 20, through: true, count: 1 });
    const bore = featureMinutesEach({ kind: 'hole', diaMm: 20, depthMm: 20, through: true, count: 1 });
    expect(bore).toBeGreaterThan(drill);
  });

  it('empty / no features → no operations, zero cost', () => {
    expect(computeFeatureMachining([], { machineId: 'm', labourId: 'l' }).operations).toHaveLength(0);
    expect(computeFeatureMachining(undefined, { machineId: 'm', labourId: 'l' }).featureCount).toBe(0);
  });

  it('finishFactor scales machining time (precision/ground features)', () => {
    const base = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' }).totalCycleHr;
    const precise = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l', finishFactor: 1.6 }).totalCycleHr;
    expect(precise).toBeCloseTo(base * 1.6, 5);
  });

  it('defaultInclude: holes in, bosses out', () => {
    expect(defaultInclude({ kind: 'hole', diaMm: 5, depthMm: 5, through: true, count: 1 })).toBe(true);
    expect(defaultInclude({ kind: 'boss', diaMm: 5, depthMm: 5, through: null, count: 1 })).toBe(false);
  });
});
