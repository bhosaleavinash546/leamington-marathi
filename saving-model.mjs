// ─────────────────────────────────────────────────────────────────────────────
// ARITHMETIC BY CONSTRUCTION.
//
// The problem this replaces: the model wrote its saving as prose ("€0.20/part
// material less a €0.06 grade premium; ~€0.15–0.25/part × 60,000") and a parser
// tried to read it back. That arrangement fails in three ways at once, all of
// them measured on the live corpus (Sept 2026 review):
//
//   • 16.1% of bases could not be read at all, so the headline figure on one
//     idea in six was checked by nothing (P-4).
//   • The same arithmetic appears again in `engineering.costBridge`, and the
//     two readings could not be reconciled — median ×0.30 apart (P-3).
//   • Before the parser was repaired, 14 of 16 reported "mismatches" were the
//     reader's error, not the model's. A checker wrong seven times in eight
//     teaches people to ignore it.
//
// Every one of those is a symptom of the same thing: the number is PRODUCED by
// the model and then RE-DERIVED by a reader. Remove the re-derivation and all
// three go away. The model states the TERMS; this module does the arithmetic;
// the prose the user reads is rendered FROM the computed result.
//
// That is the house rule applied one level further in — "math for numbers, LLM
// for judgement" already governs cost engines, and a saving walk is no less
// arithmetic than a should-cost.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not decide whether a term is TRUE.
// "material at reduced gauge saves €0.20/part" is still the model's claim, and
// the engine check is what tests it. This module guarantees only that the
// stated total follows from the stated terms — arithmetic faithfulness, not
// correctness. Those are different, and conflating them would be its own kind
// of overclaim.
// ─────────────────────────────────────────────────────────────────────────────

/** Scopes a term can carry. `of` is a percentage of another term, named by label. */
export const TERM_SCOPES = Object.freeze(['per-part', 'annual', 'of']);
export const TERM_SIGNS = Object.freeze(['saving', 'cost']);

const MAX_TERMS = 12;
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
const per = (n) => `€${n.toFixed(n < 1 ? 3 : 2)}`;

/**
 * Evaluate a structured saving model.
 *
 * @param {{volume?:number, terms?:Array, excluded?:string[]}} model
 * @param {{annualVolume?:number}} ctx  the run's volume, used when the model omits one
 * @returns {{ok:boolean, annualEur?:number, perPartEur?:number, volume?:number,
 *            basis?:string, terms?:Array, excluded?:string[], reason?:string}}
 *
 * Refuses rather than guesses. A model with no readable term, no volume for a
 * per-part term, or a percentage pointing at a label that does not exist comes
 * back `ok: false` with the reason — the caller then falls through to the prose
 * parser, exactly as it did before, and says so.
 */
export function evaluateSavingModel(model, { annualVolume = null } = {}) {
  const refuse = (reason) => ({ ok: false, reason });
  if (!model || typeof model !== 'object') return refuse('no structured saving model supplied');
  const raw = Array.isArray(model.terms) ? model.terms.slice(0, MAX_TERMS) : [];
  if (!raw.length) return refuse('the saving model lists no terms');

  const volume = Number(model.volume) > 0 ? Math.round(Number(model.volume))
    : Number(annualVolume) > 0 ? Math.round(Number(annualVolume)) : null;

  // Pass 1: the terms that stand on their own.
  const terms = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const label = String(t.label ?? '').replace(/[<>'"`]/g, '').slice(0, 80).trim();
    const scope = TERM_SCOPES.includes(t.scope) ? t.scope : 'per-part';
    const sign = TERM_SIGNS.includes(t.sign) ? t.sign : 'saving';
    const value = Number(t.value);
    if (!label) continue;
    if (!Number.isFinite(value)) { terms.push({ label, scope, sign, value: null, reason: 'no numeric value' }); continue; }
    terms.push({ label, scope, sign, value: Math.abs(value), of: typeof t.of === 'string' ? t.of.slice(0, 80) : null });
  }
  if (!terms.some(t => t.value != null)) return refuse('no term in the saving model carries a number');

  // Pass 2: resolve percentage-of terms against the per-part terms named.
  for (const t of terms) {
    if (t.scope !== 'of' || t.value == null) continue;
    const base = terms.find(x => x !== t && x.value != null && x.scope !== 'of'
      && (t.of ? x.label.toLowerCase().includes(String(t.of).toLowerCase()) : false));
    if (!base) { t.value = null; t.reason = `percentage of "${t.of ?? '(unnamed)'}", which is not one of the other terms`; continue; }
    t.resolvedFrom = base.label;
    t.resolvedScope = base.scope;
    t.eur = base.value * (t.value / 100);
  }

  const priced = terms.filter(t => t.value != null);
  const unpricedTerms = terms.filter(t => t.value == null).map(t => `${t.label} — ${t.reason}`);

  let perPart = 0, annual = 0;
  for (const t of priced) {
    const s = t.sign === 'cost' ? -1 : 1;
    if (t.scope === 'of') {
      if (t.resolvedScope === 'annual') annual += s * t.eur; else perPart += s * t.eur;
    } else if (t.scope === 'annual') annual += s * t.value;
    else perPart += s * t.value;
  }

  const needsVolume = priced.some(t => t.scope === 'per-part' || (t.scope === 'of' && t.resolvedScope !== 'annual'));
  if (needsVolume && volume == null) return refuse('the model states a per-part saving but no annual volume is available to multiply it by');

  const annualEur = round2(perPart * (volume ?? 0) + annual);

  const excluded = (Array.isArray(model.excluded) ? model.excluded : [])
    .map(x => String(x ?? '').replace(/[<>'"`]/g, '').slice(0, 90).trim()).filter(Boolean).slice(0, 8);

  return {
    ok: true, annualEur, perPartEur: round2(perPart), volume, terms, excluded,
    ...(unpricedTerms.length ? { unpricedTerms } : {}),
    basis: renderBasis({ terms, volume, perPart, annual, annualEur }),
  };
}

/**
 * The sentence the user reads, rendered FROM the arithmetic rather than beside
 * it. Nothing here is the model's prose, so nothing here can disagree with the
 * total — which was the entire defect.
 */
function renderBasis({ terms, volume, perPart, annual, annualEur }) {
  const bits = [];
  for (const t of terms) {
    if (t.value == null) { bits.push(`${t.label} (not priced: ${t.reason})`); continue; }
    const s = t.sign === 'cost' ? '−' : '+';
    if (t.scope === 'of') bits.push(`${s}${t.value}% of ${t.resolvedFrom} = ${per(t.eur)}${t.resolvedScope === 'annual' ? '/yr' : '/part'} (${t.label})`);
    else if (t.scope === 'annual') bits.push(`${s}${money(t.value)}/yr (${t.label})`);
    else bits.push(`${s}${per(t.value)}/part (${t.label})`);
  }
  const walk = bits.join(' ');
  const tail = perPart !== 0 && volume
    ? ` → ${per(perPart)}/part × ${volume.toLocaleString('en-GB')}/yr${annual !== 0 ? ` ${annual > 0 ? '+' : '−'} ${money(Math.abs(annual))}/yr` : ''} = ${money(annualEur)}/yr`
    : ` → ${money(annualEur)}/yr`;
  return `computed from stated terms: ${walk}${tail}`;
}

/** The annual-value string the UI shows, generated from the computed figure. */
export function renderAnnualValue(evaluated) {
  if (!evaluated?.ok) return null;
  const v = evaluated.annualEur;
  const fmt = Math.abs(v) >= 1_000_000 ? `€${(v / 1_000_000).toFixed(2)}M`
    : Math.abs(v) >= 1_000 ? `€${Math.round(v / 1_000).toLocaleString('en-GB')}K`
      : money(v);
  return evaluated.volume ? `${fmt} at ${evaluated.volume.toLocaleString('en-GB')} units/yr` : `${fmt}/yr`;
}

/**
 * Apply a structured model to an idea, in place.
 *
 * The computed figure REPLACES the model's own stated annual value and basis,
 * and the replaced text is kept as `savingModel.modelStated` so the swap is
 * visible rather than silent — the same rule every other stamp in this pipeline
 * follows. When the two already agreed, that is worth knowing too.
 */
export function applySavingModel(idea, { annualVolume = null } = {}) {
  const model = idea?.savingModel;
  const ev = evaluateSavingModel(model, { annualVolume });
  if (!ev.ok) return { ok: false, reason: ev.reason };

  const csp = idea.costSavingPotential && typeof idea.costSavingPotential === 'object' ? idea.costSavingPotential : {};
  const statedText = String(csp.annualValue ?? '');
  const rendered = renderAnnualValue(ev);

  idea.costSavingPotential = { ...csp, annualValue: rendered, calculationBasis: ev.basis };
  idea.savingModel = {
    ...model, computedAnnualEur: ev.annualEur, perPartEur: ev.perPartEur, volume: ev.volume,
    excluded: ev.excluded,
    ...(ev.unpricedTerms ? { unpricedTerms: ev.unpricedTerms } : {}),
    modelStated: statedText || null,
  };
  return { ok: true, annualEur: ev.annualEur, replaced: statedText && statedText !== rendered };
}
