import { describe, it, expect } from 'vitest';
import { computeFeatureCosting, type RecognizedFeatures } from '../src/engine/feature-costing.js';

const base: RecognizedFeatures = {
  holeCount: 8, holeRadiiMm: [1.5, 1.5, 2, 2, 2.5, 2.5, 3, 3],
  threadCount: 4, planarFaceCount: 12, freeFormFaceCount: 0, undercutFaceCount: 0, setupCount: 2,
};

describe('feature-based costing', () => {
  it('produces per-feature cost lines that sum to the machining cost', () => {
    const r = computeFeatureCosting(base, { machineRateGBPPerHr: 90 });
    const sum = r.lines.reduce((s, l) => s + l.costGBP, 0);
    expect(sum).toBeCloseTo(r.machiningCostGBP, 1);
    expect(r.lines.every(l => l.pctOfCost >= 0 && l.pctOfCost <= 100)).toBe(true);
    expect(r.costliestFeature).toBe(r.lines[0].feature);
  });

  it('harder material (higher factor) costs more machining time', () => {
    const al = computeFeatureCosting(base, { materialFactor: 1.0 });
    const ti = computeFeatureCosting(base, { materialFactor: 2.5 });
    expect(ti.machiningCostGBP).toBeGreaterThan(al.machiningCostGBP);
  });

  it('flags undercuts, sub-2mm holes and heavy free-form surfacing', () => {
    const hard: RecognizedFeatures = { ...base, holeRadiiMm: [0.5, 0.8, ...base.holeRadiiMm], holeCount: 10, undercutFaceCount: 3, freeFormFaceCount: 8 };
    const r = computeFeatureCosting(hard);
    expect(r.dfm.some(d => d.title.toLowerCase().includes('undercut'))).toBe(true);
    expect(r.dfm.some(d => d.title.includes('Ø2') || d.title.toLowerCase().includes('below'))).toBe(true);
    expect(r.dfm.some(d => d.title.toLowerCase().includes('free-form'))).toBe(true);
    expect(r.dfm.some(d => d.severity === 'major')).toBe(true);
  });

  it('free-form surfacing usually dominates when present', () => {
    const ff = computeFeatureCosting({ ...base, freeFormFaceCount: 20, setupCount: 1 });
    expect(ff.costliestFeature).toBe('Free-form surfacing');
  });

  it('omits feature lines with zero count', () => {
    const r = computeFeatureCosting({ holeCount: 5, holeRadiiMm: [3, 3, 3, 3, 3], threadCount: 0, planarFaceCount: 0, freeFormFaceCount: 0, undercutFaceCount: 0, setupCount: 1 });
    expect(r.lines.find(l => l.feature === 'Tapped threads')).toBeUndefined();
    expect(r.lines.find(l => l.feature === 'Drilled holes')).toBeDefined();
  });
});
