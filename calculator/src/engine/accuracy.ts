/**
 * Accuracy harness — measures should-cost accuracy against known actuals.
 *
 * This is the machinery for HONESTLY answering "how accurate is the tool?" —
 * per commodity, from real logged quotes/actuals. It fabricates nothing: feed
 * it (estimate, actual) pairs you trust and it reports MAPE, bias and hit-rates,
 * and — importantly — refuses to claim confidence it hasn't earned (small n is
 * flagged "insufficient", not dressed up as a headline number).
 *
 * MAPE   = mean |estimate − actual| / actual                (lower is better)
 * bias   = median (estimate − actual) / actual              (+ = over-estimates)
 * within = fraction of points inside ±10% / ±20% of actual
 */

export interface AccuracyPoint {
  commodity: string;
  partName?: string;
  estimateGBP: number;   // the tool's should-cost
  actualGBP: number;     // the real quote / PO price we're grading against
  source?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface CommodityAccuracy {
  commodity: string;
  n: number;
  mapePct: number;         // mean absolute percentage error
  medianApePct: number;    // median absolute percentage error (robust to outliers)
  biasPct: number;         // median signed % error; positive = over-estimating
  biasDir: 'over' | 'under' | 'centred';
  within10Pct: number;     // 0–1 fraction within ±10% of actual
  within20Pct: number;
  confidence: Confidence;
}

export interface AccuracyReport {
  overall: CommodityAccuracy;
  byCommodity: CommodityAccuracy[];
  totalPoints: number;
  skipped: number;         // points dropped for invalid data
  generatedNote: string;
}

/** Minimum points before we'll report a MAPE with any confidence. */
export const MIN_POINTS_FOR_CONFIDENCE = 5;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

function gradeConfidence(n: number, mapePct: number): Confidence {
  if (n < MIN_POINTS_FOR_CONFIDENCE) return 'insufficient';
  if (mapePct <= 12) return 'high';
  if (mapePct <= 25) return 'medium';
  return 'low';
}

function statsFor(commodity: string, pts: AccuracyPoint[]): CommodityAccuracy {
  const ape = pts.map(p => Math.abs(p.estimateGBP - p.actualGBP) / p.actualGBP * 100);
  const signed = pts.map(p => (p.estimateGBP - p.actualGBP) / p.actualGBP * 100);
  const mapePct = r1(mean(ape));
  const biasPct = r1(median(signed));
  return {
    commodity,
    n: pts.length,
    mapePct,
    medianApePct: r1(median(ape)),
    biasPct,
    biasDir: biasPct > 2 ? 'over' : biasPct < -2 ? 'under' : 'centred',
    within10Pct: mean(ape.map(a => (a <= 10 ? 1 : 0))),
    within20Pct: mean(ape.map(a => (a <= 20 ? 1 : 0))),
    confidence: gradeConfidence(pts.length, mapePct),
  };
}

export function computeAccuracyReport(points: AccuracyPoint[]): AccuracyReport {
  const valid = points.filter(p => Number.isFinite(p.estimateGBP) && Number.isFinite(p.actualGBP) && p.actualGBP > 0 && p.estimateGBP >= 0);
  const skipped = points.length - valid.length;

  const groups = new Map<string, AccuracyPoint[]>();
  for (const p of valid) {
    const key = p.commodity || 'unknown';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const byCommodity = [...groups.entries()]
    .map(([c, pts]) => statsFor(c, pts))
    .sort((a, b) => b.n - a.n || a.commodity.localeCompare(b.commodity));

  return {
    overall: statsFor('ALL', valid),
    byCommodity,
    totalPoints: valid.length,
    skipped,
    generatedNote: valid.length < MIN_POINTS_FOR_CONFIDENCE
      ? `Only ${valid.length} valid point(s) — not enough to claim accuracy. Log more actuals.`
      : `${valid.length} points across ${byCommodity.length} commodities.`,
  };
}

/** One-line honest summary for a commodity (or the overall row). */
export function accuracyHeadline(a: CommodityAccuracy): string {
  if (a.confidence === 'insufficient') return `${a.commodity}: n=${a.n} — insufficient data (need ≥${MIN_POINTS_FOR_CONFIDENCE})`;
  const bias = a.biasDir === 'centred' ? 'centred' : `${a.biasPct > 0 ? '+' : ''}${a.biasPct}% (${a.biasDir})`;
  return `${a.commodity}: MAPE ${a.mapePct}% · bias ${bias} · ${Math.round(a.within20Pct * 100)}% within ±20% · n=${a.n} (${a.confidence})`;
}
