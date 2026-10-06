/**
 * The material GRADE for a casting or a forging (casting & forging materials
 * review, Oct 2026).
 *
 * The family — aluminium, cast iron, steel — is what a measured volume plus an
 * engineer's answer can settle, and before this review it was ALL the casting
 * and forging rules asked: every steel forging was priced as 38MnVS6 (£1.15/kg)
 * whatever the drawing said, so a 316L or 34CrNiMo6 forging could not be costed
 * from CAD at its own metal; a pinned grade on the CAD panel reached the rules
 * only as the family its id text suggested.
 *
 * Now the grade is a question in its own right — ADVISORY, so the part still
 * costs at the representative grade until it is answered (no recorded cost
 * moves) — and it is answered, strongest evidence first, by:
 *
 *   1. the engineer (the question, or a grade pinned on the CAD panel);
 *   2. a material designation DECLARED in the CAD file — the designer's own
 *      property, applied as the default and said so;
 *   3. the grade the identification step read off a drawing or photo, and the
 *      part names — a LEANING only, never applied.
 *
 * An answered or declared grade also carries its own density into the mass and
 * its own alloy into the process advisors (grey v ductile iron, stainless,
 * alloy v carbon steel), which the family alone could not.
 */
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../../material-scope.js';
import type { MaterialRate } from '../../types.js';
import type { MaterialFamily } from '../../material-family.js';
import type { ForgingAlloyFamily } from '../../modules/forging-advisor.js';
import type { AlloyFamily } from '../../modules/casting-advisor.js';
import { castingAlloyOf } from '../../casting-melt.js';
import type { Decision, RuleContext } from '../types.js';
import { familyFromMaterialId, materialFacts, type MaterialFacts } from './material.js';
import { partNames } from './part-evidence.js';
import { answeredBool, SAFETY_CRITICAL_DECISION_ID } from './service-context.js';

/** Grey (flake), malleable and white irons — brittle: not a material for a safety-critical, fatigue-loaded part. */
export const BRITTLE_IRON = /^mat-(gjl|gjmb|hicr-white)/;

/**
 * The cast-iron grade costed until the grade is answered. A part answered safety-critical
 * is ductile EN-GJS-500-7 — the grade the library itself names for steering knuckles and
 * hubs — never grey iron (stub axle live run, Oct 2026: a steering stub axle answered
 * "safety-critical: yes" was still costed as EN-GJL-250 grey iron, because grey is the
 * workhorse default and nothing tied the two answers together).
 */
export function castIronDefaultGrade(ctx: RuleContext): { id: string; why: string } {
  return answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID) === true
    ? { id: 'mat-gjs500', why: 'safety-critical / fatigue-loaded → ductile EN-GJS-500-7 (grey iron is brittle)' }
    : { id: 'mat-gjl250', why: 'the grey-iron workhorse — not a drawing callout' };
}

export const GRADE_DECISION_ID = 'material.grade';

/** Which library categories each route buys — the engine's one scope table (src/engine/material-scope.ts). */
export const GRADE_SCOPE: Record<string, RegExp> = {
  casting: MATERIAL_SCOPE_BY_COMMODITY.casting,
  cast_and_machine: MATERIAL_SCOPE_BY_COMMODITY.cast_and_machine,
  forging: MATERIAL_SCOPE_BY_COMMODITY.forging,
};

/** The grades a route offers for a family; aluminium castings by route (die v gravity / sand). */
export function gradeCandidates(commodity: string, family: MaterialFamily, subtype?: string | null): MaterialRate[] {
  const scope = GRADE_SCOPE[commodity];
  if (!scope) return [];
  let out = DEFAULT_RATE_LIBRARY.materials.filter(m => scope.test(m.category) && familyFromMaterialId(m.id) === family);
  if (family === 'aluminium' && commodity !== 'forging' && subtype) {
    const die = /Die Cast|HPDC/i;
    const routed = out.filter(m => (subtype === 'hpdc') === die.test(m.category));
    if (routed.length) out = routed;
  }
  return out.sort((a, b) => a.pricePerKg - b.pricePerKg);
}

/**
 * Designation keys for a grade name: "EN-GJS-400-15" → gjs 400, en gjs 400 15 …;
 * "42CrMo4 / 4140 / 1.7225" → 42crmo4, 4140, 1 7225. A key must hold a digit, and
 * a bare number must have four digits (a 4140, not a 400).
 */
function keysOf(grade: string): RegExp[] {
  const keys: RegExp[] = [];
  for (const chunk of grade.toLowerCase().split(/[/(),;]+/)) {
    const parts = chunk.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      // Up to four tokens, so a full designation ("en gjs 500 7") outranks its stem ("en gjs 500"),
      // which EN-GJS-500-14 shares (casting grade gap review, Oct 2026).
      for (let j = i + 1; j <= Math.min(parts.length, i + 4); j++) {
        const seq = parts.slice(i, j);
        const joined = seq.join('');
        if (!/\d/.test(joined)) continue;
        if (/^\d+$/.test(joined) && joined.length < 4) continue;
        if (joined.length < 3) continue;
        keys.push(new RegExp(`(?<![a-z0-9])${seq.join(' ?')}(?![a-z0-9])`));
      }
    }
  }
  // Longest first: "gjs 400 15" outranks "gjs 400".
  return keys.sort((a, b) => b.source.length - a.source.length);
}

/** Length of a grade's first designation ("EN-GJS-500-7" from "EN-GJS-500-7 (Ductile Iron)"). */
const designationLength = (grade: string) => grade.split(/[/(),;]+/)[0].trim().length;

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The best candidate a text names, by the longest designation key it contains. */
function gradeNamedIn(text: string, candidates: MaterialRate[]): MaterialRate | null {
  const t = norm(text);
  let best: { m: MaterialRate; len: number; base: number } | null = null;
  for (const m of candidates) {
    for (const k of keysOf(m.grade)) {
      // A tie (a bare "GJS-500" names 500-7 and 500-14 alike) goes to the shorter designation —
      // the base grade, not its variant.
      if (k.test(t)) {
        const len = k.source.length, base = designationLength(m.grade);
        if (!best || len > best.len || (len === best.len && base < best.base)) best = { m, len, base };
        break;
      }
    }
  }
  return best?.m ?? null;
}

export interface GradeEvidence { id: string; source: 'declared' | 'drawing' | 'name'; where: string }

/** What the file, the drawing read and the names say the grade is. */
export function gradeEvidence(ctx: RuleContext, candidates: MaterialRate[]): GradeEvidence | null {
  for (const d of ctx.geo.cadMetadata?.materialDesignations ?? []) {
    const m = gradeNamedIn(d, candidates);
    if (m) return { id: m.id, source: 'declared', where: `the material designation declared in the CAD file ("${d}")` };
  }
  const ai = ctx.answers['material.gradeText'];
  if (typeof ai === 'string') {
    const m = gradeNamedIn(ai, candidates);
    if (m) return { id: m.id, source: 'drawing', where: `the grade read off the drawing / photo ("${ai}") — to confirm` };
  }
  for (const n of partNames(ctx.filename, ctx.geo)) {
    const m = gradeNamedIn(n.text, candidates);
    if (m) return { id: m.id, source: 'name', where: `${n.where} ("${n.text}")` };
  }
  return null;
}

/**
 * The grade the engineer chose or the file declares, valid for this family —
 * the one an advisor may act on. Null means "cost at the representative grade".
 */
export function explicitGrade(ctx: RuleContext, family: MaterialFamily): { id: string; basis: string } | null {
  const all = gradeCandidates(ctx.commodity, family);
  const ans = ctx.answers[GRADE_DECISION_ID];
  if (typeof ans === 'string' && all.some(m => m.id === ans)) {
    return { id: ans, basis: 'chosen by the engineer' };
  }
  const ev = gradeEvidence(ctx, all);
  if (ev?.source === 'declared') return { id: ev.id, basis: `from ${ev.where}` };
  return null;
}

/** Material facts with the explicit grade's own density in the mass. */
export function gradedMaterialFacts(ctx: RuleContext): MaterialFacts & { gradeId: string | null } {
  const mat = materialFacts(ctx);
  if (mat.decision || !mat.family) return { ...mat, gradeId: null };
  const g = explicitGrade(ctx, mat.family);
  if (!g) {
    // Cast iron: the default grade costed is grey or ductile (castIronDefaultGrade) — the mass is that
    // iron's too, not the family's mid density (the £/kg and the kg are the same metal).
    if (mat.family === 'cast iron' && mat.massKg !== null) {
      const def = castIronDefaultGrade(ctx);
      const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === def.id);
      const cm3 = ctx.geo.volume?.cm3 ?? 0;
      if (m && cm3 > 0) {
        return { ...mat, gradeId: null, massKg: Math.round(cm3 * m.densityKgPerM3 / 1e6 * 1000) / 1000,
          basis: `${cm3.toFixed(0)} cm³ × ${m.densityKgPerM3} kg/m³ (${m.grade}, the default grade — ${def.why})` };
      }
    }
    return { ...mat, gradeId: null };
  }
  const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === g.id)!;
  const cm3 = ctx.geo.volume?.cm3 ?? 0;
  return {
    ...mat, gradeId: g.id,
    massKg: Math.round(cm3 * m.densityKgPerM3 / 1e6 * 1000) / 1000,
    basis: `${cm3.toFixed(0)} cm³ × ${m.densityKgPerM3} kg/m³ (${m.grade}, ${g.basis})`,
  };
}

/** The casting advisor's alloy for an explicit grade (grey v ductile iron, stainless, superalloy …). */
export function castingAlloyForGrade(id: string | null): AlloyFamily | null {
  return id ? castingAlloyOf(id) : null;
}

/** The forging advisor's alloy for an explicit grade, from its library category. */
export function forgingAlloyForGrade(id: string | null): ForgingAlloyFamily | null {
  if (!id) return null;
  const c = (DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id)?.category ?? '').toLowerCase();
  if (/nickel/.test(c)) return 'superalloy';
  if (/titanium/.test(c)) return 'titanium';
  if (/stainless/.test(c)) return 'stainless-steel';
  if (/microalloy/.test(c)) return 'microalloyed-steel';
  if (/alloy steel/.test(c)) return 'alloy-steel';
  if (/carbon steel/.test(c)) return 'carbon-steel';
  if (/alumin|magnes/.test(c)) return 'aluminium';
  if (/copper|brass|bronze/.test(c)) return 'copper';
  return null;
}

/**
 * The grade question — advisory: the default is costed until it is answered.
 * Null when there is nothing to choose (one grade) or the family is not settled.
 */
export function gradeDecision(ctx: RuleContext, family: MaterialFamily, defaultId: string, subtype?: string | null): Decision | null {
  const candidates = gradeCandidates(ctx.commodity, family, subtype);
  if (candidates.length < 2) return null;
  const cm3 = ctx.geo.volume?.cm3 ?? 0;
  const ev = gradeEvidence(ctx, gradeCandidates(ctx.commodity, family));
  const lean = ev && candidates.some(m => m.id === ev.id) ? ev.id : defaultId;
  const lo = candidates[0]; const hi = candidates[candidates.length - 1];
  const safety = family === 'cast iron' && answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID) === true;
  return {
    id: GRADE_DECISION_ID, kind: 'material_grade',
    question: `Which ${family} grade?`,
    why: `The family is settled; the grade sets the £/kg — £${lo.pricePerKg.toFixed(2)} (${lo.grade}) to `
      + `£${hi.pricePerKg.toFixed(2)} (${hi.grade}) for this route — and, for ${ctx.commodity === 'forging' ? 'a forging, the flow stress and die life' : 'a casting, the melt and the alloy route'}. `
      + (ev ? `${DEFAULT_RATE_LIBRARY.materials.find(m => m.id === ev.id)?.grade} is suggested from ${ev.where}. ` : '')
      + `Until it is answered the part is costed at ${DEFAULT_RATE_LIBRARY.materials.find(m => m.id === (ev?.source === 'declared' ? ev.id : defaultId))?.grade}.`,
    options: candidates.map(m => ({
      value: m.id, label: m.grade,
      consequence: `£${m.pricePerKg.toFixed(2)}/kg · ${(cm3 * m.densityKgPerM3 / 1e6).toFixed(2)} kg`
        + (safety && BRITTLE_IRON.test(m.id) ? ' · brittle — not for a safety-critical part' : ''),
      leaning: m.id === lean,
    })),
    blockedFieldIds: [], blockedRuleIds: [], severity: 'advisory',
  };
}
