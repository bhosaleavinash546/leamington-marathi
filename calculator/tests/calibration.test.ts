import { describe, it, expect } from 'vitest';
import {
  computeCalibration, applyCalibration, calibrationSummary, MIN_SAMPLES,
  computeCalibrationHierarchical, cvFromMape, computeConformalBand, applyConformalBand,
  segmentDrift, calibrationCoverage,
  type CalibrationRecord,
} from '../src/engine/calibration.js';

let _id = 0;
const rec = (commodity: string, shouldCost: number, actualCost: number): CalibrationRecord =>
  ({ id: String(_id++), savedAt: 0, commodity, shouldCost, actualCost, currency: 'GBP' });

describe('calibration — learning from actuals', () => {
  it('holds bias at 1.0 until MIN_SAMPLES actuals exist', () => {
    const recs = [rec('machining', 100, 120), rec('machining', 100, 118)]; // n=2 < 3
    const s = computeCalibration(recs, 'machining');
    expect(s.n).toBe(2);
    expect(s.applied).toBe(false);
    expect(s.biasFactor).toBe(1);
    expect(applyCalibration(200, s)).toBe(200);
  });

  it('derives a median bias factor once enough actuals exist', () => {
    // Model under-estimates by ~15–20% consistently.
    const recs = [rec('casting', 100, 118), rec('casting', 100, 120), rec('casting', 100, 122)];
    const s = computeCalibration(recs, 'casting');
    expect(s.n).toBe(MIN_SAMPLES);
    expect(s.applied).toBe(true);
    expect(s.biasFactor).toBeCloseTo(1.20, 2);       // median ratio 120/100
    expect(s.direction).toBe('under');
    expect(applyCalibration(50, s)).toBeCloseTo(60, 1);
  });

  it('calibrated MAPE is no worse than raw MAPE (bias correction helps)', () => {
    const recs = [rec('forging', 100, 130), rec('forging', 100, 135), rec('forging', 100, 128), rec('forging', 100, 133)];
    const s = computeCalibration(recs, 'forging');
    expect(s.mapePct).toBeGreaterThan(s.calibratedMapePct);   // correcting the +30% bias reduces error
    expect(s.calibratedMapePct).toBeLessThan(6);
  });

  it('is robust to a single outlier (median, not mean)', () => {
    const recs = [rec('rubber', 100, 110), rec('rubber', 100, 112), rec('rubber', 100, 500), rec('rubber', 100, 111)];
    const s = computeCalibration(recs, 'rubber');
    expect(s.biasFactor).toBeLessThan(1.2);   // outlier 5x doesn't blow up the median
  });

  it('portfolio summary weights MAPE by sample count', () => {
    const recs = [
      rec('machining', 100, 110), rec('machining', 100, 112), rec('machining', 100, 108),
      rec('casting', 100, 150), rec('casting', 100, 155), rec('casting', 100, 152),
    ];
    const sum = calibrationSummary(recs);
    expect(sum.totalSamples).toBe(6);
    expect(sum.commodities.length).toBe(2);
    expect(sum.weightedCalibratedMapePct).toBeLessThan(sum.weightedMapePct);
  });
});

describe('hierarchical (segment) calibration', () => {
  const seg = (family: string, region: string, ratio: number, n: number): CalibrationRecord[] =>
    Array.from({ length: n }, () => ({ ...rec('casting', 100, 100 * ratio), materialFamily: family, region }));

  it('uses the most specific segment when it has enough samples', () => {
    const records = [...seg('Aluminium', 'CN', 1.12, 3), ...seg('Steel', 'UK', 0.95, 3)];
    const h = computeCalibrationHierarchical(records, { commodity: 'casting', materialFamily: 'Aluminium', region: 'CN' });
    expect(h.segment).toBe('commodity+family+region');
    expect(h.biasFactor).toBeCloseTo(1.12, 2);
  });

  it('falls back family → commodity as evidence thins', () => {
    const records = [...seg('Aluminium', 'CN', 1.12, 2), ...seg('Aluminium', 'DE', 1.10, 2)];  // 4 for family, 2 per region
    const fam = computeCalibrationHierarchical(records, { commodity: 'casting', materialFamily: 'Aluminium', region: 'CN' });
    expect(fam.segment).toBe('commodity+family');
    const other = computeCalibrationHierarchical(records, { commodity: 'casting', materialFamily: 'Zinc', region: 'CN' });
    expect(other.segment).toBe('commodity');       // no Zinc data → whole-commodity tier (4 records)
    expect(other.applied).toBe(true);
  });

  it('reports segment "none" (bias 1.0) when even the commodity lacks samples', () => {
    const h = computeCalibrationHierarchical(seg('Aluminium', 'CN', 1.2, 2), { commodity: 'casting' });
    expect(h.segment).toBe('none');
    expect(h.biasFactor).toBe(1);
  });

  it('cvFromMape maps observed error to a clamped CV for the Monte-Carlo band', () => {
    expect(cvFromMape(10)).toBeCloseTo(0.125, 3);
    expect(cvFromMape(0)).toBe(0.03);    // floor: no false precision
    expect(cvFromMape(80)).toBe(0.35);   // ceiling
  });
});


describe('conformal confidence bands', () => {
  const recF = (commodity: string, shouldCost: number, actualCost: number, family?: string, region?: string): CalibrationRecord =>
    ({ id: String(_id++), savedAt: 0, commodity, shouldCost, actualCost, currency: 'GBP', materialFamily: family, region });

  it('reports no band below MIN_SAMPLES', () => {
    const recs = [recF('machining', 100, 105), recF('machining', 100, 96)];
    const band = computeConformalBand(recs, { commodity: 'machining' });
    expect(band.applied).toBe(false);
    expect(band.halfWidthPct).toBe(0);
  });

  it('derives a band from the observed error quantile', () => {
    // errors after (near-1) bias: ~ ±3-8%
    const recs = [
      recF('machining', 100, 103), recF('machining', 100, 97),
      recF('machining', 100, 108), recF('machining', 100, 95),
      recF('machining', 100, 102), recF('machining', 100, 99),
    ];
    const band = computeConformalBand(recs, { commodity: 'machining' }, 0.9);
    expect(band.applied).toBe(true);
    expect(band.n).toBe(6);
    expect(band.halfWidthPct).toBeGreaterThan(0);
    expect(band.halfWidthPct).toBeLessThan(20);
    // empirical coverage must meet or beat the request in-sample
    expect(band.empiricalCoverage).toBeGreaterThanOrEqual(90);
  });

  it('empirical coverage is at least the requested coverage (validity)', () => {
    const recs = Array.from({ length: 12 }, (_, i) =>
      recF('casting', 50, 50 * (0.9 + (i % 5) * 0.05)));   // spread of ratios
    const band = computeConformalBand(recs, { commodity: 'casting' }, 0.9);
    expect(band.empiricalCoverage).toBeGreaterThanOrEqual(90);
  });

  it('wider target coverage yields a wider (or equal) band', () => {
    const recs = Array.from({ length: 15 }, (_, i) =>
      recF('forging', 80, 80 * (0.85 + (i % 7) * 0.05)));
    const b80 = computeConformalBand(recs, { commodity: 'forging' }, 0.8);
    const b95 = computeConformalBand(recs, { commodity: 'forging' }, 0.95);
    expect(b95.halfWidthPct).toBeGreaterThanOrEqual(b80.halfWidthPct);
  });

  it('applyConformalBand brackets the estimate symmetrically', () => {
    const recs = Array.from({ length: 8 }, (_, i) => recF('rubber', 20, 20 * (0.95 + (i % 3) * 0.05)));
    const band = computeConformalBand(recs, { commodity: 'rubber' }, 0.9);
    const { low, high } = applyConformalBand(100, band);
    expect(low).toBeLessThan(100);
    expect(high).toBeGreaterThan(100);
    expect(Math.abs((high - 100) - (100 - low))).toBeLessThan(0.02);
  });

  it('prefers the most specific segment with enough evidence', () => {
    const recs = [
      // family+region tier: aluminium/CN casting runs high-variance
      recF('casting', 100, 130, 'Aluminium', 'CN'), recF('casting', 100, 128, 'Aluminium', 'CN'),
      recF('casting', 100, 132, 'Aluminium', 'CN'),
      // broad commodity tier: tight
      recF('casting', 100, 101), recF('casting', 100, 99), recF('casting', 100, 100),
    ];
    const band = computeConformalBand(recs, { commodity: 'casting', materialFamily: 'Aluminium', region: 'CN' }, 0.9);
    expect(band.segment).toBe('commodity+family+region');
    expect(band.n).toBe(3);
  });
});

describe('segment drift — recent actuals diverging from the learned model', () => {
  let t = 0;
  const rt = (commodity: string, shouldCost: number, actualCost: number, family?: string, region?: string): CalibrationRecord =>
    ({ id: String(_id++), savedAt: ++t, commodity, shouldCost, actualCost, currency: 'GBP', materialFamily: family, region });

  it('flags a segment whose recent quotes run materially above the older ones', () => {
    const recs = [
      rt('casting', 100, 100), rt('casting', 100, 101), rt('casting', 100, 99),   // older ~1.0
      rt('casting', 100, 125), rt('casting', 100, 124), rt('casting', 100, 126),  // recent ~1.25
    ];
    const d = segmentDrift(recs, { commodity: 'casting' });
    expect(d.drifting).toBe(true);
    expect(d.direction).toBe('up');
    expect(d.deltaPct).toBeGreaterThan(15);
    expect(d.n).toBe(6);
  });

  it('does not flag a stable segment', () => {
    const recs = [
      rt('machining', 100, 110), rt('machining', 100, 108), rt('machining', 100, 112),
      rt('machining', 100, 109), rt('machining', 100, 111), rt('machining', 100, 110),
    ];
    expect(segmentDrift(recs, { commodity: 'machining' }).drifting).toBe(false);
  });

  it('stays quiet without enough data on each side', () => {
    const recs = [rt('forging', 100, 100), rt('forging', 100, 150), rt('forging', 100, 150)];
    const d = segmentDrift(recs, { commodity: 'forging' });
    expect(d.drifting).toBe(false);
    expect(d.n).toBe(3);
  });
});

describe('calibration coverage — where the model has learned', () => {
  it('reports per-segment counts and calibrated flag', () => {
    const mk = (commodity: string, family: string, region: string, s: number, a: number): CalibrationRecord =>
      ({ id: String(_id++), savedAt: 0, commodity, shouldCost: s, actualCost: a, currency: 'GBP', materialFamily: family, region });
    const recs = [
      mk('casting', 'Aluminium', 'CN', 100, 112), mk('casting', 'Aluminium', 'CN', 100, 114), mk('casting', 'Aluminium', 'CN', 100, 113),
      mk('machining', 'Steel', 'UK', 100, 105),   // only 1 → uncalibrated segment
    ];
    const cov = calibrationCoverage(recs);
    expect(cov.length).toBe(2);
    expect(cov[0].n).toBe(3);                 // most-covered first
    expect(cov[0].calibrated).toBe(true);
    const uk = cov.find(c => c.commodity === 'machining');
    expect(uk?.n).toBe(1);
    expect(uk?.calibrated).toBe(false);
  });
});
