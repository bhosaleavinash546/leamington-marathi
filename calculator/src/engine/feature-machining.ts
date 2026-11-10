/**
 * Feature-based secondary machining — a COMMODITY-AGNOSTIC cost layer.
 *
 * Most cast, forged, extruded and moulded parts are made near-net-shape and
 * then MACHINED only at functional features (bores, drilled/tapped holes,
 * turned bosses, faced datums). Pure weight-based costing ignores that
 * secondary machining; this module prices it from the exact geometry so it can
 * be added on top of ANY primary process.
 *
 * Input rows are the exact OCCT `featureTable` (hole/boss × Ø × depth × through
 * × count). Output is ready-to-cost `OperationInput`s plus a transparent
 * per-feature breakdown. Pure functions — unit-tested.
 */
import type { OperationInput } from './types.js';
import type { FeatureRow } from './feature-ops.js';
import { featureToOperation, tappedThread } from './feature-ops.js';
import type { MaterialFamily } from './material-family.js';
import {
  catalogueFor, drillFeed, boreFeed, tapFeed, faceMillCutMinutes, sidePassCm2PerMin, turnFinishCm2PerMin, millRoughInCut,
  familyForTimeFactor, MACHINABILITY_RATIO, ASSUMED, ROUGH_AIR_SHARE, borePasses, shoulderVf,
} from './cutting-catalogue.js';
import { R_PLANE_MM, NON_CUT_STATUS, planNonCut, rapidMinutes, type Visit } from './non-cut-time.js';
import { PALLET_CHANGE_SEC } from './routing-optimiser.js';
export { tappedThread, TAPPING_DRILL_MM } from './feature-ops.js';

/**
 * How the part arrives at the machining cell:
 *  - `near_net`  cast/forged/moulded: holes are cored/pierced in, so machining
 *                removes only finishing stock → NO extra material is charged,
 *                only the machining TIME (the default for these commodities).
 *  - `solid_billet` machined from bar/plate: the feature volume is real metal
 *                removed → material can be charged (returned as materialRemovedKg).
 */
export type StockCondition = 'near_net' | 'solid_billet';

export interface FeatureMachiningOptions {
  machineId: string;
  labourId: string;
  oee?: number;               // default 0.80 (the shop convention, SHOP_DEFAULTS)
  manning?: number;           // default 1
  labourEfficiency?: number;  // default 0.92 (the shop convention)
  stockCondition?: StockCondition; // default 'near_net'
  /** Per-row inclusion override (by index). When omitted, holes/bores are
   *  machined (high confidence) and bosses are excluded (need confirmation). */
  includeFlags?: boolean[];
  /** Material density kg/cm³ for solid_billet material-removal (Al 0.0027,
   *  steel 0.0078, cast iron 0.0072). Ignored for near_net. */
  densityKgPerCm3?: number;
  /** Tolerance/finish multiplier on machining time (tight bores cost more).
   *  1.0 = general; 1.3 = reamed/precision; 1.6 = ground. Default 1.0. */
  finishFactor?: number;
  /** The metal cut: every feature is timed on its own catalogue row (cutting-catalogue.ts). */
  family?: MaterialFamily;
  /** @deprecated The old cutting-time factor (`CUTTING_DATA[family].timeFactor`). Read only when `family` is absent, as
   *  the family it stands for (`familyForTimeFactor`) — it no longer multiplies anything. Pass `family`. */
  materialFactor?: number;
  /** Near-net only: holes above this diameter are cored in, and finish-bored
   *  rather than drilled from solid. Omit to drill every hole from solid. */
  coredAboveMm?: number;
  /** Near-net: the per-side stock a machined face / cored bore carries — passes follow it (PKG-2, CF-06). Omit: one finish pass. */
  stockMm?: number;
  /** The part's envelope, mm — the traverse between features is estimated from it where no position is measured. */
  envelopeMm?: readonly number[];
  /** The machining cell's per-part time that is not cutting: load / clamp /
   *  unload at each fixturing and the batch change-over shared over the batch
   *  (`secondaryMachiningCell` in machining-time.ts). Omit for cutting only. */
  cell?: { fixturings: number; handlingMin: number; setupMinPerFixturing: number; batchSize: number;
    /** A twin-pallet cell: the load / unload is labour only (masked by the cut); the machine pays a pallet change. */
    masked?: boolean; palletChangeSec?: number };
  /** A turned near-net part: its faces are faced on the lathe with the outside (`latheMin` carries them); the
   *  feature table's `face` rows are then not milled, and only the holes stay on `machineId`. */
  turned?: { latheMachineId: string; latheMin: number; basis: string };
}

export interface FeatureMachiningLine {
  kind: FeatureRow['kind'];
  diaMm: number;
  depthMm: number;
  through: boolean | null;
  count: number;
  areaMm2?: number;
  operation: string;
  minutesEach: number;
  totalMinutes: number;
  volumeCm3: number;      // total metal in these features (for solid_billet)
  included: boolean;      // is it costed?
  autoIncluded: boolean;  // default decision (holes yes / bosses no)
  /** B-rep faces behind this line — the viewer highlights them from the cost table. */
  faceIds?: number[];
}

export interface FeatureMachiningResult {
  operations: OperationInput[];      // append these to a commodity's drivers
  lines: FeatureMachiningLine[];     // per-feature breakdown for display
  featureCount: number;              // total instances costed
  totalCycleHr: number;              // machining time per part
  materialRemovedKg: number;         // 0 for near_net; >0 for solid_billet
  summary: string;                   // e.g. "50×Ø6.0×10, 2×Ø16.0×20"
}

/** Short human label for a feature, kind-aware (holes have Ø, faces have area). */
export function featureLabel(l: { kind: FeatureRow['kind']; count: number; diaMm: number; depthMm: number; areaMm2?: number }): string {
  if (l.kind === 'face') return `${l.count}× face ${Math.round(l.areaMm2 ?? 0)}mm²`;
  if (l.kind === 'pocket' || l.kind === 'slot') return `${l.count}× ${l.kind} ${Math.round(l.areaMm2 ?? 0)}mm²×${l.depthMm.toFixed(0)}`;
  return `${l.count}×Ø${l.diaMm.toFixed(1)}×${l.depthMm.toFixed(0)}`;
}

/** Every machinable feature kind the geometry engine can emit. */
const MACHINABLE_KINDS: readonly FeatureRow['kind'][] = ['hole', 'boss', 'face', 'pocket', 'slot'];

/** Stock-aware default inclusion — the fix for the "features detected but not
 *  costed" under-count.
 *  - `solid_billet` (machined from bar/plate): EVERY detected feature is
 *    physically cut from the billet, so all machinable features are costed by
 *    default. Leaving faces/pockets off here silently under-counts a machined
 *    part (the exact bug that made a 14-hole knuckle cost one face-mill).
 *  - `near_net` (cast/forged/moulded): holes/bores AND planar faces are
 *    machined. The faces used to stay off, and the real steering knuckle —
 *    99 planar faces, every mounting pad and bearing datum among them — was
 *    costed with 0.18 hr of machining and landed −25% against its manual.
 *    A near-net casting's large planar faces exist to be faced; as-cast
 *    surfaces are draft walls, not flats. Bosses/pockets/slots stay off until
 *    the engineer confirms them, and the report surfaces the omission. */
export function defaultInclude(row: FeatureRow, stock: StockCondition = 'near_net'): boolean {
  if (stock === 'solid_billet') return MACHINABLE_KINDS.includes(row.kind);
  return row.kind === 'hole' || row.kind === 'face';
}

/**
 * The machine secondary machining runs on, from what it cuts: a drilling centre
 * when it is holes only, a 3-axis VMC as soon as a face, pocket or slot is
 * milled. The screen and headless used to differ — VMC on screen, a drilling
 * machine headless even when faces were in the list (a drill cannot face-mill).
 * One function now decides for both.
 */
export function secondaryMachiningMachineId(
  rows: FeatureRow[] | undefined, stock: StockCondition = 'near_net', includeFlags?: boolean[],
): 'mach-drill' | 'mach-vmc3' {
  const milled = (rows ?? []).some((r, i) =>
    (includeFlags ? includeFlags[i] : defaultInclude(r, stock)) && r.kind !== 'hole');
  return milled ? 'mach-vmc3' : 'mach-drill';
}

/**
 * The fixed per-feature allowances (positioning, approach, retract) are GONE (PKG-2, CF-19 — 10 Nov 2026): non-cutting
 * time is built per operation from tool changes, the traverse between features at the machine's sourced rapid, a stated
 * approach / retract and datum probing (non-cut-time.ts). A feature's own minutes are now its CUTTING time plus the
 * non-cutting time at feed that belongs to it (the R-plane fed in, a tap's way out, a peck's retracts, a pocket's air
 * moves); the rapids and tool changes are the operation's. `ALLOWANCE_MIN` is kept, zeroed, for old callers only.
 * @deprecated nothing reads it.
 */
export const ALLOWANCE_MIN = {
  drill: 0, microDrill: 0, borePass: 0, face: 0, blind: 0, tap: 0, feature: 0, helical: 0, land: 0,
} as const;
/** What a basis prints for the non-cutting time (it printed the allowances' status before PKG-2). */
export const ALLOWANCE_STATUS = NON_CUT_STATUS;

/** @deprecated The rigid-tapping approach allowance — 0 since PKG-2 (the tap's R-plane is fed in and out at its feed). */
export const TAP_APPROACH_MIN = 0;
/** Extra pecking on a hole deeper than 5 diameters (time × 1.5 on the drilling feed) — engineering-typical, not sourced.
 *  Within 5×D a hole is standard reach (DIN 338 jobber Ø14.5 reaches 92 mm = 6.4×D, data.json #43) and is not pecked.
 *  The premium is the peck retracts: non-cutting time (PKG-2), no tool wear on it. */
export const DEEP_HOLE_PECK = 1.5;
/** @deprecated The aluminium-baseline drilling feed the costing used before the catalogue (3 Nov 2026). No costing reads
 *  it; the feed is now `drillFeed(family, Ø)`. Kept so older callers compile — use `deepHolePeckPremiumMin`. */
export const DRILL_FEED_MM_PER_MIN = 400;
/** @deprecated as `DRILL_FEED_MM_PER_MIN` (Ø ≤ 6). */
export const MICRO_DRILL_FEED_MM_PER_MIN = 250;
/** @deprecated The aluminium-baseline tapping feed before the catalogue; tapping is now n × pitch (`tapFeed`). */
export const TAP_FEED_MM_PER_MIN = 500;
/** Holes above this are helically milled from solid (no catalogue row: the old aluminium rate × the machinability ratio). */
export const HELICAL_ABOVE_MM = 26;
/** Helical milling feed along the hole in aluminium, mm/min (0.050 min/mm) — engineering-typical, not sourced. */
export const HELICAL_MIN_PER_MM = 0.050;
/** A land's skim, minutes per mm of Ø — engineering-typical, not sourced. */
export const LAND_MIN_PER_MM_DIA = 0.004;

/**
 * A cylinder shallower than a quarter of its Ø is a LAND — a spot face, counterbore step, seat face, groove or chamfer —
 * never a drilled hole: a 118° drill's own point is 0.30 Ø long, so a full-Ø wall that short cannot be a drilled hole
 * (fresh review, 4 Nov 2026: the casting bracket's 1 mm-deep Ø14 / Ø20 "holes" and the stub axle's Ø16 × 3.2 were each
 * timed as a drilled hole). It held from Ø30 up only; it now holds at every Ø.
 */
export const isLandRow = (row: Pick<FeatureRow, 'kind' | 'diaMm' | 'depthMm'> & Partial<FeatureRow>) =>
  row.kind === 'hole' && row.diaMm > 0 && row.depthMm > 0 && row.depthMm < 0.25 * row.diaMm;
const f3 = (n: number) => n.toFixed(3);

/** One instance's position from the kernel's axis line ("foot x,y,z,direction x,y,z") and span: the axis mid-point, mm. */
export function axisMidPoint(a: { line: string; s0: number; s1: number } | null | undefined): [number, number, number] | null {
  if (!a || typeof a.line !== 'string') return null;
  const v = a.line.split(',').map(Number);
  if (v.length < 6 || v.some(x => !Number.isFinite(x)) || !Number.isFinite(a.s0) || !Number.isFinite(a.s1)) return null;
  const m = (a.s0 + a.s1) / 2;
  return [v[0] + v[3] * m, v[1] + v[4] * m, v[2] + v[5] * m];
}

/** The time of ONE instance: cutting, the non-cutting time at feed that is its own, and the tool visits it needs. */
export interface InstanceTime {
  /** cutMin + nonCutMin — the feature's own minutes (the operation adds its tool changes, rapids and probing). */
  min: number;
  /** Chip-making minutes — what tool wear is charged on (CF-20). */
  cutMin: number;
  /** Non-cutting minutes at feed: R-plane fed in, a tap's way out, peck retracts, a pocket's air moves. */
  nonCutMin: number;
  /** The tools that visit it, one entry a visit (positions are the caller's). */
  visits: Visit[];
  label: string;
  calc: string;
}

// ── Stepped bores ───────────────────────────────────────────────────────────

/** One hole instance on its axis line. */
export interface HoleInstance { rowIndex: number; row: FeatureRow; line: string; s0: number; s1: number; axisIndex?: number }

/**
 * Coaxial hole instances that touch along the axis — ONE stepped bore (a bore with its counterbores, lands, grooves and
 * chamfer steps), machined from one side with one tool per step Ø (fresh review, 4 Nov 2026: the stub axle's two
 * kingpin bores were timed as 10 cored bores, and the knuckle's one hub bore as 4).
 *
 * Joined when the next instance on the same axis line starts no further along the axis than the run so far ends plus
 * the radial step between the two Ø (+ 0.1 mm): the transition between two steps is a cone or chamfer at most as long as
 * the step is deep (45°) — a CostVision geometric reading, not sourced. A ring inside a longer step (a circlip groove)
 * overlaps it and joins. Rows without `axes` (older recorded geometry, meshes) are never grouped.
 */
export function steppedBoreGroups(rows: FeatureRow[]): { groups: HoleInstance[][]; leftover: number[]; leftoverAxes: number[][] } {
  const leftover = rows.map(r => r.count);
  const grouped = rows.map(() => new Set<number>());
  const byLine = new Map<string, HoleInstance[]>();
  rows.forEach((row, rowIndex) => {
    if (row.kind !== 'hole' || !row.axes || row.axes.length !== row.count) return;
    row.axes.forEach((a, axisIndex) => {
      if (!a || typeof a.line !== 'string' || !Number.isFinite(a.s0) || !Number.isFinite(a.s1)) return;
      const list = byLine.get(a.line) ?? [];
      list.push({ rowIndex, row, line: a.line, s0: Math.min(a.s0, a.s1), s1: Math.max(a.s0, a.s1), axisIndex });
      byLine.set(a.line, list);
    });
  });
  const groups: HoleInstance[][] = [];
  for (const list of byLine.values()) {
    list.sort((p, q) => p.s0 - q.s0 || p.s1 - q.s1);
    let run: HoleInstance[] = [];
    let end = -Infinity;
    const close = () => {
      if (run.length > 1 && new Set(run.map(h => h.row.diaMm)).size > 1) {
        groups.push(run);
        for (const h of run) { leftover[h.rowIndex] -= 1; grouped[h.rowIndex].add(h.axisIndex ?? -1); }
      }
    };
    for (const h of list) {
      const prev = run[run.length - 1];
      const step = prev ? Math.abs(h.row.diaMm - prev.row.diaMm) / 2 : 0;
      if (prev && h.s0 <= end + step + 0.1) {
        run.push(h);
        end = Math.max(end, h.s1);
      } else {
        close();
        run = [h];
        end = h.s1;
      }
    }
    close();
  }
  const leftoverAxes = rows.map((r, i) => (r.axes && r.axes.length === r.count ? r.axes.map((_, k) => k).filter(k => !grouped[i].has(k)) : []));
  return { groups, leftover, leftoverAxes };
}

/** The work one stepped bore is: one tool a step Ø (lands are cut by the step beside them); minutes by step. */
export function steppedBoreTime(steps: HoleInstance[], family: MaterialFamily, coredAboveMm?: number, stockMm?: number): {
  min: number; cutMin: number; nonCutMin: number; stepMin: number[]; stepCutMin: number[]; visits: Visit[];
  label: string; calc: string; bored: boolean; maxDiaMm: number;
} {
  const { scale } = catalogueFor(family);
  const ordered = [...steps].sort((p, q) => p.s0 - q.s0);
  const maxDiaMm = Math.max(...ordered.map(h => h.row.diaMm));
  const bored = coredAboveMm !== undefined && Number.isFinite(coredAboveMm) && ordered.some(h => h.row.diaMm > coredAboveMm);
  const visits: Visit[] = [];
  const parts: string[] = [];
  const stepCutMin: number[] = [];
  const stepMin = ordered.map(h => {
    const t = holeInstance(h.row, family, coredAboveMm, stockMm, true);
    visits.push(...t.visits);
    stepCutMin.push(t.cutMin);
    parts.push(`${t.label} ${t.calc}`);
    return t.min;
  });
  const cutMin = stepCutMin.reduce((s, t) => s + t, 0);
  const min = stepMin.reduce((s, t) => s + t, 0);
  const label = `stepped bore ${ordered.map(h => `Ø${h.row.diaMm.toFixed(1)}×${h.row.depthMm.toFixed(h.row.depthMm < 10 ? 1 : 0)}`).join(' / ')}`;
  const calc = `${parts.join(' + ')} = ${f3(min)} min (${ordered.length} coaxial steps, one tool a step Ø, a land cut by the step beside it; `
    + `${f3(cutMin)} min cutting${scale !== 1 ? `; cut × ${+scale.toFixed(3)}` : ''}; the ${LAND_MIN_PER_MM_DIA} min/mm Ø land skim ${ASSUMED})`;
  return { min, cutMin, nonCutMin: min - cutMin, stepMin, stepCutMin, visits, label, calc, bored, maxDiaMm };
}

/** A piece of hole work: a hole on its own (× count) or a stepped bore (× count of identical bores). */
export interface HoleWork {
  kind: 'hole' | 'stepped';
  /** Identical instances of this work. */
  count: number;
  /** Minutes for ONE instance: cutting + its own non-cutting time at feed. */
  minEach: number;
  /** Cutting minutes for ONE instance (tool wear). */
  cutEach: number;
  label: string;
  calc: string;
  /** Finish-bored on the machining centre (a step above the cored size), not drilled. */
  bored: boolean;
  maxDiaMm: number;
  /** The rows it machines (one for a hole; the steps of a stepped bore). */
  rowIndexes: number[];
  /** Minutes this work puts on each row, all instances: they add to count × minEach. */
  minByRow: Map<number, number>;
  faceIds: number[];
  /** Every tool visit of every instance, at the instance's measured position where the kernel gives one. */
  visits: Visit[];
}

/**
 * The hole work of a set of rows, stepped bores grouped (`steppedBoreGroups`) — ONE reading for every route that times
 * holes: from solid, cast + machine, and the casting / forging routes' secondary machining. Identical stepped bores
 * (the same steps) are one work item with a count. `stockMm` (near-net): the per-side stock a cored bore is opened from.
 */
export function holeWork(rows: FeatureRow[], family: MaterialFamily, coredAboveMm?: number, stockMm?: number): HoleWork[] {
  const { groups, leftover, leftoverAxes } = steppedBoreGroups(rows);
  const out: HoleWork[] = [];
  rows.forEach((row, i) => {
    if (row.kind !== 'hole' || leftover[i] <= 0) return;
    const t = featureTime(row, family, coredAboveMm, stockMm);
    const axes = leftoverAxes[i];
    const visits: Visit[] = [];
    for (let k = 0; k < leftover[i]; k++) {
      const pos = axes.length === leftover[i] ? axisMidPoint(row.axes?.[axes[k]]) : null;
      for (const v of t.visits) visits.push({ ...v, pos });
    }
    out.push({
      kind: 'hole', count: leftover[i], minEach: t.min, cutEach: t.cutMin, label: `Ø${row.diaMm.toFixed(1)}×${row.depthMm.toFixed(0)}`,
      calc: t.calc, bored: coredAboveMm !== undefined && Number.isFinite(coredAboveMm) && row.diaMm > coredAboveMm,
      maxDiaMm: row.diaMm, rowIndexes: [i], minByRow: new Map([[i, t.min * leftover[i]]]),
      faceIds: leftover[i] === row.count ? [...(row.faceIds ?? [])] : [],
      visits,
    });
  });
  const bySig = new Map<string, HoleWork>();
  for (const g of groups) {
    const t = steppedBoreTime(g, family, coredAboveMm, stockMm);
    const ordered = [...g].sort((p, q) => p.s0 - q.s0);
    const pos = axisMidPoint({ line: ordered[0].line, s0: ordered[0].s0, s1: ordered[ordered.length - 1].s1 });
    const visits = t.visits.map(v => ({ ...v, pos }));
    const sig = ordered.map(h => `${h.row.diaMm}|${h.row.depthMm}|${h.row.through}`).join(';');
    const w = bySig.get(sig);
    if (w) {
      w.count += 1;
      w.visits.push(...visits);
      ordered.forEach((h, k) => w.minByRow.set(h.rowIndex, (w.minByRow.get(h.rowIndex) ?? 0) + t.stepMin[k]));
      continue;
    }
    const minByRow = new Map<number, number>();
    ordered.forEach((h, k) => minByRow.set(h.rowIndex, (minByRow.get(h.rowIndex) ?? 0) + t.stepMin[k]));
    const item: HoleWork = {
      kind: 'stepped', count: 1, minEach: t.min, cutEach: t.cutMin, label: t.label, calc: t.calc, bored: t.bored, maxDiaMm: t.maxDiaMm,
      rowIndexes: [...new Set(ordered.map(h => h.rowIndex))], minByRow,
      faceIds: [...new Set(ordered.flatMap(h => h.row.faceIds ?? []))],
      visits,
    };
    bySig.set(sig, item);
    out.push(item);
  }
  return out;
}

/** Minutes of hole work on each row (all its instances), stepped bores apportioned by step — they add to the work. */
export function holeMinutesByRow(rows: FeatureRow[], family: MaterialFamily, coredAboveMm?: number, stockMm?: number): number[] {
  const out = rows.map(() => 0);
  for (const w of holeWork(rows, family, coredAboveMm, stockMm)) for (const [i, m] of w.minByRow) out[i] += m;
  return out;
}

const drillKey = (d: number) => `drill Ø${(Math.round(d * 2) / 2).toFixed(1)}`;

/**
 * One hole instance: drilled (+ a boring pass on a blind Ø13–26, + tapping), helically milled above Ø26, a land skimmed,
 * or — cored / pierced above `coredAboveMm` — opened by boring passes from the stock (`borePasses`). Each tool visit
 * feeds the R-plane in at its own feed and retracts out of the hole at rapid; a tap feeds in and out.
 */
function holeInstance(row: FeatureRow, family: MaterialFamily, coredAboveMm: number | undefined, stockMm: number | undefined,
  inStep: boolean): InstanceTime {
  const { scale } = catalogueFor(family);
  const ratio = MACHINABILITY_RATIO[family] ?? MACHINABILITY_RATIO.steel;
  const d = row.diaMm;
  const L = Math.max(row.depthMm, 1);
  const label = `Ø${d.toFixed(1)}×${L.toFixed(0)}`;
  const R = R_PLANE_MM;
  const sc = scale !== 1 ? ` × ${+scale.toFixed(3)}` : '';
  // A wide, shallow "hole" is a spot-face, counterbore land or seat face: one skim.
  if (isLandRow(row)) {
    const cut = d * LAND_MIN_PER_MM_DIA;
    const b = boreFeed(family, d);
    const feedIn = inStep ? 0 : R / b.vf * scale;
    return { min: cut + feedIn, cutMin: cut, nonCutMin: feedIn, label: `Ø${d.toFixed(1)}×${row.depthMm.toFixed(1)} land`,
      visits: inStep ? [] : [{ tool: `spot face Ø${d.toFixed(1)}`, feedInMin: feedIn }],
      calc: `skim ${LAND_MIN_PER_MM_DIA} min/mm Ø × ${d.toFixed(1)} (${ASSUMED}) = ${f3(cut)} min cutting`
        + (inStep ? ' (cut by the step beside it)' : ` + ${R} mm fed in at ${b.vf.toFixed(0)} mm/min = ${f3(feedIn)} min`) };
  }
  if (coredAboveMm !== undefined && d > coredAboveMm) {
    // Cored / pierced: opened by boring passes from the stock — rough at the turning rough row, finish at the boring row.
    const bp = borePasses(family, d, L, stockMm);
    const cut = bp.passes.reduce((s, p) => s + p.cutMin, 0);
    const visits: Visit[] = bp.passes.map(p => ({ tool: `${p.kind === 'rough' ? 'rough bore' : 'bore'} Ø${d.toFixed(1)}`, feedInMin: R / p.vf * scale, rapidMm: L }));
    const feedIn = visits.reduce((s, v) => s + v.feedInMin, 0);
    return { min: cut + feedIn, cutMin: cut, nonCutMin: feedIn, label: `${label} cored, bored`, visits,
      calc: `${bp.text} = ${f3(cut)} min cutting + ${visits.length} × ${R} mm fed in = ${f3(feedIn)} min (retract at rapid)` };
  }
  if (d > HELICAL_ABOVE_MM) {
    const cut = L * HELICAL_MIN_PER_MM * ratio;
    const feedIn = R * HELICAL_MIN_PER_MM * ratio;
    return { min: cut + feedIn, cutMin: cut, nonCutMin: feedIn, label, visits: [{ tool: 'helical end mill', feedInMin: feedIn, rapidMm: L }],
      calc: `helical-milled ${L.toFixed(0)} × ${HELICAL_MIN_PER_MM} min/mm × ${ratio} (no catalogue row read: aluminium rate × machinability ratio, ${ASSUMED}) `
        + `= ${f3(cut)} min cutting + ${R} mm fed in = ${f3(feedIn)} min` };
  }
  const dr = drillFeed(family, d);
  const deep = L > 5 * Math.max(d, 1) ? DEEP_HOLE_PECK : 1;
  let cut = L / dr.vf * scale;
  let nonCut = R / dr.vf * scale + (deep - 1) * L / dr.vf * scale;
  const visits: Visit[] = [{ tool: drillKey(d), feedInMin: R / dr.vf * scale + (deep - 1) * L / dr.vf * scale, rapidMm: L }];
  let text = `drilled ${L.toFixed(0)} ÷ ${dr.vf.toFixed(0)} mm/min (n ${dr.n.toFixed(0)} × f ${dr.f.toFixed(3)})${sc}`;
  // A blind 13–26 mm hole is a locating or bearing bore: drilled, then one boring pass. A through hole is a clearance
  // hole and is drilled only, whatever its depth (report standard round: a 4.2×D through hole was reamed). A step of a
  // stepped bore is drilled only.
  if (!inStep && d > 13 && row.through === false) {
    const b = boreFeed(family, d);
    cut += L / b.vf * scale;
    nonCut += R / b.vf * scale;
    visits.push({ tool: `bore Ø${d.toFixed(1)}`, feedInMin: R / b.vf * scale, rapidMm: L });
    text += ` + bore ${L.toFixed(0)} ÷ ${b.vf.toFixed(0)} mm/min`;
  }
  const thread = tappedThread(row);
  if (thread) {
    const tp = tapFeed(family, thread);
    cut += 2 * L / tp.vf * scale;
    nonCut += 2 * R / tp.vf * scale;
    visits.push({ tool: `tap ${thread}`, feedInMin: 2 * R / tp.vf * scale });
    text += ` + tap ${thread} in and out 2 × ${L.toFixed(0)} ÷ ${tp.vf.toFixed(0)} mm/min (n ${tp.n.toFixed(0)} × ${tp.pitch} pitch)`;
  }
  return { min: cut + nonCut, cutMin: cut, nonCutMin: nonCut, label, visits,
    calc: `${text} = ${f3(cut)} min cutting + ${visits.length} visit(s) × ${R} mm fed in${thread ? ' (a tap in and out)' : ''}`
      + `${deep !== 1 ? ` + ${DEEP_HOLE_PECK - 1} × the drilling time for peck retracts (> 5×D, ${ASSUMED})` : ''} = ${f3(nonCut)} min` };
}

/**
 * ONE instance of a feature, with the arithmetic as text. Cutting terms come from the published catalogue for the metal
 * at the feature's own size (cutting-catalogue.ts). `coredAboveMm` (near-net): a hole above it is cast / pierced in and
 * opened by boring passes; `stockMm` (near-net): the per-side stock a machined face / cored bore carries — passes follow
 * it (PKG-2, CF-06). `min` = cutting + this feature's own non-cutting time at feed (the operation adds tool changes,
 * rapids and probing — non-cut-time.ts).
 */
export function featureTime(row: FeatureRow, family: MaterialFamily = 'aluminium', coredAboveMm?: number, stockMm?: number): InstanceTime & { text: string } {
  const r = featureTimeInner(row, family, coredAboveMm, stockMm);
  return { ...r, text: r.label ? `${r.label} ${r.calc}` : r.calc };
}

function featureTimeInner(row: FeatureRow, family: MaterialFamily, coredAboveMm?: number, stockMm?: number): InstanceTime {
  const R = R_PLANE_MM;
  if (row.kind === 'face') {
    const fm = faceMillCutMinutes(family, row.areaMm2 ?? 0, stockMm);
    return { min: fm.min + fm.clearMin, cutMin: fm.min, nonCutMin: fm.clearMin, label: `face ${Math.round(row.areaMm2 ?? 0)} mm²:`,
      visits: [{ tool: 'face mill', feedInMin: fm.clearMin, rapidMm: fm.returnMm }], calc: fm.text };
  }
  if (row.kind === 'pocket' || row.kind === 'slot') {
    const area = Math.max(row.areaMm2 ?? 0, 1);
    const depth = Math.max(row.depthMm, 1);
    const q = millRoughInCut(family).q;
    const roughIn = area * depth / 1000 / q;                                  // floor volume at the in-cut roughing rate
    const air = roughIn * ROUGH_AIR_SHARE;                                    // step-downs and air moves: non-cutting
    const wallCm2 = 4 * Math.sqrt(area) * depth / 100;                        // ≈ square perimeter × depth
    const finish = wallCm2 / sidePassCm2PerMin(family);
    const feedIn = R / shoulderVf(family) * catalogueFor(family).scale;
    const cut = roughIn + finish;
    return { min: cut + air + feedIn, cutMin: cut, nonCutMin: air + feedIn, label: `${row.kind}:`,
      visits: [{ tool: 'end mill', feedInMin: air + feedIn }],
      calc: `${(area * depth / 1000).toFixed(1)} cm³ ÷ ${q.toFixed(0)} cm³/min in-cut + ${wallCm2.toFixed(1)} cm² walls ÷ ${sidePassCm2PerMin(family).toFixed(0)} cm²/min `
        + `= ${f3(cut)} min cutting + ${ROUGH_AIR_SHARE * 100}% air moves on the roughing (${ASSUMED}) + ${R} mm fed in = ${f3(air + feedIn)} min` };
  }
  const d = row.diaMm;
  const L = Math.max(row.depthMm, 1);
  if (row.kind === 'boss') {
    const areaCm2 = Math.PI * Math.max(d, 1) * L / 100;
    const cut = areaCm2 / turnFinishCm2PerMin(family);
    const feedIn = R / shoulderVf(family) * catalogueFor(family).scale;
    return { min: cut + feedIn, cutMin: cut, nonCutMin: feedIn, label: `boss Ø${d.toFixed(1)}:`, visits: [{ tool: 'end mill', feedInMin: feedIn }],
      calc: `${areaCm2.toFixed(1)} cm² ÷ ${turnFinishCm2PerMin(family).toFixed(0)} cm²/min = ${f3(cut)} min cutting + ${R} mm fed in = ${f3(feedIn)} min` };
  }
  return holeInstance(row, family, coredAboveMm, stockMm, false);
}

/** Geometry-measured machining minutes for ONE instance of a feature (aluminium unless the metal is given). */
export function featureMinutesEach(row: FeatureRow, family: MaterialFamily = 'aluminium'): number {
  return featureTime(row, family).min;
}

/**
 * Minutes for one hole. A hole above `coredAboveMm` in a casting is cast in and only finish-bored (one pass down its
 * depth); everything else is drilled or helically milled from solid by `featureTime`.
 */
export function nearNetHoleMinutes(row: FeatureRow, coredAboveMm?: number, family: MaterialFamily = 'aluminium'): number {
  return featureTime(row, family, row.kind === 'hole' ? coredAboveMm : undefined).min;
}

/**
 * The costing's peck premium on a hole deeper than 5×D — the extra time `featureTime` charges for it, the
 * design-addressable part of a deep hole (the drilling itself stays). 0 within 5×D.
 */
export function deepHolePeckPremiumMin(row: FeatureRow, family: MaterialFamily = 'aluminium'): number {
  const d = row.diaMm, L = Math.max(row.depthMm, 1);
  if (!(L > 5 * Math.max(d, 1)) || d > HELICAL_ABOVE_MM || isLandRow(row)) return 0;
  return (DEEP_HOLE_PECK - 1) * L / drillFeed(family, d).vf * catalogueFor(family).scale;
}

/** The operation a costed feature row is, as the costing times it (a through hole is drilled only — never reamed). */
export function costedOperation(row: FeatureRow): string {
  return featureToOperation(row);
}

/** Metal volume removed (cm³) for ONE instance — cylinders for hole/boss,
 *  floor-area×depth for pockets/slots, ~0 (skim) for facing. */
export function featureVolumeCm3(row: FeatureRow): number {
  if (row.kind === 'face') return 0;                          // facing skims stock
  if (row.kind === 'pocket' || row.kind === 'slot') {
    return ((row.areaMm2 ?? 0) * Math.max(row.depthMm, 0)) / 1000;
  }
  const rCm = row.diaMm / 2 / 10;
  const lCm = row.depthMm / 10;
  return Math.PI * rCm * rCm * lCm;
}

export function computeFeatureMachining(
  rows: FeatureRow[] | undefined,
  opts: FeatureMachiningOptions,
): FeatureMachiningResult {
  const stock = opts.stockCondition ?? 'near_net';
  const density = opts.densityKgPerCm3 ?? 0.0027;
  // The metal: its catalogue row sets the cutting; the tolerance / finish factor alone multiplies the minutes.
  const family: MaterialFamily = opts.family
    ?? (opts.materialFactor !== undefined ? familyForTimeFactor(opts.materialFactor) : 'aluminium');
  const finish = opts.finishFactor ?? 1.0;
  const flags = opts.includeFlags;

  // The holes machined, timed as the costing times them: coaxial steps of one bore are one stepped bore (holeWork).
  const all = rows ?? [];
  const cored = stock === 'near_net' ? opts.coredAboveMm : undefined;
  const stockMm = stock === 'near_net' ? opts.stockMm : undefined;
  const holeIdx = all.map((_, i) => i).filter(i => all[i].kind === 'hole' && (flags ? Boolean(flags[i]) : defaultInclude(all[i], stock)));
  const holeRowsIn = holeIdx.map(i => all[i]);
  const works = holeWork(holeRowsIn, family, cored, stockMm);
  const holeByRow = holeRowsIn.map(() => 0);
  for (const w of works) for (const [i, m] of w.minByRow) holeByRow[i] += m;
  const holeMin = new Map(holeIdx.map((i, k) => [i, holeByRow[k]]));
  const visits: Visit[] = works.flatMap(w => w.visits);
  const lines: FeatureMachiningLine[] = all.map((row, i) => {
    const auto = defaultInclude(row, stock);
    const included = flags ? Boolean(flags[i]) : auto;
    const lathe = opts.turned && row.kind === 'face';
    const t = holeMin.has(i) || lathe ? null : featureTime(row, family, row.kind === 'hole' ? cored : undefined, stockMm);
    if (t && included) for (let k = 0; k < row.count; k++) visits.push(...t.visits);
    // A turned part's faces are faced on the lathe (in `turned.latheMin`), not milled.
    const minutesEach = lathe ? 0 : (holeMin.has(i) ? holeMin.get(i)! / Math.max(1, row.count) : t!.min) * finish;
    return {
      faceIds: row.faceIds,
      kind: row.kind,
      diaMm: row.diaMm,
      depthMm: row.depthMm,
      through: row.through,
      count: row.count,
      areaMm2: row.areaMm2,
      operation: lathe ? 'Faced on the lathe' : costedOperation(row),
      minutesEach: Math.round(minutesEach * 1000) / 1000,
      totalMinutes: Math.round(minutesEach * row.count * 1000) / 1000,
      volumeCm3: Math.round(featureVolumeCm3(row) * row.count * 1000) / 1000,
      included,
      autoIncluded: auto,
    };
  });

  const active = lines.filter(l => l.included);
  const featureCount = active.reduce((s, l) => s + l.count, 0);
  const latheMin = opts.turned && featureCount > 0 ? opts.turned.latheMin : 0;
  // The operation's non-cutting time beyond the features' own: tool changes and the rapids at this machine (PKG-2, CF-19).
  const nc = planNonCut(visits, opts.envelopeMm ?? null);
  const rapid = rapidMinutes(nc.rapidMm, opts.machineId);
  const featureMinutes = active.reduce((s, l) => s + l.totalMinutes, 0);
  const millMinutes = featureMinutes > 0 ? featureMinutes + nc.toolChangeMin + rapid.min : 0;
  const totalMinutes = millMinutes + latheMin;
  const totalCycleHr = totalMinutes / 60;
  const materialRemovedKg = stock === 'solid_billet'
    ? Math.round(active.reduce((s, l) => s + l.volumeCm3, 0) * density * 1000) / 1000
    : 0;

  const summary = active.map(featureLabel).join(', ');
  // what the drill / machining centre itself cuts — a turned part's faces are on the lathe
  const cutLines = active.filter(l => !(opts.turned && l.kind === 'face'));
  const cutCount = cutLines.reduce((s, l) => s + l.count, 0);
  const cutSummary = cutLines.map(featureLabel).join(', ');

  const cell = opts.cell && featureCount > 0 ? opts.cell : null;
  const cellMin = cell
    ? cell.fixturings * (cell.handlingMin + cell.setupMinPerFixturing / Math.max(1, cell.batchSize))
    : 0;
  const millHr = millMinutes / 60;
  const common = { labourId: opts.labourId, partsPerCycle: 1, oee: opts.oee ?? 0.80, labourEfficiency: opts.labourEfficiency ?? 0.92 };
  const operations: OperationInput[] = featureCount === 0 ? [] : [
    // A turned part: the outside and the faces on the lathe first; the holes stay on the drill / machining centre.
    ...(opts.turned && latheMin > 0 ? [{
      ...common,
      operationName: `Turning — outside and faces on the CNC lathe, op 10 / op 20 [geometry-measured]`,
      machineId: opts.turned.latheMachineId,
      cycleTimeHr: latheMin / 60,
      manning: opts.manning ?? 1,
      labourTimeHr: latheMin / 60,
    }] : []),
    ...(millHr > 0 ? [{
      ...common,
      operationName: `CNC Machining — ${cutCount} feature${cutCount === 1 ? '' : 's'} (${cutSummary}) [geometry-measured]`,
      machineId: opts.machineId,
      cycleTimeHr: millHr,
      manning: opts.manning ?? 1,
      labourTimeHr: millHr,
    }] : []),
    ...(cell && cell.masked ? [{
      // The twin-pallet cell: the spindle pays a pallet change; the operator loads the other pallet while it cuts.
      ...common,
      operationName: `Pallet change (${cell.fixturings} fixturing(s) × ${cell.palletChangeSec ?? PALLET_CHANGE_SEC} s)`,
      machineId: opts.machineId,
      cycleTimeHr: cell.fixturings * (cell.palletChangeSec ?? PALLET_CHANGE_SEC) / 3600,
      manning: 1,
      labourTimeHr: 0,
      untended: true,
    },
    // Only the load the operator's share of the cut does not already cover (arithmetic audit machining M4); when the
    // cut covers it all there is nothing more to charge, and no zero-time bench step is listed.
    ...(Math.max(0, cell.fixturings * cell.handlingMin - (opts.manning ?? 1) * millMinutes) > 1e-9 ? [{
      ...common,
      operationName: `Machining load / unload on the pallet while the spindle cuts (${cell.fixturings} fixturing(s) × `
        + `${cell.handlingMin} min, less the operator's share of the cut)`,
      machineId: opts.machineId,
      cycleTimeHr: 0,
      oee: 1,
      manning: 1,
      labourTimeHr: Math.max(0, cell.fixturings * cell.handlingMin - (opts.manning ?? 1) * millMinutes) / 60,
      benchOperation: true,
    }] : []), {
      // The batch change-over stops the spindle — the pallet masks the load, not the fixture swap, offsets and first-off.
      // It rode in the labour-only load above, so the machine was never charged for it (arith audit, Oct 2026). Charged
      // like the from-solid route's amortised set-up: machine and setter, OEE 1.
      ...common,
      operationName: `Machining change-over, amortised (${cell.fixturings} fixturing(s) × ${cell.setupMinPerFixturing} min ÷ batch ${cell.batchSize})`,
      machineId: opts.machineId,
      cycleTimeHr: cell.fixturings * cell.setupMinPerFixturing / Math.max(1, cell.batchSize) / 60,
      oee: 1,
      manning: 1,
      labourTimeHr: cell.fixturings * cell.setupMinPerFixturing / Math.max(1, cell.batchSize) / 60,
    }] : cell ? [{
      ...common,
      operationName: `Machining load / unload + change-over (${cell.fixturings} fixturing(s): `
        + `${cell.handlingMin} min each + ${cell.setupMinPerFixturing} min ÷ batch ${cell.batchSize})`,
      machineId: opts.machineId,
      cycleTimeHr: cellMin / 60,
      manning: 1,
      labourTimeHr: cellMin / 60,
    }] : [])];

  return { operations, lines, featureCount, totalCycleHr, materialRemovedKg, summary };
}
