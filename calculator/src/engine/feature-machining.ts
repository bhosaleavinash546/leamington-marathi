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
import { featureToOperation } from './feature-ops.js';

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
  oee?: number;               // default 0.85
  manning?: number;           // default 1
  labourEfficiency?: number;  // default 0.9
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
}

export interface FeatureMachiningResult {
  operations: OperationInput[];      // append these to a commodity's drivers
  lines: FeatureMachiningLine[];     // per-feature breakdown for display
  featureCount: number;              // total instances costed
  totalCycleHr: number;              // machining time per part
  materialRemovedKg: number;         // 0 for near_net; >0 for solid_billet
  summary: string;                   // e.g. "50×Ø6.0×10, 2×Ø16.0×20"
}

// Shop-rate constants for the area/volume-based compound features (Phase 2).
const FACE_MILL_FEED_MM2_PER_MIN = 8000;   // face-mill area coverage rate
const POCKET_MRR_MM3_PER_MIN = 6000;       // pocket roughing material-removal rate

/** Short human label for a feature, kind-aware (holes have Ø, faces have area). */
export function featureLabel(l: { kind: FeatureRow['kind']; count: number; diaMm: number; depthMm: number; areaMm2?: number }): string {
  if (l.kind === 'face') return `${l.count}× face ${Math.round(l.areaMm2 ?? 0)}mm²`;
  if (l.kind === 'pocket' || l.kind === 'slot') return `${l.count}× ${l.kind} ${Math.round(l.areaMm2 ?? 0)}mm²×${l.depthMm.toFixed(0)}`;
  return `${l.count}×Ø${l.diaMm.toFixed(1)}×${l.depthMm.toFixed(0)}`;
}

/** High-confidence default: holes/bores are machined; external bosses, faced
 *  surfaces and pockets need the engineer to confirm (a planar face or a
 *  recess may be cast/forged as-is, not machined). */
export function defaultInclude(row: FeatureRow): boolean {
  return row.kind === 'hole';
}

/** Geometry-measured machining minutes for ONE instance of a feature.
 *  Transparent shop heuristic (approach + depth/area-driven cut + finishing). */
export function featureMinutesEach(row: FeatureRow): number {
  if (row.kind === 'face') {
    const area = Math.max(row.areaMm2 ?? 0, 1);
    return 0.20 + area / FACE_MILL_FEED_MM2_PER_MIN;        // facing pass
  }
  if (row.kind === 'pocket' || row.kind === 'slot') {
    const area = Math.max(row.areaMm2 ?? 0, 1);
    const depth = Math.max(row.depthMm, 1);
    const rough = (area * depth) / POCKET_MRR_MM3_PER_MIN;   // volume roughing
    const finishPerimeterMm = 4 * Math.sqrt(area);           // ≈ square perimeter
    const finish = (finishPerimeterMm * depth) / 12000;      // wall finish pass
    return 0.30 + rough + finish;
  }
  const d = row.diaMm;
  const L = Math.max(row.depthMm, 1);
  if (row.kind === 'boss') {
    return 0.30 + L * 0.020;                     // external turning
  }
  let t: number;
  if (d > 26) {
    t = 0.50 + L * 0.050;                         // helical mill / large bore
  } else if (d > 13) {
    t = 0.15 + L * 0.020 + 0.25 + L * 0.020;      // drill + ream/bore pass
  } else {
    t = 0.15 + L * 0.020;                         // drill
  }
  if (row.through === false) t += 0.10;           // blind: bottom finishing
  return t;
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
  const finish = opts.finishFactor ?? 1.0;
  const flags = opts.includeFlags;

  const lines: FeatureMachiningLine[] = (rows ?? []).map((row, i) => {
    const auto = defaultInclude(row);
    const included = flags ? Boolean(flags[i]) : auto;
    const minutesEach = featureMinutesEach(row) * finish;
    return {
      kind: row.kind,
      diaMm: row.diaMm,
      depthMm: row.depthMm,
      through: row.through,
      count: row.count,
      areaMm2: row.areaMm2,
      operation: featureToOperation(row),
      minutesEach: Math.round(minutesEach * 1000) / 1000,
      totalMinutes: Math.round(minutesEach * row.count * 1000) / 1000,
      volumeCm3: Math.round(featureVolumeCm3(row) * row.count * 1000) / 1000,
      included,
      autoIncluded: auto,
    };
  });

  const active = lines.filter(l => l.included);
  const featureCount = active.reduce((s, l) => s + l.count, 0);
  const totalMinutes = active.reduce((s, l) => s + l.totalMinutes, 0);
  const totalCycleHr = totalMinutes / 60;
  const materialRemovedKg = stock === 'solid_billet'
    ? Math.round(active.reduce((s, l) => s + l.volumeCm3, 0) * density * 1000) / 1000
    : 0;

  const summary = active.map(featureLabel).join(', ');

  const operations: OperationInput[] = featureCount === 0 ? [] : [{
    operationName: `CNC Machining — ${featureCount} feature${featureCount === 1 ? '' : 's'} (${summary}) [geometry-measured]`,
    machineId: opts.machineId,
    labourId: opts.labourId,
    cycleTimeHr: totalCycleHr,
    partsPerCycle: 1,
    oee: opts.oee ?? 0.85,
    manning: opts.manning ?? 1,
    labourTimeHr: totalCycleHr,
    labourEfficiency: opts.labourEfficiency ?? 0.9,
  }];

  return { operations, lines, featureCount, totalCycleHr, materialRemovedKg, summary };
}
