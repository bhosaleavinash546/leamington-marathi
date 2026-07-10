import type { KnowledgeCase } from './part-similarity.js';

/**
 * Intelligence summary (Step 6 — the trust dashboard).
 *
 * Turns the knowledge base into evidence that the tool is learning: size and
 * coverage, measured accuracy against logged actuals (MAPE), bias direction,
 * and a month-by-month accuracy trend. Numbers, not claims — management can see
 * the tool getting smarter (or be told honestly that it lacks data yet).
 */

export interface AccuracyPoint { month: string; mapePct: number; n: number; }

export interface IntelligenceSummary {
  totalCases: number;
  withActuals: number;
  byCommodity: Record<string, number>;
  adjustedCases: number;               // analyses where the user corrected auto-filled values
  overallMapePct: number | null;       // vs logged actuals; null until any actual exists
  biasDirection: 'under' | 'over' | 'centred' | null;
  trend: AccuracyPoint[];              // chronological monthly MAPE
  verdict: 'improving' | 'stable' | 'degrading' | 'insufficient-data';
}

const monthOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeIntelligenceSummary(cases: KnowledgeCase[]): IntelligenceSummary {
  const byCommodity: Record<string, number> = {};
  for (const c of cases) byCommodity[c.fingerprint.commodity] = (byCommodity[c.fingerprint.commodity] ?? 0) + 1;

  const withActuals = cases.filter(c => c.actualCost && c.actualCost > 0 && c.totalCost > 0);
  const errPct = (c: KnowledgeCase) => Math.abs(c.actualCost! - c.totalCost) / c.actualCost! * 100;

  const overallMapePct = withActuals.length
    ? round1(withActuals.reduce((s, c) => s + errPct(c), 0) / withActuals.length)
    : null;

  let biasDirection: IntelligenceSummary['biasDirection'] = null;
  if (withActuals.length) {
    const meanRatio = withActuals.reduce((s, c) => s + c.actualCost! / c.totalCost, 0) / withActuals.length;
    biasDirection = meanRatio > 1.03 ? 'under' : meanRatio < 0.97 ? 'over' : 'centred';
  }

  // Monthly accuracy trend (needs ≥1 actual in a month to have a point).
  const byMonth = new Map<string, KnowledgeCase[]>();
  for (const c of withActuals) {
    const m = monthOf(c.savedAt);
    byMonth.set(m, [...(byMonth.get(m) ?? []), c]);
  }
  const trend: AccuracyPoint[] = [...byMonth.entries()]
    .map(([month, cs]) => ({ month, mapePct: round1(cs.reduce((s, c) => s + errPct(c), 0) / cs.length), n: cs.length }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Verdict: compare the first vs last month with data (needs ≥2 months, ≥4 actuals total).
  let verdict: IntelligenceSummary['verdict'] = 'insufficient-data';
  if (trend.length >= 2 && withActuals.length >= 4) {
    const delta = trend[trend.length - 1].mapePct - trend[0].mapePct;
    verdict = delta <= -2 ? 'improving' : delta >= 2 ? 'degrading' : 'stable';
  }

  return {
    totalCases: cases.length,
    withActuals: withActuals.length,
    byCommodity,
    adjustedCases: cases.filter(c => c.userAdjusted).length,
    overallMapePct,
    biasDirection,
    trend,
    verdict,
  };
}
