/**
 * CostVision — LLM Idea Validation & Critic
 * ------------------------------------------------------------------
 * Deterministic guard over LLM-generated cost-reduction ideas.
 * Normalises structure, coerces enums to safe values, and sanity-bands
 * numeric claims (saving %, payback). Never silently shows a malformed
 * or implausible idea: each idea is annotated with `validationFlags`.
 *
 *   validateIdeas(rawIdeas) -> { ideas, summary }
 *
 * Pure & dependency-free so it can be unit-tested in isolation.
 */

const COST_SAVING_TYPES = new Set(['material', 'process', 'logistics', 'complexity', 'warranty', 'tooling', 'weight', 'commonisation']);
const DIFFICULTIES = new Set(['Low', 'Medium', 'High']);
const SYSTEM_LEVELS = new Set(['Assembly', 'Subassembly', 'Part']);
const CONFIDENCE_LEVELS = new Set(['verified', 'benchmarked', 'estimated', 'theoretical']);
const EVIDENCE_TYPES = new Set(['oem_press_release', 'teardown', 'patent', 'industry_report', 'supplier_data', 'web_search', 'regulatory']);
const EVIDENCE_CONF = new Set(['high', 'medium', 'low']);

// Plausibility bands for a single VAVE idea
const MAX_SAVING_PCT = 60;     // a single idea saving >60% of part cost is implausible
const MIN_SAVING_PCT = 0;
const MAX_PAYBACK_MONTHS = 120;
const MIN_EVIDENCE_YEAR = 1990;
const MAX_EVIDENCE_YEAR = 2027;

function str(v, fallback = '') {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}
function slugify(s) {
  return str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'idea';
}

/**
 * Parse a percentage-ish string to a number. Skips currency-prefixed amounts so a
 * value like "£65/veh (-30% part cost)" reads as -30, not 65. Returns number|null.
 */
export function parsePercent(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = str(v);
  // First number NOT immediately preceded by a currency symbol (£/$/€/¥) or digit/dot,
  // so "¥40/unit (12%)" reads as 12, not 40 (¥ / CNY is a supported currency).
  const re = /(?:^|[^£$€¥\d.])(-?\d+(?:\.\d+)?)/g;
  const m = re.exec(s);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Validate & normalise a single idea. Returns the cleaned idea (with
 * `validationFlags` + `qualityScore`) or null if it is too broken to keep.
 */
export function validateIdea(raw, index = 0, ctx = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const flags = [];

  const title = str(raw.title).trim();
  const technicalDescription = str(raw.technicalDescription).trim();
  // An idea with neither a title nor a description carries no information — drop it.
  if (!title && !technicalDescription) return null;

  const idea = { ...raw };
  idea.id = str(raw.id).trim() || `${slugify(title)}-${index}`;
  idea.title = title || 'Untitled cost-reduction idea';
  idea.technicalDescription = technicalDescription || '(no technical description provided)';
  idea.manufacturingImpact = str(raw.manufacturingImpact).trim();
  idea.riskNotes = str(raw.riskNotes).trim();
  idea.timeToImplement = str(raw.timeToImplement, 'TBD').trim() || 'TBD';
  idea.benchmarkReference = str(raw.benchmarkReference).trim();

  if (!technicalDescription) flags.push('missing-technical-description');
  if (!idea.manufacturingImpact) flags.push('missing-manufacturing-impact');
  if (!idea.benchmarkReference) flags.push('missing-benchmark');

  // ── Enums ────────────────────────────────────────────────────────────────
  let types = Array.isArray(raw.costSavingTypes) ? raw.costSavingTypes.filter(t => COST_SAVING_TYPES.has(t)) : [];
  if (types.length === 0) { types = ['process']; flags.push('defaulted-cost-saving-type'); }
  idea.costSavingTypes = [...new Set(types)];

  if (!DIFFICULTIES.has(raw.implementationDifficulty)) { idea.implementationDifficulty = 'Medium'; flags.push('defaulted-difficulty'); }
  else idea.implementationDifficulty = raw.implementationDifficulty;

  if (!SYSTEM_LEVELS.has(raw.systemLevel)) { idea.systemLevel = 'Part'; flags.push('defaulted-system-level'); }
  else idea.systemLevel = raw.systemLevel;

  if (!CONFIDENCE_LEVELS.has(raw.confidenceLevel)) { idea.confidenceLevel = 'estimated'; flags.push('defaulted-confidence'); }
  else idea.confidenceLevel = raw.confidenceLevel;

  idea.dfmaPrinciples = Array.isArray(raw.dfmaPrinciples) ? raw.dfmaPrinciples.filter(p => typeof p === 'string') : [];

  // ── Cost saving potential ───────────────────────────────────────────────
  const csp = (raw.costSavingPotential && typeof raw.costSavingPotential === 'object') ? { ...raw.costSavingPotential } : {};
  csp.qualitative = str(csp.qualitative).trim();
  csp.percentage = str(csp.percentage).trim();
  csp.annualValue = str(csp.annualValue).trim();
  csp.calculationBasis = str(csp.calculationBasis).trim();

  const pct = parsePercent(csp.percentage);
  // Band on magnitude: a "-22%" reduction is a legitimate saving, so only the
  // absolute size matters for plausibility.
  if (pct != null && Math.abs(pct) > MAX_SAVING_PCT) flags.push(`implausible-saving-pct(${pct}%)`);
  if (!csp.annualValue) flags.push('missing-annual-value');

  // paybackMonths: integer 0..120 or null
  let payback = csp.paybackMonths;
  if (typeof payback === 'string') { const n = parsePercent(payback); payback = n; }
  if (typeof payback === 'number' && isFinite(payback)) {
    if (payback < 0 || payback > MAX_PAYBACK_MONTHS) { flags.push(`implausible-payback(${payback}mo)`); payback = null; }
    else payback = Math.round(payback);
  } else payback = null;
  csp.paybackMonths = payback;
  idea.costSavingPotential = csp;

  // ── Evidence sources ────────────────────────────────────────────────────
  if (Array.isArray(raw.evidenceSources)) {
    idea.evidenceSources = raw.evidenceSources
      .filter(s => s && typeof s === 'object')
      .map(s => {
        const type = EVIDENCE_TYPES.has(s.type) ? s.type : 'web_search';
        const confidence = EVIDENCE_CONF.has(s.confidence) ? s.confidence : 'low';
        let year = typeof s.year === 'number' ? s.year : parsePercent(s.year);
        if (year != null && (year < MIN_EVIDENCE_YEAR || year > MAX_EVIDENCE_YEAR)) year = undefined;
        const out = { type, title: str(s.title).trim() || 'Source', confidence };
        if (year != null) out.year = year;
        return out;
      });
  } else {
    idea.evidenceSources = [];
  }
  // Confidence consistency: "verified" with no evidence is suspicious
  if (idea.confidenceLevel === 'verified' && idea.evidenceSources.length === 0) {
    flags.push('verified-without-evidence');
    idea.confidenceLevel = 'estimated';
  }

  // regulatoryContext: string or null (never the literal string "null")
  const reg = raw.regulatoryContext;
  idea.regulatoryContext = (typeof reg === 'string' && reg.trim() && reg.trim() !== 'null') ? reg.trim() : null;

  // ── Quality score (0-100): completeness minus flag penalties ─────────────
  let score = 100;
  score -= flags.length * 8;
  if (idea.technicalDescription.length < 80) { score -= 10; flags.push('thin-technical-description'); }
  if (idea.evidenceSources.length === 0) score -= 8;
  idea.qualityScore = Math.max(0, Math.min(100, score));
  idea.validationFlags = flags;

  // ── Evidence trust (per-idea) ────────────────────────────────────────────
  // An idea is only treated as retrieval-backed when the batch actually ran a
  // search that returned data (ctx.searchExecuted) AND this specific idea claims
  // it used that data (raw.searchDataUsed). One lucky snippet must not "verify"
  // every idea. When ctx is absent (unknown provenance, e.g. tests) leave as-is.
  if (ctx.searchExecuted !== undefined) {
    const searchBacked = ctx.searchExecuted === true && raw.searchDataUsed === true;
    idea.searchDataUsed = searchBacked;                 // never trust the model's own claim
    idea.evidenceUnverified = !searchBacked;
    if (!searchBacked) {
      if (idea.confidenceLevel === 'verified' || idea.confidenceLevel === 'benchmarked') {
        idea.confidenceLevel = 'estimated';
        flags.push('confidence-capped-no-search');
      }
      idea.evidenceSources = idea.evidenceSources.map(s => ({ ...s, confidence: 'low' }));
    }
  }

  // ── Named-OEM benchmark gating ───────────────────────────────────────────
  // A specific "BMW/Toyota/NIO does X" claim is only presented as trusted when
  // retrieval evidence backs it; otherwise it is explicitly tagged unverified
  // and cannot carry benchmarked+ confidence. Soft claims without an OEM name
  // are unaffected.
  const OEM_RE = /\b(bmw|mercedes|audi|porsche|volkswagen|\bvw\b|volvo|toyota|lexus|ford|cadillac|jeep|stellantis|tesla|nio|xpeng|li auto|byd|hongqi|yangwang|aito|rivian|jaguar|land rover|hyundai|kia|magna|bosch|zf\b|continental)\b/i;
  if (idea.benchmarkReference && OEM_RE.test(idea.benchmarkReference)) {
    const backed = idea.searchDataUsed === true || idea.evidenceSources.some(s => s.confidence === 'high');
    if (!backed) {
      if (!/^unverified:/i.test(idea.benchmarkReference)) idea.benchmarkReference = `unverified: ${idea.benchmarkReference}`;
      if (idea.confidenceLevel === 'verified' || idea.confidenceLevel === 'benchmarked') {
        idea.confidenceLevel = 'estimated';
        flags.push('oem-claim-unverified');
      }
    }
  }

  return idea;
}

/**
 * Validate a batch of raw ideas.
 * @returns {{ ideas: object[], summary: { total:number, kept:number, dropped:number, flagged:number, avgQuality:number } }}
 */
export function validateIdeas(rawIdeas, ctx = {}) {
  const arr = Array.isArray(rawIdeas) ? rawIdeas : [];
  const ideas = [];
  let dropped = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = validateIdea(arr[i], i, ctx);
    if (v) ideas.push(v); else dropped++;
  }
  const flagged = ideas.filter(i => i.validationFlags.length > 0).length;
  const avgQuality = ideas.length ? Math.round(ideas.reduce((s, i) => s + i.qualityScore, 0) / ideas.length) : 0;
  return { ideas, summary: { total: arr.length, kept: ideas.length, dropped, flagged, avgQuality } };
}
