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

// Register curation vintage — "today" for horizon boundaries. Bumped to 2026
// with the mid-2026 re-curation (Naxtra mass production, Sensify EMB SOP,
// EQS steer-by-wire, 1000V platforms). Bump again on each re-curation — the
// Prediction Ledger uses this as its clock.
export const REGISTER_VINTAGE = 2026;

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
 * Horizon bucket for a technology — WHEN THE DECISION LANDS, not how mature the
 * technology is (2026 fix).
 *
 * The old rule was pure maturity (`trl >= 8 → H1`), which filed 51 of 130 H1
 * entries as "adopt/quote now" while sitting at 1-5% adoption — technologies
 * that exist in production somewhere but whose sourcing decision is years out.
 * That is what made a foresight tool read as a catalogue of today.
 *
 * The lane now comes from `decisionYear`: the modelled year the technology
 * reaches a quarter of its own saturation ceiling — the point it stops being
 * exotic and starts appearing in competitor quotes. Two guardrails keep it
 * honest in both directions:
 *   • maturity cap — a lab-stage technology is never a near-term sourcing
 *     decision however steep its curve (TRL ≤4 → H3 earliest, ≤6 → H2 earliest);
 *   • scale floor — anything already at half its ceiling is H1 by definition,
 *     you are quoting it today whatever the model says next.
 * Regulatory pull is unchanged: at most one lane earlier, never before the
 * bucket the regulation's own bite-year sits in.
 */
export function horizonFor(trl, adoptionPct, regPullYear = null, now = REGISTER_VINTAGE, { decisionYear = null, ceilingPct = 90 } = {}) {
  const maturityFloor = trl >= 7 ? 'H1' : trl >= 5 ? 'H2' : 'H3';   // earliest lane maturity permits
  const atScale = adoptionPct >= ceilingPct * 0.5;
  let base;
  if (atScale || decisionYear === 'passed') base = 'H1';
  else if (typeof decisionYear === 'number') base = yearBucket(decisionYear, now);
  else if (decisionYear === null) base = (trl >= 8 || adoptionPct >= 10) ? 'H1' : trl >= 6 ? 'H2' : 'H3';  // no model supplied
  else base = 'H3';                                                  // model says beyond planning range
  if (H_ORDER.indexOf(base) < H_ORDER.indexOf(maturityFloor)) base = maturityFloor;
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
  const ceiling = Math.max(Number(ceilingPct) || 0, 0.1);   // never divide by zero
  const seeded = Math.max(currentPct, 0.5);           // 0% can't be inverted; seed at launch-adjacent share
  const F0 = Math.min(seeded / ceiling, 0.999);
  const t0 = bassTimeFor(F0, { p, q });
  const F1 = bassAdoption(t0 + yearsAhead, { p, q });
  return Math.round(Math.min(F1 * ceiling, ceiling) * 10) / 10;
}

/**
 * The concrete predictions a cost engineer actually wants: the calendar years
 * when the modelled adoption crosses one quarter and one half OF THE
 * TECHNOLOGY'S OWN SATURATION CEILING, plus the modelled peak-growth year.
 *
 * 2026 fix: crossings used to be measured against a fixed 25%/50% of the whole
 * segment, so any technology with a curated ceiling below those bars could
 * NEVER show a future date — one register entry in five returned "not in
 * range" by construction, which read as "the tool doesn't predict". Milestones
 * relative to the ceiling give every technology an honest timeline; the
 * absolute share each milestone represents (share25/share50) and the ceiling
 * are returned alongside so nothing hides behind a percentage-of-percentage.
 *
 * Returns { cross25, cross50, band25, band50, share25, share50, ceiling,
 * peakGrowth } — years are a number, 'passed' when the register already has
 * the tech above that share, or null when the model puts the event beyond
 * now+15y (an honest "not in planning range", not a date).
 */
export function inflectionYears(currentPct, { now = REGISTER_VINTAGE, p = BASS_DEFAULTS.p, q = BASS_DEFAULTS.q, ceilingPct = 90 } = {}) {
  // A zero/negative ceiling would divide by zero and poison every downstream
  // year; treat it as the smallest meaningful niche instead of producing NaN.
  const ceiling = Math.max(Number(ceilingPct) || 0, 0.1);
  const share25 = Math.round(ceiling * 25) / 100;
  const share50 = Math.round(ceiling * 50) / 100;
  const crossing = (sharePct, qq) => {
    if (currentPct >= sharePct) return 'passed';
    // The 0.5% seed floor (needed because 0% cannot be inverted on the curve)
    // must never sit BEYOND the milestone we are solving for — on a very small
    // ceiling it otherwise made t0 > tX and dated a future milestone in the
    // PAST (audit 2026: a ceiling-1% candidate reported "reaches 0.25% ~2024").
    const seeded = Math.min(Math.max(currentPct, 0.5), sharePct);
    const t0 = bassTimeFor(Math.min(seeded / ceiling, 0.999), { p, q: qq });
    const tX = bassTimeFor(Math.min(sharePct / ceiling, 0.999), { p, q: qq });
    const years = tX - t0;
    if (years > 15) return null;
    return Math.round(now + Math.max(years, 0));   // never before today
  };
  // Point estimate at the standard imitation rate, plus an uncertainty band
  // from q ±25% (2026 audit: a single crossing year is false precision —
  // diffusion speed is the least certain parameter in the model).
  const withBand = (sharePct) => {
    const base = crossing(sharePct, q);
    if (base === 'passed' || base === null) return { value: base, band: null };
    const early = crossing(sharePct, q * 1.25);
    const late = crossing(sharePct, q * 0.75);
    return { value: base, band: [typeof early === 'number' ? early : null, typeof late === 'number' ? late : null] };
  };
  const c25 = withBand(share25);
  const c50 = withBand(share50);
  // Peak growth: the Bass curve's inflection t* = ln(q/p)/(p+q) is when yearly
  // adoption gain is fastest — the year supplier capacity gets tight and
  // late-quoting programmes pay the premium.
  const seeded = Math.max(currentPct, 0.5);
  const t0 = bassTimeFor(Math.min(seeded / ceiling, 0.999), { p, q });
  const tStar = Math.log(q / p) / (p + q);
  const peakYears = tStar - t0;
  const peakGrowth = peakYears <= 0 ? 'passed' : peakYears > 15 ? null : Math.round(now + peakYears);
  return { cross25: c25.value, cross50: c50.value, band25: c25.band, band50: c50.band, share25, share50, ceiling, peakGrowth };
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
  const futurePct = projectAdoption(tech.adoptionPct, yearsAhead, { ceilingPct: tech.ceiling ?? 90 });
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
    const firm = a && (a.status === 'in-force' || a.status === 'adopted' || a.status === undefined);
    regPts = !a ? 0 : !firm ? 3 : a.year <= now + 5 ? 10 : 5;   // proposals are weak momentum
  }
  const prodPts = tech.firstProduction ? 10 : 0;
  return Math.round(trlPts + adoptPts + trendPts + driverPts + regPts + prodPts);
}

// ── Patent-velocity trend ────────────────────────────────────────────────────
/**
 * Classify a patent-filing time series [{ year, count }, ...] (oldest first,
 * from patent-search.mjs patentVelocity). Compares the mean of the most recent
 * two years against the two before, with ±15% deadband:
 *   'accelerating' | 'steady' | 'declining', or null when there is no signal
 * (fewer than 4 years, or effectively no filings at all).
 */
export function patentTrend(counts) {
  if (!Array.isArray(counts) || counts.length < 4) return null;
  const vals = counts.map((c) => Number(c.count) || 0);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total < 5) return null;                      // a handful of hits is noise, not a trend
  const recent = (vals[vals.length - 1] + vals[vals.length - 2]) / 2;
  const prior = (vals[vals.length - 3] + vals[vals.length - 4]) / 2;
  if (prior === 0) return recent > 0 ? 'accelerating' : null;
  if (recent > prior * 1.15) return 'accelerating';
  if (recent < prior * 0.85) return 'declining';
  return 'steady';
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

// ── Powertrain intent in free text ───────────────────────────────────────────
/**
 * A query like "HEV battery" names a POWERTRAIN, and until 2026 the engine
 * threw that word away: every entry matched on "battery" alone, so the single
 * most HEV-relevant technology in the register (next-gen 48V MHEV batteries)
 * ranked 24th behind twenty-three BEV-only ones, and the user had to know to
 * use the powertrain dropdown to fix it.
 *
 * The hint BOOSTS rather than filters. HEV and BEV battery technology overlap
 * heavily — chemistry, cell contacting, thermal barriers are shared — so
 * hiding BEV entries would lose real content. Ranking the applicable ones
 * first is what the reader actually wanted.
 */
export function powertrainHint(query) {
  const q = ` ${String(query ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const has = (w) => q.includes(` ${w} `);
  const hits = new Set();
  if (has('mhev') || has('48v') || has('mild')) hits.add('MHEV');
  if (has('phev') || has('plugin') || has('plug in')) hits.add('PHEV');
  if (has('hev') || has('hybrid')) { hits.add('MHEV'); hits.add('PHEV'); }
  if (has('bev') || has('battery electric')) hits.add('BEV');
  if (has('ice') || has('combustion') || has('petrol') || has('diesel') || has('gasoline')) hits.add('ICE');
  return [...hits];
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
      // A multi-word exact hit ("electrical steel") is more specific than a
      // single generic word ("electrical") and must outrank it (2026 audit).
      if (q.includes(term)) score += term.includes(' ') ? 3 : 2;
      // Multi-word terms need EVERY word present — a lone generic token like
      // "front" or "air" must not drag in unrelated technologies.
      else if (term.split(/\s+/).every((w) => qTokens.has(w))) score += 1;
    }
    if (score > 0) scored.push({ tech, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.tech.id.localeCompare(b.tech.id));
}

// ── Assembler ────────────────────────────────────────────────────────────────
const PROJECTION_YEARS = [3, 5, 8];
// Below this many term matches, a query's landscape is widened with its
// commodity's technologies (stamped `related`) — see the audit note in
// foresightFor. Chosen so a specific part still reads as a landscape, not a
// single card.
const MIN_LANDSCAPE = 5;

// ── Evidence currency (Phase 1, 2026) ────────────────────────────────────────
// The Phase 0 review found the tool's real defect was not its maths but the AGE
// of what it says. Nine of nine commodity lenses answered entirely from the
// curated file without ever checking the world, because the research trigger
// asked "are there ENOUGH cards?" and never "are they still TRUE?". Coverage
// was being treated as currency.
//
// So currency becomes a first-class, computed property of every card, sharing
// ONE definition with `foresight-audit.mjs` (the report-core lesson: a second
// private copy of a judgement is how two parts of a product start disagreeing).
//
// Three honest states, never two:
//   fresh    the newest evidence this entry can cite is within STALE_AFTER years
//   stale    its newest evidence is older than that — it may still be true, but
//            nothing here has confirmed it recently
//   undated  it cites NO year at all. Absent is not fresh. An entry that never
//            named a programme cannot borrow confidence from silence.
//
// `lastVerified` is set ONLY where an entry was genuinely re-checked against a
// source. It is deliberately absent on most entries rather than backfilled with
// today's date — a fabricated verification date would be the exact dishonesty
// this feature exists to remove.

/** An entry is stale once its newest citable evidence is this many years old. */
export const STALE_AFTER = 3;

const EVIDENCE_YEAR_RE = /(20[12]\d)/g;

/**
 * The newest year this entry can actually prove, from `lastVerified` first and
 * otherwise from the years it cites in its own evidence and note.
 * Returns null when the entry dates nothing — which is a distinct state from
 * "old", and the callers must keep it distinct.
 */
export function evidenceYear(tech, { now = REGISTER_VINTAGE } = {}) {
  let max = 0;
  // Years scanned out of prose are only EVIDENCE if they have already happened.
  // A note saying "commercial cells 2028" is an announcement, and letting it
  // count would have made the least-proven entries look the most current --
  // exactly backwards. Caught by a self-check during Phase 1: an unproduced
  // LMR entry scored evidenceYear 2028 and read as fresher than a shipping one.
  for (const text of [tech?.firstProduction, tech?.note]) {
    for (const m of String(text ?? '').matchAll(EVIDENCE_YEAR_RE)) {
      const y = Number(m[1]);
      if (y <= now) max = Math.max(max, y);
    }
  }
  // `lastVerified` is a deliberate act with a date, not prose — it is trusted
  // as written (and a future date there would be a data error, not a claim).
  for (const m of String(tech?.lastVerified ?? '').matchAll(EVIDENCE_YEAR_RE)) {
    max = Math.max(max, Math.min(Number(m[1]), now));
  }
  return max || null;
}

/**
 * 'fresh' | 'stale' | 'undated' for one entry. Undated is NOT stale and NOT
 * fresh: it is the honest third outcome, and the UI shows it as its own state.
 */
export function currencyTier(tech, { now = REGISTER_VINTAGE } = {}) {
  const year = evidenceYear(tech, { now });
  if (year === null) return 'undated';
  return year <= now - STALE_AFTER ? 'stale' : 'fresh';
}

/** Card-shaped currency stamp: the tier, the year behind it, and whether a
 *  human actually re-verified this entry (as opposed to it merely citing a
 *  recent programme). */
export function currencyOf(tech, { now = REGISTER_VINTAGE } = {}) {
  const year = evidenceYear(tech, { now });
  return {
    tier: currencyTier(tech, { now }),
    evidenceYear: year,
    verified: Boolean(tech?.lastVerified),
    lastVerified: tech?.lastVerified ?? null,
    evidenceUrl: tech?.evidenceUrl ?? null,
    basis: tech?.lastVerified
      ? `re-verified ${tech.lastVerified}`
      : year === null
        ? 'entry cites no dated evidence'
        : `newest cited evidence ${year}`,
  };
}

/**
 * Currency of a whole landscape. `notFreshShare` counts stale AND undated
 * against the total, because both mean the same thing to a reader deciding
 * whether to trust the page: nothing here was recently confirmed.
 */
export function landscapeCurrency(cards, { now = REGISTER_VINTAGE } = {}) {
  const list = (cards ?? []).filter(Boolean);
  const counts = { fresh: 0, stale: 0, undated: 0 };
  const years = [];
  for (const c of list) {
    const tier = c.currency?.tier ?? currencyTier(c, { now });
    counts[tier] = (counts[tier] ?? 0) + 1;
    const y = c.currency?.evidenceYear ?? evidenceYear(c, { now });
    if (y !== null) years.push(y);
  }
  years.sort((a, b) => a - b);
  const total = list.length;
  return {
    ...counts,
    total,
    medianEvidenceYear: years.length ? years[years.length >> 1] : null,
    notFreshShare: total ? (counts.stale + counts.undated) / total : 0,
  };
}



function techCard(tech, now, anchors) {
  const anchor = tech.regAnchor ? anchors.find((a) => a.id === tech.regAnchor) ?? null : null;
  // Only law that exists can pull a horizon: proposed / under-revision anchors
  // are context, not commitments (2026 audit).
  const pullYear = anchor && (anchor.status === 'in-force' || anchor.status === 'adopted') ? anchor.year : null;
  const ceilingPct = tech.ceiling ?? 90;
  const adoption = { now: tech.adoptionPct };
  const costIndex = { now: 1 };
  for (const y of PROJECTION_YEARS) {
    adoption[`in${y}`] = projectAdoption(tech.adoptionPct, y, { ceilingPct });
    costIndex[`in${y}`] = costOutlook(tech, y);
  }
  const crossings = inflectionYears(tech.adoptionPct, { now, ceilingPct });
  // The lane follows the modelled decision year, not raw maturity (2026 fix).
  const { horizon, regPulled } = horizonFor(tech.trl, tech.adoptionPct, pullYear, now, { decisionYear: crossings.cross25, ceilingPct });
  return {
    ...tech,
    phase: sCurvePhase(tech.trl, tech.adoptionPct),
    horizon,
    regPulled,
    currency: currencyOf(tech, { now }),
    momentum: momentumScore(tech, { now, anchors }),
    confidence: confidenceTier(tech),
    regAnchorDetail: anchor,
    projection: {
      basis: `Bass diffusion (p=0.03, q=0.38${ceilingPct !== 90 ? `, segment ceiling ~${ceilingPct}%` : ''}) + Wright learning by cost trend — modelled, not measured`,
      adoption, costIndex, crossings,
    },
  };
}

/**
 * The deterministic heart of /api/foresight/predict: select technologies by
 * free-text query / commodity / powertrain, position each on the S-curve and
 * horizon map, and return horizon lanes sorted by momentum.
 */
export function foresightFor({ query = '', commodity = null, powertrain = null, segment = null } = {}, { now = REGISTER_VINTAGE, register = FORESIGHT_REGISTER, anchors = REG_ANCHORS } = {}) {
  let pool = register;
  let usedCommodity = commodity ?? null;
  // Segment lens first: 'off-road' / 'luxury' narrows every later filter.
  if (segment) pool = pool.filter((t) => t.segments?.includes(segment));
  if (usedCommodity) pool = pool.filter((t) => t.commodity === usedCommodity);

  let matched = [];
  const hasQuery = Boolean(String(query ?? '').trim());
  const relatedIds = new Set();
  if (hasQuery) {
    matched = resolveParts(query, pool);
    if (!matched.length && !usedCommodity) {
      // Free text that matched no terms: try the commodity classifier as a net.
      const inferred = inferCommodityKey(query);
      if (inferred) {
        usedCommodity = inferred;
        pool = register.filter((t) => t.commodity === inferred && (!segment || t.segments?.includes(segment)));
      } else {
        // Nothing resolved the query and no commodity was chosen: say so
        // honestly rather than dumping the whole register.
        pool = [];
      }
    } else if (matched.length > 0 && matched.length < MIN_LANDSCAPE && !usedCommodity) {
      // 2026 audit: the fallback net was ALL-OR-NOTHING — one weak term match
      // suppressed the whole commodity net, so "cylinder head" returned a
      // 1-card landscape while 20+ Powertrain technologies sat behind it
      // (41% of BOM leaves landed thin this way). Few matches now WIDEN with
      // the same commodity net instead of replacing it: exact matches keep the
      // top of every lane (relevance ranks first), widened entries are stamped
      // `related: true` so the UI/report can label them honestly.
      const domain = inferCommodityKey(query) ?? matched[0].tech.commodity;
      const have = new Set(matched.map((m) => m.tech.id));
      for (const t of register) {
        if (t.commodity !== domain || have.has(t.id)) continue;
        if (segment && !t.segments?.includes(segment)) continue;
        relatedIds.add(t.id);
        matched.push({ tech: t, score: 0 });
      }
    }
  }
  let selected = matched.length ? matched.map((m) => m.tech) : pool;
  if (powertrain) selected = selected.filter((t) => t.powertrains.includes(powertrain));

  // Term-matched queries rank by RELEVANCE first, then momentum — so "48V
  // MHEV battery" leads with 48V technologies, not the loudest HV-pack tech
  // that happened to share the word "battery".
  const scoreById = new Map(matched.map((m) => [m.tech.id, m.score]));
  // Powertrain named in the free text ranks applicable technologies first.
  const ptHint = powertrainHint(query);
  // Proportional, not binary: most BEV battery entries ALSO list PHEV, so a
  // flat boost lifts nearly everything and changes nothing. Weight by how much
  // of the entry's applicability is the hinted powertrain — an MHEV-only
  // technology outranks a BEV technology that merely also happens to apply.
  const ptBoost = (t) => {
    if (!ptHint.length || !t.powertrains?.length) return 0;
    const hit = t.powertrains.filter((p) => ptHint.includes(p)).length;
    return (hit / t.powertrains.length) * 4;
  };
  const cards = selected.map((t) => ({
    ...techCard(t, now, anchors),
    matchScore: (scoreById.get(t.id) ?? 0) + ptBoost(t),
    powertrainMatch: ptHint.length ? t.powertrains?.some((p) => ptHint.includes(p)) || false : undefined,
    related: relatedIds.has(t.id) || undefined,
  }));
  const horizons = { H1: [], H2: [], H3: [] };
  for (const c of cards) horizons[c.horizon].push(c);
  for (const k of H_ORDER) horizons[k].sort((a, b) => (b.matchScore - a.matchScore) || (b.momentum - a.momentum) || a.id.localeCompare(b.id));

  const anchorIds = new Set(cards.map((c) => c.regAnchor).filter(Boolean));
  return {
    query: String(query ?? ''),
    commodity: usedCommodity,
    powertrain: powertrain ?? null,
    segment: segment ?? null,
    matchedByTerms: matched.length > 0,
    powertrainHint: ptHint.length ? ptHint : null,
    count: cards.length,
    exactCount: cards.filter((c) => !c.related).length,
    windows: horizonWindows(now),
    horizons,
    anchors: anchors.filter((a) => anchorIds.has(a.id)),
    vintage: now,
    // How current this landscape actually is. Reported over the EXACT cards —
    // landscape padding answers a broader question than the user asked, so it
    // must not flatter (or damn) the currency of the answer they wanted. When a
    // query resolved to nothing exact, the summary covers what IS shown.
    currency: landscapeCurrency(cards.some((c) => !c.related) ? cards.filter((c) => !c.related) : cards, { now }),
  };
}
