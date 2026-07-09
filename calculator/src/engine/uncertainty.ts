import type { PartCostResult, UniversalStackInput, Confidence, Breakdown8Bucket } from './types.js';

/**
 * Cost uncertainty — Monte-Carlo confidence bands on the final should-cost.
 *
 * A single point estimate implies a precision the inputs don't have. This module
 * propagates the per-line confidence already tracked in the cost model into a
 * distribution on the total: each base cost bucket is perturbed by a lognormal
 * multiplier whose spread comes from how well that bucket is known, then the
 * 8-bucket stack (overhead %, margin %) is recomposed for every trial.
 *
 * Deterministic: a seeded PRNG makes the bands reproducible (and unit-testable).
 * Works for every commodity — it consumes the universal PartCostResult, so no
 * per-commodity code is needed.
 */

export interface CostUncertainty {
  p10: number;            // 10th percentile total (optimistic)
  p50: number;            // median total
  p90: number;            // 90th percentile total (conservative)
  mean: number;
  stdDev: number;
  cvPct: number;          // coefficient of variation of the total (%)
  band: 'tight' | 'moderate' | 'wide';
  overallConfidence: Confidence;
  /** ± as a percent of the point estimate, from the P10–P90 half-width. */
  plusMinusPct: number;
}

// Coefficient of variation (1σ) implied by a line's confidence grade.
const CV_BY_CONFIDENCE: Record<Confidence, number> = { High: 0.05, Medium: 0.12, Low: 0.22 };

// Per-bucket multipliers on the base CV: tooling estimates are the least certain;
// packaging/logistics are usually contracted and stable; overhead/margin are policy.
const BUCKET_CV_FACTOR: Record<keyof Breakdown8Bucket, number> = {
  rawMaterial: 1.0, process: 1.0, labour: 1.0,
  tooling: 1.8, packaging: 0.6, logistics: 0.6,
  overhead: 0.0, margin: 0.0,   // driven by %, recomputed each trial (not perturbed directly)
};

/** Overall confidence from the traceability mix (≥70% High → High, ≥40% → Medium). */
export function overallConfidence(result: PartCostResult): Confidence {
  const all = result.traceability;
  if (!all.length) return 'Medium';
  const high = all.filter(t => t.confidence === 'High').length / all.length;
  const low = all.filter(t => t.confidence === 'Low').length / all.length;
  if (low >= 0.4) return 'Low';
  if (high >= 0.7) return 'High';
  return high >= 0.4 ? 'Medium' : 'Low';
}

/** Small, fast, seeded PRNG (mulberry32) → deterministic bands. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal from two uniforms. */
function stdNormal(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface UncertaintyOptions { trials?: number; seed?: number; baseCvOverride?: number; }

/**
 * Run the Monte-Carlo and return confidence bands on the total should-cost.
 * The base cost buckets (material/process/labour/tooling/packaging/logistics) are
 * perturbed; overhead and margin are re-derived from their percentages each trial,
 * exactly as the deterministic engine composes them.
 */
export function computeCostUncertainty(
  result: PartCostResult,
  input: UniversalStackInput,
  opts: UncertaintyOptions = {},
): CostUncertainty {
  const trials = Math.max(200, Math.min(20000, opts.trials ?? 4000));
  const conf = overallConfidence(result);
  const baseCv = opts.baseCvOverride ?? CV_BY_CONFIDENCE[conf];
  const b = result.breakdown;

  const totals = new Float64Array(trials);
  const rng = mulberry32((opts.seed ?? 1234567) >>> 0);

  for (let i = 0; i < trials; i++) {
    // Lognormal multiplier per base bucket → strictly positive, mean ≈ 1.
    const mult = (bucket: keyof Breakdown8Bucket): number => {
      const cv = baseCv * BUCKET_CV_FACTOR[bucket];
      if (cv <= 0) return 1;
      const sigma = Math.sqrt(Math.log(1 + cv * cv));
      return Math.exp(-0.5 * sigma * sigma + sigma * stdNormal(rng));
    };
    const rm = b.rawMaterial * mult('rawMaterial');
    const proc = b.process * mult('process');
    const lab = b.labour * mult('labour');
    const tool = b.tooling * mult('tooling');
    const pack = b.packaging * mult('packaging');
    const log = b.logistics * mult('logistics');

    // Recompose exactly as core.ts: overhead is a % of the factory-cost base
    // (material+process+labour+tooling); margin is a % of the subtotal.
    const factoryBase = rm + proc + lab + tool;
    const overhead = input.overheadPct * factoryBase;
    const subtotal = factoryBase + pack + log + overhead;
    const margin = input.marginPct * subtotal;
    totals[i] = subtotal + margin;
  }

  totals.sort();
  const q = (p: number) => totals[Math.min(trials - 1, Math.max(0, Math.floor(p * trials)))];
  const p10 = q(0.10), p50 = q(0.50), p90 = q(0.90);
  let sum = 0; for (let i = 0; i < trials; i++) sum += totals[i];
  const mean = sum / trials;
  let varSum = 0; for (let i = 0; i < trials; i++) { const d = totals[i] - mean; varSum += d * d; }
  const stdDev = Math.sqrt(varSum / trials);
  const cvPct = mean > 0 ? (stdDev / mean) * 100 : 0;
  const plusMinusPct = result.total > 0 ? ((p90 - p10) / 2 / result.total) * 100 : 0;
  const band: CostUncertainty['band'] = cvPct < 6 ? 'tight' : cvPct < 14 ? 'moderate' : 'wide';

  return {
    p10: round2(p10), p50: round2(p50), p90: round2(p90),
    mean: round2(mean), stdDev: round2(stdDev),
    cvPct: Math.round(cvPct * 10) / 10,
    band, overallConfidence: conf,
    plusMinusPct: Math.round(plusMinusPct * 10) / 10,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
