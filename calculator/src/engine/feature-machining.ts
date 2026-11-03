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
  catalogueFor, drillFeed, boreFeed, tapFeed, faceMillCutMinutes, sidePassCm2PerMin, turnFinishCm2PerMin, millRoughEffective,
  familyForTimeFactor, MACHINABILITY_RATIO, ASSUMED,
} from './cutting-catalogue.js';
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

// Pocket floor roughing and wall finishing ride the catalogue's roughing and side-pass rates (cutting-catalogue.ts).
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
 * Fixed per-feature allowances, minutes: positioning, approach and retract around the cut. Their values are the
 * long-standing ones; since the report standard round (3 Nov 2026) they are NOT multiplied by the metal (non-cutting
 * time does not depend on it — the reviewers' point) and every basis prints them as engineering-typical, not sourced.
 */
export const ALLOWANCE_MIN = {
  drill: 0.15, microDrill: 0.06, borePass: 0.25, face: 0.20, blind: 0.10, tap: 0.10, feature: 0.30, helical: 0.50, land: 0.20,
} as const;
export const ALLOWANCE_STATUS = 'positioning / approach / retract allowances engineering-typical, not sourced, not scaled by the metal';

/** Rigid tapping approach / reversal allowance (kept under its old name). */
export const TAP_APPROACH_MIN = ALLOWANCE_MIN.tap;
/** Extra pecking on a hole deeper than 5 diameters (time × 1.5 on the drilling feed) — engineering-typical, not sourced.
 *  Within 5×D a hole is standard reach (DIN 338 jobber Ø14.5 reaches 92 mm = 6.4×D, data.json #43) and is not pecked. */
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

const isLandRow = (row: FeatureRow) => row.kind === 'hole' && row.diaMm >= 30 && row.depthMm > 0 && row.depthMm < 0.25 * row.diaMm;
const f2 = (n: number) => n.toFixed(2);

/**
 * Minutes for ONE instance of a feature, with the arithmetic as text. Cutting terms come from the published catalogue
 * for the metal at the feature's own size (cutting-catalogue.ts); the allowances are fixed. `coredAboveMm` (near-net):
 * a hole above it is cast / pierced in and finish-bored in one pass rather than drilled from solid.
 */
export function featureTime(row: FeatureRow, family: MaterialFamily = 'aluminium', coredAboveMm?: number): { min: number; text: string; calc: string } {
  const r = featureTimeInner(row, family, coredAboveMm);
  return { ...r, text: r.label ? `${r.label} ${r.calc}` : r.calc };
}

function featureTimeInner(row: FeatureRow, family: MaterialFamily, coredAboveMm?: number): { min: number; label: string; calc: string } {
  const { scale, row: cat } = catalogueFor(family);
  const ratio = MACHINABILITY_RATIO[family] ?? MACHINABILITY_RATIO.steel;
  const A = ALLOWANCE_MIN;
  if (row.kind === 'face') {
    const cut = faceMillCutMinutes(family, row.areaMm2 ?? 0);
    return { min: A.face + cut.min, label: `face ${Math.round(row.areaMm2 ?? 0)} mm²:`, calc: `${A.face} + ${cut.text}` };
  }
  if (row.kind === 'pocket' || row.kind === 'slot') {
    const area = Math.max(row.areaMm2 ?? 0, 1);
    const depth = Math.max(row.depthMm, 1);
    const rough = area * depth / 1000 / millRoughEffective(family);         // floor volume at the roughing rate
    const wallCm2 = 4 * Math.sqrt(area) * depth / 100;                       // ≈ square perimeter × depth
    const finish = wallCm2 / sidePassCm2PerMin(family);
    return { min: A.feature + rough + finish, label: `${row.kind}:`,
      calc: `${A.feature} + ${(area * depth / 1000).toFixed(1)} cm³ ÷ ${millRoughEffective(family)} cm³/min + ${wallCm2.toFixed(1)} cm² walls ÷ ${sidePassCm2PerMin(family).toFixed(0)} cm²/min = ${f2(A.feature + rough + finish)} min` };
  }
  const d = row.diaMm;
  const L = Math.max(row.depthMm, 1);
  if (row.kind === 'boss') {
    const areaCm2 = Math.PI * Math.max(d, 1) * L / 100;
    const t = A.feature + areaCm2 / turnFinishCm2PerMin(family);
    return { min: t, label: `boss Ø${d.toFixed(1)}:`, calc: `${A.feature} + ${areaCm2.toFixed(1)} cm² ÷ ${turnFinishCm2PerMin(family).toFixed(0)} cm²/min = ${f2(t)} min` };
  }
  // A wide, shallow "hole" is a spot-face, counterbore land or seat face: the kernel reports every cylindrical land of
  // a stepped bore separately (a real stub axle carried eight Ø40–46 lands 2–7 mm deep). One skim is what it costs.
  if (isLandRow(row)) {
    const t = A.land + d * 0.004;
    return { min: t, label: `Ø${d.toFixed(1)} land spot-faced`, calc: `${A.land} + 0.004 min/mm Ø (${ASSUMED}) = ${f2(t)} min` };
  }
  if (coredAboveMm !== undefined && d > coredAboveMm) {
    // Cored / pierced: one finish-boring pass down its depth at the boring row's n·f.
    const b = boreFeed(family, d);
    const t = A.borePass + L / b.vf * scale;
    return { min: t, label: `Ø${d.toFixed(1)}×${L.toFixed(0)} cored, bored`, calc: `${A.borePass} + ${L.toFixed(0)} ÷ ${b.vf.toFixed(0)} mm/min (n ${b.n.toFixed(0)} × f ${cat.bore.f})${scale !== 1 ? ` × ${+scale.toFixed(3)}` : ''} = ${f2(t)} min` };
  }
  // Pecking only beyond 5×D: a 4–5×D hole is standard catalogue reach (DIN 338; MVS runs 3–8×D at one feed).
  const deep = L > 5 * Math.max(d, 1) ? DEEP_HOLE_PECK : 1;
  let t: number; let text: string;
  const label = `Ø${d.toFixed(1)}×${L.toFixed(0)}`;
  if (d > HELICAL_ABOVE_MM) {
    t = A.helical + L * HELICAL_MIN_PER_MM * ratio;
    text = `helical-milled ${A.helical} + ${L.toFixed(0)} × ${HELICAL_MIN_PER_MM} min/mm × ${ratio} (no catalogue row read: aluminium rate × machinability ratio, ${ASSUMED})`;
  } else {
    const dr = drillFeed(family, d);
    const allow = d > 6 ? A.drill : A.microDrill;
    const cut = L / dr.vf * deep * scale;
    t = allow + cut;
    text = `${allow} + ${L.toFixed(0)} ÷ ${dr.vf.toFixed(0)} mm/min (n ${dr.n.toFixed(0)} × f ${dr.f.toFixed(3)})`
      + (deep !== 1 ? ` × ${DEEP_HOLE_PECK} peck (> 5×D)` : '') + (scale !== 1 ? ` × ${+scale.toFixed(3)}` : '');
    // A blind 13–26 mm hole is a locating or bearing bore: drilled, then one boring pass. A through hole is a clearance
    // hole and is drilled only, whatever its depth (report standard round: a 4.2×D through hole was reamed).
    if (d > 13 && row.through === false) {
      const b = boreFeed(family, d);
      const bt = A.borePass + L / b.vf * scale;
      t += bt;
      text += ` + bore ${A.borePass} + ${L.toFixed(0)} ÷ ${b.vf.toFixed(0)} mm/min`;
    }
  }
  if (row.through === false) { t += A.blind; text += ` + ${A.blind} blind`; }
  const thread = tappedThread(row);
  if (thread) {
    const tp = tapFeed(family, thread);
    const tt = A.tap + 2 * L / tp.vf * scale;
    t += tt;
    text += ` + tap ${thread} ${A.tap} + 2 × ${L.toFixed(0)} ÷ ${tp.vf.toFixed(0)} mm/min (n ${tp.n.toFixed(0)} × ${tp.pitch} pitch)`;
  }
  return { min: t, label, calc: `${text} = ${f2(t)} min` };
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

  const lines: FeatureMachiningLine[] = (rows ?? []).map((row, i) => {
    const auto = defaultInclude(row, stock);
    const included = flags ? Boolean(flags[i]) : auto;
    // A turned part's faces are faced on the lathe (in `turned.latheMin`), not milled.
    const minutesEach = opts.turned && row.kind === 'face' ? 0
      : (stock === 'near_net' && opts.coredAboveMm !== undefined
        ? nearNetHoleMinutes(row, opts.coredAboveMm, family) : featureMinutesEach(row, family)) * finish;
    return {
      faceIds: row.faceIds,
      kind: row.kind,
      diaMm: row.diaMm,
      depthMm: row.depthMm,
      through: row.through,
      count: row.count,
      areaMm2: row.areaMm2,
      operation: opts.turned && row.kind === 'face' ? 'Faced on the lathe' : costedOperation(row),
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
  const millMinutes = active.reduce((s, l) => s + l.totalMinutes, 0);
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
