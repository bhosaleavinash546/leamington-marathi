import { describe, it, expect } from 'vitest';
import { featureToOperation, drillingOpFromFeatures, type FeatureRow } from '../src/engine/feature-ops.js';

const row = (over: Partial<FeatureRow>): FeatureRow =>
  ({ kind: 'hole', diaMm: 6, depthMm: 10, through: true, count: 1, ...over });

describe('featureToOperation', () => {
  it('maps small through-holes to drilling', () => {
    expect(featureToOperation(row({ diaMm: 6 }))).toBe('Drilling');
    expect(featureToOperation(row({ diaMm: 13 }))).toBe('Drilling');
  });
  it('maps mid through-holes to drill + ream/bore', () => {
    expect(featureToOperation(row({ diaMm: 16 }))).toBe('Drill + ream/bore');
  });
  it('maps large through-holes to helical mill / bore', () => {
    expect(featureToOperation(row({ diaMm: 40 }))).toBe('Helical mill / bore');
  });
  it('flags blind holes', () => {
    expect(featureToOperation(row({ diaMm: 8, through: false }))).toBe('Drilling (blind)');
    expect(featureToOperation(row({ diaMm: 20, through: false }))).toBe('Drill + bore (blind)');
  });
  it('maps bosses to turning', () => {
    expect(featureToOperation(row({ kind: 'boss', through: null }))).toBe('Turning (external Ø)');
  });
});

describe('drillingOpFromFeatures', () => {
  it('returns null when there are no holes', () => {
    expect(drillingOpFromFeatures(undefined)).toBeNull();
    expect(drillingOpFromFeatures([])).toBeNull();
    expect(drillingOpFromFeatures([row({ kind: 'boss', count: 3 })])).toBeNull();
  });

  it('uses OCCT drill/bore minutes when available', () => {
    const plan = drillingOpFromFeatures([row({ count: 50 })], 25);
    expect(plan).not.toBeNull();
    expect(plan!.holeCount).toBe(50);
    expect(plan!.cycleTimeHr).toBeCloseTo(25 / 60, 10);
    expect(plan!.summary).toBe('50×Ø6.0×10');
    expect(plan!.name).toContain('50 holes');
    expect(plan!.name).toContain('[geometry-measured]');
  });

  it('falls back to 0.4 min per hole without OCCT timing', () => {
    const plan = drillingOpFromFeatures([row({ count: 10 })], null);
    expect(plan!.cycleTimeHr).toBeCloseTo((10 * 0.4) / 60, 10);
  });

  it('summarises mixed hole groups and ignores bosses', () => {
    const plan = drillingOpFromFeatures([
      row({ diaMm: 6, depthMm: 10, count: 50 }),
      row({ diaMm: 16, depthMm: 20, count: 1 }),
      row({ kind: 'boss', diaMm: 40, depthMm: 40, count: 1, through: null }),
    ]);
    expect(plan!.holeCount).toBe(51);
    expect(plan!.summary).toBe('50×Ø6.0×10, 1×Ø16.0×20');
  });
});
