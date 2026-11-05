/**
 * Narrow slots and slits the costing's feature table does not see (Part1 review, Nov 2026).
 *
 * A clamp slit — a 3 mm saw cut from an outside edge into a bore, so a bolt can close the bore on its tube (a triple
 * clamp, a split hub) — is two parallel planar faces 3 mm apart closed by a half-cylinder of R1.5 at its root. The
 * feature table the costing machines from reads holes, faced flats and pockets: it has no row for the slit, so the slit
 * was neither costed nor flagged. The kernel's per-face pass does see it: the root is a CONCAVE partial cylinder sweeping
 * ~180° (a slot end, not a blend) whose two adjacent planes face each other at 2R.
 *
 * Measured or silent: every number here is the kernel's (radius, sweep, the planes' normals and centroids, the depth
 * along the root's axis). The cost is NOT modelled: the cutting catalogue holds no slitting-saw or wire-EDM data, so no
 * minutes are invented — the finding says so and the core report lists it on page 1 as uncosted scope with a question.
 */
import type { GeometricFinding, ManufacturingFeature, PartContext } from '../types.js';
import { onMachinedFace } from '../types.js';
import { OWN_HEURISTIC } from './machining.js';

export const NARROW_SLIT_RULE_ID = 'machining.slot.narrow-slit';
/** A slot this narrow (≤ 3 mm, an R ≤ 1.5 mm root) is cut after casting or forging, not formed: a die blade or core that
 *  thin does not survive (CostVision engineering heuristic, not a published figure). */
export const NARROW_SLIT_MAX_WIDTH_MM = 3;
/** A slot end sweeps ~180° (a blend ≤ 120°, a hole ≥ 300°). */
const SLOT_END_SWEEP: readonly [number, number] = [150, 210];
const SOURCE = OWN_HEURISTIC('A slot ≤ 3 mm wide is cut after the part is cast or forged (slitting saw or wire EDM) — the die '
  + 'blade or core that would form it is too thin to survive. 3 mm is the tool’s own threshold, not a published figure.');

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** One narrow slit: its root, its two walls, its width (the walls' gap) and its depth along the root. */
export interface NarrowSlit {
  root: ManufacturingFeature; walls: [ManufacturingFeature, ManufacturingFeature]; widthMm: number; depthMm: number; lengthMm: number | null;
  /** The costing's feature table carries the walls as faced flats (face-milled by area) — the saw cut is still not costed. */
  wallsInCosting: boolean;
}

export function narrowSlits(part: PartContext): NarrowSlit[] {
  const feats = part.featureSet.features ?? [];
  const planeByFace = new Map<number, ManufacturingFeature>();
  for (const f of feats) if (f.kind === 'planar_face' && f.faceIds.length === 1 && f.axis && f.positionMm) planeByFace.set(f.faceIds[0], f);
  const out: NarrowSlit[] = [];
  for (const f of feats) {
    if (f.kind !== 'fillet' || f.concave !== true || f.radiusMm === undefined || !(f.radiusMm > 0) || f.sweepDeg === undefined) continue;
    if (f.sweepDeg < SLOT_END_SWEEP[0] || f.sweepDeg > SLOT_END_SWEEP[1]) continue;
    const width = 2 * f.radiusMm;
    if (width > NARROW_SLIT_MAX_WIDTH_MM + 1e-6) continue;
    const walls = (f.adjacentFaceIds ?? []).map(id => planeByFace.get(id)).filter((p): p is ManufacturingFeature => !!p);
    let pair: [ManufacturingFeature, ManufacturingFeature] | null = null; let gap = 0;
    for (let i = 0; i < walls.length && !pair; i++) for (let j = i + 1; j < walls.length && !pair; j++) {
      const a = walls[i], b = walls[j];
      if (dot(a.axis!, b.axis!) > -0.995) continue;                       // the two walls face each other
      const g = Math.abs(dot([a.positionMm![0] - b.positionMm![0], a.positionMm![1] - b.positionMm![1], a.positionMm![2] - b.positionMm![2]], a.axis!));
      if (Math.abs(g - width) <= Math.max(0.05, 0.03 * width)) { pair = [a, b]; gap = g; }
    }
    if (!pair) continue;
    const depth = f.depthMm ?? 0;
    const area = Math.max(pair[0].areaMm2 ?? 0, pair[1].areaMm2 ?? 0);
    out.push({ root: f, walls: pair, widthMm: Math.round(gap * 100) / 100, depthMm: Math.round(depth * 10) / 10,
      lengthMm: depth > 0 && area > 0 ? Math.round(area / depth * 10) / 10 : null,
      // The feature table can read the two walls as FACED FLATS: the costing then face-mills them by area — a face mill
      // cannot enter a 3 mm slit, and the saw cut itself is still not costed (Part1: walls 695 / 698 mm² as face rows).
      wallsInCosting: onMachinedFace({ faceIds: [...pair[0].faceIds, ...pair[1].faceIds] }, part) });
  }
  return out;
}

/** The findings: one a slit, 'risk' (scope the costing does not price), never priced (cost-impact.ts NOT_MODELLED). */
export function narrowSlitFindings(part: PartContext): GeometricFinding[] {
  return narrowSlits(part).map(s => ({
    ruleId: NARROW_SLIT_RULE_ID, commodity: part.commodity, severity: 'risk' as const,
    title: 'Narrow slit (saw cut) — not in the feature table, NOT costed',
    detail: `A ${s.widthMm.toFixed(1)} mm slit, ${s.depthMm.toFixed(1)} mm deep${s.lengthMm ? ` and about ${s.lengthMm.toFixed(0)} mm long` : ''}: `
      + `faces ${s.walls[0].faceIds[0]} and ${s.walls[1].faceIds[0]} face each other ${s.widthMm.toFixed(2)} mm apart, closed by an R${s.root.radiusMm!.toFixed(1)} `
      + `root sweeping ${s.root.sweepDeg!.toFixed(0)}°. It is cut after the part is made; the saw cut is NOT in this price`
      + (s.wallsInCosting ? ' — the feature table reads its two walls as faced flats, so the costing face-mills them by area, which a face mill '
        + 'cannot do in a slit this narrow.' : '.'),
    featureId: s.root.id, faceIds: [...new Set([...s.root.faceIds, ...s.walls[0].faceIds, ...s.walls[1].faceIds])].sort((a, b) => a - b),
    measured: { field: 'widthMm', value: s.widthMm, unit: 'mm' },
    threshold: { value: NARROW_SLIT_MAX_WIDTH_MM, unit: 'mm', comparator: '<=' as const },
    recommendation: 'Ask the supplier how the slit is cut (slitting saw, wire EDM) and the minutes and tooling a part, and add it to '
      + 'the costing as an operation; the cutting data has no slitting-saw row, so CostVision does not time it.',
    source: SOURCE,
    ...(s.root.positionMm ? { positionMm: s.root.positionMm } : {}),
    areaMm2: s.root.areaMm2,
  }));
}
