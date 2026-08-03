/**
 * Service-context decisions — the three facts a drawing carries and a CAD file
 * does not.
 *
 * `adviseCastingProcess` needs `pressureTight`, `toleranceClass` and
 * `safetyCritical` to choose between HPDC, gravity, sand and investment. None of
 * them is a shape. A sealed cavity in the model says nothing about whether the
 * part has a leak spec; a tight tolerance lives on the drawing; safety-critical
 * is a programme decision.
 *
 * Each of these is asked once and remembered. Where the part name gives a strong
 * hint we show it as a leaning — visible, never preselected.
 */
import type { Decision, RuleContext } from '../types.js';
import type { ToleranceClass } from '../../modules/casting-advisor.js';

export const PRESSURE_TIGHT_DECISION_ID = 'service.pressureTight';
export const TOLERANCE_CLASS_DECISION_ID = 'service.toleranceClass';
export const SAFETY_CRITICAL_DECISION_ID = 'service.safetyCritical';

/**
 * Part names that make a part very likely safety-critical.
 *
 * Lifted from the existing structural-part redirect in server/routes/cad.ts,
 * where it already drives a grey→ductile iron correction. Here it is only ever a
 * `leaning` on the question — the same words, doing honest work instead of
 * silently setting a flag.
 */
const SAFETY_CRITICAL_HINT =
  /knuckle|stub.?axle|control.?arm|suspension|steering|upright|kingpin|spindle|hub carrier|wishbone|trailing arm|tie.?rod|subframe|crash|pillar/i;

/** Part names that usually imply a leak spec. */
const PRESSURE_TIGHT_HINT =
  /pump|manifold|housing|cover|sump|valve|hydraulic|coolant|fuel|oil|water|intake|plenum|caliper|master.?cyl/i;

function hint(re: RegExp, ctx: RuleContext): boolean {
  return re.test(`${ctx.filename} ${ctx.geo.partName ?? ''}`);
}

export function pressureTightDecision(ctx: RuleContext): Decision {
  const likely = hint(PRESSURE_TIGHT_HINT, ctx);
  return {
    id: PRESSURE_TIGHT_DECISION_ID,
    kind: 'pressure_tight',
    question: 'Does this part have to hold pressure or be leak-tight?',
    why: 'A sealed cavity in the model does not tell us whether there is a leak spec. '
      + 'It changes the process (vacuum-assisted HPDC), adds impregnation and a leak test, '
      + 'and rules some routes out entirely.',
    options: [
      { value: 'yes', label: 'Yes — leak-tight / pressure-rated',
        consequence: 'vacuum assist + impregnation + leak test', leaning: likely },
      { value: 'no', label: 'No — structural or cosmetic only',
        consequence: 'no porosity-sealing operations', leaning: !likely },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

export function toleranceClassDecision(): Decision {
  return {
    id: TOLERANCE_CLASS_DECISION_ID,
    kind: 'tolerance_class',
    question: 'What tolerance class does the drawing call for?',
    why: 'Tolerances are drawing annotations, not geometry — the kernel measures shape exactly '
      + 'but cannot read a ±0.1 callout. This decides investment vs sand casting on ferrous '
      + 'parts and drives the finish-machining allowance.',
    options: [
      { value: 'loose', label: 'Loose — general as-cast', consequence: 'sand casting viable' },
      { value: 'standard', label: 'Standard', consequence: 'the usual route for the alloy' },
      { value: 'tight', label: 'Tight — ±0.1–0.5 mm', consequence: 'investment casting or added machining' },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

export function safetyCriticalDecision(ctx: RuleContext): Decision {
  const likely = hint(SAFETY_CRITICAL_HINT, ctx);
  return {
    id: SAFETY_CRITICAL_DECISION_ID,
    kind: 'safety_critical',
    question: 'Is this part safety-critical or fatigue-loaded?',
    why: 'Nothing in the geometry says whether a bracket carries a seat or a suspension load. '
      + 'It drives NDT, HIP and the choice of a ductile alloy — real cost, and a real risk if wrong.'
      + (likely ? ' The part name suggests a chassis/suspension component.' : ''),
    options: [
      { value: 'yes', label: 'Yes — safety-critical',
        consequence: 'adds X-ray/CT NDT and heat treat', leaning: likely },
      { value: 'no', label: 'No', consequence: 'standard inspection', leaning: !likely },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/** Read an answered service flag, or null when still open. */
export function answeredBool(ctx: RuleContext, id: string): boolean | null {
  const v = ctx.answers[id];
  if (v === 'yes' || v === true) return true;
  if (v === 'no' || v === false) return false;
  return null;
}

export function answeredToleranceClass(ctx: RuleContext): ToleranceClass | null {
  const v = ctx.answers[TOLERANCE_CLASS_DECISION_ID];
  return v === 'loose' || v === 'standard' || v === 'tight' ? v : null;
}
