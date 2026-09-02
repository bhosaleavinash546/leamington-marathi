// ─────────────────────────────────────────────────────────────────────────────
// Provenance of a cost-reduction idea, decided once for every exporter.
//
// The platform stamps each idea with an engine cross-check, a confidence level
// and evidence sources. Those stamps are the trust story, so they must survive
// the trip into every artefact — not just the one the engineer keeps. An idea
// the engine could not check, or actively contradicted, has to say so in the
// spreadsheet that reaches procurement and in the RFQ pack that reaches a
// supplier, exactly as loudly as it does on screen.
//
// Kept as plain .mjs, like innovation-report-core.mjs and pdf-safe.mjs, so
// node:test can exercise it with no build step. Nothing here knows about jsPDF,
// exceljs or pptxgenjs: the functions return semantic values and a tone, and
// each renderer picks its own colours. The honesty rule is therefore decided in
// testable code rather than re-implemented (and re-broken) in four exporters.
// ─────────────────────────────────────────────────────────────────────────────

/** Shown wherever an idea's saving is not an engine-verified figure. */
export const AI_ESTIMATED_CAUTION =
  'saving is AI-estimated, validate before commercial use';

/**
 * Header note for any artefact that leaves the building (RFQ, supplier pack).
 * Stated once at the top so a reader who skims the line items still sees it.
 */
export const OUTBOUND_DISCLAIMER =
  'Savings shown are engineering estimates. Only lines marked ENGINE-CONFIRMED '
  + 'have been re-costed by the deterministic cost engine; the remainder are '
  + 'AI-estimated and must be validated before commercial use.';

/**
 * Was this idea's evidence independently retrieved, or merely asserted?
 *
 * The field is deliberately negative and its default matters: per the type
 * contract, `false` means the idea was generated with live retrieval, while
 * `true` OR `undefined` means the sources are model-asserted. Reading it with a
 * plain truthiness test therefore reports the common unset case as verified,
 * which is the wrong way round — absence of a stamp is not evidence of one.
 */
export function evidenceIsVerified(idea) {
  return (idea && idea.evidenceUnverified) === false;
}

/**
 * Engine cross-check → { label, tone, text }.
 *
 * `tone` is semantic ('confirmed' | 'contradicted' | 'none'); the renderer maps
 * it to a colour. An idea with no check is never blank — it carries the reason
 * the engine could not test it, because a silent gap reads as a pass.
 */
export function engineVerdict(idea) {
  const ec = idea && idea.engineCheck;
  if (!ec) {
    // The pipeline now stamps WHY (no request, grade not in catalogue, nothing
    // changed …) — print that reason, and fall back to the generic wording
    // only for results saved before the reason existed.
    const why = idea && typeof idea.engineCheckReason === 'string' && idea.engineCheckReason.trim()
      ? idea.engineCheckReason.trim().replace(/\.$/, '')
      : 'not expressible as a substitution, tolerance, assembly or harness change the engine can price';
    return {
      label: 'NOT ENGINE-CHECKED',
      tone: 'none',
      text: `Engine cross-check: ${why} — ${AI_ESTIMATED_CAUTION}.`,
    };
  }
  const dir = String(ec.direction ?? '').toLowerCase();
  const contradicted = dir.includes('contradict');
  const base = Number(ec.baselineEur);
  const prop = Number(ec.proposedEur);
  const pct = Number(ec.savingPct);
  const money = Number.isFinite(base) && Number.isFinite(prop)
    ? `€${base.toFixed(2)} → €${prop.toFixed(2)}`
    : '';
  const delta = Number.isFinite(pct) ? `(${pct > 0 ? '−' : '+'}${Math.abs(pct)}%)` : '';
  const on = ec.referenceCase ? ` on ${ec.referenceCase}` : '';
  return {
    label: contradicted ? 'ENGINE-CONTRADICTED' : 'ENGINE-CONFIRMED',
    tone: contradicted ? 'contradicted' : 'confirmed',
    text: `Engine cross-check (${dir.toUpperCase() || 'CHECKED'}): ${[money, delta].filter(Boolean).join(' ')}${on}. ${ec.basis ?? ''}`.trim(),
  };
}

/**
 * Confidence + evidence as one sentence, with the unverified caveat applied on
 * the correct default (see evidenceIsVerified).
 */
export function evidenceLine(idea, maxSources = 3) {
  const conf = (idea && idea.confidenceLevel) || 'estimated';
  const sources = (idea && idea.evidenceSources) || [];
  const caveat = evidenceIsVerified(idea) ? '' : ' (evidence not independently verified)';
  if (!sources.length) {
    return `Confidence: ${conf}${caveat} — no external evidence sources attached.`;
  }
  const list = sources.slice(0, maxSources)
    .map(s => `${s.title}${s.year ? ` (${s.year})` : ''}`)
    .join('; ');
  return `Confidence: ${conf}${caveat}  ·  Sources: ${list}`;
}

/**
 * One compact cell for a spreadsheet or slide: the verdict plus the engine's
 * own saving figure where it produced one. Never the AI's percentage — quoting
 * the AI's number beside an "ENGINE-CONFIRMED" label is the false equivalence
 * this helper exists to prevent.
 */
export function verificationCell(idea) {
  const v = engineVerdict(idea);
  const ec = idea && idea.engineCheck;
  const pct = ec && Number(ec.savingPct);
  if (v.tone !== 'none' && Number.isFinite(pct)) {
    return `${v.label} (engine: ${pct > 0 ? '−' : '+'}${Math.abs(pct)}%)`;
  }
  return v.label;
}

/** True when the idea's headline saving must not be read as verified. */
export function needsValidation(idea) {
  return engineVerdict(idea).tone !== 'confirmed';
}

/**
 * The validator's flags, filtered to the ones a reader needs.
 *
 * `validateIdeas` stamps `validationFlags` and nothing has ever rendered them —
 * computed provenance, thrown away. But showing all of them would be noise:
 * measured flag rate is ~61%, and most of that is structural normalisation
 * (`defaulted-difficulty` and friends), which says the model returned a bad
 * enum, not that the idea is doubtful.
 *
 * These are the flags that bear on whether the CLAIM can be trusted: a saving
 * or payback outside plausible bands, a confidence level asserted without
 * evidence, an OEM attribution nobody checked. Structural fix-ups stay in the
 * data for anyone reading the API; they do not earn a badge.
 */
const TRUST_FLAG = /^(implausible-|verified-without-evidence|oem-claim-unverified|confidence-capped-no-search|uncited-in-evidence-mode)/;

export function notableFlags(idea) {
  const flags = (idea && idea.validationFlags) || [];
  return flags.filter(f => TRUST_FLAG.test(String(f)));
}

/**
 * Portfolio counts for a summary block: how much of this report is actually
 * verified. A reader who sees "3 of 14 engine-confirmed" calibrates correctly;
 * a reader shown only the total does not.
 */
export function verificationTally(ideas) {
  const list = Array.isArray(ideas) ? ideas : [];
  const t = { total: list.length, confirmed: 0, contradicted: 0, unchecked: 0, evidenceVerified: 0 };
  for (const idea of list) {
    const tone = engineVerdict(idea).tone;
    if (tone === 'confirmed') t.confirmed++;
    else if (tone === 'contradicted') t.contradicted++;
    else t.unchecked++;
    if (evidenceIsVerified(idea)) t.evidenceVerified++;
  }
  return t;
}
