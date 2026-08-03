/**
 * Material family — the one thing geometry genuinely cannot tell you.
 *
 * The same solid is ~2.9x heavier in steel than in aluminium and ~7.5x heavier
 * than in plastic. A CAD file carries shape, not substance. Per
 * docs/cad-to-cost-learnings.md this single ambiguity caused three of the six
 * documented cost errors — a stub axle costed as aluminium when it was steel, a
 * servo horn costed as plastic when it was aluminium, a seat cross-member costed
 * as PA6 when it was a steel stamping.
 *
 * So this module does NOT decide. It narrows the field as far as the evidence
 * honestly allows, then hands the engineer a question with the mass consequence
 * of each answer spelled out.
 */
import { familyFromFilename, type MaterialFamily } from '../../material-family.js';
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import type { AlloyFamily } from '../../modules/casting-advisor.js';
import type { ForgingAlloyFamily } from '../../modules/forging-advisor.js';
import type { Decision, RuleContext } from '../types.js';

/** Density used to turn measured volume into a mass, kg/cm³. */
const DENSITY_KG_PER_CM3: Record<MaterialFamily, number> = {
  plastic: 0.00105,
  aluminium: 0.00270,
  magnesium: 0.00181,
  titanium: 0.00443,
  'cast iron': 0.00715,
  steel: 0.00785,
  'copper alloy': 0.00896,
};

/** Families a given commodity can physically be made from. */
const COMMODITY_FAMILIES: Record<string, MaterialFamily[]> = {
  casting: ['aluminium', 'magnesium', 'cast iron', 'steel', 'copper alloy'],
  cast_and_machine: ['aluminium', 'magnesium', 'cast iron', 'steel', 'copper alloy'],
  forging: ['aluminium', 'steel', 'titanium', 'copper alloy'],
  machining: ['aluminium', 'steel', 'cast iron', 'titanium', 'copper alloy', 'plastic'],
  sheet_metal: ['steel', 'aluminium'],
  sheet_metal_fab: ['steel', 'aluminium'],
  injection_moulding: ['plastic'],
  blow_moulding: ['plastic'],
  thermoforming: ['plastic'],
  rotational_moulding: ['plastic'],
};

export const MATERIAL_FAMILY_DECISION_ID = 'material.family';

export interface MaterialFacts {
  /** Resolved family, or null when the engineer still has to choose. */
  family: MaterialFamily | null;
  /** Mass in kg for the resolved family. */
  massKg: number | null;
  /** How we got there — carried into `Decided.basis`. */
  basis: string;
  /** Set when the family is genuinely undecidable. */
  decision?: Decision;
}

function massFor(volumeCm3: number, fam: MaterialFamily): number {
  return Math.round(volumeCm3 * DENSITY_KG_PER_CM3[fam] * 1000) / 1000;
}

/**
 * Resolve the material family, or ask.
 *
 * Order of evidence:
 *   1. The engineer already answered → use it. Always wins.
 *   2. The commodity admits exactly one family (e.g. injection moulding is
 *      plastic) → no ambiguity to resolve.
 *   3. The filename names a family AND that family is plausible for the
 *      commodity → strong prior, accepted with reduced confidence.
 *   4. Otherwise → ask, listing each candidate with the mass it implies.
 *
 * Note what is deliberately absent: density-based inference. We measure volume,
 * not mass, so there is no measured density to infer from — using an assumed
 * density to pick a family and then that family's density to compute the mass is
 * circular. `familyFromDensity` exists for callers who have a real density.
 */
export function materialFacts(ctx: RuleContext): MaterialFacts {
  const volumeCm3 = ctx.geo.volume?.cm3 ?? 0;
  const candidates = COMMODITY_FAMILIES[ctx.commodity] ?? Object.keys(DENSITY_KG_PER_CM3) as MaterialFamily[];

  const answered = ctx.answers[MATERIAL_FAMILY_DECISION_ID] as MaterialFamily | undefined;
  if (answered && candidates.includes(answered)) {
    return {
      family: answered,
      massKg: massFor(volumeCm3, answered),
      basis: `${volumeCm3.toFixed(0)} cm³ × ${DENSITY_KG_PER_CM3[answered]} kg/cm³ (${answered}, confirmed by engineer)`,
    };
  }

  if (candidates.length === 1) {
    const fam = candidates[0];
    return {
      family: fam,
      massKg: massFor(volumeCm3, fam),
      basis: `${volumeCm3.toFixed(0)} cm³ × ${DENSITY_KG_PER_CM3[fam]} kg/cm³ (${ctx.commodity} is always ${fam})`,
    };
  }

  const fromName = familyFromFilename(ctx.filename);
  if (fromName && candidates.includes(fromName)) {
    return {
      family: fromName,
      massKg: massFor(volumeCm3, fromName),
      basis: `${volumeCm3.toFixed(0)} cm³ × ${DENSITY_KG_PER_CM3[fromName]} kg/cm³ (${fromName}, from the file name)`,
    };
  }

  return {
    family: null,
    massKg: null,
    basis: 'undecided — awaiting the engineer',
    decision: {
      id: MATERIAL_FAMILY_DECISION_ID,
      kind: 'material_family',
      question: 'What is this part made of?',
      why: 'A CAD file carries shape, not substance. We measured '
        + `${volumeCm3.toFixed(0)} cm³ exactly, but the same solid weighs `
        + `${massFor(volumeCm3, 'aluminium').toFixed(2)} kg in aluminium and `
        + `${massFor(volumeCm3, 'steel').toFixed(2)} kg in steel. Nothing in the geometry `
        + 'distinguishes them, and guessing wrong moves the material cost several-fold.',
      options: candidates.map(fam => ({
        value: fam,
        label: fam.charAt(0).toUpperCase() + fam.slice(1),
        consequence: `${massFor(volumeCm3, fam).toFixed(2)} kg`,
        // The file name is a hint worth showing, never worth acting on alone.
        leaning: fromName === fam,
      })),
      blockedFieldIds: [],
      blockedRuleIds: [],
      severity: 'blocking',
    },
  };
}

/** Map a broad family onto the alloy family the casting advisor expects. */
export function toCastingAlloyFamily(fam: MaterialFamily): AlloyFamily | null {
  switch (fam) {
    case 'aluminium': return 'aluminium';
    case 'magnesium': return 'magnesium';
    case 'copper alloy': return 'copper';
    // Grey vs ductile iron is a GRADE decision, not a family one. Ductile is the
    // safe default: grey iron is brittle, and choosing it for a structural part
    // is the error the existing safety redirect in cad.ts already corrects.
    case 'cast iron': return 'ductile-iron';
    case 'steel': return 'carbon-steel';
    default: return null;
  }
}

/**
 * The family behind a rate-library material id.
 *
 * Used to feed the model's own material choice back into the rules on the AI
 * path: the prompt renders the material-dependent lines as UNDECIDED, the model
 * answers with a grade, and the rules then re-run with that grade as the answer
 * and overwrite everything downstream of it. The model picks the metal; the
 * engine still does the arithmetic.
 *
 * Reads the library's `category` first — that is authoritative — and falls back
 * to the filename matcher for ids not in the library.
 */
export function familyFromMaterialId(materialId: string): MaterialFamily | null {
  const cat = (DEFAULT_RATE_LIBRARY.materials.find(m => m.id === materialId)?.category ?? '').toLowerCase();
  if (cat) {
    if (cat.includes('titanium')) return 'titanium';
    if (cat.includes('stainless') || cat.includes('steel')) return 'steel';
    if (cat.includes('cast iron') || cat.includes('iron')) return 'cast iron';
    if (cat.includes('aluminium')) return 'aluminium';
    if (cat.includes('magnesium')) return 'magnesium';
    if (cat.includes('copper') || cat.includes('brass')) return 'copper alloy';
    if (cat.includes('thermoplastic') || cat.includes('plastic') || cat.includes('rubber')
      || cat.includes('moulding') || cat.includes('composite')) return 'plastic';
  }
  return familyFromFilename(materialId);
}

/**
 * Map a broad family onto the alloy family the forging advisor expects.
 *
 * Two honest approximations, both stated where they are used:
 *  - carbon vs alloy steel is a GRADE distinction the family does not carry.
 *    Carbon steel is the conservative choice: it forges easier (90 MPa flow
 *    stress against 110) and gives dies a longer life (40k against 30k), so
 *    choosing it never inflates the estimate.
 *  - magnesium forges on aluminium equipment at aluminium temperatures; the
 *    advisor has no magnesium entry and aluminium is the closest behaviour.
 * Cast iron is not forgeable at all — it returns null and the caller stops.
 */
export function toForgingAlloyFamily(fam: MaterialFamily): ForgingAlloyFamily | null {
  switch (fam) {
    case 'aluminium':
    case 'magnesium': return 'aluminium';
    case 'titanium': return 'titanium';
    case 'copper alloy': return 'copper';
    case 'steel': return 'carbon-steel';
    default: return null;   // cast iron and plastic cannot be forged
  }
}

export { DENSITY_KG_PER_CM3 };
