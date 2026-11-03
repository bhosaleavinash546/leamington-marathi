/**
 * The faces a costing MACHINES — so the process-form rules (draft, corner radius, undercut, section, hot spot) judge
 * only the faces the casting or forging process forms.
 *
 * Why: the casting draft rule flagged the zero-draft flats that the cast + machine costing itself defines as its machined
 * faces, and the forging rules flagged bores, eyes and pads of a finished knuckle (report standard review, Nov 2026,
 * dfm.md #13 / #20). A machined face carries stock, not draft; its radius is the tool's.
 *
 * Read from the SAME feature table the costing reads, with the costing's own functions, so the two cannot disagree:
 *
 * - faced rows and every hole — `defaultInclude(row, 'near_net')`, the rows `computeFeatureMachining` and
 *   `nearNetMachiningTime` cut (pockets and bosses are cast / forged in);
 * - the turned axis — when the costing turns it: a turned part (`turnedPartFacts`, every route) or a cast + machine
 *   spindle (`nearNetTurnedAreaCm2`); its faces are the bosses on the kernel's coaxial family line;
 * - two stated inferences, counted separately so the report can say so: a flat square to a machined bore or the turned
 *   axis and centred on it is that bore's step / spot face or the axis's shoulder; a radius that meets a machined face
 *   is cut with it.
 *
 * Pure: the job builds it from the kernel measurement, a test from a recorded one.
 */
import type { FeatureRow } from '../feature-ops.js';
import { defaultInclude } from '../feature-machining.js';
import { turnedPartFacts, nearNetTurnedAreaCm2 } from '../machining-time.js';
import type { CommodityType } from '../types.js';
import type { ManufacturingFeature, ManufacturingFeatureSet, MachinedFaceSet } from './types.js';

/** Routes whose costing machines a near-net part (the feature table's faced rows and holes). */
export const MACHINED_SET_COMMODITIES: ReadonlySet<CommodityType> = new Set<CommodityType>(['cast_and_machine', 'casting', 'forging']);

/** The kernel's coaxial tolerance (`_turning_signature`: offset < 0.5 mm, parallel within 0.05°). */
export const COAXIAL_OFFSET_MM = 0.5;
const PARALLEL_COS = Math.cos((2 * Math.PI) / 180);

type V3 = readonly number[];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): number[] => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const parallel = (a: V3, b: V3) => Math.abs(dot(unit(a), unit(b))) >= PARALLEL_COS;
/** Distance from point p to the line through c along a. */
export function distanceToLine(p: V3, c: V3, a: V3): number {
  const u = unit(a);
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const t = dot(v, u);
  return Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]);
}

/** The slice of the kernel measurement the set needs. */
export interface MachinedSetGeometry {
  featureTable?: FeatureRow[] | null;
  turning?: { fraction: number; externalAreaMm2?: number; externalMaxDiaMm?: number; maxDiaMm?: number; axis: number[] | null } | null;
  boundingBox?: { xMm: number; yMm: number; zMm: number } | null;
  surfaceArea?: { cm2: number } | null;
}

interface AxisLine { c: V3; a: V3 }

/** Does the costing turn this part's axis? A turned part on every route; the spindle of a cast + machine part. */
function costingTurns(geo: MachinedSetGeometry, commodity: CommodityType): boolean {
  if (turnedPartFacts(geo)) return true;
  return commodity === 'cast_and_machine' && nearNetTurnedAreaCm2(geo.turning, geo.surfaceArea?.cm2 ?? 0) > 0;
}

/**
 * The turned axis line: of the bosses and holes parallel to the kernel's turning axis, the coaxial group with the most
 * area (the kernel picks its family the same way, by area). Null when no cylinder lies on it.
 */
function turnedLine(features: readonly ManufacturingFeature[], axis: V3): AxisLine | null {
  const cyl = features.filter(f => (f.kind === 'boss' || f.kind === 'hole') && f.axis && f.positionMm && parallel(f.axis, axis));
  const groups: Array<{ line: AxisLine; area: number }> = [];
  for (const f of cyl) {
    const g = groups.find(x => distanceToLine(f.positionMm!, x.line.c, x.line.a) < COAXIAL_OFFSET_MM);
    if (g) g.area += f.areaMm2 ?? 0;
    else groups.push({ line: { c: f.positionMm!, a: axis }, area: f.areaMm2 ?? 0 });
  }
  groups.sort((p, q) => q.area - p.area);
  return groups[0]?.line ?? null;
}

/**
 * The machined face set, or undefined when the route machines nothing the feature table names (moulding, sheet …) or
 * the table is absent (an STL, an older payload) — the rules then judge every face and the report says why.
 */
export function machinedFaceSet(
  geo: MachinedSetGeometry, featureSet: ManufacturingFeatureSet, commodity: CommodityType,
): MachinedFaceSet | undefined {
  if (!MACHINED_SET_COMMODITIES.has(commodity)) return undefined;
  const rows = geo.featureTable ?? [];
  if (!rows.length) return undefined;
  const features = featureSet.available ? featureSet.features ?? [] : [];

  const faced = new Set<number>();
  const holes = new Set<number>();
  for (const r of rows) {
    if (!defaultInclude(r, 'near_net')) continue;
    for (const id of r.faceIds ?? []) (r.kind === 'face' ? faced : holes).add(id);
  }

  // the turned axis, when the costing turns it
  const turned = new Set<number>();
  const lines: AxisLine[] = [];
  const tAxis = geo.turning?.axis;
  if (tAxis && costingTurns(geo, commodity)) {
    const line = turnedLine(features, tAxis);
    if (line) {
      lines.push(line);
      for (const f of features) {
        if (f.kind === 'boss' && f.axis && f.positionMm && parallel(f.axis, tAxis)
          && distanceToLine(f.positionMm, line.c, line.a) < COAXIAL_OFFSET_MM) f.faceIds.forEach(id => turned.add(id));
      }
    }
  }
  // every machined bore's axis line — its steps and spot faces are cut with it
  for (const f of features) {
    if (f.kind === 'hole' && f.axis && f.positionMm && f.faceIds.some(id => holes.has(id))) lines.push({ c: f.positionMm, a: f.axis });
  }

  const machined = new Set<number>([...faced, ...holes, ...turned]);
  // a flat square to a machined axis and centred on it: a bore step, spot face or shoulder
  const steps = new Set<number>();
  for (const f of features) {
    if (f.kind !== 'planar_face' || !f.axis || !f.positionMm || f.faceIds.every(id => machined.has(id))) continue;
    if (lines.some(l => parallel(f.axis!, l.a) && distanceToLine(f.positionMm!, l.c, l.a) < COAXIAL_OFFSET_MM)) {
      f.faceIds.forEach(id => { if (!machined.has(id)) steps.add(id); });
    }
  }
  steps.forEach(id => machined.add(id));
  // a radius that meets a machined face is cut with it (the finished model's edge break or tool-nose radius)
  const blends = new Set<number>();
  for (const f of features) {
    if (f.kind !== 'fillet' || !f.adjacentFaceIds?.some(id => machined.has(id))) continue;
    f.faceIds.forEach(id => { if (!machined.has(id)) blends.add(id); });
  }
  blends.forEach(id => machined.add(id));

  const ids = [...machined].sort((a, b) => a - b);
  const counts = { faced: faced.size, holes: holes.size, turned: turned.size, steps: steps.size, blends: blends.size };
  const route = commodity === 'forging' ? 'forging' : 'casting';
  const parts = [
    `${counts.faced} faced flat${counts.faced === 1 ? '' : 's'}`,
    `${counts.holes} hole and bore face${counts.holes === 1 ? '' : 's'}`,
    ...(counts.turned ? [`${counts.turned} face${counts.turned === 1 ? '' : 's'} of the turned axis`] : []),
  ];
  const inferred = [
    ...(counts.steps ? [`${counts.steps} flat${counts.steps === 1 ? '' : 's'} square to a machined bore or the turned axis and centred on it (its step, spot face or shoulder)`] : []),
    ...(counts.blends ? [`${counts.blends} radi${counts.blends === 1 ? 'us' : 'i'} meeting a machined face`] : []),
  ];
  const basis = `The costing machines ${parts.join(', ')} (its feature table)`
    + (inferred.length ? `; taken as cut with them: ${inferred.join(' and ')}` : '')
    + `. Draft, corner-radius, undercut, section and hot-spot checks judge the other faces — the as-${route === 'forging' ? 'forged' : 'cast'} ones. `
    + `A face the drawing machines but the costing does not is still judged here: if one is flagged, the costing is missing its machining.`;
  return { faceIds: ids, counts, basis };
}
