/**
 * Calibration / learning loop — the accuracy moat.
 *
 * A should-cost model is only as good as its agreement with reality. This module
 * lets the tool learn from actual quoted / PO prices: users log the real price
 * against a saved estimate, and the model derives a per-commodity (optionally
 * per-region) bias correction plus an honest MAPE (mean absolute percent error).
 *
 * The correction is the MEDIAN of actual÷estimate ratios (robust to outliers),
 * applied only once there is enough evidence (MIN_SAMPLES). The result is a
 * self-improving estimate: the more real data logged, the tighter and less biased
 * the number, with the accuracy reported transparently rather than asserted.
 */

export interface CalibrationRecord {
  id: string;
  savedAt: number;
  commodity: string;
  region?: string;
  materialFamily?: string;   // e.g. 'Aluminium', 'Steel', 'Thermoplastic' — enables segment calibration
  shouldCost: number;   // the model estimate at the time it was logged
  actualCost: number;   // the real quoted / PO unit price
  currency: string;
  note?: string;
}

export interface CalibrationStats {
  commodity: string;
  n: number;
  biasFactor: number;        // median(actual ÷ estimate); 1.0 until MIN_SAMPLES reached
  medianRatio: number;       // same median, always reported (even below threshold)
  mapePct: number;           // MAPE of the RAW estimate vs actual
  calibratedMapePct: number; // MAPE AFTER applying the bias factor (should be ≤ raw)
  applied: boolean;          // is the bias factor being applied?
  direction: 'under' | 'over' | 'unbiased';  // does the raw model under- or over-estimate?
}

/** Minimum logged actuals before a bias correction is trusted/applied. */
export const MIN_SAMPLES = 3;

const median = (arr: number[]): number => {
  if (!arr.length) return 1;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Compute the calibration for one commodity from all logged actuals. */
export function computeCalibration(records: CalibrationRecord[], commodity: string): CalibrationStats {
  const rs = records.filter(r => r.commodity === commodity && r.shouldCost > 0 && r.actualCost > 0);
  const n = rs.length;
  const ratios = rs.map(r => r.actualCost / r.shouldCost);
  const medianRatio = median(ratios);
  const applied = n >= MIN_SAMPLES;
  const biasFactor = applied ? medianRatio : 1;

  const mape = (bias: number): number =>
    rs.length ? (rs.reduce((s, r) => s + Math.abs(r.actualCost - r.shouldCost * bias) / r.actualCost, 0) / rs.length) * 100 : 0;

  const direction: CalibrationStats['direction'] =
    !applied ? 'unbiased' : medianRatio > 1.03 ? 'under' : medianRatio < 0.97 ? 'over' : 'unbiased';

  return {
    commodity, n,
    biasFactor: round3(biasFactor),
    medianRatio: round3(medianRatio),
    mapePct: round1(mape(1)),
    calibratedMapePct: round1(mape(biasFactor)),
    applied,
    direction,
  };
}

/** Apply a commodity's calibration to a fresh should-cost estimate. */
export function applyCalibration(shouldCost: number, stats: CalibrationStats): number {
  return round2(shouldCost * stats.biasFactor);
}

// ── Hierarchical (segment) calibration ─────────────────────────────────────────

export interface SegmentQuery { commodity: string; materialFamily?: string; region?: string; }
export interface HierarchicalCalibration extends CalibrationStats {
  /** Which segment supplied the correction, most→least specific. */
  segment: 'commodity+family+region' | 'commodity+family' | 'commodity' | 'none';
}

/**
 * Calibration at the most specific segment with enough evidence:
 * commodity×family×region → commodity×family → commodity → none.
 * A narrow segment ("aluminium castings from China run +12%") beats a broad one,
 * but only when it has MIN_SAMPLES of its own — no over-fitting to 2 data points.
 */
export function computeCalibrationHierarchical(records: CalibrationRecord[], q: SegmentQuery): HierarchicalCalibration {
  const tiers: Array<{ segment: HierarchicalCalibration['segment']; recs: CalibrationRecord[] }> = [
    { segment: 'commodity+family+region', recs: records.filter(r => r.commodity === q.commodity && !!q.materialFamily && r.materialFamily === q.materialFamily && !!q.region && r.region === q.region) },
    { segment: 'commodity+family', recs: records.filter(r => r.commodity === q.commodity && !!q.materialFamily && r.materialFamily === q.materialFamily) },
    { segment: 'commodity', recs: records.filter(r => r.commodity === q.commodity) },
  ];
  for (const t of tiers) {
    if (t.recs.length >= MIN_SAMPLES) {
      return { ...computeCalibration(t.recs, q.commodity), segment: t.segment };
    }
  }
  // Not enough evidence anywhere — report the commodity tier (unapplied bias 1.0).
  return { ...computeCalibration(tiers[2].recs, q.commodity), segment: 'none' };
}

/**
 * Convert an observed (calibrated) MAPE into a coefficient of variation for the
 * Monte-Carlo bands — real accuracy data should drive the uncertainty width.
 * Clamped so a lucky 0% MAPE on 3 quotes doesn't claim false precision.
 */
export function cvFromMape(mapePct: number): number {
  return Math.min(0.35, Math.max(0.03, (mapePct / 100) * 1.25));
}

/** Portfolio-wide accuracy across every commodity that has logged actuals. */
export function calibrationSummary(records: CalibrationRecord[]): {
  commodities: CalibrationStats[];
  totalSamples: number;
  weightedMapePct: number;
  weightedCalibratedMapePct: number;
} {
  const byCommodity = [...new Set(records.map(r => r.commodity))]
    .map(c => computeCalibration(records, c))
    .filter(s => s.n > 0)
    .sort((a, b) => b.n - a.n);
  const totalSamples = byCommodity.reduce((s, c) => s + c.n, 0);
  const wsum = (pick: (s: CalibrationStats) => number) =>
    totalSamples ? byCommodity.reduce((s, c) => s + pick(c) * c.n, 0) / totalSamples : 0;
  return {
    commodities: byCommodity,
    totalSamples,
    weightedMapePct: round1(wsum(c => c.mapePct)),
    weightedCalibratedMapePct: round1(wsum(c => c.calibratedMapePct)),
  };
}

// ── Conformal prediction bands ──────────────────────────────────────────────
/**
 * Split-conformal confidence band on a should-cost estimate.
 *
 * Where the Monte-Carlo band expresses the *physics prior* (how well the inputs
 * are known), this expresses the *empirical truth*: from the logged actuals it
 * derives a band that comes with a finite-sample COVERAGE GUARANTEE — under the
 * usual exchangeability assumption, at least `targetCoverage` of future real
 * quotes for this segment fall inside it. That lets the tool say, honestly,
 * "90% of your logged quotes have landed within ±X%" rather than asserting a
 * precision. Fully explainable: the band edge IS an observed error quantile.
 *
 * Nonconformity score per record = |actual − calibratedEstimate| ÷ actual,
 * i.e. the absolute percentage error AFTER the median-ratio bias correction, so
 * the band is centred on the number the tool actually reports.
 */
export interface ConformalBand {
  n: number;                 // records in the chosen segment
  requestedCoverage: number; // e.g. 0.90
  halfWidthPct: number;      // ± as a percent of the calibrated estimate
  guaranteed: boolean;       // n large enough for the coverage to be guaranteed in-sample
  empiricalCoverage: number; // fraction of in-sample actuals inside the band (sanity check, %)
  segment: HierarchicalCalibration['segment'];
  applied: boolean;          // enough evidence to report a band at all (n ≥ MIN_SAMPLES)
}

/** Ceil to a valid array index for the conformal quantile. */
function conformalQuantileScore(scores: number[], targetCoverage: number): { score: number; guaranteed: boolean } {
  const s = [...scores].sort((a, b) => a - b);
  const n = s.length;
  // Split-conformal rank: the ⌈(n+1)(1−α)⌉-th smallest score gives ≥ target coverage.
  const rank = Math.ceil((n + 1) * targetCoverage);
  if (rank > n) {
    // Not enough samples for the quantile to sit inside the sample → widest observed,
    // reported but NOT guaranteed (the tail is unbounded by the data we have).
    return { score: s[n - 1] ?? 0, guaranteed: false };
  }
  return { score: s[rank - 1], guaranteed: true };
}

export function computeConformalBand(
  records: CalibrationRecord[],
  q: SegmentQuery,
  targetCoverage = 0.90,
): ConformalBand {
  const cal = computeCalibrationHierarchical(records, q);
  // Reselect the same segment's records the hierarchical calibration used.
  const segRecs = (() => {
    switch (cal.segment) {
      case 'commodity+family+region':
        return records.filter(r => r.commodity === q.commodity && r.materialFamily === q.materialFamily && r.region === q.region);
      case 'commodity+family':
        return records.filter(r => r.commodity === q.commodity && r.materialFamily === q.materialFamily);
      default:
        return records.filter(r => r.commodity === q.commodity);
    }
  })().filter(r => r.shouldCost > 0 && r.actualCost > 0);

  const n = segRecs.length;
  const applied = n >= MIN_SAMPLES;
  if (!applied) {
    return { n, requestedCoverage: targetCoverage, halfWidthPct: 0, guaranteed: false,
             empiricalCoverage: 0, segment: cal.segment, applied: false };
  }
  const bias = cal.biasFactor;
  const scores = segRecs.map(r => Math.abs(r.actualCost - r.shouldCost * bias) / r.actualCost);
  const { score, guaranteed } = conformalQuantileScore(scores, targetCoverage);
  const halfWidthPct = round1(score * 100);
  const inside = scores.filter(x => x <= score).length;
  return {
    n, requestedCoverage: targetCoverage,
    halfWidthPct, guaranteed,
    empiricalCoverage: round1((inside / n) * 100),
    segment: cal.segment, applied: true,
  };
}

/** Apply a conformal band to a calibrated estimate → absolute low/high bounds. */
export function applyConformalBand(calibratedEstimate: number, band: ConformalBand): { low: number; high: number } {
  const w = calibratedEstimate * (band.halfWidthPct / 100);
  return { low: round2(calibratedEstimate - w), high: round2(calibratedEstimate + w) };
}
