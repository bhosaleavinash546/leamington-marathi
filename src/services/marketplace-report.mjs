// ─────────────────────────────────────────────────────────────────────────────
// Pure decisions behind the Marketplace PDF exports.
//
// Same pattern as report-core.mjs: plain .mjs so node:test can exercise it with
// no build step, and nothing here knows about jsPDF. The judgements that can be
// WRONG — what an idea's provenance label says, which sections an entry gets,
// how the export describes its own filter — live here where a test can pin
// them, instead of inside a renderer nobody can run in CI.
//
// The honesty rules this module owns:
//   • An idea with verified=0 must NEVER export under a label that reads as
//     verified. Most of the corpus is AI-generated and engine-uncheckable at
//     library level; the PDF has to say so as plainly as the UI badges do.
//   • Sections render only when the field exists — an idea without a
//     costReductionMechanism gets no "Cost-reduction mechanism" heading over
//     empty space, and never a substituted default (absent ≠ default).
//   • The catalogue cover states exactly what produced the selection: every
//     active filter, the count, and the verified/unverified split. An export
//     that silently hides its filter is a lie with a page count on it.
// ─────────────────────────────────────────────────────────────────────────────

/** ideaData arrives from the DB as a JSON string (or null). Parse defensively:
 *  a corrupt blob degrades to null so the export falls back to the flat
 *  description, never throws mid-render. */
export function parseIdeaData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Provenance line for one idea. `verified` is the marketplace row's flag
 * (community review), NOT an engineering validation — the wording keeps that
 * distinction. Anything unverified says what it is: estimated savings, no
 * engine check at library level.
 */
export function provenanceLabel(idea, parsed) {
  const origin = idea.origin === 'community' ? 'community-submitted' : 'curated library entry';
  if (idea.verified) return `VERIFIED (${origin}, review-approved) — savings figures remain estimates`;
  const conf = parsed?.confidenceLevel ? `, confidence: ${parsed.confidenceLevel}` : '';
  return `UNVERIFIED — AI-generated ${origin}${conf}; savings estimated, not engine-checked`;
}

/** The benchmark line. A structured benchmarkAnchor (platform + borrowed
 *  feature + difference) beats the free-text benchmarkReference; with neither,
 *  return null and let the section be absent — never fabricate a reference. */
export function benchmarkLine(parsed) {
  const a = parsed?.benchmarkAnchor;
  if (a?.platform) {
    const parts = [`Inspired by / benchmarked against: ${a.platform}`];
    if (a.borrowedFeature) parts.push(`Borrowed: ${a.borrowedFeature}`);
    if (a.difference) parts.push(`Differs: ${a.difference}`);
    return parts.join('  ·  ');
  }
  return parsed?.benchmarkReference || null;
}

/** Savings lines from costSavingPotential — each value only if stated, and the
 *  block is always headed by its honesty ("estimated"). */
export function savingsLines(csp) {
  if (!csp || typeof csp !== 'object') return [];
  const out = [];
  if (csp.percentage) out.push(`Range: ${csp.percentage}`);
  if (csp.annualValue) out.push(`Annual value (estimated): ${csp.annualValue}`);
  if (csp.qualitative) out.push(csp.qualitative);
  if (csp.calculationBasis) out.push(`Basis: ${csp.calculationBasis}`);
  return out;
}

/**
 * Ordered [heading, text] sections for one idea's detail sheet. Only fields
 * that exist appear; headings never sit over empty space. `description` is the
 * flat-row fallback used when ideaData is absent entirely (legacy entries).
 */
export function ideaSections(idea, parsed) {
  const s = [];
  const push = (h, t) => { if (t && String(t).trim()) s.push([h, String(t).trim()]); };
  if (parsed) {
    push('Technical description', parsed.technicalDescription);
    push('Cost-reduction mechanism', parsed.costReductionMechanism);
    push('Manufacturing impact', parsed.manufacturingImpact);
    push('DFM / DFA', parsed.dfmDfa);
    push('Risk & validation', parsed.riskNotes);
    push('Benchmark', benchmarkLine(parsed));
    const sav = savingsLines(parsed.costSavingPotential);
    if (sav.length) s.push(['Cost-saving potential (estimated)', sav.join('\n')]);
    if (Array.isArray(parsed.dfmaPrinciples) && parsed.dfmaPrinciples.length)
      push('DFMA principles', parsed.dfmaPrinciples.join(' · '));
    push('Material grade(s)', parsed.materialGrade);
    push('Regulatory context', parsed.regulatoryContext);
  } else {
    push('Description', idea.description);
  }
  return s;
}

/**
 * One line describing the active filter state, for the catalogue cover.
 * Only filters that actually constrain the selection appear; "everything at
 * default" reads as exactly that.
 */
export function filterLine(f) {
  const parts = [];
  if (f.searchQ) parts.push(`Search: "${f.searchQ}"`);
  if (f.commodity && f.commodity !== 'All') parts.push(`Commodity: ${f.commodity}`);
  if (f.system && f.system !== 'All Systems') parts.push(`System: ${f.system}`);
  if (f.difficulty && f.difficulty !== 'All') parts.push(`Difficulty: ${f.difficulty}`);
  if (f.level && f.level !== 'All') parts.push(`Level: ${f.level}`);
  if (f.powertrain && f.powertrain !== 'All') parts.push(`Powertrain: ${f.powertrain}`);
  if (f.voltage && f.voltage !== 'All') parts.push(`Voltage: ${f.voltage}`);
  if (f.theme) parts.push('Theme filter active');
  if (f.sortBy && f.sortBy !== 'featured') parts.push(`Sorted by: ${f.sortBy}`);
  return parts.length ? parts.join('  ·  ') : 'No filters — full library';
}

/** Verified / unverified split for a selection — the cover's honesty tally. */
export function verifiedSplit(ideas) {
  let verified = 0;
  for (const i of ideas || []) if (i.verified) verified++;
  const total = (ideas || []).length;
  return { verified, unverified: total - verified, total };
}
