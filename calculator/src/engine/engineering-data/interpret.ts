/**
 * Interpretation — from what a drawing WRITES to the form an existing engine question takes (Layer 3).
 *
 * Deterministic and rule-based: every result is a NEW parameter (`source: 'derived'`, `method: 'rule'`) whose `note`
 * prints the rule and whose `derivedFrom` names the parameter it was read from. `kind` is 'interpreted' when the
 * source states the fact in another notation ("ISO 8062-3 DCTG 9" → standard) and 'inferred' when the source does not
 * state it and a rule concluded it (a critical-characteristic marking → the part is safety-critical).
 *
 * Nothing here is an answer. An interpreted value is a leaning until the engineer confirms it (to-costing.ts), and a
 * text no rule recognises produces NO parameter — it is reported in `unresolved` so the question stays open.
 *
 * Matchers are the engine's own, reused, never copied:
 *  - designation → family: `familyFromFilename` (material-family.ts), the reader `materialFromFile` applies to a
 *    declared STEP material;
 *  - designation → rate-book grade: `gradeEvidence` (derive/grade.ts), the matcher a declared STEP designation goes
 *    through, over `gradeCandidates` (the grades the route's grade question offers);
 *  - wrought aluminium alloy and temper: `alloyEvidence` (commodities/aluminium-extrusion.ts);
 *  - rubber compound: `compoundFamilyOf` (derive/elastomer.ts) on both the text and the library's compounds;
 *  - resin: the ISO 11469 marking the polymer taxonomy files each grade under; else the resin question's own name hint;
 *  - laminate: the laminate question's own name hint.
 *
 * No cost formula; no AI; no network.
 */
import { DEFAULT_RATE_LIBRARY } from '../rate-library.js';
import { familyFromFilename, type MaterialFamily } from '../material-family.js';
import { inMaterialScope, MATERIAL_SCOPE_BY_COMMODITY } from '../material-scope.js';
import { POLYMER_TAXONOMIES } from '../polymer-material-taxonomy.js';
import { AL_ALLOYS, type AlAlloy } from '../al-extrusion-data.js';
import { PLATING_THICKNESS_RANGE_UM } from '../coating-drawing-read.js';
import type { MaterialRate } from '../types.js';
import type { RuleContext } from '../cost-input-rules/types.js';
import { gradeCandidates, gradeEvidence, GRADE_SCOPE, SHEET_GRADE_ALIASES } from '../cost-input-rules/derive/grade.js';
import { COMMODITY_FAMILIES, familyFromMaterialId } from '../cost-input-rules/derive/material.js';
import { resinFacts } from '../cost-input-rules/derive/resin.js';
import { compoundFamilyOf, elastomerFacts } from '../cost-input-rules/derive/elastomer.js';
import { laminateFacts } from '../cost-input-rules/derive/laminate.js';
import { alloyEvidence } from '../cost-input-rules/commodities/aluminium-extrusion.js';
import type { EngineeringParameter, ParameterCandidate, ParameterKind, ParameterStatus, ParameterValue } from './model.js';
import { comparisonKey, convertUnit, designationTokens, parseNumber } from './normalise.js';
import { flagOf, textOf } from './values.js';
import {
  TOLERANCE_RULES, GENERAL_TOLERANCE_NOT_MAPPED, TIGHT_LABEL_MAX_MM, classOfCastingGrade, CAST_AL_DESIGNATIONS, DESIGNATION_FAMILY_RULES,
  COATING_RULES, COATING_NOT_MAPPED, AL_TEMPER_RULES, AL_TEMPER_NOT_MAPPED, HARDENING_RULES,
  GEAR_QUALITY_RULES, GEAR_CLASS_RANGE, LEAK_NOTE_RE, LEAK_NEGATION_RE, SAFETY_NOTE_RE, IMPREGNATION_RE, IMPREGNATION_NEGATION_RE,
  type Certainty, type SpecLookup,
} from './interpret-tables.js';

/**
 * What each reading CAN be interpreted into (on some route). The reconciliation uses it to say why a drawing reading is
 * not costed: no question anywhere, a question on another route only, or a question here that this text did not fit.
 */
export const INTERPRETS: Readonly<Record<string, readonly string[]>> = {
  'material.designation': ['material.family', 'material.grade', 'material.alloy', 'material.laminateSystem', 'material.condition'],
  'material.specCode': ['material.designation', 'material.family', 'material.grade', 'material.alloy', 'material.laminateSystem', 'material.condition'],
  'tolerance.general': ['tolerance.generalClass'],
  'tolerance.castingGrade': ['tolerance.generalClass'],
  'finish.coating': ['finish.coatingRoute', 'finish.coatingThickness'],
  'heatTreat.process': ['material.condition', 'heatTreat.route'],
  'gear.qualityClass': ['gear.qualityClassIso'],
  'quality.leakTestSpec': ['quality.pressureTight'],
  'quality.impregnation': ['quality.impregnationRequired'],
};

/** A reading that could not be turned into the engine's form — the question it would have answered stays open. */
export interface Unresolved { parameterId: string; name: string; why: string }

export interface InterpretOptions {
  /** The route being costed. Without it only route-independent readings are made (family, tolerance class, flags). */
  commodity?: string;
  /** The company specification table (server/data/spec-lookup.json through `parseSpecLookup`). Absent = no code resolves. */
  specLookup?: SpecLookup;
}

export interface Interpretation { parameters: EngineeringParameter[]; unresolved: Unresolved[] }

const statusOf = (c: Certainty): ParameterStatus => (c === 'judgement' ? 'needs-validation' : 'extracted');

/** A derived parameter that carries its origin's provenance (file, location, raw text) so evidence can point at the drawing. */
function derive(
  origin: EngineeringParameter, name: string, value: ParameterValue, note: string,
  o: { kind?: ParameterKind; status?: ParameterStatus; unit?: string; candidates?: ParameterCandidate[]; suffix?: string } = {},
): EngineeringParameter {
  // A value worked out from a doubtful reading is no surer than the reading (independent validation, 10 Nov 2026: a
  // grade derived from a 41 %-confidence OCR word showed as "read, nothing to doubt" and could be bulk-confirmed).
  const asked = o.status ?? 'extracted';
  const status: ParameterStatus = asked === 'extracted' && (origin.status === 'needs-validation' || origin.method === 'ocr')
    ? 'needs-validation' : asked;
  if (status !== asked) note = `${note} Worked out from a reading that needs checking (${origin.method === 'ocr' ? 'read by OCR' : 'its own status'}): check the reading first.`;
  return {
    id: `${origin.id}>${name}${o.suffix ? `:${o.suffix}` : ''}`, name, value, ...(o.unit ? { unit: o.unit } : {}),
    ...(origin.rawText !== undefined ? { rawText: origin.rawText } : typeof origin.value === 'string' ? { rawText: origin.value } : {}),
    source: 'derived', ...(origin.sourceFile ? { sourceFile: origin.sourceFile } : {}), ...(origin.location ? { location: origin.location } : {}),
    method: 'rule', kind: o.kind ?? 'interpreted', status,
    ...(origin.reliability !== undefined ? { reliability: origin.reliability } : {}),
    note, derivedFrom: [origin.id], ...(o.candidates?.length ? { candidates: o.candidates } : {}),
  };
}

// ─── Material ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The context the engine's own matchers read a declared designation from. */
const designationCtx = (text: string, commodity = ''): RuleContext => ({
  geo: { status: 'success', cadMetadata: { productNames: [], materialDesignations: [text] } },
  geometryQuality: 'text', commodity, annualVolume: 0, filename: '', answers: {},
} as RuleContext);
/** The context the name-hint matchers read (they look at the file name). */
const nameCtx = (text: string, commodity: string): RuleContext => ({
  geo: { status: 'success' }, geometryQuality: 'text', commodity, annualVolume: 0, filename: text, answers: {},
} as RuleContext);

const gradeLabel = (id: string): string => DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id)?.grade ?? id;

/** The designations a library grade goes by: its name split at "/" and brackets, plus the sheet aliases the engine keeps. */
function aliasesOf(m: MaterialRate): string[][] {
  return [...m.grade.split(/[/(),;]+/), ...(SHEET_GRADE_ALIASES[m.id] ?? [])].map(a => designationTokens(a)).filter(a => a.length > 0);
}
const isRun = (hay: string[], needle: string[]): boolean =>
  needle.length > 0 && hay.some((_, i) => needle.every((t, j) => hay[i + j] === t));
const isPrefix = (whole: string[], head: string[]): boolean => head.length > 0 && head.length <= whole.length && head.every((t, i) => whole[i] === t);

export interface GradeReading {
  /** The grade the engine's matcher picks, or null when it names none. */
  id: string | null;
  /** True when the text carries one of the pick's full designations — the pick was not made on a shared stem. */
  exact: boolean;
  /** Every in-scope grade the text names on its own, when there is more than the pick. */
  candidates: string[];
}

/**
 * The rate-book grade a designation names among `candidates`. The PICK is the engine's (`gradeEvidence`). `exact`
 * only says how far to trust it without a person: the engine's matcher accepts a stem ("GJS-500" names 500-7 and
 * 500-14 alike, and "AlSi7Mg0.3" reaches AlSi7Mg0.6 through their shared stem), so a pick is exact when the text holds
 * one of the grade's full designations, or is the head of exactly one candidate's designation.
 */
export function gradeNamed(text: string, candidates: MaterialRate[]): GradeReading {
  const ev = gradeEvidence(designationCtx(text), candidates);
  if (!ev) return { id: null, exact: false, candidates: [] };
  const each = candidates.filter(m => gradeEvidence(designationCtx(text), [m])).map(m => m.id);
  const pick = candidates.find(m => m.id === ev.id)!;
  const t = designationTokens(text);
  const full = aliasesOf(pick).some(a => isRun(t, a));
  const headOf = candidates.filter(m => aliasesOf(m).some(a => isPrefix(a, t)));
  const exact = full || (headOf.length === 1 && headOf[0].id === pick.id);
  return { id: pick.id, exact, candidates: exact ? [] : [...new Set([pick.id, ...each])] };
}

/** The grades a designation is matched against on a route: the grade question's own list, else the route's scope. */
function scopeGrades(commodity: string): MaterialRate[] {
  if (GRADE_SCOPE[commodity]) return (COMMODITY_FAMILIES[commodity] ?? []).flatMap(f => gradeCandidates(commodity, f));
  if (!MATERIAL_SCOPE_BY_COMMODITY[commodity]) return [];
  return DEFAULT_RATE_LIBRARY.materials.filter(m => inMaterialScope(commodity, m.category));
}

const POLYMER_ROUTES = new Set(['injection_moulding', 'blow_moulding', 'thermoforming', 'rotational_moulding', 'extrusion']);

function interpretDesignation(origin: EngineeringParameter, opts: InterpretOptions, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const raw = textOf(origin).trim();
  if (!raw) return;
  // An alloy and its temper as drawings write them: "5052 H-32", "6061 T6" are the "5052-H32" / "6061-T6" the grade names
  // carry (final re-measurement, 10 Nov 2026: "5052 H-32 Aluminum" named no sheet grade and costed as AA5754).
  const text = raw.replace(/\b([HT])\s*-\s*(\d)/gi, '$1$2').replace(/\b(\d{4}A?)\s+([HT]\d{1,4}|O)\b/gi, '$1-$2');
  const commodity = opts.commodity;
  const quoted = `"${raw}"`;

  // ── The rate-book grade, on a route whose grade question exists ──
  let gradeId: string | null = null;
  if (commodity && GRADE_SCOPE[commodity]) {
    const scope = scopeGrades(commodity);
    const en1706 = CAST_AL_DESIGNATIONS.find(d => d.pattern.test(text) && scope.some(m => m.id === d.gradeId));
    const g: GradeReading = en1706 ? { id: en1706.gradeId, exact: true, candidates: [] } : gradeNamed(text, scope);
    if (en1706) {
      gradeId = en1706.gradeId;
      out.push(derive(origin, 'material.grade', en1706.gradeId,
        `${quoted} names ${gradeLabel(en1706.gradeId)}: ${en1706.written} — the same alloy limits under its EN 1706 designation (cross-reference table, interpret-tables.ts)`));
    } else if (g.id) {
      gradeId = g.id;
      out.push(derive(origin, 'material.grade', g.id,
        g.exact
          ? `${quoted} names ${gradeLabel(g.id)} — the one grade of that designation the ${commodity.replace(/_/g, ' ')} grade question offers `
            + '(the engine\'s own designation matcher, derive/grade.ts)'
          : `${quoted} matches ${g.candidates.map(gradeLabel).join(' / ')} in the ${commodity.replace(/_/g, ' ')} rate-book scope; the engine's matcher `
            + `would take ${gradeLabel(g.id)} on the shared stem — choose the grade`,
        { status: g.exact ? 'extracted' : 'needs-validation',
          ...(g.exact ? {} : { candidates: g.candidates.map(id => ({ value: id, label: gradeLabel(id) })) }) }));
    } else {
      unresolved.push({ parameterId: origin.id, name: 'material.grade',
        why: `${quoted} names no grade the ${commodity.replace(/_/g, ' ')} grade question offers — the grade question stays open` });
    }
  } else if (commodity && POLYMER_ROUTES.has(commodity)) {
    interpretResin(origin, text, commodity, out, unresolved);
  } else if (commodity === 'rubber') {
    interpretElastomer(origin, text, out, unresolved);
  } else if (commodity === 'composites') {
    const lean = laminateFacts(nameCtx(text, commodity)).decision?.options.find(o => o.leaning);
    if (lean) {
      out.push(derive(origin, 'material.laminateSystem', lean.value,
        `${quoted} suggests "${lean.label}" by the laminate question's own name hint. ENGINEERING JUDGEMENT: a designation names a fibre or a `
        + 'process, the question asks for the whole fibre + resin + process system', { status: 'needs-validation' }));
    } else {
      unresolved.push({ parameterId: origin.id, name: 'material.laminateSystem', why: `${quoted} names none of the laminate systems the question offers` });
    }
  } else if (commodity === 'aluminium_extrusion') {
    const ev = alloyEvidence(designationCtx(text, commodity));
    if (ev.alloy && ev.source.startsWith('the material designation')) {
      const a: AlAlloy = ev.alloy;
      out.push(derive(origin, 'material.alloy', a,
        `${quoted} names ${AL_ALLOYS[a].label} (the engine's own alloy designation matcher, commodities/aluminium-extrusion.ts)`));
      if (ev.temper) {
        const ok = (AL_ALLOYS[a].tempers as string[]).includes(ev.temper);
        out.push(derive(origin, 'material.condition', ev.temper,
          ok ? `${quoted} states temper ${ev.temper}` : `${quoted} states temper ${ev.temper}, which is not a temper the question offers for ${a} (${AL_ALLOYS[a].tempers.join(', ')})`,
          { status: ok ? 'extracted' : 'needs-validation' }));
      }
    } else {
      unresolved.push({ parameterId: origin.id, name: 'material.alloy', why: `${quoted} names none of the wrought alloys the alloy question offers` });
    }
  }

  // ── Aluminium casting temper carried in the designation ("EN AC-42100 T6") ──
  if (commodity === 'casting' || commodity === 'cast_and_machine') {
    const t = AL_TEMPER_RULES.find(r => /(?<![A-Za-z0-9])T[0-9]/.test(text) && r.pattern.test(text));
    if (t) out.push(derive(origin, 'material.condition', t.temper, `${quoted}: ${t.basis}`));
  }

  // ── The family: the designation's own word, else the family of the grade it resolved to ──
  // A material READING names its family by its standard's numbering too ("5052-H32", "S235JR", "Q235") — never applied
  // to a file name (familyFromFilename) because a bare number there may be a part number.
  const byNumbering = DESIGNATION_FAMILY_RULES.find(r => r.pattern.test(text.replace(/\s+/g, ' ').trim()));
  const named = familyFromFilename(text) ?? byNumbering?.family ?? null;
  const fromGrade = gradeId ? familyFromMaterialId(gradeId) : null;
  // A route that only needs the family (machining, gear) is read through its material scope.
  let fromScope: MaterialFamily | null = null;
  if (!named && !fromGrade && commodity && !GRADE_SCOPE[commodity] && COMMODITY_FAMILIES[commodity] && COMMODITY_FAMILIES[commodity].length > 1) {
    const g = gradeNamed(text, scopeGrades(commodity));
    fromScope = g.id && g.exact ? familyFromMaterialId(g.id) : null;
  }
  const family = named ?? fromGrade ?? fromScope;
  // Only a route that ASKS the family (more than one on offer) has a question to leave open.
  const asksFamily = !commodity || (COMMODITY_FAMILIES[commodity]?.length ?? 0) > 1;
  if (!family) {
    if (asksFamily) unresolved.push({ parameterId: origin.id, name: 'material.family', why: `${quoted} does not name a material family the engine's designation reader knows — the material question stays open` });
    return;
  }
  const offered = commodity ? COMMODITY_FAMILIES[commodity] : undefined;
  const disagree = named && fromGrade && named !== fromGrade;
  // A bare 4-digit number in a material cell may be a company code: named by the numbering alone, it needs checking.
  const bareNumber = !familyFromFilename(text) && !!byNumbering && /^\d{4}A?$/.test(text.trim());
  const notOffered = !!offered && !offered.includes(family);
  out.push(derive(origin, 'material.family', family,
    (named ? `${quoted} is ${family} by the engine's designation → family reader (material-family.ts)`
      : `${quoted} is ${family}: the library category of ${gradeLabel(gradeId ?? '') || 'the grade it names'} (the designation itself carries no family word the reader knows)`)
    + (disagree ? `; but the grade it resolves to, ${gradeLabel(gradeId!)}, is filed as ${fromGrade} — check` : '')
    + (notOffered ? `; ${family} is not a material the ${commodity!.replace(/_/g, ' ')} route offers` : '')
    + (byNumbering && !familyFromFilename(text) ? ` (by the ${byNumbering.system})` : '')
    + (bareNumber ? '; a bare number with no alloy word or temper — check it is the alloy, not a company code' : ''),
    { status: disagree || notOffered || bareNumber ? 'needs-validation' : 'extracted' }));
}

function interpretResin(origin: EngineeringParameter, text: string, commodity: string, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const quoted = `"${text}"`;
  const key = comparisonKey(text);
  const tax = POLYMER_TAXONOMIES[commodity];
  const inScope = DEFAULT_RATE_LIBRARY.materials.filter(m => inMaterialScope(commodity, m.category));
  const byMarking = tax ? inScope.filter(m => { const mk = tax.facts(m.id)?.marking; return !!mk && comparisonKey(mk) === key; }) : [];
  if (byMarking.length === 1) {
    out.push(derive(origin, 'material.grade', byMarking[0].id,
      `${quoted} is the ISO 11469 marking of ${byMarking[0].grade}, the one ${commodity.replace(/_/g, ' ')} grade filed under it (polymer-material-taxonomy.ts)`));
    return;
  }
  if (byMarking.length > 1) {
    out.push(derive(origin, 'material.grade', byMarking[0].id,
      `${quoted} is the ISO 11469 marking of ${byMarking.length} ${commodity.replace(/_/g, ' ')} grades (${byMarking.map(m => m.grade).join(' / ')}) — the marking `
      + 'names the polymer and filler, not the grade; choose one',
      { status: 'needs-validation', candidates: byMarking.map(m => ({ value: m.id, label: m.grade })) }));
    return;
  }
  const lean = resinFacts(nameCtx(text, commodity)).decision?.options.find(o => o.leaning);
  if (lean) {
    out.push(derive(origin, 'material.grade', lean.value,
      `${quoted} matches no grade's ISO 11469 marking exactly; the resin question's own name hint suggests ${lean.label}, its nearest stocked `
      + 'grade. ENGINEERING JUDGEMENT — check the filler and the grade', { status: 'needs-validation', candidates: [{ value: lean.value, label: lean.label }] }));
  } else {
    unresolved.push({ parameterId: origin.id, name: 'material.grade', why: `${quoted} names no ${commodity.replace(/_/g, ' ')} grade in the rate book — the resin question stays open` });
  }
}

function interpretElastomer(origin: EngineeringParameter, text: string, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const quoted = `"${text}"`;
  const fam = compoundFamilyOf('', text);
  // 'nr' is also the classifier's fallback for a text it does not know, so it counts only when the compound question's
  // own name hint says natural rubber too.
  if (fam === 'nr') {
    const lean = elastomerFacts(nameCtx(text, 'rubber')).decision?.options.find(o => o.leaning);
    if (lean?.value === 'mat-nr' && /(?<![a-z])nr(?![a-z])|natural[\s-]*rubber/i.test(text)) {
      out.push(derive(origin, 'material.grade', 'mat-nr', `${quoted} names natural rubber (the compound question's own name hint and the engine's compound classifier)`));
    } else {
      unresolved.push({ parameterId: origin.id, name: 'material.grade', why: `${quoted} names no rubber compound the engine's classifier knows — the compound question stays open` });
    }
    return;
  }
  const inScope = DEFAULT_RATE_LIBRARY.materials.filter(m => /^Rubber$/i.test(m.category) && compoundFamilyOf(m.id, m.grade) === fam);
  const menu = new Set((elastomerFacts(nameCtx('', 'rubber')).decision?.options ?? []).map(o => o.value));
  const onMenu = inScope.filter(m => menu.has(m.id));
  if (inScope.length === 1) {
    out.push(derive(origin, 'material.grade', inScope[0].id,
      `${quoted} is a ${fam} compound (the engine's compound classifier, derive/elastomer.ts); ${inScope[0].grade} is the one rate-book compound of that family`));
  } else if (inScope.length > 1) {
    const pick = onMenu.length === 1 ? onMenu[0] : inScope[0];
    out.push(derive(origin, 'material.grade', pick.id,
      `${quoted} is a ${fam} compound; the rate book holds ${inScope.length} of that family (${inScope.map(m => m.grade).join(' / ')}) — choose one`,
      { status: 'needs-validation', candidates: inScope.map(m => ({ value: m.id, label: m.grade })) }));
  } else {
    unresolved.push({ parameterId: origin.id, name: 'material.grade', why: `${quoted} is a ${fam} compound, and the rate book holds none — the compound question stays open` });
  }
}

// ─── General tolerance ────────────────────────────────────────────────────────────────────────────────────────────

/** The engine class a general-tolerance note states, by the first table row that reads it. Exported for the row tests. */
export function toleranceClassOf(text: string, drawingUnits?: string):
  { value: 'loose' | 'standard' | 'tight'; certainty: Certainty; written: string; basis: string; ruleId: string } | { unmapped: string } | null {
  for (const r of TOLERANCE_RULES) {
    const m = r.pattern.exec(text);
    if (!m) continue;
    if (r.id === 'explicit-plus-minus') {
      const block = GENERAL_TOLERANCE_NOT_MAPPED.find(n => n.pattern.test(text));
      if (block) return { unmapped: block.why };
      const n = parseNumber(m[1]);
      const unit = m[2] ? (m[2] === '"' ? 'in' : m[2].toLowerCase()) : (drawingUnits ?? 'mm');
      const mm = n == null ? null : convertUnit(n, unit, 'mm');
      if (mm == null || !(mm > 0)) return null;
      if (mm <= TIGHT_LABEL_MAX_MM) return { value: 'tight', certainty: r.certainty, written: `±${Math.round(mm * 1000) / 1000} mm`, basis: r.basis, ruleId: r.id };
      return { unmapped: `a general tolerance of ±${Math.round(mm * 1000) / 1000} mm is wider than the engine's "tight" label (±${TIGHT_LABEL_MAX_MM} mm) and the engine states no `
        + 'boundary between "standard" and "loose" — choose the class' };
    }
    const value = r.classOf(m);
    if (!value) continue;
    return { value, certainty: r.certainty, written: r.written(m), basis: r.basis, ruleId: r.id };
  }
  const not = GENERAL_TOLERANCE_NOT_MAPPED.find(n => n.pattern.test(text));
  return not ? { unmapped: not.why } : null;
}

function interpretTolerance(origin: EngineeringParameter, drawingUnits: string | undefined, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  // A bare casting grade ("9") under tolerance.castingGrade is read as a DCTG number.
  let text = textOf(origin).trim();
  if (origin.name === 'tolerance.castingGrade') {
    const n = typeof origin.value === 'number' ? origin.value : /^\s*(\d{1,2})\s*$/.test(text) ? Number(text) : null;
    if (n != null && classOfCastingGrade(n)) text = `DCTG ${n}`;
  }
  if (!text) return;
  const r = toleranceClassOf(text, drawingUnits);
  if (!r) {
    unresolved.push({ parameterId: origin.id, name: 'tolerance.generalClass', why: `"${text}" is not a general-tolerance notation the mapping table reads — the tolerance-class question stays open` });
  } else if ('unmapped' in r) {
    unresolved.push({ parameterId: origin.id, name: 'tolerance.generalClass', why: `"${text}": ${r.unmapped}` });
  } else {
    out.push(derive(origin, 'tolerance.generalClass', r.value, `${r.written} → ${r.value}. ${r.basis}`, { status: statusOf(r.certainty) }));
  }
}

// ─── Coating ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The finish route a coating note names. Exported for the row tests. */
export function coatingRouteOf(text: string): { route: string; certainty: Certainty; basis: string } | { unmapped: string } | null {
  for (const r of COATING_RULES) {
    if (r.pattern.test(text) && !(r.unless && r.unless.test(text))) return { route: r.route, certainty: r.certainty, basis: r.basis };
  }
  const not = COATING_NOT_MAPPED.find(n => n.pattern.test(text));
  return not ? { unmapped: not.why } : null;
}

/** A deposit thickness written in a coating note, µm: "8 µm", "8-12 µm", "Fe//Zn8", "Zn12", "AA15". Null when none. */
export function coatingThicknessOf(text: string): { min: number; max: number } | null {
  const range = /(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)\s*(?:µm|μm|um|micron)/i.exec(text);
  if (range) { const a = parseNumber(range[1]); const b = parseNumber(range[2]); if (a != null && b != null) return { min: Math.min(a, b), max: Math.max(a, b) }; }
  const one = /(\d+(?:[.,]\d+)?)\s*(?:µm|μm|um|micron)/i.exec(text);
  if (one) { const a = parseNumber(one[1]); if (a != null) return { min: a, max: a }; }
  const code = /(?:Fe\s*\/\/?\s*)?\bZn\s*(\d{1,2})\b/i.exec(text) ?? /\bAA\s*(\d{1,2})\b/.exec(text);
  if (code) { const a = Number(code[1]); return { min: a, max: a }; }
  return null;
}

function interpretCoatings(origins: EngineeringParameter[], hasThickness: boolean, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const read = origins.map(o => ({ o, text: textOf(o).trim() })).filter(x => x.text)
    .map(x => ({ ...x, r: coatingRouteOf(x.text) }));
  const routes = new Set(read.map(x => (x.r && 'route' in x.r ? x.r.route : null)).filter(Boolean));
  for (const { o, text, r } of read) {
    if (!r) {
      unresolved.push({ parameterId: o.id, name: 'finish.coatingRoute', why: `"${text}" is not a finish the mapping table reads — the finish question stays open` });
      continue;
    }
    if ('unmapped' in r) { unresolved.push({ parameterId: o.id, name: 'finish.coatingRoute', why: `"${text}": ${r.unmapped}` }); continue; }
    const several = routes.size > 1;
    out.push(derive(o, 'finish.coatingRoute', r.route,
      `"${text}": ${r.basis}` + (several ? '; the drawing names more than one finish and the finish question takes ONE route — choose' : ''),
      { status: several ? 'needs-validation' : statusOf(r.certainty) }));
    const t = hasThickness ? null : coatingThicknessOf(text);
    if (t) {
      const range = PLATING_THICKNESS_RANGE_UM[r.route];
      out.push(derive(o, 'finish.coatingThickness', t, range
        ? `deposit ${t.min === t.max ? t.min : `${t.min}–${t.max}`} µm written in the note; the ${r.route.replace(/_/g, ' ')} route prices by deposit inside ${range.lo}–${range.hi} µm (${range.basis})`
        : `deposit ${t.min === t.max ? t.min : `${t.min}–${t.max}`} µm written in the note; the ${r.route.replace(/_/g, ' ')} route does not price by deposit thickness`,
        { unit: 'µm' }));
    }
  }
}

// ─── Heat treatment ───────────────────────────────────────────────────────────────────────────────────────────────

/** The aluminium casting temper a heat-treatment note states. Exported for the row tests. */
export function alTemperOf(text: string): { temper: 'T6' | 'T5' | 'F'; certainty: Certainty; basis: string } | { unmapped: string } | null {
  const not = AL_TEMPER_NOT_MAPPED.find(n => n.pattern.test(text));
  if (not) return { unmapped: not.why };
  const r = AL_TEMPER_RULES.find(x => x.pattern.test(text));
  return r ? { temper: r.temper, certainty: r.certainty, basis: r.basis } : null;
}

/** The gear hardening route a heat-treatment note states. Exported for the row tests. */
export function hardeningRouteOf(text: string): { route: string; certainty: Certainty; basis: string } | null {
  const r = HARDENING_RULES.find(x => x.pattern.test(text));
  return r ? { route: r.route, certainty: r.certainty, basis: r.basis } : null;
}

function interpretHeatTreat(origins: EngineeringParameter[], commodity: string | undefined, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const casting = commodity === 'casting' || commodity === 'cast_and_machine';
  const gear = commodity === 'gear';
  if (!casting && !gear) return;      // no other route has a heat-treatment question
  const routes = new Set<string>();
  const pending: Array<{ o: EngineeringParameter; text: string; r: NonNullable<ReturnType<typeof hardeningRouteOf>> }> = [];
  for (const o of origins) {
    // A reader may hold the process as its own keyword ("case-harden") with the clause it came from in rawText: the
    // value is read first, and the clause only when the value names nothing the question takes.
    const texts = [...new Set([textOf(o).trim(), (o.rawText ?? '').trim()].filter(Boolean))];
    const text = texts[0];
    if (!text) continue;
    const firstHit = <T,>(f: (t: string) => T | null): T | null => { for (const t of texts) { const r = f(t); if (r) return r; } return null; };
    if (casting) {
      const r = firstHit(alTemperOf);
      if (!r) unresolved.push({ parameterId: o.id, name: 'material.condition', why: `"${text}" states no aluminium casting temper the heat-treat question offers (T6, T5, F) — it stays open` });
      else if ('unmapped' in r) unresolved.push({ parameterId: o.id, name: 'material.condition', why: `"${text}": ${r.unmapped}` });
      else out.push(derive(o, 'material.condition', r.temper, `"${text}": ${r.basis}. The question applies to aluminium gravity and sand castings only`, { status: statusOf(r.certainty) }));
    } else {
      const r = firstHit(hardeningRouteOf);
      if (!r) unresolved.push({ parameterId: o.id, name: 'heatTreat.route', why: `"${text}" names no hardening route the gear question offers — it stays open` });
      else { routes.add(r.route); pending.push({ o, text, r }); }
    }
  }
  for (const { o, text, r } of pending) {
    const several = routes.size > 1;
    out.push(derive(o, 'heatTreat.route', r.route,
      `"${text}": ${r.basis}` + (several ? '; the drawing names more than one treatment and the question takes ONE route — choose' : ''),
      { status: several ? 'needs-validation' : statusOf(r.certainty) }));
  }
}

// ─── Gear quality ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The ISO 1328 class number a gear-quality entry states. Exported for the row tests. */
export function gearQualityOf(text: string): { value: number; certainty: Certainty; basis: string } | null {
  for (const r of GEAR_QUALITY_RULES) {
    const m = r.pattern.exec(text);
    if (!m) continue;
    const n = r.classOf(m);
    if (Number.isInteger(n) && n >= GEAR_CLASS_RANGE.min && n <= GEAR_CLASS_RANGE.max) return { value: n, certainty: r.certainty, basis: r.basis };
    return null;
  }
  return null;
}

function interpretGearQuality(origin: EngineeringParameter, out: EngineeringParameter[], unresolved: Unresolved[]): void {
  const text = [origin.rawText, typeof origin.value === 'string' || typeof origin.value === 'number' ? String(origin.value) : ''].filter(Boolean).join(' ').trim();
  const r = gearQualityOf(text);
  if (r) {
    out.push(derive(origin, 'gear.qualityClassIso', r.value, `"${text}" → class ${r.value}. ${r.basis}`, { status: statusOf(r.certainty) }));
    return;
  }
  const bare = typeof origin.value === 'number' ? origin.value : /^\s*(\d{1,2})\s*$/.test(String(origin.value)) ? Number(origin.value) : null;
  if (bare != null && Number.isInteger(bare) && bare >= GEAR_CLASS_RANGE.min && bare <= GEAR_CLASS_RANGE.max) {
    out.push(derive(origin, 'gear.qualityClassIso', bare,
      `quality ${bare} with no standard named, read as ISO 1328 class ${bare}. ENGINEERING JUDGEMENT — confirm which standard the drawing means`,
      { status: 'needs-validation' }));
  } else {
    unresolved.push({ parameterId: origin.id, name: 'gear.qualityClassIso', why: `"${text}" is not a gear quality the mapping table reads (ISO 1328, DIN 3961–3967, AGMA Q) — the quality question stays open` });
  }
}

// ─── Notes and flags ──────────────────────────────────────────────────────────────────────────────────────────────

function interpretNotes(params: EngineeringParameter[], out: EngineeringParameter[]): void {
  const stated = (name: string) => params.some(p => p.name === name && p.source !== 'derived');
  // A leak-test specification as written IS the requirement.
  for (const p of params.filter(x => x.name === 'quality.leakTestSpec')) {
    const text = textOf(p).trim();
    if (!text || LEAK_NEGATION_RE.test(text) || stated('quality.pressureTight')) continue;
    out.push(derive(p, 'quality.pressureTight', true, `the drawing states a leak / pressure test ("${text}") → the part must be leak-tight`));
  }
  for (const p of params.filter(x => x.name === 'quality.impregnation')) {
    const text = textOf(p).trim();
    if (!text) continue;
    const f = flagOf(p.value);
    const no = f === false || IMPREGNATION_NEGATION_RE.test(text);
    if (f === null && !IMPREGNATION_RE.test(text)) continue;
    out.push(derive(p, 'quality.impregnationRequired', !no, no ? `the drawing rules impregnation out ("${text}")` : `the drawing calls for impregnation ("${text}")`));
  }
  // Free notes: only when no dedicated parameter already states the fact.
  for (const p of params.filter(x => (x.name === 'note.general' || x.name === 'note.manufacturing') && x.source !== 'derived')) {
    const text = textOf(p).trim();
    if (!text) continue;
    if (!stated('quality.pressureTight') && !stated('quality.leakTestSpec') && LEAK_NOTE_RE.test(text) && !LEAK_NEGATION_RE.test(text)) {
      out.push(derive(p, 'quality.pressureTight', true, `a note states a leak / pressure requirement ("${text}") → the part must be leak-tight`, { suffix: 'note' }));
    }
    if (!stated('quality.safetyCritical') && SAFETY_NOTE_RE.test(text)) {
      out.push(derive(p, 'quality.safetyCritical', true,
        `a note designates a safety / critical characteristic ("${text}"). INFERRED — ENGINEERING JUDGEMENT: the marking is on a characteristic; `
        + 'that the PART is safety-critical or fatigue-loaded is the engineer\'s call', { kind: 'inferred', status: 'needs-validation', suffix: 'note' }));
    }
    if (!stated('quality.impregnation') && IMPREGNATION_RE.test(text)) {
      const no = IMPREGNATION_NEGATION_RE.test(text);
      out.push(derive(p, 'quality.impregnationRequired', !no, no ? `a note rules impregnation out ("${text}")` : `a note calls for impregnation ("${text}")`, { suffix: 'note' }));
    }
  }
}

// ─── Company specification codes ──────────────────────────────────────────────────────────────────────────────────

function interpretSpecCodes(params: EngineeringParameter[], opts: InterpretOptions, out: EngineeringParameter[], unresolved: Unresolved[]): EngineeringParameter[] {
  const designations: EngineeringParameter[] = [];
  for (const p of params.filter(x => x.name === 'material.specCode')) {
    const code = textOf(p).trim();
    if (!code) continue;
    const e = opts.specLookup?.[comparisonKey(code)];
    if (!e) {
      unresolved.push({ parameterId: p.id, name: 'material.designation',
        why: `company specification "${code}" is not in the specification lookup table (server/data/spec-lookup.json) — its meaning is never guessed; the material questions stay open` });
      continue;
    }
    const d = derive(p, 'material.designation', e.designation,
      `company specification "${code}" = ${e.designation}${e.standard ? ` (${e.standard})` : ''} by the specification lookup table — ${e.source}${e.note ? `; ${e.note}` : ''}`);
    // The designation text the matchers read is the table's, not the code's.
    d.rawText = p.rawText ?? code;
    out.push(d); designations.push(d);
  }
  return designations;
}

// ─── The pass ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Statuses whose parameter is not interpreted: the engineer said the reading is wrong. */
const DEAD: ReadonlySet<ParameterStatus> = new Set(['rejected', 'missing']);

/**
 * Every interpretation the parameters allow. Pure: the input is not changed; the result is the NEW parameters and the
 * readings that could not be mapped. Parameters that are themselves derived are not interpreted again.
 */
export function interpretParameters(input: readonly EngineeringParameter[], opts: InterpretOptions = {}): Interpretation {
  const out: EngineeringParameter[] = [];
  const unresolved: Unresolved[] = [];
  const params = input.filter(p => !DEAD.has(p.status) && p.source !== 'derived');
  const units = params.find(p => p.name === 'title.units');
  const drawingUnits = units ? (/in(ch)?/i.test(textOf(units)) ? 'in' : 'mm') : undefined;

  const fromSpec = interpretSpecCodes(params, opts, out, unresolved);
  for (const p of [...params.filter(x => x.name === 'material.designation'), ...fromSpec]) interpretDesignation(p, opts, out, unresolved);

  // One class per source: a casting or forging grade outranks the general note it sits beside.
  const tolerance = params.filter(x => x.name === 'tolerance.castingGrade' || x.name === 'tolerance.general');
  const seen = new Set<string>();
  for (const p of [...tolerance].sort((a, b) => Number(b.name === 'tolerance.castingGrade') - Number(a.name === 'tolerance.castingGrade'))) {
    const key = `${p.source}|${p.sourceFile ?? ''}`;
    if (seen.has(key)) continue;
    const before = out.length;
    interpretTolerance(p, drawingUnits, out, unresolved);
    if (out.length > before) seen.add(key);
  }

  const hasThickness = params.some(x => x.name === 'finish.coatingThickness');
  interpretCoatings(params.filter(x => x.name === 'finish.coating'), hasThickness, out, unresolved);
  interpretHeatTreat(params.filter(x => x.name === 'heatTreat.process'), opts.commodity, out, unresolved);
  for (const p of params.filter(x => x.name === 'gear.qualityClass')) interpretGearQuality(p, out, unresolved);
  interpretNotes(params, out);

  return { parameters: out, unresolved };
}
