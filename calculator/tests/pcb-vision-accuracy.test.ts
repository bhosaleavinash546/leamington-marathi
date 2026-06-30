import { describe, it, expect } from 'vitest';
import { scoreBom, aggregateScores, type BomItem } from '../server/utils/pcb-vision-accuracy.js';

const truth: BomItem[] = [
  { refDes: 'U1', partNumber: 'STM32F407', unitPriceGBP: 5.0, qty: 1 },
  { refDes: 'U2', partNumber: 'TJA1051',   unitPriceGBP: 0.6, qty: 1 },
  { refDes: 'C1', partNumber: 'GRM188',    unitPriceGBP: 0.02, qty: 4 },
  { refDes: 'R1', partNumber: 'RC0402',    unitPriceGBP: 0.01, qty: 4 },
];

describe('scoreBom — perfect prediction', () => {
  it('scores 1.0 precision/recall/F1 and zero error', () => {
    const s = scoreBom(truth, truth);
    expect(s.componentPrecision).toBe(1);
    expect(s.componentRecall).toBe(1);
    expect(s.componentF1).toBe(1);
    expect(s.partNumberAccuracy).toBe(1);
    expect(s.priceMAPE).toBe(0);
    expect(s.totalCostError).toBe(0);
    expect(s.falsePositives).toBe(0);
    expect(s.falseNegatives).toBe(0);
  });
});

describe('scoreBom — missed and hallucinated components', () => {
  it('counts a missed component as a false negative (lowers recall)', () => {
    const pred = truth.slice(0, 3); // misses R1
    const s = scoreBom(pred, truth);
    expect(s.truePositives).toBe(3);
    expect(s.falseNegatives).toBe(1);
    expect(s.componentRecall).toBeCloseTo(0.75, 5);
    expect(s.componentPrecision).toBe(1); // everything predicted was real
  });

  it('counts a hallucinated component as a false positive (lowers precision)', () => {
    const pred = [...truth, { refDes: 'U9', partNumber: 'GHOST', unitPriceGBP: 9, qty: 1 }];
    const s = scoreBom(pred, truth);
    expect(s.falsePositives).toBe(1);
    expect(s.componentPrecision).toBeCloseTo(4 / 5, 5);
    expect(s.componentRecall).toBe(1);
  });
});

describe('scoreBom — part number and price error', () => {
  it('reports part-number accuracy over comparable lines', () => {
    const pred = truth.map((t, i) => i === 0 ? { ...t, partNumber: 'WRONG' } : t);
    const s = scoreBom(pred, truth);
    expect(s.partNumberAccuracy).toBeCloseTo(3 / 4, 5); // 1 of 4 PNs wrong
  });

  it('computes price MAPE on matched priced items', () => {
    // U1 predicted at 6.0 vs truth 5.0 → 20% error; others exact → MAPE = 0.20/4
    const pred = truth.map((t, i) => i === 0 ? { ...t, unitPriceGBP: 6.0 } : t);
    const s = scoreBom(pred, truth);
    expect(s.priceMAPE).toBeCloseTo(0.2 / 4, 5);
  });

  it('computes total-cost error from qty × price sums', () => {
    // truth total = 5 + 0.6 + 0.08 + 0.04 = 5.72; bump U1 5→7 (+2) → 2/5.72
    const pred = truth.map((t, i) => i === 0 ? { ...t, unitPriceGBP: 7.0 } : t);
    const s = scoreBom(pred, truth);
    expect(s.totalCostError).toBeCloseTo(2 / 5.72, 5);
  });
});

describe('scoreBom — matching is case-insensitive on refDes', () => {
  it('matches u1 to U1', () => {
    const s = scoreBom([{ refDes: 'u1', partNumber: 'stm32f407', unitPriceGBP: 5, qty: 1 }], [truth[0]]);
    expect(s.truePositives).toBe(1);
    expect(s.partNumberAccuracy).toBe(1);
  });
});

describe('aggregateScores', () => {
  it('macro-averages across boards', () => {
    const a = scoreBom(truth, truth);                 // F1 = 1
    const b = scoreBom(truth.slice(0, 2), truth);     // recall 0.5, precision 1 → F1 ≈ 0.667
    const agg = aggregateScores([a, b]);
    expect(agg.componentF1).toBeCloseTo((1 + (2 * 1 * 0.5) / 1.5) / 2, 5);
    expect(agg.truePositives).toBe(a.truePositives + b.truePositives);
  });
});
