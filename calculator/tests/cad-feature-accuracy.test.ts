import { describe, it, expect } from 'vitest';
import {
  scoreCADFeatures, aggregateCADScores, featureCountsFromPrediction,
  type CADPrediction, type CADTruth,
} from '../server/utils/cad-feature-accuracy.js';

const pred = (o: CADPrediction) => o;
const truth = (o: CADTruth) => o;

describe('CAD feature-accuracy scorer', () => {
  it('extracts feature counts from a featureTable, summing by kind', () => {
    const c = featureCountsFromPrediction(pred({ featureTable: [
      { kind: 'hole', count: 4 }, { kind: 'hole', count: 2 }, { kind: 'boss', count: 1 }, { kind: 'face', count: 3 },
    ] }));
    expect(c).toEqual({ hole: 6, boss: 1, pocket: 0 });
  });

  it('falls back to summary counts when the table is empty', () => {
    const c = featureCountsFromPrediction(pred({ features: { estimatedHoleCount: 5, bossShaftCount: 2 } }));
    expect(c).toEqual({ hole: 5, boss: 2, pocket: 0 });
  });

  it('scores a perfect match as precision/recall/F1 = 1', () => {
    const s = scoreCADFeatures(
      pred({ featureTable: [{ kind: 'hole', count: 4 }, { kind: 'boss', count: 1 }] }),
      truth({ features: { hole: 4, boss: 1, pocket: 0 } }),
    );
    expect(s.featurePrecision).toBe(1);
    expect(s.featureRecall).toBe(1);
    expect(s.featureF1).toBe(1);
  });

  it('penalises OVER-counting via precision (the stub-axle bug class)', () => {
    // Detected 8 holes; there are really 4.
    const s = scoreCADFeatures(
      pred({ featureTable: [{ kind: 'hole', count: 8 }] }),
      truth({ features: { hole: 4 } }),
    );
    expect(s.byKind.hole).toEqual({ predicted: 8, truth: 4, matched: 4 });
    expect(s.featurePrecision).toBeCloseTo(0.5, 6); // 4 matched / 8 predicted
    expect(s.featureRecall).toBe(1);                // all real holes found
    expect(s.featureF1).toBeCloseTo(2 / 3, 6);
  });

  it('penalises UNDER-counting via recall', () => {
    const s = scoreCADFeatures(
      pred({ featureTable: [{ kind: 'hole', count: 2 }] }),
      truth({ features: { hole: 4 } }),
    );
    expect(s.featurePrecision).toBe(1);          // the 2 found are real
    expect(s.featureRecall).toBeCloseTo(0.5, 6); // 2 of 4 found
  });

  it('grades material classification when both sides provide it', () => {
    expect(scoreCADFeatures(pred({ materialFamily: 'Aluminium', featureTable: [] }), truth({ features: {}, materialFamily: 'aluminum' })).materialMatch).toBe(1);
    expect(scoreCADFeatures(pred({ materialFamily: 'steel', featureTable: [] }), truth({ features: {}, materialFamily: 'aluminum' })).materialMatch).toBe(0);
    expect(scoreCADFeatures(pred({ featureTable: [] }), truth({ features: {} })).materialMatch).toBeNull();
  });

  it('computes volume error % when truth volume is provided', () => {
    const s = scoreCADFeatures(pred({ volume: { cm3: 105 }, featureTable: [] }), truth({ features: {}, volumeCm3: 100 }));
    expect(s.volumeErrorPct).toBeCloseTo(5, 6);
    expect(scoreCADFeatures(pred({ featureTable: [] }), truth({ features: {} })).volumeErrorPct).toBeNull();
  });

  it('micro-averages across parts in the aggregate', () => {
    const a = scoreCADFeatures(pred({ featureTable: [{ kind: 'hole', count: 8 }] }), truth({ features: { hole: 4 } }), 'a'); // P=0.5 R=1
    const b = scoreCADFeatures(pred({ featureTable: [{ kind: 'hole', count: 4 }] }), truth({ features: { hole: 4 } }), 'b'); // P=1  R=1
    const agg = aggregateCADScores([a, b]);
    // total matched 8 / total predicted 12 = 0.667 precision; 8 truth all matched = 1 recall
    expect(agg.featurePrecision).toBeCloseTo(8 / 12, 6);
    expect(agg.featureRecall).toBe(1);
    expect(agg.byKind.hole).toEqual({ predicted: 12, truth: 8, matched: 8 });
  });
});
