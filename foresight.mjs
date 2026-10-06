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
  // The maturity floor holds AFTER the pull too (Oct 2026 review): a law can
  // make a decision more urgent, it cannot make a TRL-6 technology that has
  // never been produced something to quote now. Before this, immersion-cooled
  // packs (TRL 6, 0%) were filed "adopt/quote now" on a battery-safety rule.
  const pulled = H_ORDER[Math.max(ri, bi - 1, H_ORDER.indexOf(maturityFloor))];
  return { horizon: pulled, regPulled: pulled !== base };
}

/** Law that binds: in force or adopted. Proposals, revisions, repealed law and
 *  consumer-test protocols (Euro NCAP) are context — they never pull a lane
 *  and never make a technology "committed". One predicate, used everywhere. */
export function isFirmAnchor(a) {
  return !!a && (a.status === 'in-force' || a.status === 'adopted');
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
  // A technology AT its own ceiling holds there. The 0.999 cap on the inverse
  // below read 90% of a 90% ceiling back as 89.9%, so a saturated technology
  // was projected to decline (Horizon review, 28 Sept 2026) — and "today" is
  // today's curated share, not the seeded one.
  if (currentPct >= ceiling) return Math.round(currentPct * 10) / 10;
  if (!(yearsAhead > 0)) return currentPct;
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
// 'flat' means flat: a curated flat cost trend used to fall 21% in 8 years.
export const TREND_LEARNING = { 'falling-fast': 0.22, falling: 0.12, flat: 0, rising: -0.05 };

/** Years of today's output assumed already produced, as Wright's starting base. */
export const LEARNING_BASE_YEARS = 3;

/**
 * Cumulative Bass adoption ∫₀ᵗ F(τ) dτ, in share-years (closed form).
 * With a = q/p and k = p + q:  t + (1+a)/(a·k) · ln((1 + a·e^(−kt)) / (1 + a)).
 */
export function bassCumulative(t, { p = BASS_DEFAULTS.p, q = BASS_DEFAULTS.q } = {}) {
  if (!(t > 0)) return 0;
  const k = p + q, a = q / p;
  return t + ((1 + a) / (a * k)) * (Math.log(1 + a * Math.exp(-k * t)) - Math.log(1 + a));
}

/**
 * Modelled cost index N years ahead.
 *
 * WRIGHT'S LAW RUNS ON CUMULATIVE PRODUCTION. This used to feed it the ratio
 * of future to current adoption SHARE — an annual rate, not a cumulative
 * volume — so a technology whose share had flattened showed almost no further
 * learning even though every year of production keeps doubling the total: a
 * 55% heat pump read 0.92 in eight years at a 12% learning rate, against the
 * ~0.77 two doublings of cumulative volume give (Horizon review, 28 Sept 2026).
 *
 * With a constant segment volume, annual output is proportional to share, so
 * cumulative output is the integral of the Bass curve. The starting total is
 * floored at ONE YEAR of today's output: the curve's own integral from launch
 * is near zero for a technology just past launch, and Wright's law
 * extrapolated from a near-zero base returns doublings nobody would quote.
 */
export function costOutlook(tech, yearsAhead) {
  const lr = TREND_LEARNING[tech.costTrend] ?? 0.03;
  const ceiling = Math.max(Number(tech.ceiling ?? 90) || 0, 0.1);
  const F0 = Math.min(Math.max(tech.adoptionPct, 0.5) / ceiling, 0.999);
  const t0 = bassTimeFor(F0);
  // Starting base: at least THREE years of today's output (Oct 2026 review). One
  // year gave a 1%-share technology ~7 cost halvings in 8 years (GaN inverter
  // and silicon anode read 0.15) — doublings no supplier would quote. Three
  // years is a stated assumption, not a fit; see LEARNING_BASE_YEARS.
  const cum0 = Math.max(bassCumulative(t0), F0 * LEARNING_BASE_YEARS);
  // At saturation the curve is flat at the ceiling: output continues at that
  // rate, so cumulative volume still grows linearly — learning slows, it does
  // not stop.
  const cum1 = cum0 + (tech.adoptionPct >= ceiling
    ? F0 * yearsAhead
    : bassCumulative(t0 + yearsAhead) - bassCumulative(t0));
  const multiple = Math.max(cum1 / cum0, 1);
  const raw = wrightCostIndex(multiple, lr);
  // A BOUND, not a fit (Oct 2026 review): on an uncurated 90% ceiling a 1%-share
  // technology's modelled volume explodes and Wright's law returned 0.22 in
  // eight years. The index is held at or above a per-trend floor over 8 years
  // (scaled geometrically for shorter horizons) — the steepest decline the
  // curated trend direction can defend.
  const floor8 = COST_FLOOR_8Y[tech.costTrend];
  if (floor8 == null || lr <= 0) return raw;
  const floor = Math.round(Math.pow(floor8, yearsAhead / 8) * 100) / 100;
  return Math.max(raw, floor);
}

/** Lowest modelled cost index allowed at +8 years per curated trend. */
export const COST_FLOOR_8Y = { 'falling-fast': 0.5, falling: 0.65 };

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
    const firm = isFirmAnchor(a);
    regPts = !a ? 0 : !firm ? 3 : a.year <= now + 5 ? 10 : 5;   // proposals are weak momentum
  }
  const prodPts = hasProductionEvidence(tech.firstProduction) ? 10 : 0;
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
/** Words that mark a firstProduction string as NOT series production. */
const NOT_PRODUCTION_RE = /\b(discontinu\w*|review\w*|research|concept\w*|announc\w*|prototype\w*|pilot\w*|delayed|planned|target\w*|slated|evaluat\w*|study|studies|patent\w*|R&D|demo\w*|trial\w*)\b/i;

/** A named series-production programme — not a review paper, a pilot or a plan. */
export function hasProductionEvidence(firstProduction) {
  const t = typeof firstProduction === 'string' ? firstProduction.trim() : '';
  return t !== '' && !/^none/i.test(t) && !NOT_PRODUCTION_RE.test(t);
}

/** committed: production-ready (TRL ≥ 7) AND anchored to binding law or a
 *              named series-production programme.
 *  probable:  production-ready maturity (TRL ≥ 7) without a hard anchor.
 *  speculative: everything earlier — the UI labels these prominently.
 *
 *  Oct 2026 review: ANY regulation link or ANY non-empty production string used
 *  to qualify, so 137 of 180 entries (76%) wore the COMMITTED pill — a TRL-4
 *  e-fuel linked to the very law that bans ICE, a discontinued pack, a "reviews
 *  (2026)" literature citation. A tier that nearly everything earns says nothing. */
export function confidenceTier(tech, anchors = REG_ANCHORS) {
  if (tech.trl >= 7) {
    const a = tech.regAnchor ? anchors.find((x) => x.id === tech.regAnchor) : null;
    // A launch that never diffused (stalledSince) is not a commitment, however
    // long ago it shipped — it would otherwise wear COMMITTED in an H3 lane.
    if ((isFirmAnchor(a) || hasProductionEvidence(tech.firstProduction)) && stalledSince(tech) === null) return 'committed';
    return 'probable';
  }
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
/**
 * WHOLE WORDS, NOT SUBSTRINGS. `q.includes(term)` matched a term anywhere
 * inside a word, and the register carries dozens of short terms, so a
 * turbo-CHARGER matched EV charging, a crank-SHAFT matched half-shafts, a
 * muffler and SILencer matched software-in-the-loop, and variabLe Valve timing
 * matched the 48 V LV network — each presented as an exact answer, not context
 * (Horizon review, 28 Sept 2026). A term now matches only where it starts and
 * ends on a word boundary, with a plural ending allowed.
 */
const termPatterns = new Map();
function termPattern(term) {
  let re = termPatterns.get(term);
  if (!re) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:s|es)?(?![a-z0-9])`);
    termPatterns.set(term, re);
  }
  return re;
}

/**
 * Commodity- and system-level words. They are real matchTerms (a "battery"
 * query should see battery technologies) but they are not a PART: 31 entries
 * carry "battery", 11 "edu". Scoring them like "stator" or "lamination" put a
 * 2-speed gearbox level with laminations for "EDU stator assembly" (Oct 2026
 * review). A hit on one of these is weak evidence — see GENERIC hits below.
 */
export const GENERIC_MATCH_TERMS = new Set(['battery', 'edu', 'e-motor', 'motor', 'interior', 'exterior', 'biw', 'chassis', 'electrical', 'electronics', 'hvac', 'adas', 'body', 'pack', 'cell', 'powertrain', 'driveline', 'thermal', 'system', 'software', 'safety', 'lighting', 'ice', 'bev', 'ev']);

/** Words that qualify a query without naming a part. */
const QUERY_QUALIFIERS = new Set(['hv', 'lv', 'high', 'low', 'voltage', 'assembly', 'assemblies', 'system', 'systems', 'unit', 'units', 'part', 'parts', 'module', 'modules', 'mhev', 'phev', 'hev', '48v', '800v', '400v', 'new', 'next', 'gen', 'the', 'and', 'for', 'of']);

export function resolveParts(query, register = FORESIGHT_REGISTER) {
  const q = String(query ?? '').toLowerCase();
  if (!q.trim()) return [];
  const raw = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  // Singular forms too, so "sensors" satisfies a multi-word term's "sensor".
  // Both candidates: stripping "es" greedily turned "brakes" into "brak".
  const qTokens = new Set([...raw,
    ...raw.map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 2),
    ...raw.map((w) => w.replace(/es$/, '')).filter((w) => w.length >= 2)]);
  const scored = [];
  for (const tech of register) {
    let score = 0;
    const hits = { multi: 0, single: 0, tokens: 0, generic: 0, terms: [] };
    for (const term of tech.matchTerms) {
      // A multi-word exact hit ("electrical steel") is more specific than a
      // single generic word ("electrical") and must outrank it (2026 audit).
      if (termPattern(term).test(q)) {
        const multi = term.includes(' ');
        if (!multi && GENERIC_MATCH_TERMS.has(term)) { score += 0.5; hits.generic++; hits.terms.push(term); continue; }
        score += multi ? 3 : 2; hits[multi ? 'multi' : 'single']++; hits.terms.push(term);
      }
      // Multi-word terms need EVERY word present — a lone generic token like
      // "front" or "air" must not drag in unrelated technologies.
      else if (term.split(/\s+/).every((w) => qTokens.has(w))) { score += 1; hits.tokens++; }
    }
    if (score > 0) scored.push({ tech, score, hits });
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
const FORWARD_WORD_RE = /\b(watch|target\w*|expect\w*|plan\w*|aim\w*|slated|due|by|from|next|roadmap|until|scheduled|forecast\w*|projected)\b[^.;]*$/i;

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
  for (const [field, text] of [['firstProduction', tech?.firstProduction], ['note', tech?.note]]) {
    const str = String(text ?? '');
    for (const m of str.matchAll(EVIDENCE_YEAR_RE)) {
      const y = Number(m[1]);
      if (y > now) continue;
      // In prose, a year after a forward-looking word is a plan, not evidence
      // ("watch pilot magnets 2026-27" made an unproduced entry read fresh —
      // Oct 2026 review). firstProduction is evidence by definition.
      if (field === 'note' && FORWARD_WORD_RE.test(str.slice(Math.max(0, m.index - 28), m.index))) continue;
      max = Math.max(max, y);
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



/**
 * NOT YET IN PRODUCTION ANYWHERE: 0% share and no named production programme.
 *
 * The Bass curve counts years from LAUNCH, and 0% cannot be placed on it, so
 * the model seeded such a technology at 0.5% today — i.e. assumed it launches
 * this year. A TRL-6 cathode chemistry with no production anywhere was
 * projected to 14.8% of the segment in three years on that assumption alone
 * (Horizon review, 28 Sept 2026). The register does not date launches, so no
 * adoption or cost figure is projected for these entries, and their lane
 * follows maturity. Technologies at 0% that DO have a named programme exist at
 * a fractional share, and the 0.5% seed is a fair rounding for them.
 */
export function isPrelaunch(adoptionPct, firstProduction, trl = null) {
  const named = typeof firstProduction === 'string' && firstProduction.trim() !== '' && !/^none/i.test(firstProduction.trim());
  // TRL 8-9 is qualified or proven in service: a missing programme name on
  // such an entry is a curation gap, not evidence of no production — central
  // tyre inflation ships on commercial vehicles and its entry names none. Only
  // TRL 7 and below is called pre-launch on the absence of a name.
  if (typeof trl === 'number' && trl >= 8) return false;
  return !(adoptionPct > 0) && !named;
}

export const PRELAUNCH_BASIS = 'Not in series production anywhere yet. The diffusion model counts years from a launch this register does not date, so no adoption or cost figure is projected; the lane follows maturity.';

/** Years without measurable share after first production that mark a technology as stalled. */
export const STALL_YEARS = 5;

/**
 * In production for years yet still at 0% share: fuel-cell stacks (Mirai since
 * 2014) were placed at the START of a fresh Bass ramp and projected "half its
 * ceiling by 2031" (Oct 2026 review). The standard curve assumes a launch, and
 * this technology launched long ago and did not diffuse — so nothing is
 * projected. Returns the earliest production year, or null when not stalled.
 */
export function stalledSince(tech, now = REGISTER_VINTAGE) {
  if (tech.adoptionPct !== 0 || !hasProductionEvidence(tech.firstProduction)) return null;   // an explicit 0% share, not a missing one
  const years = [...String(tech.firstProduction).matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => Number(m[1])).filter((y) => y <= now);
  if (!years.length) return null;
  const first = Math.min(...years);
  return first <= now - STALL_YEARS ? first : null;
}

export const stalledBasis = (year) => `In series production since ${year} but still at ~0% share — it has not diffused, so the standard diffusion curve (which assumes a launch) does not apply and no adoption or cost figure is projected; the lane follows maturity.`;

/** The lane for one technology, by the same rule wherever it is needed. */
export function laneFor(tech, now = REGISTER_VINTAGE, anchors = REG_ANCHORS) {
  const anchor = tech.regAnchor ? anchors.find((a) => a.id === tech.regAnchor) ?? null : null;
  const pullYear = isFirmAnchor(anchor) ? anchor.year : null;
  const ceilingPct = tech.ceiling ?? 90;
  // Stalled = launched long ago, never diffused: "track, don't commit" (H3),
  // not the no-model "TRL ≥ 8 → quote now" fallback that put fuel-cell stacks
  // (0% share, Mirai since 2014) in Horizon 1.
  const decisionYear = stalledSince(tech, now) !== null ? 'stalled'
    : isPrelaunch(tech.adoptionPct, tech.firstProduction, tech.trl)
    ? null
    : inflectionYears(tech.adoptionPct, { now, ceilingPct }).cross25;
  return horizonFor(tech.trl, tech.adoptionPct, pullYear, now, { decisionYear, ceilingPct });
}

function techCard(tech, now, anchors) {
  const anchor = tech.regAnchor ? anchors.find((a) => a.id === tech.regAnchor) ?? null : null;
  const ceilingPct = tech.ceiling ?? 90;
  const prelaunch = isPrelaunch(tech.adoptionPct, tech.firstProduction, tech.trl);
  const stalled = prelaunch ? null : stalledSince(tech, now);
  const noModel = prelaunch || stalled !== null;
  const adoption = { now: tech.adoptionPct };
  const costIndex = { now: 1 };
  // Diffusion speed (q) is the least certain input, so every projected share
  // carries the same q ±25% band the crossing years already had.
  const adoptionBand = {};
  for (const y of PROJECTION_YEARS) {
    adoption[`in${y}`] = noModel ? null : projectAdoption(tech.adoptionPct, y, { ceilingPct });
    adoptionBand[`in${y}`] = noModel ? null : [
      projectAdoption(tech.adoptionPct, y, { ceilingPct, q: BASS_DEFAULTS.q * 0.75 }),
      projectAdoption(tech.adoptionPct, y, { ceilingPct, q: BASS_DEFAULTS.q * 1.25 }),
    ];
    // No curated cost direction (an AI-researched promotion) → no cost index.
    costIndex[`in${y}`] = noModel || !(tech.costTrend in TREND_LEARNING) ? null : costOutlook(tech, y);
  }
  const crossings = noModel ? null : inflectionYears(tech.adoptionPct, { now, ceilingPct });
  const ceilingNote = tech.ceiling != null
    ? `a curated ~${ceilingPct}% segment ceiling`
    : 'the default 90% segment ceiling (not curated)';
  // The lane follows the modelled decision year, not raw maturity (2026 fix).
  const { horizon, regPulled } = laneFor(tech, now, anchors);
  return {
    ...tech,
    phase: sCurvePhase(tech.trl, tech.adoptionPct),
    horizon,
    regPulled,
    currency: currencyOf(tech, { now }),
    momentum: momentumScore(tech, { now, anchors }),
    confidence: confidenceTier(tech, anchors),
    regAnchorDetail: anchor,
    projection: {
      basis: prelaunch
        ? PRELAUNCH_BASIS
        : stalled !== null
          ? stalledBasis(stalled)
          : `${tech.estimatedInputs ? 'AI-ESTIMATED TRL and adoption — modelled on estimates. ' : ''}Bass diffusion (p=0.03, q=0.38 ±25%) toward ${ceilingNote}${tech.costTrend in TREND_LEARNING ? ` + Wright learning on cumulative volume by cost trend (base ${LEARNING_BASE_YEARS} years of current output)` : '; cost trend not curated, so no cost index'} — modelled, not measured`,
      adoption, adoptionBand, costIndex, crossings, prelaunch: prelaunch || undefined, stalled: stalled ?? undefined,
      ceilingCurated: tech.ceiling != null,
    },
  };
}

/**
 * The deterministic heart of /api/foresight/predict: select technologies by
 * free-text query / commodity / powertrain, position each on the S-curve and
 * horizon map, and return horizon lanes sorted by momentum.
 */
export function foresightFor({ query = '', commodity = null, powertrain = null, segment = null, commodityHint = null } = {}, { now = REGISTER_VINTAGE, register = FORESIGHT_REGISTER, anchors = REG_ANCHORS } = {}) {
  let pool = register;
  let usedCommodity = commodity ?? null;
  // Segment lens first: 'off-road' / 'luxury' narrows every later filter.
  if (segment) pool = pool.filter((t) => t.segments?.includes(segment));
  if (usedCommodity) pool = pool.filter((t) => t.commodity === usedCommodity);

  let matched = [];
  const hasQuery = Boolean(String(query ?? '').trim());
  const relatedIds = new Set();
  let demotedTechs = [];
  if (hasQuery) {
    matched = resolveParts(query, pool);
    // ONE GENERIC WORD IS NOT AN ANSWER FROM ANOTHER COMMODITY. With whole-word
    // matching the remaining false answers were single common words crossing
    // commodities: "rotor magnets" matched brake-disc coatings via "rotor",
    // "catalytic converter" a GaN inverter via "converter". When the query's
    // own commodity is known, a technology from a different one is an EXACT
    // answer only on a multi-word term or two distinct hits; on one generic
    // word it is kept as labelled context (`related`), never dropped — a
    // "48v MHEV battery" query still gets Battery-commodity technologies,
    // which match on "48v" AND "battery" (Horizon review, 28 Sept 2026).
    // Where the user PICKED the part (the BOM browser) is ground truth; the
    // text classifier is a guess from the words ("lambda sensors" reads as
    // Electrical), so the hint wins when there is one.
    // Phrase matches outvote the word classifier: "HVAC heat pump" reads as
    // Interior to the classifier, but every multi-word hit is a thermal entry
    // filed under Electrical — demoting the e-compressor as "not your part"
    // (Oct 2026 review). The commodity most phrase hits agree on wins.
    const phraseDomain = (() => {
      const counts = {};
      for (const m of matched) if (m.hits?.multi) counts[m.tech.commodity] = (counts[m.tech.commodity] ?? 0) + 1;
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return best ? best[0] : null;
    })();
    const qDomain = usedCommodity ? null : (commodityHint ?? phraseDomain ?? inferCommodityKey(query) ?? null);
    // Specific evidence elsewhere demotes weak matches to labelled context:
    //  • an entry hit ONLY on generic system words ("battery", "edu");
    //  • an entry hit only by single words that sit INSIDE a phrase another
    //    entry matched whole ("steering wheel" → sensorised tyres via "wheel").
    // Generic-only demotion applies when the query names a PART ("stator",
    // "underbody"); a system-level query ("BEV HV battery") is about the whole
    // commodity, so its generic matches stay answers.
    const partWords = String(query).toLowerCase().split(/[^a-z0-9-]+/)
      .filter((w) => w.length >= 2 && !GENERIC_MATCH_TERMS.has(w) && !QUERY_QUALIFIERS.has(w));
    const specific = partWords.length > 0 && matched.some((m) => (m.hits?.multi ?? 0) + (m.hits?.single ?? 0) > 0);
    // Phrase leaks only count ACROSS commodities: "harness" in a zonal entry is
    // still about a wiring harness; "wheel" in a tyre entry is not about a
    // steering wheel.
    const phraseHits = matched.filter((m) => (m.hits?.terms ?? []).some((t) => t.includes(' ')));
    const phraseWords = new Set(phraseHits.flatMap((m) => m.hits.terms.filter((t) => t.includes(' ')).flatMap((t) => t.split(/\s+/))));
    const phraseCommodities = new Set(phraseHits.map((m) => m.tech.commodity));
    const weakOnly = (m) => {
      const h = m.hits ?? {};
      if (h.multi) return false;
      if (specific && !h.single && !h.tokens && h.generic) return true;
      const singles = (h.terms ?? []).filter((t) => !t.includes(' ') && !GENERIC_MATCH_TERMS.has(t));
      return phraseHits.length > 0 && !phraseCommodities.has(m.tech.commodity)
        && singles.length > 0 && !h.tokens && singles.every((t) => phraseWords.has(t));
    };
    const weakMatches = matched.filter(weakOnly);
    if (weakMatches.length && weakMatches.length < matched.length) {
      matched = matched.filter((m) => !weakOnly(m));
      for (const m of weakMatches) relatedIds.add(m.tech.id);
      demotedTechs = weakMatches.map((m) => m.tech);
    }
    if (qDomain) {
      const weak = (m) => m.tech.commodity !== qDomain && !m.hits?.multi && ((m.hits?.single ?? 0) + (m.hits?.tokens ?? 0)) < 2;
      const demoted = matched.filter(weak);
      matched = matched.filter((m) => !weak(m));
      for (const m of demoted) relatedIds.add(m.tech.id);
      demotedTechs = [...demotedTechs, ...demoted.map((m) => m.tech)];
    }
    if (!matched.length && !usedCommodity) {
      // Free text that matched no terms: try the commodity classifier as a net.
      // The BOM hint first — where the user picked the part is known, the
      // classifier only guesses from the words.
      const inferred = commodityHint ?? inferCommodityKey(query);
      if (inferred) {
        usedCommodity = inferred;
        pool = register.filter((t) => t.commodity === inferred && (!segment || t.segments?.includes(segment)));
        // NOTHING HERE MATCHED THE PART. The net is the commodity's landscape,
        // and it used to be shown as if every entry answered the query —
        // "lambda sensors" returned the whole Electrical register as exact
        // answers (Horizon review, 28 Sept 2026). It is context, labelled so.
        for (const t of pool) relatedIds.add(t.id);
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
      //
      // Phase 3 (2026) bounded it. Widening was unbounded — it appended the
      // WHOLE commodity — so "stator lamination" returned 16 cards of which 3
      // were about laminations, and "HV busbar" returned 29 of which 4 were
      // about busbars: roughly 85% of the answer was other people's parts,
      // presented with the same confidence as the answer itself. A landscape
      // FLOOR is a floor, not a flood. Widening now fills up to the floor and
      // stops, taking the highest-momentum entries so the context that does
      // arrive is the context worth having.
      const domain = inferCommodityKey(query) ?? matched[0].tech.commodity;
      const have = new Set(matched.map((m) => m.tech.id));
      // Widening stops when the floor's CONDITIONS are met, not at a raw count.
      // The floor was never "at least five cards" — it is "a landscape with a
      // future in it", which is why the coverage gate checks for a future lane.
      // Capping on count alone starved that lane for parts with several weak
      // near-term matches (caught by the coverage gate on the first run of this
      // change: 276 of 291 BOM leaves still passed, 15 lost their future).
      const laneOf = (t) => laneFor(t, now, anchors).horizon;
      const hasFuture = () => matched.some((m) => laneOf(m.tech) !== 'H1');
      const pool2 = register
        .filter((t) => t.commodity === domain && !have.has(t.id) && (!segment || t.segments?.includes(segment)))
        .map((t) => ({ t, m: momentumScore(t, { now, anchors }), lane: laneOf(t) }))
        .sort((a, b) => b.m - a.m || a.t.id.localeCompare(b.t.id));
      // Breadth is NOT capped, and the 2026 correction is worth recording: a
      // first cut of Phase 3 bounded this list, and it was wrong. Two problems
      // had been conflated — that widened entries were MISLABELLED as answers,
      // and how MANY of them there were. Only the first was a defect, and the
      // labelling, separate counts, lane divider and cover split fix it
      // completely. Capping merely deleted technologies a cost engineer
      // browsing a commodity legitimately wants to see. Every applicable entry
      // is offered; `related: true` and the counts say which is context.
      //
      // What survives from that cut is the ORDER: the landscape arrives
      // momentum-ranked, so the most consequential context reads first instead
      // of whatever the file happened to list first.
      for (const { t } of pool2) {
        relatedIds.add(t.id);
        matched.push({ tech: t, score: 0 });
      }
    }
  }
  let selected = matched.length ? matched.map((m) => m.tech) : pool;
  // Demoted single-word foreign matches travel as context after everything else.
  if (demotedTechs.length) {
    const have = new Set(selected.map((t) => t.id));
    selected = [...selected, ...demotedTechs.filter((t) => !have.has(t.id))];
  }
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
  const demotedIds = new Set(demotedTechs.map((t) => t.id));
  const cards = selected.map((t) => ({
    ...techCard(t, now, anchors),
    // Context because it matched on ONE generic word from another commodity —
    // distinct from landscape widening, and labelled so.
    demoted: demotedIds.has(t.id) || undefined,
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
    relatedCount: cards.filter((c) => c.related).length,
    // Phase 3: what SHAPE is this answer? A reader must be able to tell "three
    // technologies match your part, plus six for context" from "nine
    // technologies match your part" — the tool used to report both as nine.
    answerShape: (() => {
      const exact = cards.filter((c) => !c.related).length;
      const related = cards.length - exact;
      if (!cards.length) return 'empty';
      if (!related) return 'exact';
      if (!exact) return 'landscape-only';
      return 'exact-plus-landscape';
    })(),
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


// ── Prediction ledger scoring ────────────────────────────────────────────────
/**
 * Drift and projection error between a saved snapshot and today's register.
 * Pure, so the scoring rule is tested directly (it used to live inline in the
 * route, where its ceiling defect could only be seen over HTTP).
 */
export function scoreSnapshot(then, nowById, yearsElapsed, laneRule) {
  return then.map((t) => {
    const n = nowById.get(t.id);
    if (!n) return { id: t.id, name: t.name, then: t, now: null, removed: true };
    const d = {
      id: t.id, name: t.name, then: t, removed: false,
      now: { trl: n.trl, adoptionPct: n.adoptionPct, horizon: n.horizon, momentum: n.momentum, confidence: n.confidence },
      trlDelta: n.trl - t.trl,
      adoptionDelta: Math.round((n.adoptionPct - t.adoptionPct) * 10) / 10,
      // A lane difference is only real drift when both sides were computed
      // under the same lane rule; otherwise it is a definition change and is
      // reported as such rather than as a moved technology.
      horizonMoved: n.horizon !== t.horizon && (t.laneRule ?? null) === laneRule,
      horizonRuleChanged: n.horizon !== t.horizon && (t.laneRule ?? null) !== laneRule,
      momentumDelta: n.momentum - t.momentum,
    };
    if (yearsElapsed > 0 && t.prelaunch) {
      // Nothing was projected for a technology not yet in production, so
      // there is nothing to score — and a zero would read as a hit.
      d.projectionError = null;
      d.unscoredReason = 'not in production when snapshotted — no projection was made';
    } else if (yearsElapsed > 0) {
      // What the snapshot's Bass curve implied for today vs today's curated
      // share — on the SAME ceiling the card was drawn with. Snapshots older
      // than this fix did not store it; the entry's current ceiling is the
      // best available stand-in and the row says so.
      const ceilingPct = t.ceilingPct ?? n.ceiling ?? 90;
      const expected = projectAdoption(t.adoptionPct, yearsElapsed, { ceilingPct });
      d.projectionError = Math.round(Math.abs(expected - n.adoptionPct) * 10) / 10;
      d.projectedForNow = expected;
      if (t.ceilingPct === undefined) d.ceilingBasis = 'snapshot predates stored ceilings; scored on the current register ceiling';
    }
    return d;
  });
}
