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
 *
 * qualityScore is the technical-DEPTH rubric (idea-depth.mjs) minus flag
 * penalties. It used to be completeness-only and scored 100 on every one of
 * 63 live ideas — see idea-depth.mjs for why that had to change.
 */
import { scoreDepth, findGrade } from './idea-depth.mjs';
import { resolveMaterial } from './material-process-resolve.mjs';

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
const MAX_EVIDENCE_YEAR = new Date().getFullYear() + 1;   // rolls forward — a fixed year silently starts rejecting valid citations

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
  // First number NOT immediately preceded by a currency symbol (£/$/€/¥),
  // digit, dot, or comma — so "¥40/unit (12%)" reads as 12, not 40, and the
  // tail of a thousands-grouped amount ("€82,920; 4-8%") reads as 4, not 920.
  const re = /(?:^|[^£$€¥\d.,])(-?\d+(?:\.\d+)?)/g;
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

  // ── Evidence refs (Part 360 dossier citations) ──────────────────────────
  // Only [E7]/[W2]-style ids survive — free text here would let the model
  // smuggle uncited prose past the citation demand. When a dossier was
  // actually supplied (ctx.hasEvidence) an idea with no surviving ref is
  // flagged: the prompt made citation mandatory, so its absence is a defect
  // worth a visible badge, not a silent pass.
  const shaped = Array.isArray(raw.evidenceRefs)
    ? [...new Set(raw.evidenceRefs.filter(r => typeof r === 'string' && /^[EW]\d{1,3}$/.test(r.trim())).map(r => r.trim()))].slice(0, 8)
    : [];
  // When the dossier's line ids are known, a ref must RESOLVE to one of them.
  // A well-formed id for a line that does not exist is a fabricated citation
  // — dropped, and flagged so the badge says so.
  const known = ctx.evidenceIds ? new Set(Array.isArray(ctx.evidenceIds) ? ctx.evidenceIds : [...ctx.evidenceIds]) : null;
  const refs = known ? shaped.filter(r => known.has(r)) : shaped;
  if (known && refs.length < shaped.length) flags.push(`unresolvable-evidence-ref(${shaped.filter(r => !known.has(r)).join(',')})`);
  if (refs.length > 0) idea.evidenceRefs = refs;
  else delete idea.evidenceRefs;
  if (ctx.hasEvidence === true && refs.length === 0) flags.push('uncited-in-evidence-mode');

  // ── Engineering sections (depth over count) ─────────────────────────────
  // Five named sections the prompt demands; kept as strings, capped, and
  // absent when the model sent nothing usable — never a heading over air.
  if (raw.engineering && typeof raw.engineering === 'object') {
    const eng = {};
    for (const k of ['mechanism', 'specDeltas', 'validationPlan', 'dfmImplications', 'costBridge']) {
      const v = str(raw.engineering[k]).trim();
      if (v) eng[k] = v.slice(0, 1200);
    }
    if (Object.keys(eng).length) idea.engineering = eng; else delete idea.engineering;
  } else delete idea.engineering;

  // ── Named grade resolved against the engine catalogue (when supplied) ────
  // The material lens demands a specific grade; measured at 27–70% of ideas.
  // Naming one is the rubric's business; whether the ENGINE knows it is
  // recorded here so a grade the catalogue cannot price is visible.
  const named = findGrade([idea.title, idea.technicalDescription, str(raw.materialGrade), raw.engineering?.specDeltas].map(s => str(s)).join('\n'));
  if (named) {
    const hit = ctx.materials ? resolveMaterial(named, ctx.materials) : null;
    idea.grade = { named, catalogueKey: hit?.key ?? null, approx: hit ? hit.approx : null };
    if (ctx.materials && !hit) flags.push(`grade-not-in-library(${named})`);
  } else delete idea.grade;

  // regulatoryContext: string or null (never the literal string "null")
  const reg = raw.regulatoryContext;
  idea.regulatoryContext = (typeof reg === 'string' && reg.trim() && reg.trim() !== 'null') ? reg.trim() : null;

  // ── Quality score (0-100): technical depth minus flag penalties ──────────
  // The depth rubric is the base (see idea-depth.mjs); completeness defects
  // still cost 8 each so a deep idea with broken fields does not outrank a
  // deep idea with clean ones. 100 needs every rubric criterion AND no flags.
  if (idea.technicalDescription.length < 80) flags.push('thin-technical-description');
  idea.depth = scoreDepth(idea, { evidenceIds: known ?? undefined });
  let score = idea.depth.score;
  score -= flags.length * 8;
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

  // ── Benchmark gating ─────────────────────────────────────────────────────
  //
  // THE FAILURE DIRECTION IS THE WHOLE DESIGN (Sept 2026 review, P-1).
  //
  // This used to be an ALLOW-LIST of ~55 company names: a benchmark claim was
  // tagged unverified only if it mentioned a marque the list happened to know.
  // Measured on the live corpus, 26 references naming real companies walked
  // straight past it — Vitesco, BorgWarner, Voestalpine, Sadef, Georg Fischer,
  // Gienanth, Altair, Schuler, Nemak, Trumpf, Fraunhofer ILT, Nidec — and were
  // presented to the reader with no tag at all. A list of every company on
  // earth cannot be completed, and every name missing from it FAILED OPEN.
  //
  // So the rule is inverted. An unbacked benchmark is unverified, full stop —
  // no detection required, no list to keep current, no gap to walk through.
  //
  // The one remaining list is of GENERIC words, used to decide whether the
  // claim is also ATTRIBUTABLE (names a specific company, programme or year)
  // and therefore worth a validator flag and a confidence cap on top of the
  // tag. That list fails in the safe direction: a generic word missing from it
  // makes a soft claim read as attributable — more caution, not less.
  const backed = idea.searchDataUsed === true || idea.evidenceSources.some(s => s.confidence === 'high');
  if (idea.benchmarkReference) {
    if (backed) {
      idea.benchmarkClaim = 'retrieval-backed';
    } else {
      if (!/^unverified:/i.test(idea.benchmarkReference)) idea.benchmarkReference = `unverified: ${idea.benchmarkReference}`;
      // A STAMP, NOT A PENALTY. Measured on the corpus, ~98% of benchmark
      // references make an unbacked attributable claim — so a validator flag
      // here would be a constant 8-point deduction applied to almost every
      // idea, which discriminates nothing and quietly re-baselines the whole
      // quality score. The confidence cap this used to apply is already done
      // above, for every unbacked idea, for the same reason.
      //
      // What IS worth recording is which KIND of claim it is, so the reader
      // and the UI can tell "Vitesco did this in 2023" apart from "standard
      // industry practice". Both are unverified; only one is checkable.
      idea.benchmarkClaim = isAttributableClaim(idea.benchmarkReference) ? 'attributable-unverified' : 'generic-unverified';
    }
  }

  return idea;
}

// Words that are capitalised in ordinary technical prose without naming
// anybody — the generic half of the vocabulary. Deliberately SHORT: this list
// only decides whether an already-tagged claim also earns a flag, and a word
// missing from it produces MORE caution, never less. Contrast the allow-list
// of company names this replaced, where every missing name failed open.
const GENERIC_CAPS = new Set([
  'OEM', 'OEMs', 'Tier', 'Tiers', 'EV', 'EVs', 'ICE', 'BEV', 'PHEV', 'HEV',
  'DFM', 'DFA', 'DFMA', 'VAVE', 'VA', 'VE', 'NVH', 'NCAP', 'PPAP', 'APQP',
  'BOM', 'CAD', 'CAE', 'CNC', 'HPDC', 'LPDC', 'MIM', 'VPI', 'RSW', 'SPR',
  'European', 'Europe', 'German', 'Germany', 'Japanese', 'Japan', 'Chinese',
  'China', 'Indian', 'India', 'American', 'US', 'USA', 'North', 'Eastern',
  'Western', 'Central', 'Mexico', 'Czech', 'Slovak', 'Slovakia', 'Turkish',
  'Turkey', 'Poland', 'Polish', 'Morocco', 'Vietnam', 'Thailand', 'Brazil',
  'Standard', 'Typical', 'Common', 'Multiple', 'Several', 'Industry',
  'Industrial', 'Automotive', 'Marketplace', 'General', 'Various', 'Global',
  'Best', 'Class', 'The', 'A', 'An', 'This', 'These', 'Those', 'Same',
  'Unverified', 'Approx', 'Reference', 'Benchmark', 'Practice', 'Programme',
]);

/**
 * Does a benchmark claim ATTRIBUTE itself to somebody or something specific?
 *
 * A year, a slash-joined pair of capitalised names, or any capitalised token
 * outside GENERIC_CAPS that is not the first word of a sentence. This does not
 * decide whether the claim is tagged — every unbacked claim is tagged — only
 * whether it is also flagged and confidence-capped.
 */
export function isAttributableClaim(text) {
  const t = String(text || '').replace(/^unverified:\s*/i, '');
  if (!t.trim()) return false;
  if (/\b(?:19|20)\d{2}\b/.test(t)) return true;                       // a dated claim
  if (/[A-Z][A-Za-z-]{1,}\s*\/\s*[A-Z][A-Za-z-]{1,}/.test(t)) return true;  // "Vitesco/BorgWarner"
  // EVERY capitalised token, including the first word. Skipping the sentence
  // opener looked tidy and was the same failure-open mistake in miniature:
  // "Gestamp progressive-die nesting programmes…" and "Feintool fineblanked…"
  // both name a company in position zero and both walked through. Position is
  // not evidence of genericness; GENERIC_CAPS is, and it fails closed.
  for (const word of t.split(/\s+/)) {
    const w = word.replace(/^[^A-Za-z]+|[^A-Za-z0-9-]+$/g, '');
    if (w.length < 2 || !/^[A-Z]/.test(w)) continue;
    if (GENERIC_CAPS.has(w)) continue;
    return true;
  }
  return false;
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
