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

  it('caps milling time to the physical envelope on small parts (servo-horn over-count)', () => {
    // Real servo-horn numbers: 1.19 cm³ part, 96 planar + 24 free-form faces.
    const horn: RecognizedFeatures = {
      holeCount: 10, holeRadiiMm: [1.25, 1.25, 1.25, 1.25, 1.25, 1.25, 2.45, 2.45, 2.55, 2.55],
      threadCount: 0, planarFaceCount: 96, freeFormFaceCount: 24, undercutFaceCount: 5, setupCount: 3,
    };
    const uncapped = computeFeatureCosting(horn, { machineRateGBPPerHr: 30 });
    const capped = computeFeatureCosting(horn, {
      machineRateGBPPerHr: 30,
      partVolumeCm3: 1.19, stockVolumeCm3: 3.6, surfaceAreaCm2: 13.5, maxDimMm: 46.9,
    });
    // Uncapped bills ~140 min of face milling; capped is a small fraction of that.
    expect(uncapped.totalCycleMin).toBeGreaterThan(200);
    expect(capped.totalCycleMin).toBeLessThan(uncapped.totalCycleMin * 0.35);
    const cutUncapped = uncapped.lines.filter(l => /Milled|Free-form/.test(l.feature)).reduce((s, l) => s + l.totalMinutes, 0);
    const cutCapped = capped.lines.filter(l => /Milled|Free-form/.test(l.feature)).reduce((s, l) => s + l.totalMinutes, 0);
    expect(cutCapped).toBeLessThan(cutUncapped * 0.1);   // face milling slashed to the envelope
    expect(capped.dfm.some(d => /capped/i.test(d.title))).toBe(true);
  });

  it('does NOT cap a large part where the milling time is physically plausible', () => {
    // A big part with real removal volume — the ceiling is high, nothing capped.
    const big: RecognizedFeatures = { ...base, planarFaceCount: 20, freeFormFaceCount: 4, setupCount: 2 };
    const r = computeFeatureCosting(big, { partVolumeCm3: 4000, stockVolumeCm3: 12000, surfaceAreaCm2: 3000, maxDimMm: 400 });
    expect(r.dfm.some(d => /capped/i.test(d.title))).toBe(false);
  });
});
