import type { PartCostResult, UniversalStackInput, Confidence, Breakdown8Bucket, RateLibrary } from './types.js';
import { computeUniversalStack } from './core.js';

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

/**
 * Small, fast, seeded PRNG (mulberry32) → deterministic bands.
 *
 * Exported because the software should-cost model had its own Monte Carlo built
 * on raw `Math.random()`, so its P50/P90 band moved on every run for identical
 * inputs — a confidence interval nobody could reproduce. One seeded generator
 * for the whole tool rather than two conventions.
 */
export function mulberry32(seed: number): () => number {
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

/**
 * Where each cost DRIVER came from. This is what makes a CAD-measured part's
 * band narrower than a hand-typed one — the product's whole argument — and
 * what makes the band respond to answering a decision.
 *
 *   geometry_exact  OCCT volume, bbox, hole count          CV 0.01
 *   geometry_mesh   STL volume (thin drapes are worse)     CV 0.03 / 0.12
 *   rule            derived from geometry with a basis     CV 0.05
 *   engineer        answered or typed by a person          CV 0.05
 *   ai              read from a drawing by the model       CV 0.15
 *   library         a rate-library entry (by its own confidence)
 *   default         SHOP_DEFAULTS / mapper fallbacks       CV 0.25
 */
export type DriverSource = 'geometry_exact' | 'geometry_mesh' | 'geometry_mesh_thin' | 'rule' | 'engineer' | 'ai' | 'default';
export const DRIVER_CV: Record<DriverSource, number> = {
  geometry_exact: 0.01, geometry_mesh: 0.03, geometry_mesh_thin: 0.12, rule: 0.05, engineer: 0.05, ai: 0.15, default: 0.25,
};
export interface DriverProvenance {
  netWeightKg?: DriverSource;
  materialUtilization?: DriverSource;
  /** One entry per operation (by index); missing → `default`. */
  cycleTimeHr?: DriverSource[];
  toolingCost?: DriverSource;
  packaging?: DriverSource;
  logistics?: DriverSource;
}

export interface UncertaintyOptions {
  trials?: number; seed?: number; baseCvOverride?: number;
  /** With `library`, drivers are perturbed and the whole stack re-run per trial. */
  provenance?: DriverProvenance;
  library?: RateLibrary;
}

const LIB_CV: Record<Confidence, number> = CV_BY_CONFIDENCE;

/** Lognormal multiplier with the given CV, mean ≈ 1. */
function lognormalMult(cv: number, rng: () => number): number {
  if (cv <= 0) return 1;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  return Math.exp(-0.5 * sigma * sigma + sigma * stdNormal(rng));
}

/**
 * Driver-level Monte Carlo: perturb the INPUTS by how well each is known and
 * run `computeUniversalStack` for every trial. Rates are perturbed by their own
 * library confidence; geometry by its provenance. ~1 ms per trial.
 */
function driverTrials(
  input: UniversalStackInput, library: RateLibrary, prov: DriverProvenance,
  trials: number, rng: () => number,
): Float64Array {
  const totals: Float64Array = new Float64Array(trials);
  const cvOf = (src: DriverSource | undefined) => DRIVER_CV[src ?? 'default'];
  const matConf = library.materials.find(m => m.id === input.rawMaterial.materialId)?.confidence ?? 'Medium';
  const machConf = input.operations.map(op => library.machines.find(m => m.id === op.machineId)?.confidence ?? 'Medium');
  const labConf = input.operations.map(op => library.labour.find(l => l.id === op.labourId)?.confidence ?? 'Medium');
  for (let i = 0; i < trials; i++) {
    const lib: RateLibrary = {
      ...library,
      materials: library.materials.map(m => m.id === input.rawMaterial.materialId
        ? { ...m, pricePerKg: m.pricePerKg * lognormalMult(LIB_CV[matConf], rng) } : m),
      machines: library.machines.map(m => {
        const k = input.operations.findIndex(op => op.machineId === m.id);
        return k >= 0 ? { ...m, computedRatePerHr: m.computedRatePerHr * lognormalMult(LIB_CV[machConf[k]], rng) } : m;
      }),
      labour: library.labour.map(l => {
        const k = input.operations.findIndex(op => op.labourId === l.id);
        return k >= 0 ? { ...l, fullyLoadedRatePerHr: l.fullyLoadedRatePerHr * lognormalMult(LIB_CV[labConf[k]], rng) } : l;
      }),
    };
    const util = Math.min(0.99, Math.max(0.05, input.rawMaterial.materialUtilization * lognormalMult(cvOf(prov.materialUtilization), rng)));
    const trial: UniversalStackInput = {
      ...input,
      rawMaterial: { ...input.rawMaterial,
        netWeightKg: input.rawMaterial.netWeightKg * lognormalMult(cvOf(prov.netWeightKg), rng),
        materialUtilization: util },
      operations: input.operations.map((op, k) => {
        const m = lognormalMult(cvOf(prov.cycleTimeHr?.[k]), rng);
        return { ...op, cycleTimeHr: op.cycleTimeHr * m, labourTimeHr: op.labourTimeHr * m };
      }),
      tooling: { ...input.tooling, totalToolingCost: input.tooling.totalToolingCost * lognormalMult(cvOf(prov.toolingCost) * 1.8, rng) },
      packagingPerPart: input.packagingPerPart * lognormalMult(cvOf(prov.packaging) * 0.6, rng),
      logisticsPerPart: input.logisticsPerPart * lognormalMult(cvOf(prov.logistics) * 0.6, rng),
    };
    try { totals[i] = computeUniversalStack(trial, lib).total; }
    catch { totals[i] = NaN; }
  }
  return totals;
}

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

  const rng = mulberry32((opts.seed ?? 1234567) >>> 0);

  // Provenance path: drivers through the real stack. Falls back to the bucket
  // path when nothing is known about the drivers, a calibrated CV override is
  // in force, or a trial cannot be costed (a malformed input).
  let totals: Float64Array | null = null;
  const useDrivers = !!(opts.library && opts.provenance && opts.baseCvOverride === undefined);
  if (useDrivers) {
    const t = driverTrials(input, opts.library!, opts.provenance!, trials, rng);
    if (t.every(Number.isFinite)) totals = t;
  }
  if (!totals) {
    totals = new Float64Array(trials);
    for (let i = 0; i < trials; i++) {
      // Lognormal multiplier per base bucket → strictly positive, mean ≈ 1.
      const mult = (bucket: keyof Breakdown8Bucket): number => lognormalMult(baseCv * BUCKET_CV_FACTOR[bucket], rng);
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
