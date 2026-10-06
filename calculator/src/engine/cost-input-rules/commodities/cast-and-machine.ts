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
import {
  castMachiningStockMm, nearNetStockCm3, nearNetTurnedAreaCm2, CORED_ABOVE_MM,
} from '../../machining-time.js';
import type { FeatureRow } from '../../feature-ops.js';
import { decided, fmt, type CommodityRuleSpec, type RuleContext, type RuleDef } from '../types.js';
import { CASTING_RULES, castingSubtypeFor } from './casting.js';
import { machiningRuleDefs, nearNetCut } from './machining.js';
// The GRADED facts: the cast weight starts from the same finished mass (the grade's density) the
// finished-weight rule states — it used the family's mid density, 0.7% off on ductile iron.
import { gradedMaterialFacts as materialFacts } from '../derive/grade.js';

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
  'cast-ht-cost': 'cam-ht-cost',
  'cast-shot-blast': 'cam-shot-blast',
  'cast-impreg': 'cam-impreg',
  'cast-ndt': 'cam-ndt',
  'cast-inv-wax': 'cam-inv-wax',
  'cast-inv-shell': 'cam-inv-shell',
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
 * Metal the casting carries for machining.
 *
 * Holes up to DRILLED_FROM_SOLID_MM in a sand, gravity or investment casting are
 * drilled from solid, so their volume was poured and then cut away (HPDC cores
 * its holes). The machined faces and cored bores carry the process's per-side
 * machining stock (`castMachiningStockMm`, ISO 8062-3 RMA typical) — measured
 * from the feature table's face areas and bore walls, which the second casting
 * pass stated as "not measured, not included".
 */
export const DRILLED_FROM_SOLID_MM = 20;

export function drilledStockCm3(ctx: RuleContext): { cm3: number; holes: number } {
  let mm3 = 0; let holes = 0;
  for (const f of ctx.geo.featureTable ?? []) {
    const row = f as { kind?: string; diaMm?: number; depthMm?: number; count?: number };
    if (row.kind !== 'hole' || !row.diaMm || !row.depthMm || row.diaMm > DRILLED_FROM_SOLID_MM) continue;
    const n = row.count ?? 1;
    mm3 += Math.PI * row.diaMm ** 2 / 4 * row.depthMm * n;
    holes += n;
  }
  return { cm3: Math.round(mm3 / 10) / 100, holes };
}

const CAST_WEIGHT_RULE: RuleDef = {
  id: 'castAndMachine.castPartWeightKg',
  path: 'casting.castPartWeightKg',
  fieldId: 'cam-cast-wt',
  label: 'castPartWeightKg',
  evaluate: (ctx) => {
    const mat = materialFacts(ctx);
    if (mat.decision || mat.massKg === null) return decided('castAndMachine.castPartWeightKg', 0, 'rule', 'pending the material answer', 0.1);
    const sub = castingSubtypeFor(ctx);
    const density = mat.massKg / Math.max(1e-9, ctx.geo.volume?.cm3 ?? 0);   // kg / cm³, from the confirmed metal
    const drilled = sub === 'hpdc' || sub === null ? { cm3: 0, holes: 0 } : drilledStockCm3(ctx);
    const stockMm = castMachiningStockMm(sub, mat.family ?? null);
    const faceCm3 = nearNetStockCm3((ctx.geo.featureTable ?? []) as FeatureRow[], stockMm,
      sub === 'hpdc' ? CORED_ABOVE_MM.hpdc : DRILLED_FROM_SOLID_MM);
    // The turned axis (a spindle) is cast with the same stock on its outside: it is poured and paid for.
    const turnedCm2 = nearNetTurnedAreaCm2(ctx.geo.turning, ctx.geo.surfaceArea?.cm2 ?? 0);
    const turnCm3 = Math.round(turnedCm2 * stockMm / 10 * 10) / 10;
    const kg = mat.massKg + (drilled.cm3 + faceCm3 + turnCm3) * density;
    return decided('castAndMachine.castPartWeightKg', Math.round(kg * 1000) / 1000, 'geometry',
      `${fmt(mat.massKg, 3)} kg finished`
      + (drilled.holes > 0 ? ` + ${fmt(drilled.cm3, 1)} cm³ of ${drilled.holes} hole(s) ≤ ${DRILLED_FROM_SOLID_MM} mm drilled from solid`
        : sub === 'hpdc' ? ' (HPDC cores its holes)' : '')
      + ` + ${fmt(faceCm3, 1)} cm³ machining stock (${stockMm} mm a side on the machined faces and cored bores, `
      + `${sub ?? 'casting'} — ISO 8062-3 RMA typical; the drawing's RMA replaces it)`
      + (turnCm3 > 0 ? ` + ${fmt(turnCm3, 1)} cm³ turning stock on the ${fmt(turnedCm2, 0)} cm² spindle (${stockMm} mm a side)` : ''), 0.7);
  },
};

/** The machining half: the shared machining rules, given the casting's near-net cut. */
const NEAR_NET_MACHINING_RULES = machiningRuleDefs(
  (ctx, family) => nearNetCut(ctx, family, castingSubtypeFor(ctx)),
).filter(r => !DROPPED_MACHINING_RULES.has(r.id)).map(repath);

export const CAST_AND_MACHINE_RULES: CommodityRuleSpec = {
  commodity: 'cast_and_machine',
  header: 'CAST + MACHINE COST INPUT RULES:',
  rules: [
    ...CASTING_RULES.rules.map(repath),
    CAST_WEIGHT_RULE,
    ...NEAR_NET_MACHINING_RULES,
  ],
};
