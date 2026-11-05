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
export const SAFETY_CRITICAL_HINT =
  /knuckle|stub.?axle|control.?arm|suspension|steering|upright|kingpin|spindle|hub carrier|wishbone|trailing arm|tie.?rod|subframe|crash|pillar|(?<![a-z])(?:hub|wheel|brake|caliper|seat|anchor)/i;
// Report standard review (3 Nov 2026): a wheel hub flange (wheel attachment), a brake part and a seat-anchorage bracket
// showed no leaning — "hub carrier" was the only hub word. A letter before the word stops "github" / "freewheel" style
// matches; a separator (space, "_", "-") does not, so "FORGE_Hub_Flange" and "Seat_Locking_Bracket" lean Yes.

/** Part names that usually imply a leak spec. A coolant header (expansion) tank and a reservoir hold pressure too. */
export const PRESSURE_TIGHT_HINT =
  /pump|manifold|housing|cover|sump|valve|hydraulic|coolant|fuel|oil|water|intake|plenum|caliper|master.?cyl|tank|reservoir/i;

function hint(re: RegExp, ctx: RuleContext): boolean {
  return re.test(`${ctx.filename} ${ctx.geo.partName ?? ''}`);
}

/** What "leak-tight" does on this route — the casting route prices it; the others say what is not costed. */
export function pressureConsequence(commodity: string): string {
  if (commodity === 'casting' || commodity === 'cast_and_machine') {
    return 'vacuum assist on a die casting + impregnation (light alloys; asked on iron and steel) + leak test';
  }
  if (commodity === 'extrusion') return 'adds the pipe / tube pressure test station';
  return 'no leak test is costed on this route — listed as not costed';
}

export function pressureTightDecision(ctx: RuleContext): Decision {
  const likely = hint(PRESSURE_TIGHT_HINT, ctx);
  const casting = ctx.commodity === 'casting' || ctx.commodity === 'cast_and_machine';
  return {
    id: PRESSURE_TIGHT_DECISION_ID,
    kind: 'pressure_tight',
    question: 'Does this part have to hold pressure or be leak-tight?',
    why: 'A sealed cavity in the model does not tell us whether there is a leak spec. '
      + (casting
        ? 'It changes the process (vacuum-assisted HPDC), adds impregnation and a leak test, and rules some routes out entirely.'
        : 'It decides whether a leak / pressure test belongs in the price; where this route does not cost one it is '
          + 'listed as not costed.'),
    options: [
      { value: 'yes', label: 'Yes — leak-tight / pressure-rated',
        consequence: pressureConsequence(ctx.commodity), leaning: likely },
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

/** What "safety-critical" adds on this route — the forging and casting advisors' own secondary operations. */
export function safetyConsequence(commodity: string): string {
  if (commodity === 'forging') return 'adds crack testing (MPI on a closed-die or precision steel forging, UT on open-die / ring-rolled, CT on titanium and superalloys)';
  if (commodity === 'casting' || commodity === 'cast_and_machine') return 'adds NDT (100% MPI with sample X-ray on iron and steel, in-line X-ray on light alloys, CT on superalloys) and a ductile grade on iron';
  if (commodity === 'machining') return 'a ductile grade on cast iron; no check is costed on this route — special-characteristic controls are listed as not costed';
  return 'no check is costed on this route — special-characteristic controls are listed as not costed';
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
    // D1 (CAD to COST proposal v2, Director decision 28 Oct 2026): only evidence leans. "No" is never pre-ticked: a
    // stub axle named "PRCR002" was pre-ticked No and costed in grey iron, £41.46 against £53.06 ductile. With no name
    // evidence the engineer must choose; the unattended AI path still falls back to No (answeredBool), as stated.
    // D2: the consequence names the check this process actually charges (MPI on a closed-die forging, not X-ray).
    options: [
      { value: 'yes', label: 'Yes — safety-critical',
        consequence: safetyConsequence(ctx.commodity), leaning: likely },
      { value: 'no', label: 'No', consequence: 'standard inspection', leaning: false },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/**
 * Read an answered service flag, or null when still open.
 *
 * Under `assumeLeanings` — the AI path, where no engineer is present — an
 * unanswered flag falls back to the leaning the decision already displays,
 * rather than blocking every rule downstream of it. That is not a silent
 * default: `assumedNote` puts it in the basis, and the confidence drops.
 */
export function answeredBool(ctx: RuleContext, id: string): boolean | null {
  const v = ctx.answers[id];
  if (v === 'yes' || v === true) return true;
  if (v === 'no' || v === false) return false;
  if (!ctx.assumeLeanings) return null;
  const d = id === SAFETY_CRITICAL_DECISION_ID ? safetyCriticalDecision(ctx)
    : id === PRESSURE_TIGHT_DECISION_ID ? pressureTightDecision(ctx)
    : null;
  if (!d) return null;
  return d.options.find(o => o.leaning)?.value === 'yes';
}

/** Tolerance class has no geometric leaning to fall back on. 'standard' is the stated assumption, and it is the one
 *  that does not silently push a part toward investment casting (tight) or sand (loose). The report prints it as what
 *  an unanswered class was costed as (decision-used.ts). */
export const TOLERANCE_CLASS_ASSUMED: ToleranceClass = 'standard';

export function answeredToleranceClass(ctx: RuleContext): ToleranceClass | null {
  const v = ctx.answers[TOLERANCE_CLASS_DECISION_ID];
  if (v === 'loose' || v === 'standard' || v === 'tight') return v;
  return ctx.assumeLeanings ? TOLERANCE_CLASS_ASSUMED : null;
}

/**
 * The sentence appended to a basis when a service flag was assumed rather than
 * answered. Short on purpose — it has to survive onto a report line.
 */
export function assumedNote(ctx: RuleContext, id: string): string {
  if (!ctx.assumeLeanings || ctx.answers[id] !== undefined) return '';
  return ' (assumed — confirm before quoting)';
}

/**
 * The service flags a costing ASSUMED rather than had answered, read off the rule bases it carries — the casting and
 * forging advisors print "[pressure-tight, tolerance class, safety-critical assumed — confirm before quoting]" on the
 * reason every other rule quotes. No route assumes them since Nov 2026 (an engineer is at the screen in every mode); this
 * is the report's backstop for any costing that still carries one (a stored or older analysis, a harness that sets
 * `assumeLeanings`), so the core report lists it as "assumed — confirm" and counts it as an open question.
 */
export const ASSUMED_SERVICE_FLAGS: ReadonlyArray<{ id: string; name: string; question: string; assumed: string }> = [
  { id: PRESSURE_TIGHT_DECISION_ID, name: 'pressure-tight', question: 'Does this part have to hold pressure or be leak-tight?', assumed: 'not leak-tight' },
  { id: TOLERANCE_CLASS_DECISION_ID, name: 'tolerance class', question: 'What tolerance class does the drawing call for?', assumed: 'standard tolerance class' },
  { id: SAFETY_CRITICAL_DECISION_ID, name: 'safety-critical', question: 'Is this part safety-critical or fatigue-loaded?', assumed: 'not safety-critical' },
];
export function assumedServiceFlagsIn(bases: ReadonlyArray<string | null | undefined>): typeof ASSUMED_SERVICE_FLAGS[number][] {
  const names = new Set<string>();
  for (const b of bases) {
    for (const m of String(b ?? '').matchAll(/\[([^\]]*?) assumed — confirm before quoting\]/g)) {
      for (const n of m[1].split(/,\s*/)) names.add(n.trim());
    }
  }
  return ASSUMED_SERVICE_FLAGS.filter(f => names.has(f.name));
}
