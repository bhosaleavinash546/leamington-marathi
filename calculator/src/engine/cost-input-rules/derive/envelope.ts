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

/**
 * Projected area at the parting plane, cm².
 *
 * The bbox face (two largest dimensions) is the WORST-CASE silhouette, and for
 * a thin shell — a bumper skin spanning its envelope — it is also roughly the
 * truth. For a SOLID part it badly overstates: the stub axle's bbox face is
 * 617.6 cm² where its real parting silhouette is ~200 cm², and that one number
 * cascaded into an 8000 t press, a £202k die and a 16,675-shot die life —
 * £104/part against a £30 manual.
 *
 * Physics bounds the silhouette for a solid of volume V in an L×W×H box:
 * at least V/H (a prism) and at most L×W. In fill-ratio terms those bounds are
 * LW×fill and LW×1; the geometric mean LW×√fill interpolates between them and
 * lands where real forgings do. Shells (fill < 5%) keep the bbox face — for
 * them the envelope IS the part.
 */
export function projectedAreaCm2(ctx: RuleContext): number | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  const faceCm2 = (d[0] * d[1]) / 100;
  const fill = ctx.geo.fillRatio ?? null;
  const est = fill !== null && fill >= 0.05 ? faceCm2 * Math.sqrt(fill) : faceCm2;
  return Math.round(est * 10) / 10;
}

/** Envelope volume in cm³ — the solid billet a from-solid part is cut out of. */
export function bboxVolumeCm3(ctx: RuleContext): number | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  return Math.round(d[0] * d[1] * d[2] / 1000 * 10) / 10;
}

/**
 * The wall thickness that GOVERNS cooling, mm.
 *
 * Cooling time goes as wall² and the part ejects when its THICKEST section is
 * stiff enough — the mean wall systematically under-times any part with local
 * thick sections. The ray-cast measurement now carries a 95th-percentile wall
 * (p95, not max, so one sliver or a grazed boss cannot set the cycle); use it,
 * capped at 2× the mean so rib/boss outliers stay a local feature rather than
 * becoming the whole part. When the thin-shell 2·V/S correction fired, the raw
 * samples measured cavity depth and p95 was dropped at the boundary — the
 * corrected mean is all there is, and for a uniform shell it is also right.
 */
export function governingWallMm(
  wt: RuleContext['geo']['wallThickness'],
): { mm: number; basis: string } | null {
  if (!wt?.meanMm) return null;
  const mean = wt.meanMm;
  if (wt.method === 'ray_cast' && wt.p95Mm && wt.p95Mm > mean) {
    const capped = wt.p95Mm > mean * 2;
    const mm = Math.round(Math.min(wt.p95Mm, mean * 2) * 10) / 10;
    return {
      mm,
      basis: `95th-percentile ray-cast wall over ${wt.sampleCount ?? 0} samples (mean ${mean} mm)`
        + (capped ? `, capped at 2x mean — p95 ${wt.p95Mm} mm reads as a local boss/rib` : '')
        + ' — the thickest section governs cooling',
    };
  }
  const basis = wt.method === 'volume_surface_shell'
    ? 'thin-shell wall from 2·V/S (ray-cast overshot the cavity)'
    : `ray-cast mean wall over ${wt.sampleCount ?? 0} samples`;
  return { mm: Math.round(mean * 10) / 10, basis };
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
