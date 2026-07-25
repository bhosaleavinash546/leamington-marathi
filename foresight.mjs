// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — deterministic foresight cores.
//
// Every number the /horizon feature shows comes from these functions operating
// on the curated register (tech-foresight-register.mjs): S-curve phases,
// horizon buckets with regulatory pull, Bass-diffusion adoption projections,
// Wright's-law cost indices and momentum scores. The LLM layer (routes) only
// narrates on top of these outputs — it never invents a figure.
//
// Projections are MODELS, not measurements: standard Bass parameters
// (p≈0.03, q≈0.38 — Bass 1969 / Sultan-Farley-Lehmann means) seeded from the
// register's curated current adoption, and Wright's-law learning rates mapped
// from the curated cost-trend direction. The UI must label them "modelled".
//
// Pure module: no Express, no DB, no network (costing-engine.mjs pattern).
// ─────────────────────────────────────────────────────────────────────────────
import { FORESIGHT_REGISTER, REG_ANCHORS } from './src/data/tech-foresight-register.mjs';
import { inferCommodityKey } from './src/data/commodity-classify.mjs';

// Register curation vintage — "today" for horizon boundaries (H1 now–2027,
// H2 2028–2031, H3 2032+). Bump when the register is re-curated.
export const REGISTER_VINTAGE = 2025;

const H1_SPAN = 2;   // vintage .. vintage+2   → "Now–2027"
const H2_SPAN = 6;   // vintage+3 .. vintage+6 → "2028–2031"

export function horizonWindows(now = REGISTER_VINTAGE) {
  return {
    H1: { label: `Now–${now + H1_SPAN}`, from: now, to: now + H1_SPAN },
    H2: { label: `${now + H1_SPAN + 1}–${now + H2_SPAN}`, from: now + H1_SPAN + 1, to: now + H2_SPAN },
    H3: { label: `${now + H2_SPAN + 1}+`, from: now + H2_SPAN + 1, to: null },
  };
}

/** Where a technology sits on its S-curve, from TRL + current adoption share. */
export function sCurvePhase(trl, adoptionPct) {
  if (adoptionPct >= 50) return 'mainstream';
  if (adoptionPct >= 15) return 'growth';
  if (trl >= 7) return 'takeoff';
  if (trl >= 5) return 'demonstration';
  return 'research';
}

function yearBucket(year, now) {
  if (year <= now + H1_SPAN) return 'H1';
  if (year <= now + H2_SPAN) return 'H2';
  return 'H3';
}

const H_ORDER = ['H1', 'H2', 'H3'];

/**
 * Horizon bucket for a technology. Base position comes from maturity; a
 * regulatory anchor can PULL it at most one horizon earlier (a regulation can
 * force investment, but it cannot conjure a TRL-4 technology into production),
 * and never earlier than the bucket the regulation's own bite-year sits in.
 */
export function horizonFor(trl, adoptionPct, regPullYear = null, now = REGISTER_VINTAGE) {
  const base = (trl >= 8 || adoptionPct >= 10) ? 'H1' : trl >= 6 ? 'H2' : 'H3';
  if (regPullYear == null) return { horizon: base, regPulled: false };
  const regBucket = yearBucket(regPullYear, now);
  const bi = H_ORDER.indexOf(base);
  const ri = H_ORDER.indexOf(regBucket);
  if (ri >= bi) return { horizon: base, regPulled: false };
  return { horizon: H_ORDER[Math.max(ri, bi - 1)], regPulled: true };
}

// ── Bass diffusion (cumulative) ──────────────────────────────────────────────
export const BASS_DEFAULTS = { p: 0.03, q: 0.38 };

/** Cumulative Bass adoption fraction F(t) ∈ [0,1) at t years after launch. */
export function bassAdoption(t, { p = BASS_DEFAULTS.p, q = BASS_DEFAULTS.q } = {}) {
  if (t <= 0) return 0;
  const e = Math.exp(-(p + q) * t);
  return (1 - e) / (1 + (q / p) * e);
}

/** Inverse of bassAdoption: years after launch at which fraction F is reached. */
export function bassTimeFor(F, { p = BASS_DEFAULTS.p, q = BASS_DEFAULTS.q } = {}) {
  const f = Math.min(Math.max(F, 0), 0.999);
  if (f === 0) return 0;
  const e = (1 - f) / (1 + f * (q / p));
  return -Math.log(e) / (p + q);
}

/**
 * Project adoption share N years ahead by placing today's curated share on the
 * standard Bass curve and reading forward. ceilingPct is the saturation share
 * of the applicable segment (few technologies reach 100%).
 */
export function projectAdoption(currentPct, yearsAhead, { p = BASS_DEFAULTS.p, q = BASS_DEFAULTS.q, ceilingPct = 90 } = {}) {
  const seeded = Math.max(currentPct, 0.5);           // 0% can't be inverted; seed at launch-adjacent share
  const F0 = Math.min(seeded / ceilingPct, 0.999);
  const t0 = bassTimeFor(F0, { p, q });
  const F1 = bassAdoption(t0 + yearsAhead, { p, q });
  return Math.round(Math.min(F1 * ceilingPct, ceilingPct) * 10) / 10;
}

// ── Wright's law ─────────────────────────────────────────────────────────────
/**
 * Relative cost index after cumulative volume grows by `cumulativeMultiple`
 * (1.0 = today's cost). learningRate is the per-doubling cost reduction.
 */
export function wrightCostIndex(cumulativeMultiple, learningRate = 0.15) {
  if (cumulativeMultiple <= 1 || learningRate <= 0) {
    // No volume growth (or a rising trend modelled as negative learning).
    return Math.round((learningRate < 0 ? 1 - learningRate * Math.log2(Math.max(cumulativeMultiple, 1)) : 1) * 100) / 100;
  }
  const b = Math.log2(1 - learningRate);
  return Math.round(Math.pow(cumulativeMultiple, b) * 100) / 100;
}

// Curated cost-trend direction → Wright learning rate used for the index.
export const TREND_LEARNING = { 'falling-fast': 0.22, falling: 0.12, flat: 0.03, rising: -0.05 };

/** Modelled cost index N years ahead: adoption growth drives cumulative volume. */
export function costOutlook(tech, yearsAhead) {
  const lr = TREND_LEARNING[tech.costTrend] ?? 0.03;
  const nowPct = Math.max(tech.adoptionPct, 0.5);
  const futurePct = projectAdoption(tech.adoptionPct, yearsAhead);
  const multiple = Math.max(futurePct / nowPct, 1);
  return wrightCostIndex(multiple, lr);
}

// ── Momentum ─────────────────────────────────────────────────────────────────
/**
 * 0–100 composite of how much force is behind a technology right now:
 * maturity (30) + adoption (20) + cost trajectory (20) + breadth of drivers
 * (10) + regulatory pull (10) + named production evidence (10).
 */
export function momentumScore(tech, { now = REGISTER_VINTAGE, anchors = REG_ANCHORS } = {}) {
  const trlPts = (Math.min(Math.max(tech.trl, 1), 9) / 9) * 30;
  const adoptPts = (Math.min(tech.adoptionPct, 50) / 50) * 20;
  const trendPts = { 'falling-fast': 20, falling: 14, flat: 6, rising: 0 }[tech.costTrend] ?? 6;
  const driverPts = (Math.min(tech.drivers.length, 4) / 4) * 10;
  let regPts = 0;
  if (tech.regAnchor) {
    const a = anchors.find((x) => x.id === tech.regAnchor);
    regPts = a && a.year <= now + 5 ? 10 : 5;
  }
  const prodPts = tech.firstProduction ? 10 : 0;
  return Math.round(trlPts + adoptPts + trendPts + driverPts + regPts + prodPts);
}

// ── Confidence tiers (honesty architecture) ──────────────────────────────────
/** committed: anchored to a regulation or named production programme.
 *  probable:  production-ready maturity (TRL ≥ 7) without a hard anchor.
 *  speculative: everything earlier — the UI labels these prominently. */
export function confidenceTier(tech) {
  if (tech.regAnchor || tech.firstProduction) return 'committed';
  if (tech.trl >= 7) return 'probable';
  return 'speculative';
}

// ── Part resolution ──────────────────────────────────────────────────────────
/**
 * Match a free-text part/assembly query against register matchTerms.
 * Returns [{ tech, score }] sorted by score desc — empty when nothing matches.
 */
export function resolveParts(query, register = FORESIGHT_REGISTER) {
  const q = String(query ?? '').toLowerCase();
  if (!q.trim()) return [];
  const qTokens = new Set(q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
  const scored = [];
  for (const tech of register) {
    let score = 0;
    for (const term of tech.matchTerms) {
      if (q.includes(term)) score += 2;
      else if (term.split(/\s+/).some((w) => qTokens.has(w))) score += 1;
    }
    if (score > 0) scored.push({ tech, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.tech.id.localeCompare(b.tech.id));
}

// ── Assembler ────────────────────────────────────────────────────────────────
const PROJECTION_YEARS = [3, 5, 8];

function techCard(tech, now, anchors) {
  const anchor = tech.regAnchor ? anchors.find((a) => a.id === tech.regAnchor) ?? null : null;
  const { horizon, regPulled } = horizonFor(tech.trl, tech.adoptionPct, anchor?.year ?? null, now);
  const adoption = { now: tech.adoptionPct };
  const costIndex = { now: 1 };
  for (const y of PROJECTION_YEARS) {
    adoption[`in${y}`] = projectAdoption(tech.adoptionPct, y);
    costIndex[`in${y}`] = costOutlook(tech, y);
  }
  return {
    ...tech,
    phase: sCurvePhase(tech.trl, tech.adoptionPct),
    horizon,
    regPulled,
    momentum: momentumScore(tech, { now, anchors }),
    confidence: confidenceTier(tech),
    regAnchorDetail: anchor,
    projection: { basis: 'Bass diffusion (p=0.03, q=0.38) + Wright learning by cost trend — modelled, not measured', adoption, costIndex },
  };
}

/**
 * The deterministic heart of /api/foresight/predict: select technologies by
 * free-text query / commodity / powertrain, position each on the S-curve and
 * horizon map, and return horizon lanes sorted by momentum.
 */
export function foresightFor({ query = '', commodity = null, powertrain = null } = {}, { now = REGISTER_VINTAGE, register = FORESIGHT_REGISTER, anchors = REG_ANCHORS } = {}) {
  let pool = register;
  let usedCommodity = commodity ?? null;
  if (usedCommodity) pool = pool.filter((t) => t.commodity === usedCommodity);

  let matched = [];
  if (String(query ?? '').trim()) {
    matched = resolveParts(query, pool);
    if (!matched.length && !usedCommodity) {
      // Free text that matched no terms: try the commodity classifier as a net.
      const inferred = inferCommodityKey(query);
      if (inferred) {
        usedCommodity = inferred;
        pool = register.filter((t) => t.commodity === inferred);
      }
    }
  }
  let selected = matched.length ? matched.map((m) => m.tech) : pool;
  if (powertrain) selected = selected.filter((t) => t.powertrains.includes(powertrain));

  const cards = selected.map((t) => techCard(t, now, anchors));
  const horizons = { H1: [], H2: [], H3: [] };
  for (const c of cards) horizons[c.horizon].push(c);
  for (const k of H_ORDER) horizons[k].sort((a, b) => b.momentum - a.momentum || a.id.localeCompare(b.id));

  const anchorIds = new Set(cards.map((c) => c.regAnchor).filter(Boolean));
  return {
    query: String(query ?? ''),
    commodity: usedCommodity,
    powertrain: powertrain ?? null,
    matchedByTerms: matched.length > 0,
    count: cards.length,
    windows: horizonWindows(now),
    horizons,
    anchors: anchors.filter((a) => anchorIds.has(a.id)),
    vintage: now,
  };
}
