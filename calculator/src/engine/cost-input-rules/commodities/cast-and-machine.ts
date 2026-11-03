/**
 * Cast-and-machine: a casting plus the finish machining that follows it.
 *
 * This module is the composition test for the whole rule design — can two specs
 * written independently be joined without special-casing? Mostly yes, and the
 * "mostly" is worth recording:
 *
 * **The rules compose by concatenation. The form field ids do not.** The
 * cast-and-machine form does not prefix the other two forms' ids; it renames
 * them. `cast-part-wt` becomes `cam-cast-wt`, `cast-hpdc-ct` becomes
 * `cam-hpdc-ct` (dropping `cast-` rather than prefixing it), `mach-mat` becomes
 * `cam-mat`. No mechanical rule covers that, so the map below is explicit. A
 * silent `replace(/^cast-/, 'cam-cast-')` would have produced ids that match
 * nothing on the page and filled a form full of empty fields with no error.
 *
 * The second thing composition alone gets wrong is the machining time. A
 * near-net casting only needs its machined faces trued and its holes drilled or
 * finish-bored. That used to be the from-solid estimate capped to `0.10 h +
 * 0.07 h/kg` — a ceiling that became the value, and disagreed with the casting
 * route's own secondary machining for the same part (PRCR002: £50.10 here,
 * £80.84 there). Since the machining review (Oct 2026) the machining half is
 * the SAME rule set as `machining` (`machiningRuleDefs`) given a near-net cut
 * (`nearNetCut`): the measured faces and holes, at the metal's cutting rate.
 */
import { asCastWeight, costedNearNetRows, DRILLED_FROM_SOLID_MM } from '../../machining-time.js';
import type { FeatureRow } from '../../feature-ops.js';
import { decided, type CommodityRuleSpec, type RuleContext, type RuleDef } from '../types.js';
// The GRADED facts (casting.ts `asCastFacts`): the cast weight starts from the same finished mass (the grade's density)
// the finished-weight rule states — it used the family's mid density, 0.7% off on ductile iron.
import { CASTING_RULES, castingSubtypeFor, asCastFacts, asCastBasis } from './casting.js';
import { machiningRuleDefs, nearNetCut } from './machining.js';

/**
 * Where each half's field lands on the combined form.
 *
 * Explicit because the renaming is irregular — see the module header. A rule
 * whose id is absent here keeps no field: it still computes and still shows on
 * the report, it just has no box to fill.
 */
const FIELD_ID_MAP: Record<string, string> = {
  // casting half
  'cast-mat': 'cam-mat',
  'cast-subtype': 'cam-cast-subtype',
  'cast-yield': 'cam-cast-yield',
  // The STEP is the FINISHED part: its weight is the finished weight. The
  // as-cast weight adds the stock the machining removes (CAST_WEIGHT_RULE).
  'cast-part-wt': 'cam-finish-wt',
  'cast-hpdc-ct': 'cam-hpdc-ct',
  'cast-hpdc-die-cost': 'cam-hpdc-die-cost',
  'cast-hpdc-die-life': 'cam-hpdc-die-life',
  'cast-hpdc-cav': 'cam-hpdc-cav',
  'cast-sand-ct': 'cam-sand-ct',
  'cast-sand-core': 'cam-sand-core',
  'cast-hpdc-mach': 'cam-hpdc-mach',
  'cast-manning': 'cam-cast-manning',
  'cast-leak-sec': 'cam-leak-sec',
  'cast-lab': 'cam-cast-lab',
  'cast-fettle-min': 'cam-fettle-min',
  'cast-fettle-cell-sec': 'cam-fettle-cell-sec',
  'cast-sand-line': 'cam-sand-line',
  'cast-ht-cost': 'cam-ht-cost',
  'cast-shot-blast': 'cam-shot-blast',
  'cast-impreg': 'cam-impreg',
  'cast-ndt': 'cam-ndt',
  'cast-inv-wax': 'cam-inv-wax',
  'cast-inv-shell': 'cam-inv-shell',
  // finish (CAD to COST D4)
  'cast-sf-route': 'cam-sf-route',
  'cast-sf-area': 'cam-sf-area',
  'cast-sf-rack': 'cam-sf-rack',
  'cast-sf-racks': 'cam-sf-racks',
  // machining half
  'mach-setup-mach': 'cam-mach-setup-mach',
  'mach-setup-time': 'cam-mach-setup-time',
  'mach-batch-size': 'cam-mach-batch-size',
  'mach-tooling': 'cam-mach-tooling',
  'mach-prog-nre': 'cam-mach-prog-nre',
  'mach-tool-wear': 'cam-tool-wear',
};

/**
 * Machining rules that do not survive the join.
 *
 * Both halves derive a material family and a weight from the same measured
 * solid, and the casting half owns them: the as-cast weight is the material
 * basis, and a from-solid stock weight is meaningless for a part that arrives
 * near-net. The casting module's reject rate covers the part.
 */
const DROPPED_MACHINING_RULES = new Set([
  'machining.materialId',
  'machining.netWeightKg',
  'machining.stockWeightKg',
  'machining.materialUtilization',
  'machining.rejectRate',
]);

/** Re-label a rule for the combined form. */
function repath(rule: RuleDef): RuleDef {
  return { ...rule, fieldId: rule.fieldId ? FIELD_ID_MAP[rule.fieldId] : undefined };
}

/**
 * Metal the casting carries for machining — `asCastWeight` (machining-time.ts), the ONE function the casting route's
 * secondary machining (headless) and the casting form (the screen) also call (secondary-machining parity, Nov 2026).
 *
 * Holes up to DRILLED_FROM_SOLID_MM in a sand, gravity or investment casting are drilled from solid, so their volume was
 * poured and then cut away (HPDC cores its holes). The machined faces and cored bores carry the process's per-side
 * machining stock (`castMachiningStockMm`, ISO 8062-3 RMA typical) — measured from the feature table's face areas and
 * bore walls, which the second casting pass stated as "not measured, not included".
 */
export { DRILLED_FROM_SOLID_MM };

export function drilledStockCm3(ctx: RuleContext): { cm3: number; holes: number } {
  const a = asCastWeight({ finishedKg: 0, volumeCm3: 1, rows: costedNearNetRows((ctx.geo.featureTable ?? []) as FeatureRow[]),
    subtype: 'sand', family: null });
  return { cm3: a.drilledCm3, holes: a.drilledHoles };
}

/** The as-cast facts / weight / basis live with the casting rules (casting.ts), which size the blast on them too. */
export { asCastFacts, asCastBasis };

/** The as-cast weight, kg (finished + the metal machining removes), or null while the material is unanswered. */
export function asCastWeightKg(ctx: RuleContext): number | null {
  const a = asCastFacts(ctx);
  return a && a.kg > 0 ? a.kg : null;
}

const CAST_WEIGHT_RULE: RuleDef = {
  id: 'castAndMachine.castPartWeightKg',
  path: 'casting.castPartWeightKg',
  fieldId: 'cam-cast-wt',
  label: 'castPartWeightKg',
  evaluate: (ctx) => {
    const a = asCastFacts(ctx);
    if (!a) return decided('castAndMachine.castPartWeightKg', 0, 'rule', 'pending the material answer', 0.1);
    return decided('castAndMachine.castPartWeightKg', a.kg, 'geometry', asCastBasis(a), 0.7);
  },
};

/** The machining half: the shared machining rules, given the casting's near-net cut. */
const NEAR_NET_MACHINING_RULES = machiningRuleDefs(
  (ctx, family) => nearNetCut(ctx, family, castingSubtypeFor(ctx)),
).filter(r => !DROPPED_MACHINING_RULES.has(r.id)).map(repath);

// The casting is blasted as cast — before it is machined — at the AS-CAST weight: the casting rule itself sizes it so
// (casting.shotBlastCostPerPart reads `asCastFacts`), on this route and on the casting route alike. Heat treatment
// charges the as-cast weight in the module (× castPartWeightKg).

export const CAST_AND_MACHINE_RULES: CommodityRuleSpec = {
  commodity: 'cast_and_machine',
  header: 'CAST + MACHINE COST INPUT RULES:',
  rules: [
    ...CASTING_RULES.rules.map(repath),
    CAST_WEIGHT_RULE,
    ...NEAR_NET_MACHINING_RULES,
  ],
};
