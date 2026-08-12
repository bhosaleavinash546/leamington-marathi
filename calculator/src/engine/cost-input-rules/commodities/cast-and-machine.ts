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
 * The second thing composition alone gets wrong is the machining time.
 * `cncCycleTimeEstimate` mills every planar face as if the part came from solid
 * billet — right for `machining`, badly wrong here, where a near-net casting
 * only needs its datums trued and its journals and bores finished. That is what
 * charged a 2.8 kg stub axle ~0.9 h of cutting and ~£116 against a realistic
 * ~£30. So the cycle time goes through `capNearNetMachiningHr`, the same ceiling
 * the server holds the AI path to, and the routing is scaled to match it.
 */
import { capNearNetMachiningHr } from '../../near-net-machining.js';
import { decided, fmt, type CommodityRuleSpec, type RuleContext, type RuleDef } from '../types.js';
import { CASTING_RULES } from './casting.js';
import { MACHINING_RULES, cuttingHours, machiningOperationPlan, machiningRouting, principalDirections } from './machining.js';
import { materialFacts } from '../derive/material.js';

/**
 * Where each half's field lands on the combined form.
 *
 * Explicit because the renaming is irregular — see the module header. A rule
 * whose id is absent here keeps no field: it still computes and still shows on
 * the report, it just has no box to fill.
 */
const FIELD_ID_MAP: Record<string, string> = {
  // casting half
  'cast-subtype': 'cam-cast-subtype',
  'cast-yield': 'cam-cast-yield',
  'cast-part-wt': 'cam-cast-wt',
  'cast-hpdc-ct': 'cam-hpdc-ct',
  'cast-hpdc-die-cost': 'cam-hpdc-die-cost',
  'cast-hpdc-die-life': 'cam-hpdc-die-life',
  'cast-hpdc-cav': 'cam-hpdc-cav',
  'cast-sand-ct': 'cam-sand-ct',
  // machining half
  'mach-setup-mach': 'cam-mach-setup-mach',
  'mach-tooling': 'cam-mach-tooling',
  'mach-prog-nre': 'cam-mach-prog-nre',
};

/**
 * Machining rules that do not survive the join.
 *
 * Both halves derive a material family and a weight from the same measured
 * solid, and the casting half owns them: the as-cast weight is the material
 * basis, and a from-solid stock weight is meaningless for a part that arrives
 * near-net. The cycle time and the routing are replaced by capped versions
 * below; the setup rule is replaced so its wording says "datum/fixture".
 */
const DROPPED_MACHINING_RULES = new Set([
  'machining.materialId',
  'machining.netWeightKg',
  'machining.stockWeightKg',
  'machining.materialUtilization',
  'machining.estimatedCycleTimeHr',
  'machining.setupTimeHr',
  'machining.operations',
  'machining.operationCount',
]);

/** Re-label a rule for the combined form. */
function repath(rule: RuleDef): RuleDef {
  return { ...rule, fieldId: rule.fieldId ? FIELD_ID_MAP[rule.fieldId] : undefined };
}

/**
 * Finish-machining hours: the from-solid estimate, capped to the near-net
 * envelope. Exported so a test can show the cap binding on a real part rather
 * than sitting in the code unexercised.
 */
export function finishMachiningHours(ctx: RuleContext): {
  hours: number; capped: boolean; rawHours: number; ceilingHr: number; weightKg: number;
} | null {
  const mat = materialFacts(ctx);
  if (!mat.family || mat.massKg === null) return null;
  const raw = cuttingHours(ctx, mat.family).hours;
  const cap = capNearNetMachiningHr(raw, mat.massKg, 'cast_and_machine');
  return {
    hours: cap.machiningHr,
    capped: cap.capped,
    rawHours: raw,
    ceilingHr: cap.ceilingHr,
    weightKg: mat.massKg,
  };
}

/** The routing for the machining half, scaled to the capped hours. */
export function castAndMachineOperationPlan(ctx: RuleContext) {
  const mat = materialFacts(ctx);
  const f = finishMachiningHours(ctx);
  if (!mat.family || !f) return [];
  const raw = machiningOperationPlan(ctx, mat.family);
  const rawTotal = raw.reduce((s, o) => s + o.cycleTimeHr, 0);
  if (!f.capped || rawTotal <= 0) return raw;
  const scale = f.hours / rawTotal;
  return raw.map(o => ({
    ...o,
    cycleTimeHr: Math.round(o.cycleTimeHr * scale * 10_000) / 10_000,
    basis: `${o.basis}, scaled to the near-net finish envelope`,
  }));
}

const NEAR_NET_CYCLE_RULE: RuleDef = {
  id: 'castAndMachine.machiningCycleTimeHr',
  path: 'machining.estimatedCycleTimeHr',
  label: 'machiningCycleTimeHr',
  evaluate: (ctx) => {
    const f = finishMachiningHours(ctx);
    if (f === null) {
      // The casting half is already asking which metal this is; a second copy of
      // that question here would just be noise.
      return decided('castAndMachine.machiningCycleTimeHr', 0, 'rule',
        'pending the material answer', 0.1);
    }
    return decided('castAndMachine.machiningCycleTimeHr', f.hours, 'geometry',
      f.capped
        ? `from-solid estimate was ${fmt(f.rawHours, 3)} hr; a ${fmt(f.weightKg, 1)} kg near-net `
          + `casting only needs finish machining, so capped to ${fmt(f.ceilingHr, 3)} hr `
          + '(0.10 hr setup + 0.07 hr/kg)'
        : `${fmt(f.hours, 3)} hr, inside the ${fmt(f.ceilingHr, 3)} hr near-net finish envelope`,
      f.capped ? 0.6 : 0.75);
  },
};

const SETUP_RULE: RuleDef = {
  id: 'castAndMachine.machiningSetupTimeHr',
  path: 'machining.setupTimeHr',
  fieldId: 'cam-mach-setup-time',
  label: 'machiningSetupTimeHr',
  evaluate: (ctx) => {
    const p = principalDirections(ctx);
    const mins = ctx.geo.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45;
    // Setups follow the cost-chosen routing (machiningRouting caps the hours to
    // the near-net finish envelope for this commodity before ranking). While the
    // metal is unanswered the direction count stands in — costing is blocked
    // then anyway.
    const mat = materialFacts(ctx);
    const routing = mat.family ? machiningRouting(ctx, mat.family) : null;
    const setups = routing ? routing.chosen.setups : p.count;
    return decided('castAndMachine.machiningSetupTimeHr',
      Math.round(setups * mins / 60 * 1000) / 1000, 'rule',
      routing
        ? `${setups} datum/fixture setup(s) of the ${routing.chosen.label} routing × ${mins} min`
        : `${p.count} datum/fixture setup(s) × ${mins} min`, 0.7);
  },
};

const OPERATIONS_RULE: RuleDef<ReturnType<typeof castAndMachineOperationPlan>> = {
  id: 'castAndMachine.machiningOperations',
  path: 'machining.operations',
  label: 'machiningOperations',
  evaluate: (ctx) => {
    const ops = castAndMachineOperationPlan(ctx);
    if (ops.length === 0) {
      return decided('castAndMachine.machiningOperations', [], 'rule',
        'pending the material answer', 0.1);
    }
    const total = ops.reduce((s, o) => s + o.cycleTimeHr, 0);
    // The VALUE must be the OperationPlan[] — this path maps to
    // `estimatedOperations`, whose every consumer (`applyCADToForm`'s CAM loop,
    // `printCADAnalysisPDF`) `.map()`s an array. The prose join that used to be
    // emitted here crashed both, making cast_and_machine un-costable from CAD
    // in the browser (live audit F7). promptLine below renders the readable
    // summary; the data stays data.
    return decided('castAndMachine.machiningOperations', ops, 'geometry',
      `sums to ${fmt(total, 3)} hr of finish machining`, 0.7);
  },
  promptLine: (outcome) => {
    if (!outcome.ok) return '  machiningOperations: UNDECIDED';
    const ops = outcome.decided.value;
    if (!Array.isArray(ops) || ops.length === 0) return '  machiningOperations: pending the material answer';
    const summary = ops.map(o => `${o.name} ${fmt(o.cycleTimeHr, 3)} hr on ${o.machineId}`).join('; ');
    return `  machiningOperations=${summary}  [${outcome.decided.basis} — deterministic, use verbatim]`;
  },
};

export const CAST_AND_MACHINE_RULES: CommodityRuleSpec = {
  commodity: 'cast_and_machine',
  header: 'CAST + MACHINE COST INPUT RULES:',
  rules: [
    ...CASTING_RULES.rules.map(repath),
    NEAR_NET_CYCLE_RULE,
    SETUP_RULE,
    OPERATIONS_RULE,
    ...MACHINING_RULES.rules.filter(r => !DROPPED_MACHINING_RULES.has(r.id)).map(repath),
  ],
};
