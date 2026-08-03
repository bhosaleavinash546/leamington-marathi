/**
 * Bounding-box derivations shared by every commodity that needs a footprint.
 *
 * One rule, stated once: when a process needs a projected area, take the two
 * largest bounding-box dimensions. The model's orientation is arbitrary — a
 * bumper can be drawn with its length on Z — so `bbox X x Y` is a coin flip, and
 * the coin landing wrong under-sizes the press. The largest projection is the
 * worst case, and the worst case is the safe one: it can only over-size.
 */
import type { RuleContext } from '../types.js';

/** Bounding-box dimensions, largest first. */
export function bboxSortedMm(ctx: RuleContext): [number, number, number] | null {
  const bb = ctx.geo.boundingBox;
  if (!bb) return null;
  const [a, b, c] = [bb.xMm, bb.yMm, bb.zMm].sort((x, y) => y - x);
  return [a, b, c];
}

/** Projected area at the parting plane, cm² — the two largest dimensions. */
export function projectedAreaCm2(ctx: RuleContext): number | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  return Math.round((d[0] * d[1]) / 100 * 10) / 10;
}

/** Envelope volume in cm³ — the solid billet a from-solid part is cut out of. */
export function bboxVolumeCm3(ctx: RuleContext): number | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  return Math.round(d[0] * d[1] * d[2] / 1000 * 10) / 10;
}

/**
 * Axisymmetric ring/flange/gear-blank shape?
 *
 * Two near-equal footprint dimensions plus a large central bore. Ring rolling is
 * the cheapest route for that shape and the wrong one for anything else, so this
 * is worth measuring rather than asking.
 */
export function isRingShape(ctx: RuleContext): boolean {
  const d = bboxSortedMm(ctx);
  if (!d) return false;
  const round = d[1] > 0 && d[0] / d[1] <= 1.1;      // circular footprint
  if (!round) return false;
  const biggestBore = (ctx.geo.featureTable ?? [])
    .filter(r => r.kind === 'hole')
    .reduce((m, r) => Math.max(m, r.diaMm ?? 0), 0);
  return biggestBore >= d[0] * 0.25;
}
