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
import { activeLabourRate, activeRates } from '../../rate-context.js';
import type { FeatureRow } from '../../feature-ops.js';
import type { MachiningOpType } from '../../modules/machining.js';
import type { MaterialFamily } from '../../material-family.js';
import {
  stockSize, fromSolidMillingTime, fromBarTurningTime, nearNetMachiningTime, nearNetTurningTime, nearNetTurnedAreaCm2, castMachiningStockMm, deburrInspectMinutes,
  CORED_ABOVE_MM, HOURS_STATUS, CUTTING_DATA_STATUS,
  fixtureCostGBP, programmingHours, toolWearPerPart, cuttingDataFor,
  handlingMinPerFixturing, SETUP_MIN_PER_FIXTURING, PROGRAMMING_HR, turnedPartFacts, type CuttingTime,
  costedNearNetRows, machinedFaceCount, TOOL_CHANGE_SEC, TOOL_CHANGE_STATUS, forgingMachiningStockMm, groupTime, SETUP_STATUS,
} from '../../machining-time.js';
import { rapidMinutes, indexMinutes, NON_CUT_STATUS } from '../../non-cut-time.js';
import {
  optimiseMachiningRouting, standardBatchSize, type RoutingChoice, CUTTING_MANNING, PALLET_CHANGE_SEC, PALLET_CHANGE_SOURCE,
} from '../../routing-optimiser.js';
import { tappedThread } from '../../feature-ops.js';
import { costedOperation, holeWork, isLandRow, LAND_MIN_PER_MM_DIA, type HoleWork } from '../../feature-machining.js';
import { sourcesLine, slitMinutes } from '../../cutting-catalogue.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleDef, type RuleOutcome } from '../types.js';
import { holeRows, bRepFaceCount, MESH_DEBURR_FACE_ALLOWANCE } from '../derive/facts.js';
import { materialFacts, DENSITY_KG_PER_CM3, representativeMaterialId, materialGradeName } from '../derive/material.js';
import { serviceQuestionRules } from '../derive/service-questions.js';
import { castIronDefaultGrade } from '../derive/grade.js';
import { bboxSortedMm } from '../derive/envelope.js';

/**
 * Utilisation floor.
 *
 * Below this the stock is not a billet — it is a moulded or fabricated part
 * that has been routed to machining by mistake, and charging its envelope as
 * solid stock would buy a block of metal nobody cuts. Clamping keeps a mis-route
 * from turning into a five-figure material line.
 */
export const MIN_UTILISATION = 0.05;

/** Shop settings the plan states on every operation (SHOP_DEFAULTS in to-cost-params). */
const MACHINE_OEE = 0.80;
/** …and the labour efficiency the cast + machine mapping gives the plan's operations (SHOP_DEFAULTS.labourEfficiency —
 *  a test holds them equal); the casting / forging secondary machining uses the same (secondary-machining.ts). */
export const MACHINE_LABOUR_EFFICIENCY = 0.92;
/** One operator tends two machining centres while they cut; load / unload and bench work take a whole operator
 *  (defined with the routing optimiser, which ranks the operator with the machine; re-exported for its callers). */
export { CUTTING_MANNING } from '../../routing-optimiser.js';
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
    // 4 dp: at 3 dp the gross the costing buys (net ÷ utilisation) missed the stock weight printed beside it by up to
    // 0.25 % (Part1: 5.599 kg costed v 5.611 kg stated — arith audit, Oct 2026).
    utilisation: Math.round(utilisation * 10_000) / 10_000,
    clamped,
    basis: clamped
      ? `${st.basis} implies only ${(rawUtil * 100).toFixed(1)}% utilisation — too low to be a machined billet, `
        + `so clamped to ${(MIN_UTILISATION * 100).toFixed(0)}%. Check the commodity.`
      : `${st.basis} = ${fmt(st.cm3, 0)} cm³ of ${family}, ${fmt(rawStockKg, 3)} kg, of which the part is ${(rawUtil * 100).toFixed(0)}%`,
  };
}

/** What the part's machining is, before a machine is chosen. */
export interface MachiningCut {
  /** A turned near-net part: its faces are turned with the outside (nearNetCut), so no per-direction milling op. */
  turnedPart?: boolean;
  kind: 'from-solid' | 'near-net';
  /** The metal cut — its catalogue row times the holes the drilling basis itemises. Optional for callers that build a
   *  cut by hand; the plan then reads the steel row, as `cuttingDataFor` does for an unknown family. */
  family?: MaterialFamily;
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
  /** Near-net: the narrow slits (kernel `slits`) cut with a slitting saw on the machining centre, min — cutting + one tool
   *  change (Part1 review phase 3, Nov 2026: the slits were face-milled by their wall area, which a face mill cannot do). */
  slitMin?: number;
  slits?: SlitWork[];
  /** Near-net: the feature rows the cut machines (`costedNearNetRows`) — the drilling, programming and deburr read these,
   *  not every row of the table (a cast-in pocket is not programmed or deburred). Absent: every row (from solid). */
  rows?: FeatureRow[];
  /** Chip-making minutes inside millMin / holeMin / boreMin / slitMin — what tool wear is charged on (PKG-2, CF-20).
   *  Absent (a cut built by hand): the minutes are taken as all cutting. */
  cutOf?: { mill: number; hole: number; bore: number; slit: number };
  /** Rapid travel of each group, mm — added at the rapid of the machine that runs it (non-cut-time.ts, CF-19). */
  rapidOf?: { mill: number; hole: number; bore: number; slit: number };
  /** The per-side stock the near-net passes were taken from, mm, and why. */
  stock?: { mm: number; basis: string };
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
    envelopeMm: d,
  });
  const t = turned
    ? fromBarTurningTime({ family, partCm3, stockCm3: stock.cm3, totalAreaCm2, turnedFraction: turned.fraction, rows, maxDiaMm: turned.maxDiaMm, envelopeMm: d })
    : null;
  const handledKg = stock.cm3 * DENSITY_KG_PER_CM3[family];
  return {
    kind: 'from-solid', family, handledKg, handlingMin: handlingMinPerFixturing(handledKg),
    millMin: mill.totalMin - mill.holeMin,
    holeMin: mill.holeMin,
    cutOf: { mill: mill.groups?.mill?.cutMin ?? 0, hole: mill.groups?.hole?.cutMin ?? 0, bore: 0, slit: 0 },
    rapidOf: { mill: mill.groups?.mill?.rapidMm ?? 0, hole: mill.groups?.hole?.rapidMm ?? 0, bore: 0, slit: 0 },
    turned: t ? { lathe: t.lathe, secondary: t.mill } : null,
    detail: mill,
    surfaced: mill.surfacingMin > 0,
    kernelHr: kernelCuttingHr(ctx),
  };
}

/** What a near-net cut can be told beyond the part: the form's ticks and settings (casting / forging secondary machining). */
export interface NearNetCutOptions {
  /** Per feature-table row: machined or not (the form's ticks). Absent: holes and measured faces (`costedNearNetRows`). */
  includeFlags?: boolean[];
  /** Holes above this Ø are cored / pierced and finish-bored (default `CORED_ABOVE_MM[subtype]`); Infinity drills every hole. */
  coredAboveMm?: number;
  /** Per-side stock on a turned axis, mm (default the casting process's `castMachiningStockMm`). */
  turnStockMm?: number;
  /** Tolerance / finish factor on the milling and drilling CUTTING minutes (the form's field; default 1). */
  finishFactor?: number;
  /** Per-side stock on the machined faces and cored / pierced bores, mm — the passes follow it (PKG-2, CF-06). Default:
   *  the route's own stock (`nearNetFaceStock`). */
  faceStockMm?: number;
}

/**
 * The per-side stock a near-net part's machined faces and cored / pierced bores carry — the route's existing figure, the
 * same one its as-cast / as-forged weight pours (PKG-2, CF-06): a casting's `castMachiningStockMm` (ISO 8062-3 RMA
 * typical by process); a forging's IS 3469 finish stock by its greatest dimension (impression forging) or the open-die
 * figure when every hole is drilled (`coredAboveMm` Infinity).
 */
export function nearNetFaceStock(ctx: RuleContext, family: MaterialFamily, subtype: string | null, coredAboveMm: number): { mm: number; basis: string } {
  if (subtype === 'forging') {
    const bb = ctx.geo.boundingBox;
    return forgingMachiningStockMm(coredAboveMm === Infinity ? 'open-die' : 'closed-die', bb ? Math.max(bb.xMm, bb.yMm, bb.zMm) : null);
  }
  const mm = castMachiningStockMm(subtype, family);
  return { mm, basis: `${mm} mm a side — the casting's machining stock (ISO 8062-3 RMA typical for the process, ${subtype ?? 'gravity'}; an assumption, no drawing input)` };
}

/** Narrow slits of one size, cut by one saw. */
export interface SlitWork { count: number; widthMm: number; depthMm: number; lengthMm: number | null; minEach: number; calc: string; faceIds: number[]; reachShort: boolean }

/**
 * The narrow slits the kernel measured (`geo.slits`), grouped by size, each timed by the slitting-saw row of the cutting
 * catalogue (`slitMinutes`). Empty when the geometry has none (older recorded geometry, a mesh).
 */
export function slitWork(geo: RuleContext['geo'], family: MaterialFamily): SlitWork[] {
  const out: SlitWork[] = [];
  for (const s of geo.slits ?? []) {
    if (!(s.widthMm > 0) || !(s.depthMm > 0)) continue;
    const hit = out.find(w => w.widthMm === s.widthMm && w.depthMm === s.depthMm && w.lengthMm === s.lengthMm);
    const ids = [...s.rootFaceIds, ...s.wallFaceIds];
    if (hit) { hit.count++; hit.faceIds.push(...ids); continue; }
    const t = slitMinutes(family, s);
    out.push({ count: 1, widthMm: s.widthMm, depthMm: s.depthMm, lengthMm: s.lengthMm, minEach: t.min, calc: t.text, faceIds: ids, reachShort: t.reachShort });
  }
  return out;
}

/**
 * Near-net (cast / forged) finish machining: the machined faces and the holes, nothing roughed. ONE cut for the cast +
 * machine route and for the casting and forging routes' secondary machining (`nearNetSecondaryMachining`) — they used to
 * be two models that priced the same 18 features £1.85 apart (secondary-machining parity, Nov 2026).
 */
export function nearNetCut(ctx: RuleContext, family: MaterialFamily, subtype: string | null, opts: NearNetCutOptions = {}): MachiningCut {
  const rows = costedNearNetRows((ctx.geo.featureTable ?? []) as FeatureRow[], opts.includeFlags);
  const cored = opts.coredAboveMm ?? CORED_ABOVE_MM[subtype ?? ''] ?? 20;
  const ff = opts.finishFactor && opts.finishFactor > 0 ? opts.finishFactor : 1;
  const stock = opts.faceStockMm !== undefined
    ? { mm: opts.faceStockMm, basis: `${opts.faceStockMm} mm a side (as given)` }
    : nearNetFaceStock(ctx, family, subtype, cored);
  const env = bboxSortedMm(ctx) ?? undefined;
  // A turned part (hub, flange, pulley): the outside AND the faces are turned on the lathe; a part with a spindle
  // (stub axle) turns the spindle only and mills its faces (pilot rule pack, 30 Oct 2026).
  const tp = turnedPartFacts(ctx.geo);
  const nn = nearNetMachiningTime(rows, family, subtype, { coredAboveMm: cored, finishFactor: ff, stockMm: stock.mm, envelopeMm: env, excludeFaces: !!tp,
    // a datum is set where a cast / forged part is located on its datum targets; a turned part is chucked on its turned faces
    probes: tp ? 0 : 1 });
  const handledKg = (ctx.geo.volume?.cm3 ?? 0) * DENSITY_KG_PER_CM3[family];
  const facedCm2 = rows.filter(r => r.kind === 'face').reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  const turnedCm2 = tp ? tp.externalCm2 + facedCm2 : nearNetTurnedAreaCm2(ctx.geo.turning, ctx.geo.surfaceArea?.cm2 ?? 0);
  const spindle = turnedCm2 > 0
    ? nearNetTurningTime(turnedCm2, family, opts.turnStockMm ?? castMachiningStockMm(subtype, family), ctx.geo.turning?.externalMaxDiaMm ?? ctx.geo.turning?.maxDiaMm ?? 0)
    : null;
  // Holes up to the cored size are drilled from solid (drill machine); the cored bores above it are bored on the
  // machining centre. A stepped bore goes where its largest step is cut: bored when a step is above the cored size.
  const g = nn.groups;
  // Narrow slits: one slitting saw, one approach a slit, one tool change for the operation.
  const slits = slitWork(ctx.geo, family);
  const slitCut = slits.reduce((s, w) => s + w.minEach * w.count, 0) * ff;
  const slitG = slits.length ? groupTime(slitCut, 0, slits.flatMap(w => Array.from({ length: w.count }, () => ({ tool: 'slitting saw', feedInMin: 0 }))), env) : null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    kind: 'near-net', family, handledKg, handlingMin: handlingMinPerFixturing(handledKg),
    millMin: r2(g.mill.min), holeMin: r2(g.hole.min), boreMin: r2(g.bore.min), coredAboveMm: cored,
    cutOf: { mill: g.mill.cutMin, hole: g.hole.cutMin, bore: g.bore.cutMin, slit: slitG?.cutMin ?? 0 },
    rapidOf: { mill: g.mill.rapidMm, hole: g.hole.rapidMm, bore: g.bore.rapidMm, slit: slitG?.rapidMm ?? 0 },
    stock,
    turned: null, spindle, turnedPart: !!tp, detail: nn, surfaced: false, kernelHr: kernelCuttingHr(ctx), rows,
    ...(slits.length ? { slits, slitMin: r2(slitG!.min) } : {}),
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
  /** Chip-making minutes inside the cycle — tool wear is charged on these only (PKG-2, CF-20). Absent on handling,
   *  pallet change and bench operations (0). */
  cuttingMin?: number;
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
    millingHr: (cut.millMin + (cut.boreMin ?? 0) + (cut.slitMin ?? 0)) / 60,   // cored bores and slits are cut on the machining centre
    drillHr: cut.holeMin / 60,
    principalDirections: cut.turnedPart ? 1 : principalDirections(ctx).count,
    axisymmetric: cut.kind === 'from-solid' && !ctx.geo.turning && isAxisymmetric(ctx),
    bboxSortedMm: bboxSortedMm(ctx),
    batchSize: standardBatchSize(ctx.annualVolume),
    setupMinsPerSetup: SETUP_MIN_PER_FIXTURING,
    perPartHandlingMinPerSetup: cut.handlingMin,
    fromSolid: cut.kind === 'from-solid',
    turned: cut.turned ? {
      latheHr: cut.turned.lathe.totalMin / 60,
      millHr: (cut.turned.secondary.groups?.mill?.min ?? cut.turned.secondary.finishMin + cut.turned.secondary.toolChangeMin) / 60,
      drillHr: (cut.turned.secondary.groups?.hole?.min ?? cut.turned.secondary.holeMin) / 60,
      chuckings: 2,
    } : null,
    // the non-cutting rapids, priced by each candidate at its own machine's sourced rapid (PKG-2, CF-19)
    rapidMm: {
      mill: (cut.rapidOf?.mill ?? 0) + (cut.rapidOf?.bore ?? 0) + (cut.rapidOf?.slit ?? 0),
      drill: cut.rapidOf?.hole ?? 0,
      ...(cut.turned ? { lathe: cut.turned.lathe.rapidMm, turnedSecondary: cut.turned.secondary.rapidMm } : {}),
    },
    annualVolume: ctx.annualVolume,
    // A turned near-net part (hub flange) is turned on the lathe and drilled — never the HMC cell (pilot rule pack): the
    // casting / forging feature path held it so, and it is now the same plan (secondary-machining parity, Nov 2026).
    ...(cut.turnedPart ? { noVolumeCell: true } : {}),
  });
}

export function machiningRouting(ctx: RuleContext, family: MaterialFamily): RoutingChoice {
  const cut = solidCut(ctx, family);
  return routingFor(ctx, cut ?? {
    kind: 'from-solid', millMin: (kernelCuttingHr(ctx) ?? 0) * 60, holeMin: 0, turned: null,
    detail: { roughMin: 0, finishMin: 0, surfacingMin: 0, holeMin: 0, tools: 0, toolChangeMin: 0, totalMin: 0, cutMin: 0, nonCutMin: 0, rapidMm: 0, basis: '' },
    surfaced: false, kernelHr: kernelCuttingHr(ctx), handlingMin: 0.8, handledKg: 0,
  });
}

const hr4 = (min: number) => Math.round(min / 60 * 10_000) / 10_000;
const isLand = (r: FeatureRow) => isLandRow(r);

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
  const holeRowsAll = (cut.rows ?? (ctx.geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole');
  const holeIds = holeRowsAll.flatMap(r => r.faceIds ?? []);
  const nHoles = holeRowsAll.reduce((s, r) => s + r.count, 0);

  if (chosen.label === 'turned' && cut.turned) {
    const { lathe, secondary } = cut.turned;
    const lr = rapidMinutes(lathe.rapidMm, chosen.primaryMachineId);
    ops.push({ ...machine, name: 'Turning — op 10 / op 20 from bar', type: 'turning', machineId: chosen.primaryMachineId,
      cycleTimeHr: hr4(lathe.totalMin + lr.min), cuttingMin: lathe.cutMin, basis: `${lathe.basis}; rapids ${lr.text}` });
    if (secondary.totalMin > 0) {
      const sr = rapidMinutes(secondary.rapidMm, chosen.drillMachineId);
      ops.push({ ...machine, name: `Mill / drill after turning${nHoles ? ` — ${nHoles} hole(s)` : ''}`,
        type: secondary.finishMin > 0 ? 'milling_3ax' : 'drilling', machineId: chosen.drillMachineId,
        cycleTimeHr: hr4(secondary.totalMin + sr.min), cuttingMin: secondary.cutMin, basis: `${secondary.basis}; rapids ${sr.text}`, faceIds: holeIds });
    }
  } else {
    const type: MachiningOpType = chosen.label === 'consolidated-5axis' ? 'milling_5ax'
      : chosen.label === 'turned' ? 'turning' : 'milling_3ax';
    const { faces } = principalDirections(ctx);
    const dirFaces = new Map((ctx.geo.setupAnalysis?.principalDirections ?? []).map(d => [d.directionLabel, d.faceIds ?? []]));
    const totalFaces = faces.reduce((s, f) => s + f.faceCount, 0);
    const what = cut.kind === 'near-net' ? 'Finish machining' : type === 'turning' ? 'Turning' : 'Milling';
    // The milling content at its machine: + the rapids at the machine's sourced rapid, + the indexes between the sides of
    // a clamping on the HMC cell / 5-axis (PKG-2, CF-19). Cutting minutes are carried for tool wear (CF-20).
    const mr = rapidMinutes(cut.rapidOf?.mill ?? 0, chosen.primaryMachineId);
    const ix = indexMinutes(cut.millMin > 0 ? chosen.indexes ?? 0 : 0, chosen.primaryMachineId);
    const millTotal = cut.millMin + mr.min + ix.min;
    const millCut = cut.cutOf?.mill ?? cut.millMin;
    const nonCutText = `${fmt(millCut, 2)} min cutting; non-cutting at the machine: rapids ${mr.text}${ix.text ? `; ${ix.text}` : ''}`;
    if (cut.millMin <= 0) {
      // nothing milled (a turned part's faces are on the lathe) — no per-direction operation
    } else if (faces.length > 0 && totalFaces > 0) {
      for (const f of faces) {
        const share = f.faceCount / totalFaces;
        // Near-net: only the measured flats and the holes are cut — "(140 faces)" read as 140 machined faces.
        ops.push({ ...machine, name: cut.kind === 'near-net' ? `${what} — ${f.directionLabel} side` : `${what} — ${f.directionLabel} (${f.faceCount} faces)`, type,
          machineId: chosen.primaryMachineId, cycleTimeHr: hr4(millTotal * share), cuttingMin: millCut * share,
          basis: `${f.faceCount} of ${totalFaces} faces approach from ${f.directionLabel} → ${(share * 100).toFixed(0)}% of `
            + `${fmt(millTotal, 2)} min (${nonCutText}): ${cut.detail.basis}`,
          faceIds: dirFaces.get(f.directionLabel) ?? [] });
      }
    } else {
      ops.push({ ...machine, name: what, type, machineId: chosen.primaryMachineId, cycleTimeHr: hr4(millTotal), cuttingMin: millCut,
        basis: `no setup analysis — one operation, ${fmt(millTotal, 2)} min (${nonCutText}): ${cut.detail.basis}` });
    }
    // Near-net: holes up to the cored size are drilled; the cored bores are finish-bored on the machining centre. Coaxial
    // steps of one bore (counterbores, lands, grooves) are ONE piece of work with one approach (holeWork, fresh review
    // 4 Nov 2026 — the stub axle's two stepped kingpin bores were "10 cored bores").
    const coredAbove = cut.coredAboveMm ?? Infinity;
    const fam = cut.family ?? 'steel';
    const work = holeWork(holeRowsAll, fam, cut.coredAboveMm, cut.kind === 'near-net' ? cut.stock?.mm : undefined);
    const boreWork = cut.kind === 'near-net' && (cut.boreMin ?? 0) > 0 ? work.filter(w => w.bored) : [];
    const drillWork = work.filter(w => !boreWork.includes(w));
    const summary = (ws: HoleWork[]) => ws.map(w => `${w.count}×${w.kind === 'stepped' ? ` ${w.label}` : w.label}`).join(', ');
    const count = (ws: HoleWork[]) => ws.reduce((s, w) => s + w.count, 0);
    // The arithmetic behind the drilling minutes, piece by piece (arith audit, Oct 2026: the basis printed only the total,
    // and an inferred tapping — a hole at a tapping-drill size, ≥ 1.5 Ø deep — was charged without being stated).
    const perRow = (ws: HoleWork[]) => ws.map(w => {
      if (w.kind === 'stepped') return `${w.count}× ${w.label}: ${w.calc}`;
      const r = holeRowsAll[w.rowIndexes[0]];
      const tap = tappedThread(r);
      const what = tap ? `drill + tap ${tap} (inferred from the tapping-drill size)`
        : isLand(r) ? 'land, spot-faced (shallower than ¼ Ø — not a drilled hole)'
        : cut.coredAboveMm !== undefined && r.diaMm > cut.coredAboveMm ? 'cored, finish-bored'
        : costedOperation(r).toLowerCase();
      return `${w.count}×${w.label} ${what}: ${w.calc}`;
    }).join('; ');
    const stepNote = (ws: HoleWork[]) => ws.some(w => w.kind === 'stepped')
      ? 'a stepped bore — coaxial steps that touch along one axis — is one tool and one approach a step Ø, a land cut by the step beside it; ' : '';
    // the drilling and boring tool changes and rapids, as the cut timed them (non-cut-time.ts)
    const groups = cut.detail.groups;
    const nonCutLine = (g: { text: string } | undefined) => (g?.text ? `non-cutting: ${g.text}; ` : '');
    if (cut.holeMin > 0) {
      const ws = boreWork.length ? drillWork : work;
      const hr = rapidMinutes(cut.rapidOf?.hole ?? 0, chosen.drillMachineId);
      const total = cut.holeMin + hr.min;
      ops.push({ ...machine, name: `Drilling — ${count(ws)} holes (${summary(ws)}) [geometry-measured]`, type: 'drilling',
        machineId: chosen.drillMachineId, cycleTimeHr: hr4(total), cuttingMin: cut.cutOf?.hole ?? cut.holeMin,
        basis: `${count(ws)} holes measured off the B-rep, ${fmt(total, 2)} min (${fmt(cut.cutOf?.hole ?? cut.holeMin, 2)} min cutting): ${perRow(ws)} `
          + `(drilled at each hole's own Ø, n·f; a boring pass on blind Ø13–26 only — a through hole is a clearance hole, not reamed; `
          + `peck only beyond 5×D; helical mill above Ø26; tap in and out at n × pitch; ${stepNote(ws)}a cylinder shallower than ¼ Ø is a land, `
          + `not a hole; ${nonCutLine(groups?.hole)}rapids ${hr.text}; ${NON_CUT_STATUS}; sources — ${sourcesLine(fam, ['drill', 'bore', 'tap'])}; ${CUTTING_DATA_STATUS})`
          + (chosen.drillMachineId === chosen.primaryMachineId ? ' — drilled in the same clamping' : ''),
        faceIds: ws.flatMap(w => w.faceIds) });
    }
    if ((cut.boreMin ?? 0) > 0) {
      const nStepped = boreWork.filter(w => w.kind === 'stepped').reduce((s, w) => s + w.count, 0);
      const br = rapidMinutes(cut.rapidOf?.bore ?? 0, chosen.primaryMachineId);
      const total = cut.boreMin! + br.min;
      ops.push({ ...machine, name: `Finish boring — ${count(boreWork)} cored bore(s)${nStepped ? `, ${nStepped} stepped` : ''} (${summary(boreWork)}) [geometry-measured]`, type: 'milling_3ax',
        machineId: chosen.primaryMachineId, cycleTimeHr: hr4(total), cuttingMin: cut.cutOf?.bore ?? cut.boreMin!,
        basis: `${count(boreWork)} bore(s) above Ø${coredAbove} mm are cored / pierced in the near-net part and bored on the machining centre `
          + `(not drilled), ${fmt(total, 2)} min (${fmt(cut.cutOf?.bore ?? cut.boreMin!, 2)} min cutting): ${perRow(boreWork)} (rough passes from the `
          + `${cut.stock ? `${cut.stock.mm} mm a side of stock (${cut.stock.basis})` : 'stock'} at the turning rough row, then one finish pass at the boring row; `
          + `${stepNote(boreWork)}a land shallower than ¼ Ø is skimmed at ${LAND_MIN_PER_MM_DIA} min/mm Ø; ${nonCutLine(groups?.bore)}rapids ${br.text}; ${NON_CUT_STATUS}; `
          + `sources — ${sourcesLine(fam, ['bore', 'bore-rough'])}; ${CUTTING_DATA_STATUS})`,
        faceIds: boreWork.flatMap(w => w.faceIds) });
    }
    if ((cut.slitMin ?? 0) > 0 && cut.slits?.length) {
      const sl = cut.slits;
      const n = sl.reduce((s, w) => s + w.count, 0);
      const sr = rapidMinutes(cut.rapidOf?.slit ?? 0, chosen.primaryMachineId);
      const total = cut.slitMin! + sr.min;
      ops.push({ ...machine, name: `Slitting — ${n} narrow slit${n === 1 ? '' : 's'} (${sl.map(w => `${w.count}× ${fmt(w.widthMm, 1)} wide × ${fmt(w.depthMm, 1)} deep${w.lengthMm != null ? ` × ${fmt(w.lengthMm, 1)} long` : ''}`).join(', ')}) [geometry-measured]`,
        type: 'milling_3ax', machineId: chosen.primaryMachineId, cycleTimeHr: hr4(total), cuttingMin: cut.cutOf?.slit ?? cut.slitMin!,
        basis: `${n} slit(s) measured off the B-rep (two facing walls ${sl.map(w => fmt(w.widthMm, 2)).join(' / ')} mm apart closed by a half-round root), `
          + `cut with a slitting saw on an arbor, one approach a slit, ${fmt(total, 2)} min: `
          + sl.map(w => `${w.count}× ${w.calc}`).join('; ')
          + ` + 1 tool change × ${TOOL_CHANGE_SEC} s (${TOOL_CHANGE_STATUS}); rapids ${sr.text}`
          + (sl.some(w => w.reachShort) ? '; the slit is longer than the largest listed saw reaches — costed on it, confirm the cutter' : '')
          + `; the slit walls are not face-milled (sources — ${sourcesLine(fam, ['slit'])}; ${CUTTING_DATA_STATUS})`,
        faceIds: sl.flatMap(w => w.faceIds) });
    }
  }
  // Near-net with a turned axis: the spindle on the CNC lathe, in its own fixture, loaded once.
  if (cut.kind === 'near-net' && cut.spindle) {
    const sr = rapidMinutes(cut.spindle.rapidMm, 'mach-lathe-cnc');
    ops.push({ ...machine, name: cut.turnedPart ? 'Turning — outside and faces on the CNC lathe, op 10 / op 20' : `Turning — spindle on the CNC lathe (journals, taper, shoulders)`, type: 'turning', machineId: 'mach-lathe-cnc',
      cycleTimeHr: hr4(cut.spindle.totalMin + sr.min), cuttingMin: cut.spindle.cutMin, basis: `${cut.spindle.basis}; rapids ${sr.text}` });
    // The load is its own operation: a whole operator while the lathe stands (it rode in the turning op at the cutting
    // crew of 0.5, and paid tool wear on the handling minutes — arith audit, Oct 2026).
    ops.push({ ...machine, manning: 1, name: 'Load / clamp / unload — lathe fixture, 1 fixturing', type: 'turning', machineId: 'mach-lathe-cnc',
      cycleTimeHr: hr4(cut.handlingMin),
      basis: `1 fixturing × ${cut.handlingMin} min to load, clamp and unload ${fmt(cut.handledKg, 2)} kg in the lathe fixture — a whole operator, the lathe stands (${HOURS_STATUS})` });
  }
  if (chosen.masked) {
    // A twin-pallet cell: the spindle pays only the pallet change; the operator loads the other pallet while it cuts.
    ops.push({ ...machine, name: `Pallet change — ${chosen.setups} fixturing(s)`, type: 'milling_3ax',
      machineId: chosen.primaryMachineId, cycleTimeHr: hr4(chosen.setups * PALLET_CHANGE_SEC / 60),
      basis: `${chosen.setups} fixturing(s) × ${PALLET_CHANGE_SEC} s pallet change on the twin-pallet HMC (${PALLET_CHANGE_SOURCE}) — the only machine time the handling costs` });
    // The operator already pays CUTTING_MANNING of the cut (one operator tends two cells) and loads the other pallet IN
    // that time: only the load the cut cannot cover is charged again (arithmetic audit machining M4 — the pilot pack
    // charged the whole load on top, 1.11 operators on two machines).
    const loadMin = chosen.setups * cut.handlingMin;
    const coveredMin = CUTTING_MANNING * spindleMinutesOf(ops);
    const extraMin = Math.max(0, loadMin - coveredMin);
    if (extraMin > 0) ops.push({ name: `Load / unload on the pallet while the spindle cuts — ${chosen.setups} fixturing(s)`, type: 'milling_3ax',
      machineId: chosen.primaryMachineId, cycleTimeHr: hr4(extraMin), partsPerCycle: 1,
      labourId: 'lab-uk-skilled', manning: 1, oee: 1, benchOperation: true,
      basis: `${chosen.setups} fixturing(s) × ${cut.handlingMin} min = ${fmt(loadMin, 2)} min to load, clamp (hydraulic fixture) and unload `
        + `${fmt(cut.handledKg, 2)} kg on the second pallet, while the spindle cuts; the operator's ${CUTTING_MANNING} share of the `
        + `${fmt(spindleMinutesOf(ops), 1)} min spindle cycle (${fmt(coveredMin, 2)} min) already pays for it`
        + (extraMin > 0 ? ` — the ${fmt(extraMin, 2)} min it does not cover is charged here` : ' — nothing more to charge')
        + ` (${HOURS_STATUS})` });
  } else {
    ops.push({ ...machine, manning: 1, name: `Load / clamp / unload — ${chosen.setups} fixturing(s)`, type: 'milling_3ax',
      machineId: chosen.primaryMachineId, cycleTimeHr: hr4(chosen.setups * cut.handlingMin),
      basis: `${chosen.setups} fixturing(s) × ${cut.handlingMin} min every part to load, clamp and unload `
        + `${fmt(cut.handledKg, 2)} kg — the handling the routing was ranked with (by weight: ≤ 0.5 kg 0.3, ≤ 5 kg 0.6, ≤ 20 kg 1.2, else 2.5 min; ${HOURS_STATUS})` });
  }
  // The deburr counts the faces the costing MACHINES: every face of a part cut from solid; on a near-net part only the
  // faces of its costed features — an as-cast / as-forged face leaves no machined edge (it read all 230 B-rep faces of a
  // bracket that machines 28; secondary-machining parity, Nov 2026).
  const bRepFaces = bRepFaceCount(ctx);
  const machinedFaces = cut.kind === 'near-net' && cut.rows && bRepFaces !== null
    ? machinedFaceCount(cut.rows) + new Set((cut.slits ?? []).flatMap(w => w.faceIds)).size : null;
  const deburr = deburrInspectMinutes(machinedFaces ?? bRepFaces ?? MESH_DEBURR_FACE_ALLOWANCE);
  ops.push({ name: 'Deburr and gauge check (bench)', type: 'milling_3ax', machineId: chosen.primaryMachineId,
    cycleTimeHr: hr4(deburr), partsPerCycle: 1, labourId: 'lab-uk-semiskilled', manning: 1, oee: 1, benchOperation: true,
    basis: bRepFaces === null
      ? `mesh upload — no B-rep faces to count (its triangles are not faces): 0.5 min deburr + 0.004 min × ${MESH_DEBURR_FACE_ALLOWANCE} faces allowed + 0.5 min gauge check = ${fmt(deburr, 2)} min (assumed)`
      : machinedFaces !== null
        ? `0.5 min deburr + 0.004 min × ${machinedFaces} machined faces (the B-rep faces of the costed features — the near-net faces left as made carry no machined edge) `
          + `+ 0.5 min gauge check = ${fmt(deburr, 2)} min (engineering-typical, not sourced)`
        : `0.5 min deburr + 0.004 min × ${bRepFaces} B-rep faces of edges (a part cut from solid is machined all over) + 0.5 min gauge check = ${fmt(deburr, 2)} min (engineering-typical, not sourced)` });
  return ops;
}

/** The from-solid operation plan (kept for its callers and tests). */
export function machiningOperationPlan(ctx: RuleContext, family: MaterialFamily): OperationPlan[] {
  const cut = solidCut(ctx, family);
  if (!cut) return [];
  return buildOperationPlan(ctx, cut, routingFor(ctx, cut));
}

const isSpindleOp = (o: OperationPlan) => !o.benchOperation && !o.name.startsWith('Load / clamp') && !o.name.startsWith('Pallet change');
/** Minutes the spindle runs a part — cutting AND its non-cutting time (machine operations, not handling, pallet change or
 *  bench): what the operator's share covers a masked load with. */
export function spindleMinutesOf(ops: OperationPlan[]): number {
  return ops.filter(isSpindleOp).reduce((s, o) => s + o.cycleTimeHr * 60, 0);
}
/** CUTTING minutes a part pays tool wear on — chip-making only, never the rapids, tool changes, feed-in or probing
 *  (PKG-2, CF-20). An operation without `cuttingMin` (built by hand) counts its cycle. */
export function cuttingMinutesOf(ops: OperationPlan[]): number {
  return ops.filter(isSpindleOp).reduce((s, o) => s + (o.cuttingMin ?? o.cycleTimeHr * 60), 0);
}

/**
 * How many machines the part keeps busy at this volume — the capacity the report prints (executive-summary.ts
 * `capacityImplied`): annual × cycle ÷ parts a cycle ÷ OEE, summed over the plan's operations on the machine, plus the
 * amortised change-over (fixturings × 45 min ÷ the batch, OEE 1), ÷ that machine's own annual available hours in the
 * costed book. Each machine running the part carries its own set of the fixturings' fixtures (Part1 review, Nov 2026:
 * one set of 4 fixtures was costed for the 5 VF-2s the capacity table implied). Rounded UP: 5.03 machines is 6.
 * Unknown hours or no volume → one machine, said so.
 */
export function machineSetsFor(ops: ReadonlyArray<Pick<OperationPlan, 'machineId' | 'cycleTimeHr' | 'partsPerCycle' | 'oee' | 'benchOperation'>>,
  machineId: string, annualVolume: number, setups: number): { sets: number; hours: number; availableHours: number | null; machineClass: string; basis: string } {
  const m = activeRates().machines.find(x => x.id === machineId);
  const avail = m?.buildup?.annualAvailableHours ?? 0;
  const name = m?.machineClass ?? machineId;
  if (!(annualVolume > 0) || !(avail > 0)) {
    return { sets: 1, hours: 0, availableHours: avail > 0 ? avail : null, machineClass: name,
      basis: `one fixture set (${!(annualVolume > 0) ? 'no annual volume' : `no available hours for the ${name} in the rate book`} to size the machines on)` };
  }
  const run = ops.filter(o => !o.benchOperation && o.machineId === machineId)
    .reduce((h, o) => h + o.cycleTimeHr / (o.partsPerCycle > 0 ? o.partsPerCycle : 1) / ((o.oee ?? 0) > 0 ? o.oee! : 1), 0);
  const setupHr = setups * SETUP_MIN_PER_FIXTURING / 60 / standardBatchSize(annualVolume);
  const hours = annualVolume * (run + setupHr);
  const machines = hours / avail;
  const sets = Math.max(1, Math.ceil(machines - 1e-6));
  // printed so it can be re-done: (Σ cycle ÷ OEE + change-over) min a part × the volume ÷ 60 = h; h ÷ h available = machines
  const runMin = Math.round(run * 60 * 10_000) / 10_000, setupMin = Math.round(setupHr * 60 * 10_000) / 10_000;
  const perPart = Math.round((runMin + setupMin) * 10_000) / 10_000;
  return { sets, hours, availableHours: avail, machineClass: name,
    basis: `${sets} fixture set(s), one a machine — on the ${name}: cycle ÷ OEE ${runMin.toFixed(4)} min + change-over ${setupMin.toFixed(4)} min `
      + `= ${perPart.toFixed(4)} min a part; ${perPart.toFixed(4)} × ${annualVolume.toLocaleString('en-GB')} a year ÷ 60 `
      + `= ${Math.round(hours).toLocaleString('en-GB')} h; ${Math.round(hours).toLocaleString('en-GB')} h ÷ ${avail.toLocaleString('en-GB')} h available `
      + `= ${machines.toFixed(2)} machine(s), rounded up — the capacity at this volume` };
}

/** Fixtures and programming for a plan, £. With the plan's operations, one fixture set a machine the capacity implies. */
export function machiningNRE(ctx: RuleContext, cut: MachiningCut, routing: RoutingChoice,
  plan?: { ops: ReadonlyArray<OperationPlan>; machineId: string }): {
  fixtureGBP: number; fixtureBasis: string; programmingGBP: number; programmingBasis: string; fixtureSets: number;
} {
  const chuckings = routing.chosen.label === 'turned' && cut.turned ? 2 : 0;
  // A near-net spindle is held in its own dedicated lathe fixture (a knuckle cannot go in jaws).
  const lathe = cut.kind === 'near-net' && cut.spindle ? 1 : 0;
  const kind = routing.chosen.label === 'volume-cell' ? 'hydraulic' : 'auto';
  const cap = plan ? machineSetsFor(plan.ops, plan.machineId, ctx.annualVolume, routing.chosen.setups) : null;
  const n = cap?.sets ?? 1;
  const mill = fixtureCostGBP(Math.max(0, routing.chosen.setups - chuckings) * n, chuckings * n, ctx.annualVolume, kind);
  // the near-net spindle's lathe fixture is its own dedicated one (not a tombstone fixture), one a lathe the plan keeps busy
  const latheCap = lathe && plan ? machineSetsFor(plan.ops, 'mach-lathe-cnc', ctx.annualVolume, 1) : null;
  const latheFx = lathe ? fixtureCostGBP(latheCap?.sets ?? 1, 0, ctx.annualVolume) : null;
  const fx = {
    gbp: mill.gbp + (latheFx?.gbp ?? 0),
    basis: (cap ? `${cap.basis}; ` : '') + (latheFx ? `${mill.basis}; lathe: ${latheCap ? `${latheCap.basis}; ` : ''}${latheFx.basis}` : mill.basis),
  };
  // From solid every feature row is programmed; near-net only the rows it machines (a cast-in pocket is not programmed —
  // secondary-machining parity, Nov 2026).
  const rows = cut.kind === 'near-net' && cut.rows ? cut.rows.length + (cut.slits?.length ?? 0) : (ctx.geo.featureTable ?? []).length;
  const hrs = programmingHours(routing.chosen.setups + lathe, rows, cut.surfaced);
  const rate = activeLabourRate('lab-uk-engineer');   // the costed country's engineer
  return {
    fixtureGBP: fx.gbp, fixtureBasis: fx.basis, fixtureSets: n,
    programmingGBP: Math.round(hrs * rate),
    programmingBasis: `CAM programming and prove-out ${fmt(hrs, 2)} h (${PROGRAMMING_HR.perFixturing} h × ${routing.chosen.setups + lathe} fixturing(s)${lathe ? ' incl. the lathe' : ''} `
      + `+ ${PROGRAMMING_HR.perFeatureRow} h × ${rows} ${cut.kind === 'near-net' ? 'machined ' : ''}feature group(s)${cut.surfaced ? ` + ${PROGRAMMING_HR.surfacing} h surfacing` : ''}) `
      + `× £${rate.toFixed(2)}/h manufacturing engineer (hours engineering-typical, not sourced)`
      + (n > 1 ? `; programmed once a fixturing and run on all ${n} machines — not repeated a machine` : ''),
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
      nre: machiningNRE(ctx, cut, routing, { ops, machineId }),
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
        // Cast iron answered safety-critical is ductile, on this route as on the casting routes: the route comparison
        // machined a safety-critical stub axle from GREY iron plate, the brittle grade the casting rules exclude
        // (report standard review, 3 Nov 2026).
        if (r.advice.family === 'cast iron') {
          const g = castIronDefaultGrade(ctx);
          return decided('machining.materialId', g.id, 'engineer',
            `cast iron → ${materialGradeName(g.id, ctx.rates)} (${g.why}); ${r.advice.massBasis}`, 1);
        }
        const id = representativeMaterialId('machining', r.advice.family) ?? r.advice.family;
        return decided('machining.materialId', id, 'engineer',
          `${r.advice.family} → ${materialGradeName(id, ctx.rates)} (representative machining grade — not a drawing callout); ${r.advice.massBasis}`, 1);
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
        const t = r.advice.routing.chosen.label === 'turned' ? r.advice.cut.turned : null;
        return decided('machining.estimatedCycleTimeHr', Math.round(machineHr * 10_000) / 10_000, 'geometry',
          `${fmt(r.advice.cuttingMin, 2)} min cutting + ${fmt(spindleMinutesOf(r.advice.ops) - r.advice.cuttingMin, 2)} min non-cutting (tool changes, rapids, approach, probing — ${NON_CUT_STATUS}) + ${r.advice.routing.chosen.masked
            ? `${fmt(r.advice.setups * PALLET_CHANGE_SEC / 60, 2)} min pallet change (load / unload masked by the cut)`
            : `${fmt(r.advice.setups * r.advice.cut.handlingMin, 1)} min handling`} `
          + `(${t ? `${t.lathe.basis}; ${t.secondary.basis}` : r.advice.cut.detail.basis})`,
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
          + `${SETUP_MIN_PER_FIXTURING} min change-over (fixture swap, tool offsets, first-off inspection) a batch `
          + `(${SETUP_STATUS})`, 0.7);
      },
    },
    {
      id: 'machining.batchSize',
      path: 'machining.batchSize',
      fieldId: 'mach-batch-size',
      label: 'batchSize',
      evaluate: (ctx) => decided('machining.batchSize', standardBatchSize(ctx.annualVolume), 'rule',
        `${ctx.annualVolume.toLocaleString('en-GB')}/yr ÷ 20 runs a year, held between 50 and 5,000 (20 runs a year engineering-typical, not sourced)`, 0.6),
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
          `${fmt(r.advice.cuttingMin, 2)} min of cutting (chip-making only — not the rapids, tool changes, feed-in or probing) × £${cd.toolCostPerCutMin.toFixed(4)}/min inserts, end mills and drills `
          + `(${r.advice.family}) — not in the machine rate (£/min engineering-typical, not sourced)`, 0.5);
      },
    },
  ];
}

export const MACHINING_RULES: CommodityRuleSpec = {
  commodity: 'machining',
  header: 'MACHINING COST INPUT RULES:',
  // Safety-critical and leak-tight are asked here too (report standard review, 3 Nov 2026) — advisory, on the
  // from-solid route only: cast + machine asks them on its casting half, blocking.
  rules: [...machiningRuleDefs(solidCut), ...serviceQuestionRules('machining', { safety: true, pressure: true })],
};
