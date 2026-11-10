/**
 * THE adapter — confirmed engineering parameters → answers to the cost engine's EXISTING questions (Layer 3 → 4).
 *
 * This is the only bridge between the unified engineering data and the costing. It hands the engine nothing but a
 * `Record<decisionId, value>` — the same `RuleContext.answers` an engineer fills by clicking — so the engine is never
 * told a drawing exists and no cost rule changes. Four rules:
 *
 *  1. ONLY `confirmed` and `corrected` parameters become answers. A reading that is merely `extracted` or
 *     `needs-validation` becomes a LEANING: a suggestion with its drawing location, never an answer, never pre-ticked.
 *     A `conflict`, a `rejected` reading and a `missing` name become nothing.
 *  2. An answer is one the question ACCEPTS. Each binding reads the value through a named reader that checks it
 *     against the very option table the question builder uses; a value the question does not offer is dropped with the
 *     reason stated, never passed through. Given the engine's open decisions, an answer is also checked against the
 *     options that question shows for this part.
 *  3. Missing never becomes 0 or a default: no parameter, no answer — the question stays open exactly as today.
 *  4. What the drawing states and no question takes is returned in `notCosted`, never silently dropped.
 *
 * This file names no commodity: which parameter answers which question comes from the commodity's pack (commodity/).
 * No cost formula; no costing code is called.
 */
import { DEFAULT_RATE_LIBRARY } from '../rate-library.js';
import type { MaterialFamily } from '../material-family.js';
import { inMaterialScope } from '../material-scope.js';
import { AL_ALLOYS, type AlFinish } from '../al-extrusion-data.js';
import { finishOptionsFor, FINISH_PREFIX_BY_COMMODITY } from '../surface-finish-routes.js';
import { boundDrawingCoating, PLATING_THICKNESS_RANGE_UM } from '../coating-drawing-read.js';
import type { Decision } from '../cost-input-rules/types.js';
import { toleranceClassDecision } from '../cost-input-rules/derive/service-context.js';
import { COMMODITY_FAMILIES, MATERIAL_FAMILY_DECISION_ID, familyFromMaterialId } from '../cost-input-rules/derive/material.js';
import { gradeCandidates } from '../cost-input-rules/derive/grade.js';
import { LAMINATE_SYSTEMS } from '../cost-input-rules/derive/laminate.js';
import type {
  ConsolidatedEngineeringData, DrawingLocation, EngineeringParameter, ParameterCandidate, ParameterKind, ParameterSource,
  ParameterStatus, ParameterValue,
} from './model.js';
import { numericValue } from './normalise.js';
import { flagOf, rangeOf } from './values.js';
import { GEAR_CLASS_RANGE, GEAR_HARDENING_ROUTES } from './interpret-tables.js';
import { computeNotCosted } from './reconcile.js';
import { packFor, type AnswerCodec, type CommodityPack, type DecisionBinding } from './commodity/index.js';

// ─── What the adapter returns ─────────────────────────────────────────────────────────────────────────────────────

/** Where an answer came from — enough for the review screen and the report to point at the drawing. */
export interface AnswerEvidence {
  parameterId: string;
  /** Exactly what was read (the parameter's `rawText`). */
  sourceText?: string;
  location?: DrawingLocation;
  status: ParameterStatus;
  source: ParameterSource;
  sourceFile?: string;
}

/** An unconfirmed reading that fits a question: shown beside it as a suggestion. Never an answer. */
export interface CostingLeaning extends AnswerEvidence {
  decisionId: string;
  /** The value the question would take if the engineer confirmed the reading. */
  value: unknown;
  kind: ParameterKind;
  note?: string;
  candidates?: ParameterCandidate[];
}

/** A confirmed parameter that could NOT be passed, and why. */
export interface DroppedAnswer { decisionId: string; parameterId: string; value: ParameterValue; why: string }

/** A value for a costing-FORM field (no question exists for it): the finish deposit thickness and masked features. */
export interface FormFieldValue { fieldId: string; value: number; parameterId: string; note: string }

export interface NotCostedItem { parameterId: string; name: string; value: ParameterValue; sourceText?: string; location?: DrawingLocation; why: string }

export interface CostingAnswers {
  /** Decision id → the value the engineer would have clicked or typed. Confirmed and corrected parameters only. */
  answers: Record<string, unknown>;
  /** Decision id → the parameter behind the answer. */
  evidence: Record<string, AnswerEvidence>;
  leanings: CostingLeaning[];
  dropped: DroppedAnswer[];
  /** Drawing readings no question on this route takes — for the report's "specified, not costed" list. */
  notCosted: NotCostedItem[];
  /** Confirmed values that reach the costing through a form field, bounded by the existing drawing-coating limits. */
  formFields: FormFieldValue[];
  /** Why a form-field value was not used. */
  formNotes: string[];
}

export interface AdapterOptions {
  /**
   * The engine's OPEN decisions for this part (`runCostInputRules(…).decisions`, built without the drawing's answers).
   * With them, an answer is checked against the options that question shows for this part, and a question the engine
   * asks only when it could not measure a figure (`onlyWhenAsked`) is answered only while it is open.
   */
  decisions?: readonly Decision[];
  /** Answers the engineer already gave by hand. They are never overwritten; a differing confirmed reading is dropped and said so. */
  answered?: Readonly<Record<string, unknown>>;
  /** Holes and bosses the kernel measured — the most a drawing may ask to mask. Default: the CAD hole count in the dataset. */
  measuredMaskableFeatures?: number;
}

// ─── The value readers ────────────────────────────────────────────────────────────────────────────────────────────

interface ReadContext {
  commodity: string;
  /** The material family that is settled (a confirmed parameter, a hand answer, or the route's only family). */
  family: MaterialFamily | null;
  /** The wrought aluminium alloy that is settled. */
  alloy: string | null;
}
type Read = { ok: true; answer: unknown } | { ok: false; why: string };
interface Reader {
  read: (value: ParameterValue, ctx: ReadContext) => Read;
  /**
   * True where the engine documents that an in-scope answer OFF the question's short menu is valid (any in-scope
   * resin, compound or grade). Such an answer is checked against the scope, not against the menu shown.
   */
  offMenu?: boolean;
}

const no = (why: string): Read => ({ ok: false, why });
const yes = (answer: unknown): Read => ({ ok: true, answer });
const text = (v: ParameterValue): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const libraryMaterial = (id: string) => DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id);

/** The aluminium-extrusion finish vocabulary, typed against the engine's union. */
const AL_FINISH_OF_ROUTE: Readonly<Record<string, AlFinish>> = {
  none: 'mill', mill: 'mill', anodise: 'anodise', powder_coat: 'powder', powder_coat_zn: 'powder', powder: 'powder', e_coat: 'ecoat', ecoat: 'ecoat',
};

/**
 * One reader per kind of answer. Each states which table of the engine it checks against; none holds an option list of
 * its own except where the engine exports none (the gear hardening routes — typed against the engine's union in
 * interpret-tables.ts so a change there fails the build).
 */
export const ANSWER_CODECS: Readonly<Record<AnswerCodec, Reader>> = {
  /** 'yes' / 'no' — the pressure-tight, safety-critical and impregnation questions. */
  yesNo: { read: v => { const f = flagOf(v); return f === null ? no('not a yes / no value') : yes(f ? 'yes' : 'no'); } },

  /** The options of `toleranceClassDecision()` (derive/service-context.ts). */
  toleranceClass: { read: v => {
    const t = text(v)?.toLowerCase();
    const options = toleranceClassDecision().options.map(o => String(o.value));
    return t && options.includes(t) ? yes(t) : no(`"${String(v)}" is not a tolerance class the question offers (${options.join(', ')})`);
  } },

  /** A family the route can be made from (`COMMODITY_FAMILIES`, derive/material.ts — what the question lists). */
  materialFamily: { read: (v, c) => {
    const t = text(v)?.toLowerCase();
    const offered = COMMODITY_FAMILIES[c.commodity] ?? [];
    return t && (offered as string[]).includes(t) ? yes(t) : no(`"${String(v)}" is not a material the ${c.commodity.replace(/_/g, ' ')} route offers (${offered.join(', ') || 'none'})`);
  } },

  /** A rate-book grade the route's grade question accepts (`gradeCandidates`, derive/grade.ts), of the settled family. */
  gradeInScope: { offMenu: true, read: (v, c) => {
    const id = text(v);
    const m = id ? libraryMaterial(id) : undefined;
    if (!id || !m) return no(`"${String(v)}" is not a grade in the rate book`);
    const fam = familyFromMaterialId(id);
    if (!fam || !(COMMODITY_FAMILIES[c.commodity] ?? []).includes(fam)) return no(`${m.grade} is not a material the ${c.commodity.replace(/_/g, ' ')} route offers`);
    if (c.family && c.family !== fam) return no(`${m.grade} is ${fam}, and the material is settled as ${c.family}`);
    return gradeCandidates(c.commodity, fam).some(g => g.id === id) ? yes(id) : no(`${m.grade} is not a grade the ${c.commodity.replace(/_/g, ' ')} grade question accepts`);
  } },

  /** A rate-book resin in the route's material scope (`inMaterialScope`) — the test `resinFacts` applies to an answer. */
  resinInScope: { offMenu: true, read: (v, c) => {
    const id = text(v); const m = id ? libraryMaterial(id) : undefined;
    if (!id || !m) return no(`"${String(v)}" is not a grade in the rate book`);
    return inMaterialScope(c.commodity, m.category) ? yes(id) : no(`${m.grade} is not a grade the ${c.commodity.replace(/_/g, ' ')} route buys`);
  } },

  /** A rate-book compound in the route's material scope — the test `elastomerFacts` applies to an answer. */
  elastomerInScope: { offMenu: true, read: (v, c) => {
    const id = text(v); const m = id ? libraryMaterial(id) : undefined;
    if (!id || !m) return no(`"${String(v)}" is not a compound in the rate book`);
    return inMaterialScope(c.commodity, m.category) ? yes(id) : no(`${m.grade} is not a compound the ${c.commodity.replace(/_/g, ' ')} route buys`);
  } },

  /** One of `LAMINATE_SYSTEMS` (derive/laminate.ts). */
  laminateSystem: { read: v => {
    const t = text(v);
    return t && LAMINATE_SYSTEMS.some(s => s.value === t) ? yes(t) : no(`"${String(v)}" is not a laminate system the question offers (${LAMINATE_SYSTEMS.map(s => s.value).join(', ')})`);
  } },

  /** A key of `AL_ALLOYS` (al-extrusion-data.ts). */
  alAlloy: { read: v => { const t = text(v)?.toUpperCase(); return t && t in AL_ALLOYS ? yes(t) : no(`"${String(v)}" is not an alloy the alloy question offers`); } },

  /** A temper the settled alloy takes (`AL_ALLOYS[alloy].tempers` — the temper question's options). */
  alTemper: { read: (v, c) => {
    const t = text(v)?.toUpperCase();
    if (!c.alloy || !(c.alloy in AL_ALLOYS)) return no('the alloy is not settled, and the tempers on offer depend on it');
    const tempers = AL_ALLOYS[c.alloy as keyof typeof AL_ALLOYS].tempers as string[];
    return t && tempers.includes(t) ? yes(t) : no(`"${String(v)}" is not a temper the question offers for ${c.alloy} (${tempers.join(', ')})`);
  } },

  /** The aluminium-extrusion finish (mill / anodise / powder / ecoat) from an interpreted finish route. */
  alFinish: { read: v => {
    const t = text(v)?.toLowerCase();
    const f = t ? AL_FINISH_OF_ROUTE[t] : undefined;
    return f ? yes(f) : no(`"${String(v)}" has no equivalent in the extrusion finish question (mill, anodise, powder, e-coat)`);
  } },

  /** A route `finishOptionsFor(commodity, family)` offers (surface-finish-routes.ts), or 'none'. */
  finishRoute: { read: (v, c) => {
    const t = text(v)?.toLowerCase();
    if (t === 'none') return yes('none');
    const offered = finishOptionsFor(c.commodity, c.family);
    if (!offered.length) return no(`the ${c.commodity.replace(/_/g, ' ')} route has no finish question`);
    return t && offered.includes(t) ? yes(t)
      : no(`"${String(v)}" is not a finish the question offers for ${c.family ?? 'an unsettled material'} on the ${c.commodity.replace(/_/g, ' ')} route (${offered.join(', ')})`);
  } },

  /** The helix question: '0' for a spur gear, else the angle — what `answeredHelix` reads (|β| < 60°). */
  gearHelix: { read: v => {
    const n = numericValue(v);
    if (n == null || !(Math.abs(n) < 60)) return no(`"${String(v)}" is not a helix angle under 60°`);
    return yes(n === 0 ? '0' : String(n));
  } },

  /** The ISO 1328 class, 1–11 — what `answeredQuality` reads. */
  gearQualityClass: { read: v => {
    const n = numericValue(v);
    return n != null && Number.isInteger(n) && n >= GEAR_CLASS_RANGE.min && n <= GEAR_CLASS_RANGE.max ? yes(String(n))
      : no(`"${String(v)}" is not an ISO 1328 class ${GEAR_CLASS_RANGE.min}–${GEAR_CLASS_RANGE.max}`);
  } },

  /** One of the engine's `HardeningRoute`s — what `answeredHardening` reads. */
  gearHardening: { read: v => {
    const t = text(v);
    return t && t in GEAR_HARDENING_ROUTES ? yes(t) : no(`"${String(v)}" is not a hardening route the gear question offers`);
  } },

  /** ONE effective case depth, 0–5 mm — what the case-depth rule reads. A range is not one figure. */
  gearCaseDepth: { read: v => {
    const r = rangeOf(v);
    if (!r) return no('not a case depth in mm');
    if (r.min !== r.max) return no(`the drawing gives a range (${r.min}–${r.max} mm) and the costing takes ONE effective case depth — correct it to the figure to cost`);
    return r.min > 0 && r.min < 5 ? yes(r.min) : no(`${r.min} mm is outside the 0–5 mm the case-depth rule accepts`);
  } },

  positiveNumber: { read: v => { const n = numericValue(v); return n != null && n > 0 ? yes(n) : no(`"${String(v)}" is not a positive number`); } },
  positiveInteger: { read: v => { const n = numericValue(v); return n != null && n > 0 && Number.isInteger(n) ? yes(n) : no(`"${String(v)}" is not a positive whole number`); } },
};

function readBinding(b: DecisionBinding, value: ParameterValue, ctx: ReadContext): Read {
  if (b.options) {
    const t = text(value);
    const hit = t ? b.options.find(o => o.toLowerCase() === t.toLowerCase()) : undefined;
    return hit !== undefined ? yes(hit) : no(`"${String(value)}" is not one of the question's options (${b.options.join(', ')})`);
  }
  const codec = b.codec ? ANSWER_CODECS[b.codec] : undefined;
  return codec ? codec.read(value, ctx) : no('the binding names no reader and no option list');
}

/** Does the engine's own open decision accept this answer (an option it shows, or a value of its entry kind)? */
function acceptedBy(d: Decision, answer: unknown): boolean {
  if (d.options.some(o => String(o.value) === String(answer))) return true;
  if (!d.entry) return false;
  return d.entry.kind === 'number' ? Number.isFinite(Number(answer)) : typeof answer === 'string' && answer.trim().length > 0;
}

const evidenceOf = (p: EngineeringParameter): AnswerEvidence => ({
  parameterId: p.id, status: p.status, source: p.source,
  ...(p.rawText !== undefined ? { sourceText: p.rawText } : {}), ...(p.location ? { location: p.location } : {}),
  ...(p.sourceFile ? { sourceFile: p.sourceFile } : {}),
});

const USABLE: ReadonlySet<ParameterStatus> = new Set(['confirmed', 'corrected']);
const LEANS: ReadonlySet<ParameterStatus> = new Set(['extracted', 'needs-validation']);

// ─── The adapter ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The answers a consolidated dataset gives the cost engine for a commodity.
 *
 * A dataset with no confirmed parameter — the CAD measurement alone, or a drawing nobody has reviewed — returns
 * `answers: {}`: the costing is then exactly what it is today.
 */
export function answersFromEngineeringData(
  data: ConsolidatedEngineeringData, commodity: string | undefined = data.commodity, opts: AdapterOptions = {},
): CostingAnswers {
  const out: CostingAnswers = { answers: {}, evidence: {}, leanings: [], dropped: [], notCosted: [], formFields: [], formNotes: [] };
  const byId = new Map(data.parameters.map(p => [p.id, p]));
  const notCosted = commodity === data.commodity ? data.notCosted : computeNotCosted(data.parameters, commodity);
  for (const n of notCosted) {
    const p = byId.get(n.parameterId);
    if (p) out.notCosted.push({ parameterId: p.id, name: p.name, value: p.value, why: n.why, ...(p.rawText !== undefined ? { sourceText: p.rawText } : {}), ...(p.location ? { location: p.location } : {}) });
  }
  const pack: CommodityPack | undefined = packFor(commodity);
  if (!commodity || !pack) return out;

  const answered = opts.answered ?? {};
  const open = opts.decisions ? new Map(opts.decisions.map(d => [d.id, d])) : null;
  const usable = (name: string) => data.parameters.filter(p => p.name === name && USABLE.has(p.status));

  // What the material-dependent readers need, settled first: a confirmed family, a hand answer, or the route's only one.
  const offered = COMMODITY_FAMILIES[commodity] ?? [];
  const confirmedFamilies = [...new Set(usable('material.family').map(p => String(p.value).toLowerCase()))].filter(f => (offered as string[]).includes(f));
  const handFamily = typeof answered[MATERIAL_FAMILY_DECISION_ID] === 'string' ? String(answered[MATERIAL_FAMILY_DECISION_ID]) : null;
  const family = (handFamily && (offered as string[]).includes(handFamily) ? handFamily
    : confirmedFamilies.length === 1 ? confirmedFamilies[0] : offered.length === 1 ? offered[0] : null) as MaterialFamily | null;
  const alloyBinding = pack.bindings.find(b => b.codec === 'alAlloy');
  const handAlloy = alloyBinding && typeof answered[alloyBinding.decisionId] === 'string' ? String(answered[alloyBinding.decisionId]) : null;
  const confirmedAlloys = [...new Set(usable('material.alloy').map(p => String(p.value).toUpperCase()))];
  const ctx: ReadContext = { commodity, family, alloy: handAlloy ?? (confirmedAlloys.length === 1 ? confirmedAlloys[0] : null) };

  for (const b of pack.bindings) {
    const all = data.parameters.filter(p => p.name === b.parameter);
    const decision = open?.get(b.decisionId);

    // ── Leanings: unconfirmed readings the question would accept ──
    for (const p of all.filter(x => LEANS.has(x.status))) {
      const r = readBinding(b, p.value, ctx);
      if (!r.ok) continue;
      if (b.onlyWhenAsked && !decision) continue;
      if (decision && !(b.codec && ANSWER_CODECS[b.codec].offMenu) && !acceptedBy(decision, r.answer)) continue;
      out.leanings.push({ decisionId: b.decisionId, value: r.answer, kind: p.kind, ...evidenceOf(p),
        ...(p.note ? { note: p.note } : {}), ...(p.candidates?.length ? { candidates: p.candidates } : {}) });
    }

    // ── Answers: confirmed and corrected parameters only ──
    const set = all.filter(p => USABLE.has(p.status));
    if (!set.length) continue;
    const drop = (p: EngineeringParameter, why: string) => out.dropped.push({ decisionId: b.decisionId, parameterId: p.id, value: p.value, why });
    const reads = set.map(p => ({ p, r: readBinding(b, p.value, ctx) }));
    for (const { p, r } of reads) if (!r.ok) drop(p, r.why);
    const good = reads.filter((x): x is { p: EngineeringParameter; r: { ok: true; answer: unknown } } => x.r.ok);
    if (!good.length) continue;
    const distinct = [...new Set(good.map(g => String(g.r.answer)))];
    if (distinct.length > 1) {
      for (const g of good) drop(g.p, `confirmed values disagree (${distinct.join(' v ')}) — nothing is passed until all but one are rejected`);
      continue;
    }
    const { p, r } = good[0];
    if (b.onlyWhenAsked && !decision) {
      drop(p, open ? 'the engine measured this on the 3D model — its question is not open, so the measured figure stands'
        : 'this question exists only when the 3D model could not be measured — pass the engine\'s open decisions to the adapter');
      continue;
    }
    if (decision && !(b.codec && ANSWER_CODECS[b.codec].offMenu) && !acceptedBy(decision, r.answer)) {
      drop(p, `"${String(r.answer)}" is not an option the question "${decision.question}" offers for this part (${decision.options.map(o => String(o.value)).join(', ')})`);
      continue;
    }
    const hand = answered[b.decisionId];
    if (hand !== undefined) {
      if (String(hand) !== String(r.answer)) drop(p, `the engineer already answered this question by hand ("${String(hand)}") — that answer stands`);
      continue;                                  // a hand answer is never overwritten, and never duplicated
    }
    if (b.decisionId in out.answers) {
      if (String(out.answers[b.decisionId]) !== String(r.answer)) drop(p, `another confirmed parameter already answers this question ("${String(out.answers[b.decisionId])}")`);
      continue;
    }
    out.answers[b.decisionId] = r.answer;
    out.evidence[b.decisionId] = evidenceOf(p);
  }

  // ── Form fields: the finish deposit thickness and masked features, inside the existing drawing-coating limits ──
  const prefix = FINISH_PREFIX_BY_COMMODITY[commodity];
  const finishBinding = pack.bindings.find(b => b.codec === 'finishRoute');
  const route = finishBinding ? (out.answers[finishBinding.decisionId] ?? answered[finishBinding.decisionId]) : undefined;
  if (pack.formFields?.length && prefix && typeof route === 'string' && route !== 'none') {
    const thick = usable('finish.coatingThickness');
    const masks = usable('finish.maskedFeatures');
    const cadHoles = data.parameters.find(p => p.source === 'cad' && p.name === 'feature.count.holes');
    const cap = opts.measuredMaskableFeatures ?? (cadHoles ? numericValue(cadHoles.value) ?? undefined : undefined);
    const field = (parameter: string) => pack.formFields!.find(f => f.parameter === parameter);
    for (const p of thick) {
      const f = field('finish.coatingThickness'); const r = rangeOf(p.value);
      if (!f || !r) continue;
      if (r.min !== r.max) { out.formNotes.push(`finish thickness ${r.min}–${r.max} µm is a range and the form takes one figure — correct it to the thickness to cost`); continue; }
      const bounded = boundDrawingCoating({ route, thicknessUm: r.min });
      const range = PLATING_THICKNESS_RANGE_UM[route];
      if (bounded.thicknessUm != null) {
        out.formFields.push({ fieldId: `${prefix}-${f.fieldSuffix}`, value: bounded.thicknessUm, parameterId: p.id,
          note: `deposit ${bounded.thicknessUm} µm, confirmed from the drawing — inside ${range.lo}–${range.hi} µm (${range.basis})` });
      } else {
        out.formNotes.push(range
          ? `finish thickness ${r.min} µm is outside ${range.lo}–${range.hi} µm for the ${route.replace(/_/g, ' ')} route (${range.basis}) — not used; the form keeps its own thickness`
          : `finish thickness ${r.min} µm is not used: the ${route.replace(/_/g, ' ')} route does not price by deposit thickness`);
      }
    }
    for (const p of masks) {
      const f = field('finish.maskedFeatures'); const n = numericValue(p.value);
      if (!f || n == null || !(n > 0)) continue;
      const bounded = boundDrawingCoating({ route, maskedFeatureCount: n, ...(cap !== undefined ? { measuredMaskableFeatures: cap } : {}) });
      if (bounded.maskedFeatureCount != null) {
        out.formFields.push({ fieldId: `${prefix}-${f.fieldSuffix}`, value: bounded.maskedFeatureCount, parameterId: p.id,
          note: `${bounded.maskedFeatureCount} masked feature(s), confirmed from the drawing — no more than the ${cap} measured on the 3D model` });
      } else {
        out.formNotes.push(cap === undefined
          ? `${Math.round(n)} masked feature(s) not used: no measured feature table to check the count against`
          : `${Math.round(n)} masked feature(s) not used: more than the ${cap} holes measured on the 3D model`);
      }
    }
  }
  return out;
}
