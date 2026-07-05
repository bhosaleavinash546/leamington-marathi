import { describe, it, expect } from 'vitest';
import {
  estimateLaserFeedRateMmMin,
  estimateBlankingCycleSec,
  estimatePierceSec,
} from '../src/engine/modules/sheet-metal-fab.js';
import {
  adviseSheetMetalProcess,
  analyseSheetMetalDFM,
} from '../src/engine/modules/sheet-metal-advisor.js';

describe('laser feed-rate model (review #3 / A9)', () => {
  it('feed rate falls as thickness rises, and stainless cuts slower than mild steel', () => {
    expect(estimateLaserFeedRateMmMin('mild_steel', 1)).toBeGreaterThan(estimateLaserFeedRateMmMin('mild_steel', 6));
    expect(estimateLaserFeedRateMmMin('stainless', 6)).toBeLessThan(estimateLaserFeedRateMmMin('mild_steel', 6));
  });

  it('waterjet is much slower than laser; punch/shear are not feed-rate cut', () => {
    expect(estimateLaserFeedRateMmMin('mild_steel', 3, 'waterjet')).toBeLessThan(estimateLaserFeedRateMmMin('mild_steel', 3, 'laser'));
    expect(estimateLaserFeedRateMmMin('mild_steel', 3, 'punch')).toBeNaN();
  });

  it('blanking cycle = cut length ÷ feed + pierce + load; thick stainless costs more time than thin steel', () => {
    const thinSteel = estimateBlankingCycleSec({ method: 'laser', materialFamily: 'mild_steel', thicknessMm: 1, cutLengthMm: 1000, pierceCount: 4 });
    const thickSS = estimateBlankingCycleSec({ method: 'laser', materialFamily: 'stainless', thicknessMm: 6, cutLengthMm: 1000, pierceCount: 4 });
    expect(thickSS).toBeGreaterThan(thinSteel);
    // sanity: 1000mm at ~8000mm/min ≈ 7.5s cut + pierces + 8s load
    expect(thinSteel).toBeGreaterThan(10);
    expect(thinSteel).toBeLessThan(40);
  });

  it('pierce time grows with thickness', () => {
    expect(estimatePierceSec(6)).toBeGreaterThan(estimatePierceSec(1));
  });
});

describe('advisor now reads complexity (was a dead input)', () => {
  it('high complexity at high volume routes to a transfer die with higher tooling band', () => {
    const simple = adviseSheetMetalProcess({ annualVolume: 200000, thicknessMm: 1.5, complexity: 'low', holeDensity: 'low', materialFamily: 'steel' });
    const complex = adviseSheetMetalProcess({ annualVolume: 200000, thicknessMm: 1.5, complexity: 'high', holeDensity: 'low', materialFamily: 'steel' });
    expect(simple.toolingBand).not.toBe(complex.toolingBand);
    expect(complex.formingProcess).toMatch(/transfer/i);
    expect(complex.reason).toMatch(/complex/i);
  });
});

describe('analyseSheetMetalDFM (parity with casting/forging)', () => {
  it('flags a bend radius below the material minimum (critical for high-strength)', () => {
    const r = analyseSheetMetalDFM({ thicknessMm: 2, materialFamily: 'steel', minBendRadiusMm: 0.5, highStrength: true });
    expect(r.issues.some(i => i.severity === 'critical' && /bend radius/i.test(i.title))).toBe(true);
    expect(r.score).toBeLessThan(10);
  });

  it('flags too-small holes, tight tolerance, weld distortion and poor nesting', () => {
    const r = analyseSheetMetalDFM({
      thicknessMm: 2, materialFamily: 'stainless', minHoleDiameterMm: 1.0, toleranceMm: 0.04,
      weldLengthM: 1.2, materialUtilization: 0.55,
    });
    expect(r.issues.some(i => /hole/i.test(i.title))).toBe(true);
    expect(r.issues.some(i => /tolerance/i.test(i.title))).toBe(true);
    expect(r.issues.some(i => /weld/i.test(i.title))).toBe(true);
    expect(r.issues.some(i => /nesting/i.test(i.title))).toBe(true);
  });

  it('returns a clean score for compliant geometry', () => {
    const r = analyseSheetMetalDFM({
      thicknessMm: 1.5, materialFamily: 'steel', minBendRadiusMm: 2, minHoleDiameterMm: 2,
      minFeatureToEdgeMm: 4, toleranceMm: 0.2, bendCount: 3, weldLengthM: 0, materialUtilization: 0.8,
    });
    expect(r.score).toBe(10);
    expect(r.issues).toEqual([]);
  });
});
