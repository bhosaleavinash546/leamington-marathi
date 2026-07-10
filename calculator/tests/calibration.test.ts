import { describe, it, expect } from 'vitest';
import {
  computeCalibration, applyCalibration, calibrationSummary, MIN_SAMPLES,
  computeCalibrationHierarchical, cvFromMape, type CalibrationRecord,
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
