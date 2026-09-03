/**
 * Machining cost inputs, derived from the measured solid.
 *
 * Machining is the commodity where the geometry already did nearly all the work
 * and the model was still in the loop. `cncCycleTimeEstimate` is a bottom-up
 * cutting time off the B-rep; `setupAnalysis` counts the approach directions;
 * `featureTable` lists every hole by diameter, depth and count. The only thing
 * the AI supplied was the *shape of the operation list* — and then
 * `applyCADToForm` rescaled the AI's cycle times so they summed back to the
 * geometry's total. The numbers were already geometry's; the model was being
 * paid in credibility for supplying labels.
 *
 * Two things change relative to the prompt these rules came from:
 *
 * 1. **Stock weight comes from the envelope, not `net x 1.4`.** The browser
 *    assumed every machined part is 40% bigger than its finished self. On a 3 g
 *    servo horn cut from a block that is nowhere near true, and material
 *    utilisation drives the whole raw-material bucket. The bounding box IS the
 *    billet on a from-solid part, so measure it.
 *
 * 2. **The operation list is built from the setup analysis**, one milling
 *    operation per principal direction plus the exact drilling operation the
 *    feature table already produces. The cutting time is apportioned by face
 *    count, so the operations sum to the capped OCCT cycle by construction —
 *    nothing is rescaled after the fact.
 *
 * The cap itself is `physicalRemovalCeilingMin`, reused rather than re-derived:
 * a part cannot carry more cutting time than its stock envelope allows. That
 * guard is what took the servo horn from 50 minutes of cutting to something a
 * 3 g part can physically absorb.
 */
import { physicalRemovalCeilingMin } from '../../feature-costing.js';
import { featureMinutesEach } from '../../feature-machining.js';
import type { FeatureRow } from '../../feature-ops.js';
import { drillingOpFromFeatures } from '../../feature-ops.js';
import type { MachiningOpType } from '../../modules/machining.js';
import type { MaterialFamily } from '../../material-family.js';
import { capNearNetMachiningHr } from '../../near-net-machining.js';
import {
  optimiseMachiningRouting, standardBatchSize, type RoutingChoice,
} from '../../routing-optimiser.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { materialFacts, DENSITY_KG_PER_CM3 } from '../derive/material.js';
import { bboxSortedMm, bboxVolumeCm3 } from '../derive/envelope.js';
import { holeRows } from '../derive/facts.js';

/**
 * Machinability factor — how much longer a metal takes to cut than aluminium.
 * Scales the removal ceiling. Keyed on the family rather than matched out of a
 * material-id string, which is what the browser does today.
 */
const MACHINABILITY: Record<MaterialFamily, number> = {
  aluminium: 1.0,
  magnesium: 0.8,
  plastic: 0.6,
  'copper alloy': 1.1,
  'cast iron': 1.4,
  steel: 1.5,
  titanium: 2.5,
};

/**
 * Utilisation floor.
 *
 * Below this the bounding box is not a billet — it is a moulded or fabricated
 * part that has been routed to machining by mistake, and charging its envelope
 * as solid stock would buy a block of metal nobody cuts. Clamping keeps a
 * mis-route from turning into a five-figure material line.
 */
const MIN_UTILISATION = 0.05;

/** How many distinct approach directions the part needs. */
export function principalDirections(ctx: RuleContext): { count: number; faces: Array<{ directionLabel: string; faceCount: number }> } {
  const dirs = ctx.geo.setupAnalysis?.principalDirections ?? [];
  const count = ctx.geo.setupAnalysis?.estimatedSetupCount ?? dirs.length;
  return { count: Math.max(1, count), faces: dirs };
}

/** Two near-equal footprint dimensions — a turned part. */
export function isAxisymmetric(ctx: RuleContext): boolean {
  const d = bboxSortedMm(ctx);
  return !!d && d[1] > 0 && d[0] / d[1] <= 1.05;
}

/**
 * Solid stock and how much of it survives.
 *
 * The bounding box is the billet. Utilisation is what is left after cutting —
 * clamped at the floor above so a mis-routed part cannot buy an absurd block.
 */
export function stockFacts(
  ctx: RuleContext, family: MaterialFamily, netKg: number,
): { stockKg: number; utilisation: number; basis: string; clamped: boolean } | null {
  const envCm3 = bboxVolumeCm3(ctx);
  if (!envCm3) return null;
  const d = bboxSortedMm(ctx)!;
  const rawStockKg = envCm3 * DENSITY_KG_PER_CM3[family];
  const rawUtil = rawStockKg > 0 ? netKg / rawStockKg : 0;
  const clamped = rawUtil < MIN_UTILISATION;
  const utilisation = clamped ? MIN_UTILISATION : rawUtil;
  const stockKg = Math.round(netKg / utilisation * 1000) / 1000;
  return {
    stockKg,
    utilisation: Math.round(utilisation * 1000) / 1000,
    clamped,
    basis: clamped
      ? `${d[0].toFixed(0)}×${d[1].toFixed(0)}×${d[2].toFixed(0)} mm envelope implies only `
        + `${(rawUtil * 100).toFixed(1)}% utilisation — too low to be a machined billet, so clamped to `
        + `${(MIN_UTILISATION * 100).toFixed(0)}%. Check the commodity.`
      : `${d[0].toFixed(0)}×${d[1].toFixed(0)}×${d[2].toFixed(0)} mm solid billet in ${family} `
        + `= ${fmt(rawStockKg, 3)} kg, of which the part is ${(rawUtil * 100).toFixed(0)}%`,
  };
}

/**
 * Cutting hours, capped to what the stock envelope can physically give up.
 *
 * `physicalRemovalCeilingMin` covers milling and finishing; drilling is discrete
 * and counted separately, so its allowance is added on top before comparing.
 */
export function cuttingHours(
  ctx: RuleContext, family: MaterialFamily,
): { hours: number; capped: boolean; rawHours: number | null; ceilingHr: number | null } {
  // `estimatedTotalHrs` INCLUDES the kernel's setup allowance (setup_count ×
  // 15 min) — and `machining.setupTimeHr` charges setup again, separately. On a
  // 3 g part with 3-6 principal directions that double-count was most of the
  // cycle: the servo horn costed +186% against its manual. Cutting time here is
  // cutting time only; setup is the setup rule's job.
  const est = ctx.geo.cncCycleTimeEstimate;
  const kernelSetupHr = (est?.setupTimeMins ?? 0) / 60;
  const raw = est?.estimatedTotalHrs != null
    ? Math.max(est.estimatedTotalHrs - kernelSetupHr, 0.02)
    : null;
  const partCm3 = ctx.geo.volume?.cm3 ?? 0;
  const stockCm3 = bboxVolumeCm3(ctx) ?? 0;
  if (raw === null || !partCm3 || !stockCm3) {
    return { hours: raw ?? 0, capped: false, rawHours: raw, ceilingHr: null };
  }
  const mf = MACHINABILITY[family];
  // Dia-aware drilling allowance: the feature table knows a Ø2 spot from a
  // Ø37 bore, and a flat 0.4 min/hole billed a 3 g part a third of its cycle
  // for twelve micro-holes. The flat figure survives only when no table exists.
  const holeRows = (ctx.geo.featureTable ?? []).filter(r => r.kind === 'hole');
  const drillMin = holeRows.length
    ? holeRows.reduce((sum, r) => sum + featureMinutesEach(r as FeatureRow) * r.count, 0)
    : (ctx.geo.features?.estimatedHoleCount ?? 0) * 0.4;
  const ceilingHr = (
    physicalRemovalCeilingMin(partCm3, stockCm3, ctx.geo.surfaceArea?.cm2 ?? 0, mf) + drillMin * mf
  ) / 60;
  return raw > ceilingHr
    ? { hours: Math.round(ceilingHr * 10_000) / 10_000, capped: true, rawHours: raw, ceilingHr }
    : { hours: Math.round(raw * 10_000) / 10_000, capped: false, rawHours: raw, ceilingHr };
}

export const MACHINE_ENVELOPE_DECISION_ID = 'machine.oversize';

export interface OperationPlan {
  name: string;
  type: MachiningOpType;
  machineId: string;
  cycleTimeHr: number;
  partsPerCycle: number;
  /** Why this operation exists and where its time came from. */
  basis: string;
  /** The B-rep faces this operation's time is spent on — what the viewer lights up for it. */
  faceIds?: number[];
}

/**
 * The milling/drilling split the plan will cost, hr — shared between the
 * operation plan and the routing decision so both see the same job. For
 * cast+machine the from-solid estimate is first capped to the near-net finish
 * envelope, so the routing is chosen for the machining the part actually needs.
 */
function cuttingSplit(ctx: RuleContext, family: MaterialFamily): { millingHr: number; drillHr: number } {
  const cut = cuttingHours(ctx, family);
  let totalHr = cut.hours;
  if (ctx.commodity === 'cast_and_machine') {
    const mat = materialFacts(ctx);
    if (mat.massKg !== null) totalHr = capNearNetMachiningHr(totalHr, mat.massKg, 'cast_and_machine').machiningHr;
  }
  const holeRows = (ctx.geo.featureTable ?? []).filter(r => r.kind === 'hole');
  const drill = drillingOpFromFeatures(
    ctx.geo.featureTable, ctx.geo.cncCycleTimeEstimate?.drillBoreTimeMins);
  const diaAwareDrillHr = holeRows.length
    ? holeRows.reduce((sum, r) => sum + featureMinutesEach(r as FeatureRow) * r.count, 0) / 60
    : (drill?.cycleTimeHr ?? 0);
  const drillHr = Math.min(diaAwareDrillHr, totalHr * 0.8);
  return { millingHr: totalHr - drillHr, drillHr };
}

/**
 * The machine choice as a COST decision.
 *
 * Ranks the feasible routings — split across cheap 3-axis stations, single-setup
 * 5-axis consolidation, turning-led when axisymmetric — in pounds, under the
 * same setup-amortisation conventions the mapper charges, and returns the
 * cheapest with the losers priced in the basis. This is what retires the report
 * critiquing its own routing: the consolidation question is ANSWERED here,
 * before a single pound is booked.
 */
export function machiningRouting(ctx: RuleContext, family: MaterialFamily): RoutingChoice {
  const split = cuttingSplit(ctx, family);
  return optimiseMachiningRouting({
    millingHr: split.millingHr,
    drillHr: split.drillHr,
    principalDirections: principalDirections(ctx).count,
    axisymmetric: isAxisymmetric(ctx),
    bboxSortedMm: bboxSortedMm(ctx),
    batchSize: standardBatchSize(ctx.annualVolume),
    setupMinsPerSetup: setupMinsPerSetup(ctx),
  });
}

/**
 * The routing.
 *
 * One milling operation per principal direction — that is what a setup IS — with
 * the cutting time split by how much of the part each direction sees, plus the
 * drilling operation the feature table already knows exactly. Labour, OEE and
 * manning are deliberately absent: those are shop and region settings, and the
 * rule engine's remit stops at "how long, on what machine".
 */
export function machiningOperationPlan(
  ctx: RuleContext, family: MaterialFamily,
): OperationPlan[] {
  const cut = cuttingHours(ctx, family);
  const drill = drillingOpFromFeatures(
    ctx.geo.featureTable, ctx.geo.cncCycleTimeEstimate?.drillBoreTimeMins);
  // The drilling op must use the SAME dia-aware minutes the ceiling uses, and
  // must fit inside the capped cycle. It used the kernel's flat 0.5 min/hole:
  // on the servo horn (ten Ø2.5–5 spline holes) that made the drilling op alone
  // 0.083 hr against a 0.061 hr capped total — the ops summed to MORE than the
  // cycle they claim to partition, and the mapper costs the ops. Billed 5.7 min
  // of a 3.7-min job, on a part where time is the whole price.
  const holeRows = (ctx.geo.featureTable ?? []).filter(r => r.kind === 'hole');
  const diaAwareDrillHr = holeRows.length
    ? holeRows.reduce((sum, r) => sum + featureMinutesEach(r as FeatureRow) * r.count, 0) / 60
    : (drill?.cycleTimeHr ?? 0);
  // ≤80% of the cycle: a part that is mostly holes still has to be faced and held.
  const drillHr = Math.min(diaAwareDrillHr, cut.hours * 0.8);
  const millingHr = cut.hours - drillHr;

  const { faces } = principalDirections(ctx);
  const dirFaces = new Map((ctx.geo.setupAnalysis?.principalDirections ?? []).map(d => [d.directionLabel, d.faceIds ?? []]));
  const routing = machiningRouting(ctx, family);
  const machineId = routing.chosen.primaryMachineId;
  const type: MachiningOpType = routing.chosen.label === 'turned' ? 'turning'
    : routing.chosen.label === 'consolidated-5axis' ? 'milling_5ax' : 'milling_3ax';

  const ops: OperationPlan[] = [];
  const totalFaces = faces.reduce((s, f) => s + f.faceCount, 0);
  if (faces.length > 0 && totalFaces > 0) {
    for (const f of faces) {
      const share = f.faceCount / totalFaces;
      ops.push({
        name: `${type === 'turning' ? 'Turning' : 'Milling'} — ${f.directionLabel} (${f.faceCount} faces)`,
        type, machineId,
        cycleTimeHr: Math.round(millingHr * share * 10_000) / 10_000,
        partsPerCycle: 1,
        basis: `${f.faceCount} of ${totalFaces} faces approach from ${f.directionLabel} `
          + `→ ${(share * 100).toFixed(0)}% of ${fmt(millingHr, 3)} hr cutting`,
        faceIds: dirFaces.get(f.directionLabel) ?? [],
      });
    }
  } else {
    ops.push({
      name: type === 'turning' ? 'Turning' : 'Milling',
      type, machineId,
      cycleTimeHr: Math.round(millingHr * 10_000) / 10_000,
      partsPerCycle: 1,
      basis: 'no setup analysis — one operation carrying the whole cutting time',
    });
  }

  if (drill && drillHr > 0) {
    ops.push({
      name: drill.name,
      type: 'drilling',
      machineId: routing.chosen.drillMachineId,
      cycleTimeHr: Math.round(drillHr * 10_000) / 10_000,
      partsPerCycle: 1,
      basis: `${drill.holeCount} holes measured off the B-rep: ${drill.summary}`
        + (routing.chosen.drillMachineId === machineId ? ' — drilled in the same clamping' : ''),
      faceIds: holeRows.flatMap(r => r.faceIds ?? []),
    });
  }
  return ops;
}

interface MachAdvice {
  family: MaterialFamily;
  massBasis: string;
  netKg: number;
  stock: NonNullable<ReturnType<typeof stockFacts>>;
  cut: ReturnType<typeof cuttingHours>;
  ops: OperationPlan[];
  routing: RoutingChoice;
  setups: number;
  machineId: string;
}

function advise(ctx: RuleContext): { advice: MachAdvice } | { blocked: RuleOutcome<never> } {
  const mat = materialFacts(ctx);
  if (mat.decision) return { blocked: ask(mat.decision) };

  const netKg = mat.massKg;
  const stock = netKg === null ? null : stockFacts(ctx, mat.family!, netKg);
  if (netKg === null || !stock) {
    return {
      blocked: ask({
        id: 'machining.envelope', kind: 'geometry_gap',
        question: 'What is the finished weight and the stock size?',
        why: 'No volume or bounding box was measured, so neither the part weight nor '
          + 'the billet it is cut from can be derived — and their ratio is the whole '
          + 'raw-material bucket.',
        options: [{ value: 'enter', label: 'Enter net weight and stock dimensions' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  // A mesh cannot show holes. Ask, rather than costing "zero holes" as if measured.
  const holes = holeRows(ctx);
  if ('decision' in holes) return { blocked: ask(holes.decision) };

  const ops = machiningOperationPlan(ctx, mat.family!);
  const routing = machiningRouting(ctx, mat.family!);
  // No machine in the class holds the part. That used to be a parenthetical in
  // a detail string while the part was costed on the largest machine anyway.
  // It is a decision: accept the largest machine on the record, or name one.
  const oversizeAnswer = ctx.answers[MACHINE_ENVELOPE_DECISION_ID];
  const namedMachine = typeof oversizeAnswer === 'string' && oversizeAnswer.startsWith('mach-') ? oversizeAnswer : null;
  if (routing.chosen.oversize && oversizeAnswer !== 'accept_largest' && !namedMachine) {
    const env = routing.chosen.envelopeMm;
    const bb = bboxSortedMm(ctx);
    return {
      blocked: ask({
        id: MACHINE_ENVELOPE_DECISION_ID, kind: 'machine_envelope',
        question: `The part (${bb ? bb.map(d => d.toFixed(0)).join(' × ') : '?'} mm) does not fit any ${routing.chosen.label} machine in the library. Which machine costs it?`,
        why: `The largest of the class is ${routing.chosen.primaryMachineId}`
          + (env ? ` at ${env.join(' × ')} mm` : '') + '. Costing on a machine that cannot hold the part '
          + 'states a cycle time for an operation the shop cannot perform.',
        options: [
          { value: 'accept_largest', label: `Cost on ${routing.chosen.primaryMachineId} anyway (largest of class)`, consequence: 'The rate of the largest machine is used; the report records that the part exceeds its envelope.' },
          { value: 'enter', label: 'Use a specific machine id from the rate library', consequence: 'Its rate and envelope are used instead.' },
        ],
        entry: { kind: 'text', placeholder: 'mach-…' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }
  return {
    advice: {
      family: mat.family!, massBasis: mat.basis, netKg, stock,
      cut: cuttingHours(ctx, mat.family!),
      ops,
      routing,
      setups: routing.chosen.setups,
      machineId: namedMachine ?? routing.chosen.primaryMachineId,
    },
  };
}

/** Minutes of setup per setup — the kernel's own assumption when it has one. */
function setupMinsPerSetup(ctx: RuleContext): number {
  return ctx.geo.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45;
}

export const MACHINING_RULES: CommodityRuleSpec = {
  commodity: 'machining',
  header: 'MACHINING COST INPUT RULES:',
  rules: [
    {
      id: 'machining.materialId',
      path: 'machining.materialId',
      fieldId: 'mach-mat',
      label: 'materialFamily',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.materialId', r.advice.family, 'engineer', r.advice.massBasis, 1);
      },
    },
    {
      id: 'machining.netWeightKg',
      path: 'machining.netWeightKg',
      fieldId: 'mach-net-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.netWeightKg', r.advice.netKg, 'geometry', r.advice.massBasis, 0.95);
      },
    },
    {
      id: 'machining.stockWeightKg',
      path: 'machining.stockWeightKg',
      fieldId: 'mach-stock-wt',
      label: 'stockWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.stockWeightKg', r.advice.stock.stockKg, 'geometry',
          r.advice.stock.basis, r.advice.stock.clamped ? 0.3 : 0.8);
      },
    },
    {
      id: 'machining.materialUtilization',
      path: 'machining.materialUtilization',
      fieldId: 'mach-mat-util',
      label: 'materialUtilization',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.materialUtilization', r.advice.stock.utilisation, 'geometry',
          r.advice.stock.basis, r.advice.stock.clamped ? 0.3 : 0.8);
      },
    },
    {
      id: 'machining.estimatedCycleTimeHr',
      path: 'machining.estimatedCycleTimeHr',
      label: 'estimatedCycleTimeHr',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const c = r.advice.cut;
        return decided('machining.estimatedCycleTimeHr', c.hours, 'geometry',
          c.capped
            ? `bottom-up B-rep estimate was ${fmt(c.rawHours ?? 0, 3)} hr — more cutting than a `
              + `${fmt(ctx.geo.volume?.cm3 ?? 0, 0)} cm³ part in its envelope can physically give up, `
              + `so capped at ${fmt(c.ceilingHr ?? 0, 3)} hr`
            : `bottom-up B-rep cutting estimate over ${ctx.geo.faces?.total ?? 0} faces`,
          c.capped ? 0.6 : 0.8);
      },
    },
    {
      // Setups follow the CHOSEN routing, not the raw direction count: a 5-axis
      // consolidation collapses four approach directions into one clamping, and
      // charging four setups against a routing that only fixtures once was the
      // exact inconsistency the report used to recommend fixing to its reader.
      // While the material is still unanswered the routing cannot be costed, so
      // the geometry count stands in — the costing is blocked at that point
      // anyway, so only the prompt rendering sees the fallback.
      id: 'machining.setupCount',
      path: 'machining.setupCount',
      label: 'setupCount',
      evaluate: (ctx) => {
        const p = principalDirections(ctx);
        const r = advise(ctx);
        if ('blocked' in r) {
          return decided('machining.setupCount', p.count, 'geometry',
            p.faces.length > 0
              ? `distinct approach directions: ${p.faces.map(f => f.directionLabel).join(', ')}`
              : 'no setup analysis available — assuming a single setup',
            p.faces.length > 0 ? 0.8 : 0.4);
        }
        return decided('machining.setupCount', r.advice.setups, 'advisor',
          `${r.advice.setups} fixturing(s) of the ${r.advice.routing.chosen.label} routing `
          + `(${p.count} approach direction(s) measured)`, 0.8);
      },
    },
    {
      id: 'machining.setupTimeHr',
      path: 'machining.setupTimeHr',
      fieldId: 'mach-setup-time',
      label: 'setupTimeHr',
      evaluate: (ctx) => {
        const p = principalDirections(ctx);
        const mins = setupMinsPerSetup(ctx);
        const r = advise(ctx);
        const setups = 'blocked' in r ? p.count : r.advice.setups;
        return decided('machining.setupTimeHr', Math.round(setups * mins / 60 * 1000) / 1000, 'rule',
          'blocked' in r
            ? `${setups} setup(s) × ${mins} min`
            : `${setups} fixturing(s) of the ${r.advice.routing.chosen.label} routing × ${mins} min`,
          0.7);
      },
    },
    {
      // The machine is a COST decision: the feasible routings are priced and the
      // cheapest wins, with the losers in the basis. See machiningRouting().
      id: 'machining.machineId',
      path: 'machining.machineId',
      fieldId: 'mach-setup-mach',
      label: 'machineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.machineId', r.advice.machineId, 'advisor',
          r.advice.routing.basis, 0.75);
      },
    },
    {
      id: 'machining.operationCount',
      path: 'machining.operationCount',
      label: 'operationCount',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const drilling = r.advice.ops.filter(o => o.type === 'drilling').length;
        return decided('machining.operationCount', r.advice.ops.length, 'geometry',
          `${r.advice.ops.length - drilling} cutting op(s) from the setup analysis`
          + (drilling ? ' + 1 measured drilling op' : ''), 0.75);
      },
    },
    {
      // The routing itself — the STRUCTURED plan, not prose. It was flattened to
      // a summary string for the scalar RuleDef bound, which left the whole
      // operation list AI-owned; the A/B showed the model beating the rules on
      // exactly the fields the rules computed and discarded. The prompt line
      // reproduces the old prose byte for byte via `promptLine`.
      id: 'machining.operations',
      path: 'machining.operations',
      label: 'operations',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const total = r.advice.ops.reduce((s, o) => s + o.cycleTimeHr, 0);
        return decided('machining.operations', r.advice.ops, 'geometry',
          `sums to ${fmt(total, 3)} hr — the capped bottom-up cycle, apportioned by face count`, 0.75);
      },
      promptLine: (outcome) => {
        if (!outcome.ok) {
          const opts = outcome.decision.options.map(o => o.label).join(' | ');
          return `  operations: UNDECIDED — needs "${outcome.decision.question}" (${opts})`;
        }
        const ops = outcome.decided.value as Array<{ name: string; cycleTimeHr: number; machineId: string }>;
        const summary = ops.map(o => `${o.name} ${fmt(o.cycleTimeHr, 3)} hr on ${o.machineId}`).join('; ');
        return `  operations=${summary}  [${outcome.decided.basis} — deterministic, use verbatim]`;
      },
    },
  ],
};
