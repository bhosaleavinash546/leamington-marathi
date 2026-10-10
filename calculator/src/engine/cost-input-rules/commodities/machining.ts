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
import { activeLabourRate } from '../../rate-context.js';
import type { FeatureRow } from '../../feature-ops.js';
import type { MachiningOpType } from '../../modules/machining.js';
import type { MaterialFamily } from '../../material-family.js';
import {
  stockSize, fromSolidMillingTime, fromBarTurningTime, nearNetMachiningTime, nearNetTurningTime, nearNetTurnedAreaCm2, castMachiningStockMm, deburrInspectMinutes,
  holeMinutes, CORED_ABOVE_MM,
  fixtureCostGBP, programmingHours, toolWearPerPart, cuttingDataFor,
  handlingMinPerFixturing, SETUP_MIN_PER_FIXTURING, PROGRAMMING_HR, type CuttingTime,
} from '../../machining-time.js';
import {
  optimiseMachiningRouting, standardBatchSize, type RoutingChoice,
} from '../../routing-optimiser.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleDef, type RuleOutcome } from '../types.js';
import { holeRows, bRepFaceCount, MESH_DEBURR_FACE_ALLOWANCE } from '../derive/facts.js';
import { materialFacts, DENSITY_KG_PER_CM3, representativeMaterialId } from '../derive/material.js';
import { bboxSortedMm } from '../derive/envelope.js';

/**
 * Utilisation floor.
 *
 * Below this the stock is not a billet — it is a moulded or fabricated part
 * that has been routed to machining by mistake, and charging its envelope as
 * solid stock would buy a block of metal nobody cuts. Clamping keeps a mis-route
 * from turning into a five-figure material line.
 */
const MIN_UTILISATION = 0.05;

/** Shop settings the plan states on every operation (SHOP_DEFAULTS in to-cost-params). */
const MACHINE_OEE = 0.80;
/** One operator tends two machining centres while they cut; load / unload and bench work take a whole operator. */
export const CUTTING_MANNING = 0.5;
/** Machining scrap (first-offs, set-up and dimensional rejects), fraction. */
export const MACHINING_REJECT = 0.02;

/** How many distinct approach directions the part needs. */
export function principalDirections(ctx: RuleContext): { count: number; faces: Array<{ directionLabel: string; faceCount: number }> } {
  const dirs = ctx.geo.setupAnalysis?.principalDirections ?? [];
  const count = ctx.geo.setupAnalysis?.estimatedSetupCount ?? dirs.length;
  return { count: Math.max(1, count), faces: dirs };
}

/** Two near-equal footprint dimensions — a turned disc (the fallback when no turning was measured). */
export function isAxisymmetric(ctx: RuleContext): boolean {
  const d = bboxSortedMm(ctx);
  return !!d && d[1] > 0 && d[0] / d[1] <= 1.05;
}

/**
 * A turned part, measured: most of its surface is one coaxial family of
 * revolved faces and the shoulders square to it (kernel `turning`), and that
 * family's largest diameter fills the part's cross-section. The bounding box
 * alone missed every shaft — a 190 × 40 × 40 mm shaft is not "square" — and
 * costed it as a block on a 5-axis mill.
 */
export const TURNED_FRACTION = 0.6;
export function turnedFacts(ctx: RuleContext): { maxDiaMm: number; lengthMm: number; fraction: number } | null {
  const t = ctx.geo.turning;
  const bb = ctx.geo.boundingBox;
  if (!t || !t.axis || !bb || t.fraction < TURNED_FRACTION) return null;
  const dims = [bb.xMm, bb.yMm, bb.zMm];
  const ax = t.axis.map(Math.abs);
  const i = ax.indexOf(Math.max(...ax));
  const perp = dims.filter((_, k) => k !== i);
  if (t.maxDiaMm < 0.9 * Math.max(...perp)) return null;
  return { maxDiaMm: t.maxDiaMm, lengthMm: dims[i], fraction: t.fraction };
}

/**
 * Bought stock and how much of it survives.
 *
 * Plate or bar in stocked sizes with facing allowance and a saw cut
 * (`stockSize`) — not the finished part's bounding box, which nobody can buy.
 * Utilisation is clamped at the floor above so a mis-routed part cannot buy an
 * absurd block.
 */
export function stockFacts(
  ctx: RuleContext, family: MaterialFamily, netKg: number,
): { stockKg: number; utilisation: number; basis: string; clamped: boolean; stockCm3: number; form: 'plate' | 'bar' } | null {
  const d = bboxSortedMm(ctx);
  if (!d || !(d[2] > 0)) return null;
  const st = stockSize(d, turnedFacts(ctx));
  const rawStockKg = st.cm3 * DENSITY_KG_PER_CM3[family];
  const rawUtil = rawStockKg > 0 ? netKg / rawStockKg : 0;
  const clamped = rawUtil < MIN_UTILISATION;
  const utilisation = clamped ? MIN_UTILISATION : rawUtil;
  const stockKg = Math.round(netKg / utilisation * 1000) / 1000;
  return {
    stockKg, stockCm3: st.cm3, form: st.form,
    utilisation: Math.round(utilisation * 1000) / 1000,
    clamped,
    basis: clamped
      ? `${st.basis} implies only ${(rawUtil * 100).toFixed(1)}% utilisation — too low to be a machined billet, `
        + `so clamped to ${(MIN_UTILISATION * 100).toFixed(0)}%. Check the commodity.`
      : `${st.basis} = ${fmt(st.cm3, 0)} cm³ of ${family}, ${fmt(rawStockKg, 3)} kg, of which the part is ${(rawUtil * 100).toFixed(0)}%`,
  };
}

/** What the part's machining is, before a machine is chosen. */
export interface MachiningCut {
  kind: 'from-solid' | 'near-net';
  /** Machining-centre content (rough + finish + surfacing + tool changes), min. */
  millMin: number;
  /** Drilling content (on the routing's drill machine), min. */
  holeMin: number;
  /** Near-net: the cored bores finish-bored on the machining centre (above `CORED_ABOVE_MM`), min — a bearing bore is
   *  not drilled on a drilling centre (casting 360 review, Oct 2026: the Ø63–75 knuckle bores were "Drilling"). */
  boreMin?: number;
  /** Near-net: holes above this diameter are cored in the casting (`CORED_ABOVE_MM` for the process), mm. */
  coredAboveMm?: number;
  /** Measured turned part: the lathe's content and what it leaves for a mill or drill. */
  turned: { lathe: CuttingTime; secondary: CuttingTime } | null;
  /** Near-net: the outside of the turned axis (a stub axle's spindle), turned on a CNC lathe in its own fixturing. */
  spindle?: CuttingTime | null;
  /** The milling breakdown (from solid) or the face/hole breakdown (near-net). */
  detail: CuttingTime;
  surfaced: boolean;
  /** The kernel's area-rate figure, shown and not used. */
  kernelHr: number | null;
  /** Load / clamp / unload minutes per fixturing, by the weight handled. */
  handlingMin: number;
  /** The weight handled (stock or casting), kg. */
  handledKg: number;
}

const kernelCuttingHr = (ctx: RuleContext): number | null => {
  const est = ctx.geo.cncCycleTimeEstimate;
  return est?.estimatedTotalHrs != null
    ? Math.max(0, est.estimatedTotalHrs - (est.setupTimeMins ?? 0) / 60) : null;
};

/** From-solid cutting content (bar or plate), from the measured part and its stock. */
export function solidCut(ctx: RuleContext, family: MaterialFamily): MachiningCut | null {
  const partCm3 = ctx.geo.volume?.cm3 ?? 0;
  const d = bboxSortedMm(ctx);
  if (!partCm3 || !d) return null;
  const turned = turnedFacts(ctx);
  const stock = stockSize(d, turned);
  const rows = (ctx.geo.featureTable ?? []) as FeatureRow[];
  const totalAreaCm2 = ctx.geo.surfaceArea?.cm2 ?? 0;
  const byType = ctx.geo.faces?.areaByTypeMm2;
  const areaByTypeCm2 = byType ? Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v / 100])) : null;
  const mill = fromSolidMillingTime({
    family, partCm3, stockCm3: stock.cm3, totalAreaCm2,
    planarAreaCm2: (ctx.geo.features?.planarFaceAreaMm2 ?? 0) / 100, areaByTypeCm2, rows,
    freeFormFaceShare: ctx.geo.faces?.total ? (ctx.geo.features?.freeFormFaceCount ?? 0) / ctx.geo.faces.total : undefined,
  });
  const t = turned
    ? fromBarTurningTime({ family, partCm3, stockCm3: stock.cm3, totalAreaCm2, turnedFraction: turned.fraction, rows })
    : null;
  const handledKg = stock.cm3 * DENSITY_KG_PER_CM3[family];
  return {
    kind: 'from-solid', handledKg, handlingMin: handlingMinPerFixturing(handledKg),
    millMin: mill.totalMin - mill.holeMin,
    holeMin: mill.holeMin,
    turned: t ? { lathe: t.lathe, secondary: t.mill } : null,
    detail: mill,
    surfaced: mill.surfacingMin > 0,
    kernelHr: kernelCuttingHr(ctx),
  };
}

/** Near-net (cast) finish machining: the machined faces and the holes, nothing roughed. */
export function nearNetCut(ctx: RuleContext, family: MaterialFamily, subtype: string | null): MachiningCut {
  const rows = (ctx.geo.featureTable ?? []) as FeatureRow[];
  const nn = nearNetMachiningTime(rows, family, subtype);
  const handledKg = (ctx.geo.volume?.cm3 ?? 0) * DENSITY_KG_PER_CM3[family];
  const turnedCm2 = nearNetTurnedAreaCm2(ctx.geo.turning, ctx.geo.surfaceArea?.cm2 ?? 0);
  const spindle = turnedCm2 > 0
    ? nearNetTurningTime(turnedCm2, family, castMachiningStockMm(subtype, family), ctx.geo.turning?.externalMaxDiaMm ?? ctx.geo.turning?.maxDiaMm ?? 0)
    : null;
  // Holes up to the cored size are drilled from solid (drill machine); the cored bores above it are finish-bored on the
  // machining centre — the same minutes nearNetMachiningTime counted, split by where they are cut.
  const cored = CORED_ABOVE_MM[subtype ?? ''] ?? 20;
  const boreMin = Math.round(holeMinutes(rows.filter(r => r.kind === 'hole' && r.diaMm > cored), family, cored) * 100) / 100;
  return {
    kind: 'near-net', handledKg, handlingMin: handlingMinPerFixturing(handledKg), millMin: nn.finishMin + nn.toolChangeMin,
    holeMin: Math.max(0, Math.round((nn.holeMin - boreMin) * 100) / 100), boreMin, coredAboveMm: cored,
    turned: null, spindle, detail: nn, surfaced: false, kernelHr: kernelCuttingHr(ctx),
  };
}

/**
 * Cutting hours — the measured build-up, not the kernel's area rate.
 *
 * Kept under its old name: `hours` is the machine-centre and drilling content
 * (or the lathe's and its secondary's, on a turned part); `rawHours` is the
 * kernel's planar-area figure, reported so the change is visible.
 */
export function cuttingHours(
  ctx: RuleContext, family: MaterialFamily,
): { hours: number; capped: boolean; rawHours: number | null; ceilingHr: number | null; cut: MachiningCut | null } {
  const cut = solidCut(ctx, family);
  if (!cut) {
    const k = kernelCuttingHr(ctx);
    return { hours: k ?? 0, capped: false, rawHours: k, ceilingHr: null, cut: null };
  }
  const routing = routingFor(ctx, cut);
  const hours = routing.chosen.label === 'turned' && cut.turned
    ? (cut.turned.lathe.totalMin + cut.turned.secondary.totalMin) / 60
    : (cut.millMin + cut.holeMin + (cut.boreMin ?? 0)) / 60;
  return { hours: Math.round(hours * 10_000) / 10_000, capped: false, rawHours: cut.kernelHr, ceilingHr: null, cut };
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
  labourId?: string;
  manning?: number;
  oee?: number;
  /** Labour-only bench task (deburr, inspect) — no machine time. */
  benchOperation?: boolean;
}

/**
 * The machine choice as a COST decision.
 *
 * Ranks the feasible routings — split across cheap 3-axis stations, 5-axis
 * consolidation, turned from bar when the part is measured as turned — in
 * pounds, under the same setup-amortisation conventions the mapper charges, and
 * returns the cheapest with the losers priced in the basis.
 */
export function routingFor(ctx: RuleContext, cut: MachiningCut): RoutingChoice {
  return optimiseMachiningRouting({
    millingHr: (cut.millMin + (cut.boreMin ?? 0)) / 60,   // cored bores are bored on the machining centre
    drillHr: cut.holeMin / 60,
    principalDirections: principalDirections(ctx).count,
    axisymmetric: cut.kind === 'from-solid' && !ctx.geo.turning && isAxisymmetric(ctx),
    bboxSortedMm: bboxSortedMm(ctx),
    batchSize: standardBatchSize(ctx.annualVolume),
    setupMinsPerSetup: SETUP_MIN_PER_FIXTURING,
    perPartHandlingMinPerSetup: cut.handlingMin,
    fromSolid: cut.kind === 'from-solid',
    turned: cut.turned ? {
      latheHr: cut.turned.lathe.totalMin / 60,
      millHr: (cut.turned.secondary.finishMin + cut.turned.secondary.toolChangeMin) / 60,
      drillHr: cut.turned.secondary.holeMin / 60,
      chuckings: 2,
    } : null,
  });
}

export function machiningRouting(ctx: RuleContext, family: MaterialFamily): RoutingChoice {
  const cut = solidCut(ctx, family);
  return routingFor(ctx, cut ?? {
    kind: 'from-solid', millMin: (kernelCuttingHr(ctx) ?? 0) * 60, holeMin: 0, turned: null,
    detail: { roughMin: 0, finishMin: 0, surfacingMin: 0, holeMin: 0, tools: 0, toolChangeMin: 0, totalMin: 0, basis: '' },
    surfaced: false, kernelHr: kernelCuttingHr(ctx), handlingMin: 0.8, handledKg: 0,
  });
}

const hr4 = (min: number) => Math.round(min / 60 * 10_000) / 10_000;

/**
 * The operations, from the cut and the chosen routing.
 *
 * Milling: one operation per approach direction (that is what a fixturing IS),
 * the milling minutes split by how many faces each direction sees; drilling on
 * the routing's drill machine. Turned: the lathe operation and whatever the
 * lathe leaves. Then the per-part time every routing pays and the optimiser
 * already ranked with — load / clamp / unload per fixturing — and the bench
 * deburr and gauge check. Every operation states its own crew and OEE so the
 * screen and headless cost the same.
 */
export function buildOperationPlan(ctx: RuleContext, cut: MachiningCut, routing: RoutingChoice): OperationPlan[] {
  const ops: OperationPlan[] = [];
  const machine = { labourId: 'lab-uk-skilled', manning: CUTTING_MANNING, oee: MACHINE_OEE, partsPerCycle: 1 };
  const chosen = routing.chosen;
  const holeRowsAll = ((ctx.geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole');
  const holeIds = holeRowsAll.flatMap(r => r.faceIds ?? []);
  const holeSummary = holeRowsAll.map(r => `${r.count}×Ø${r.diaMm.toFixed(1)}×${r.depthMm.toFixed(0)}`).join(', ');
  const nHoles = holeRowsAll.reduce((s, r) => s + r.count, 0);

  if (chosen.label === 'turned' && cut.turned) {
    const { lathe, secondary } = cut.turned;
    ops.push({ ...machine, name: 'Turning — op 10 / op 20 from bar', type: 'turning', machineId: chosen.primaryMachineId,
      cycleTimeHr: hr4(lathe.totalMin), basis: lathe.basis });
    if (secondary.totalMin > 0) {
      ops.push({ ...machine, name: `Mill / drill after turning${nHoles ? ` — ${nHoles} hole(s)` : ''}`,
        type: secondary.finishMin > 0 ? 'milling_3ax' : 'drilling', machineId: chosen.drillMachineId,
        cycleTimeHr: hr4(secondary.totalMin), basis: secondary.basis, faceIds: holeIds });
    }
  } else {
    const type: MachiningOpType = chosen.label === 'consolidated-5axis' ? 'milling_5ax'
      : chosen.label === 'turned' ? 'turning' : 'milling_3ax';
    const { faces } = principalDirections(ctx);
    const dirFaces = new Map((ctx.geo.setupAnalysis?.principalDirections ?? []).map(d => [d.directionLabel, d.faceIds ?? []]));
    const totalFaces = faces.reduce((s, f) => s + f.faceCount, 0);
    const what = cut.kind === 'near-net' ? 'Finish machining' : type === 'turning' ? 'Turning' : 'Milling';
    if (faces.length > 0 && totalFaces > 0) {
      for (const f of faces) {
        const share = f.faceCount / totalFaces;
        // Near-net: only the measured flats and the holes are cut — "(140 faces)" read as 140 machined faces.
        ops.push({ ...machine, name: cut.kind === 'near-net' ? `${what} — ${f.directionLabel} side` : `${what} — ${f.directionLabel} (${f.faceCount} faces)`, type,
          machineId: chosen.primaryMachineId, cycleTimeHr: hr4(cut.millMin * share),
          basis: `${f.faceCount} of ${totalFaces} faces approach from ${f.directionLabel} → ${(share * 100).toFixed(0)}% of `
            + `${fmt(cut.millMin, 1)} min: ${cut.detail.basis}`,
          faceIds: dirFaces.get(f.directionLabel) ?? [] });
      }
    } else {
      ops.push({ ...machine, name: what, type, machineId: chosen.primaryMachineId, cycleTimeHr: hr4(cut.millMin),
        basis: `no setup analysis — one operation: ${cut.detail.basis}` });
    }
    // Near-net: holes up to the cored size are drilled; the cored bores are finish-bored on the machining centre.
    const coredAbove = cut.coredAboveMm ?? Infinity;
    const boreRows = cut.kind === 'near-net' && (cut.boreMin ?? 0) > 0 ? holeRowsAll.filter(r => r.diaMm > coredAbove) : [];
    const drillRows = holeRowsAll.filter(r => !boreRows.includes(r));
    const summary = (rs: FeatureRow[]) => rs.map(r => `${r.count}×Ø${r.diaMm.toFixed(1)}×${r.depthMm.toFixed(0)}`).join(', ');
    const count = (rs: FeatureRow[]) => rs.reduce((s, r) => s + r.count, 0);
    if (cut.holeMin > 0) {
      const rs = boreRows.length ? drillRows : holeRowsAll;
      ops.push({ ...machine, name: `Drilling — ${count(rs)} holes (${boreRows.length ? summary(rs) : holeSummary}) [geometry-measured]`, type: 'drilling',
        machineId: chosen.drillMachineId, cycleTimeHr: hr4(cut.holeMin),
        basis: `${count(rs)} holes measured off the B-rep, ${fmt(cut.holeMin, 1)} min`
          + (chosen.drillMachineId === chosen.primaryMachineId ? ' — drilled in the same clamping' : ''),
        faceIds: rs.flatMap(r => r.faceIds ?? []) });
    }
    if ((cut.boreMin ?? 0) > 0) {
      ops.push({ ...machine, name: `Finish boring — ${count(boreRows)} cored bore(s) (${summary(boreRows)}) [geometry-measured]`, type: 'milling_3ax',
        machineId: chosen.primaryMachineId, cycleTimeHr: hr4(cut.boreMin!),
        basis: `${count(boreRows)} bore(s) above Ø${coredAbove} mm are cored in the casting and finish-bored on the machining centre `
          + `(not drilled), ${fmt(cut.boreMin!, 1)} min`,
        faceIds: boreRows.flatMap(r => r.faceIds ?? []) });
    }
  }
  // Near-net with a turned axis: the spindle on the CNC lathe, in its own fixture, loaded once.
  if (cut.kind === 'near-net' && cut.spindle) {
    ops.push({ ...machine, name: `Turning — spindle on the CNC lathe (journals, taper, shoulders)`, type: 'turning', machineId: 'mach-lathe-cnc',
      cycleTimeHr: hr4(cut.spindle.totalMin + cut.handlingMin),
      basis: `${cut.spindle.basis}; + ${cut.handlingMin} min to load the casting into the lathe fixture` });
  }
  ops.push({ ...machine, manning: 1, name: `Load / clamp / unload — ${chosen.setups} fixturing(s)`, type: 'milling_3ax',
    machineId: chosen.primaryMachineId, cycleTimeHr: hr4(chosen.setups * cut.handlingMin),
    basis: `${chosen.setups} fixturing(s) × ${cut.handlingMin} min every part to load, clamp and unload `
      + `${fmt(cut.handledKg, 2)} kg — the handling the routing was ranked with` });
  const bRepFaces = bRepFaceCount(ctx);
  const deburr = deburrInspectMinutes(bRepFaces ?? MESH_DEBURR_FACE_ALLOWANCE);
  ops.push({ name: 'Deburr and gauge check (bench)', type: 'milling_3ax', machineId: chosen.primaryMachineId,
    cycleTimeHr: hr4(deburr), partsPerCycle: 1, labourId: 'lab-uk-semiskilled', manning: 1, oee: 1, benchOperation: true,
    basis: bRepFaces === null
      ? `mesh upload — no B-rep faces to count (its triangles are not faces): 0.5 min deburr + 0.004 min × ${MESH_DEBURR_FACE_ALLOWANCE} faces allowed + 0.5 min gauge check = ${fmt(deburr, 2)} min (assumed)`
      : `0.5 min deburr + 0.004 min × ${bRepFaces} B-rep faces of edges + 0.5 min gauge check = ${fmt(deburr, 2)} min` });
  return ops;
}

/** The from-solid operation plan (kept for its callers and tests). */
export function machiningOperationPlan(ctx: RuleContext, family: MaterialFamily): OperationPlan[] {
  const cut = solidCut(ctx, family);
  if (!cut) return [];
  return buildOperationPlan(ctx, cut, routingFor(ctx, cut));
}

/** Cutting minutes a part pays tool wear on (machine operations, not handling or bench). */
export function cuttingMinutesOf(ops: OperationPlan[]): number {
  return ops.filter(o => !o.benchOperation && !o.name.startsWith('Load / clamp')).reduce((s, o) => s + o.cycleTimeHr * 60, 0);
}

/** Fixtures and programming for a plan, £. */
export function machiningNRE(ctx: RuleContext, cut: MachiningCut, routing: RoutingChoice): {
  fixtureGBP: number; fixtureBasis: string; programmingGBP: number; programmingBasis: string;
} {
  const chuckings = routing.chosen.label === 'turned' && cut.turned ? 2 : 0;
  // A near-net spindle is held in its own dedicated lathe fixture (a knuckle cannot go in jaws).
  const lathe = cut.kind === 'near-net' && cut.spindle ? 1 : 0;
  const fx = fixtureCostGBP(Math.max(0, routing.chosen.setups - chuckings) + lathe, chuckings, ctx.annualVolume);
  const rows = (ctx.geo.featureTable ?? []).length;
  const hrs = programmingHours(routing.chosen.setups + lathe, rows, cut.surfaced);
  const rate = activeLabourRate('lab-uk-engineer');   // the costed country's engineer
  return {
    fixtureGBP: fx.gbp, fixtureBasis: fx.basis,
    programmingGBP: Math.round(hrs * rate),
    programmingBasis: `CAM programming and prove-out ${fmt(hrs, 2)} h (${PROGRAMMING_HR.perFixturing} h × ${routing.chosen.setups + lathe} fixturing(s)${lathe ? ' incl. the lathe' : ''} `
      + `+ ${PROGRAMMING_HR.perFeatureRow} h × ${rows} feature group(s)${cut.surfaced ? ` + ${PROGRAMMING_HR.surfacing} h surfacing` : ''}) `
      + `× £${rate.toFixed(2)}/h manufacturing engineer`,
  };
}

interface MachAdvice {
  family: MaterialFamily;
  massBasis: string;
  netKg: number;
  stock: NonNullable<ReturnType<typeof stockFacts>>;
  cut: MachiningCut;
  ops: OperationPlan[];
  routing: RoutingChoice;
  setups: number;
  machineId: string;
  nre: ReturnType<typeof machiningNRE>;
  cuttingMin: number;
}

/** How a commodity's machining content is measured: from solid, or near-net. */
export type CutFor = (ctx: RuleContext, family: MaterialFamily) => MachiningCut | null;

function advise(ctx: RuleContext, cutFor: CutFor): { advice: MachAdvice } | { blocked: RuleOutcome<never> } {
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

  const cut = cutFor(ctx, mat.family!);
  if (!cut) return { blocked: ask({
    id: 'machining.envelope', kind: 'geometry_gap',
    question: 'What is the finished weight and the stock size?',
    why: 'No volume or bounding box was measured.',
    options: [{ value: 'enter', label: 'Enter net weight and stock dimensions' }],
    entry: { kind: 'number' }, blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  }) };
  const routing = routingFor(ctx, cut);
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
  const machineId = namedMachine ?? routing.chosen.primaryMachineId;
  let ops = buildOperationPlan(ctx, cut, routing);
  if (namedMachine) ops = ops.map(o => o.machineId === routing.chosen.primaryMachineId ? { ...o, machineId: namedMachine } : o);
  return {
    advice: {
      family: mat.family!, massBasis: mat.basis, netKg, stock, cut, ops, routing,
      // The lathe fixturing of a near-net spindle is a set-up like any other (change-over, programming, fixture).
      setups: routing.chosen.setups + (cut.kind === 'near-net' && cut.spindle ? 1 : 0), machineId,
      nre: machiningNRE(ctx, cut, routing),
      cuttingMin: cuttingMinutesOf(ops),
    },
  };
}

/**
 * The machining rules, parameterised by how the cut is measured — from solid
 * for `machining`, near-net for the machining half of `cast_and_machine`. One
 * set of rules, so the two commodities cannot drift apart on crew, OEE, batch,
 * fixtures, programming or tool wear.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function machiningRuleDefs(cutFor: CutFor): RuleDef<any>[] {
  const A = (ctx: RuleContext) => advise(ctx, cutFor);
  return [
    {
      id: 'machining.materialId',
      path: 'machining.materialId',
      fieldId: 'mach-mat',
      label: 'materialFamily',
      evaluate: (ctx) => {
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        // The bar / plate GRADE, not the family: the form's drop-down cannot take
        // "steel", so the screen kept its own first steel (1045, £2.89 of
        // material on the shaft) while headless costed the representative EN8
        // (£2.96) — the same gap the sheet-metal and casting reviews closed.
        const id = representativeMaterialId('machining', r.advice.family) ?? r.advice.family;
        return decided('machining.materialId', id, 'engineer',
          `${r.advice.family} → ${id} (representative machining grade — not a drawing callout); ${r.advice.massBasis}`, 1);
      },
    },
    {
      id: 'machining.netWeightKg',
      path: 'machining.netWeightKg',
      fieldId: 'mach-net-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const r = A(ctx);
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
        const r = A(ctx);
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
        const r = A(ctx);
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
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        const machineHr = r.advice.ops.filter(o => !o.benchOperation).reduce((s, o) => s + o.cycleTimeHr, 0);
        const k = r.advice.cut.kernelHr;
        const t = r.advice.routing.chosen.label === 'turned' ? r.advice.cut.turned : null;
        return decided('machining.estimatedCycleTimeHr', Math.round(machineHr * 10_000) / 10_000, 'geometry',
          `${fmt(r.advice.cuttingMin, 1)} min cutting + ${fmt(r.advice.setups * r.advice.cut.handlingMin, 1)} min handling `
          + `(${t ? `${t.lathe.basis}; ${t.secondary.basis}` : r.advice.cut.detail.basis})`
          + (k !== null ? `; the kernel's planar-area rate said ${fmt(k * 60, 1)} min (not used)` : ''),
          0.75);
      },
    },
    {
      // Setups follow the CHOSEN routing, not the raw direction count: a 5-axis
      // consolidation collapses the approach directions into one or two
      // clampings, and charging four setups against a routing that fixtures
      // once was the inconsistency the report used to recommend fixing.
      id: 'machining.setupCount',
      path: 'machining.setupCount',
      label: 'setupCount',
      evaluate: (ctx) => {
        const p = principalDirections(ctx);
        const r = A(ctx);
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
        const r = A(ctx);
        const setups = 'blocked' in r ? p.count : r.advice.setups;
        return decided('machining.setupTimeHr', Math.round(setups * SETUP_MIN_PER_FIXTURING / 60 * 1000) / 1000, 'rule',
          `${setups} fixturing(s)${'blocked' in r ? '' : ` of the ${r.advice.routing.chosen.label} routing`} × `
          + `${SETUP_MIN_PER_FIXTURING} min change-over (fixture swap, tool offsets, first-off inspection) a batch — `
          + 'not the kernel\'s 15 min, which is a per-part allowance', 0.7);
      },
    },
    {
      id: 'machining.batchSize',
      path: 'machining.batchSize',
      fieldId: 'mach-batch-size',
      label: 'batchSize',
      evaluate: (ctx) => decided('machining.batchSize', standardBatchSize(ctx.annualVolume), 'rule',
        `${ctx.annualVolume.toLocaleString('en-GB')}/yr ÷ 20 runs a year, held between 50 and 5,000`, 0.6),
    },
    {
      // The machine is a COST decision: the feasible routings are priced and the
      // cheapest wins, with the losers in the basis. See routingFor().
      id: 'machining.machineId',
      path: 'machining.machineId',
      fieldId: 'mach-setup-mach',
      label: 'machineId',
      evaluate: (ctx) => {
        const r = A(ctx);
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
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        const drilling = r.advice.ops.filter(o => o.type === 'drilling').length;
        return decided('machining.operationCount', r.advice.ops.length, 'geometry',
          `${r.advice.ops.length} operation(s): cutting by approach direction`
          + (drilling ? ', 1 measured drilling op' : '') + ', handling and the bench deburr', 0.75);
      },
    },
    {
      // The routing itself — the STRUCTURED plan. Each operation carries its
      // machine, crew and OEE, so the screen and headless cost it identically.
      id: 'machining.operations',
      path: 'machining.operations',
      label: 'operations',
      evaluate: (ctx) => {
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        const total = r.advice.ops.reduce((s, o) => s + o.cycleTimeHr, 0);
        return decided('machining.operations', r.advice.ops, 'geometry',
          `sums to ${fmt(total, 3)} hr: measured cutting, handling per fixturing, bench deburr`, 0.75);
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
    {
      id: 'machining.rejectRate',
      path: 'machining.rejectRate',
      fieldId: 'mach-reject',
      label: 'rejectRate',
      evaluate: () => decided('machining.rejectRate', MACHINING_REJECT, 'rule',
        `${MACHINING_REJECT * 100}% machining scrap (first-offs and dimensional rejects) — engineering typical, `
        + 'replace with the supplier\'s figure', 0.5),
    },
    {
      id: 'machining.toolingCost',
      path: 'machining.toolingCost',
      fieldId: 'mach-tooling',
      label: 'fixtureCostGBP',
      evaluate: (ctx) => {
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.toolingCost', r.advice.nre.fixtureGBP, 'rule', r.advice.nre.fixtureBasis, 0.5);
      },
    },
    {
      id: 'machining.programmingNRE',
      path: 'machining.programmingNRE',
      fieldId: 'mach-prog-nre',
      label: 'programmingNRE',
      evaluate: (ctx) => {
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('machining.programmingNRE', r.advice.nre.programmingGBP, 'rule', r.advice.nre.programmingBasis, 0.5);
      },
    },
    {
      id: 'machining.toolWearCostPerPart',
      path: 'machining.toolWearCostPerPart',
      fieldId: 'mach-tool-wear',
      label: 'toolWearCostPerPart',
      evaluate: (ctx) => {
        const r = A(ctx);
        if ('blocked' in r) return r.blocked;
        const cd = cuttingDataFor(r.advice.family);
        return decided('machining.toolWearCostPerPart', toolWearPerPart(r.advice.cuttingMin, r.advice.family), 'rule',
          `${fmt(r.advice.cuttingMin, 1)} min of cutting × £${cd.toolCostPerCutMin.toFixed(2)}/min inserts, end mills and drills `
          + `(${r.advice.family}) — not in the machine rate`, 0.5);
      },
    },
  ];
}

export const MACHINING_RULES: CommodityRuleSpec = {
  commodity: 'machining',
  header: 'MACHINING COST INPUT RULES:',
  rules: machiningRuleDefs(solidCut),
};
