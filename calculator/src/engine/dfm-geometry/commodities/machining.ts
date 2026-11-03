/**
 * Machining DFM, measured per feature.
 *
 * The old engine's machining rules key off `topOpShare` and station counts —
 * shop-loading observations. These read the holes and pockets the kernel
 * actually measured.
 */
import type { GeometricRule } from '../types.js';
import { finding, isBlend } from '../types.js';
import { CORED_ABOVE_MM } from '../../machining-time.js';

/** The diameter above which a casting route cores a hole (the costing's own table), by route name. */
export function coredAbove(process: string | undefined): number {
  const p = (process ?? '').toLowerCase();
  const key = p === 'diecast' || p === 'die_casting' || p === 'die-casting' ? 'hpdc' : p;
  return CORED_ABOVE_MM[key] ?? CORED_ABOVE_MM.sand;
}

/** A CostVision rule of thumb with no published figure behind it — said so, not dressed as a citation. */
export const OWN_HEURISTIC = (what: string) => ({
  standard: 'CostVision engineering heuristic (not a published standard)',
  note: what,
});

/** Kept for callers: the depth-to-diameter of the Hubs prototype-shop guidance this rule no longer fires on. */
export const STANDARD_DRILL_LD = 4;
export const EXTENDED_DRILL_LD = 10;

/**
 * DIN 338 type N (jobber length) twist drills — flute length l2 by diameter range, mm: [upper bound of the Ø range, l2].
 * ISO 235-1 gives the same jobber series. A hole no deeper than l2 is drilled with a stock jobber drill; deeper needs a
 * long-series drill (DIN 340) or deep-hole drilling. The table stops at Ø20 (DIN 338's standard range); above it the
 * reach check does not run.
 */
export const DIN338_FLUTE_MM: ReadonlyArray<readonly [number, number]> = [
  [1.06, 12], [1.18, 14], [1.32, 16], [1.5, 18], [1.7, 20], [1.9, 22], [2.12, 24], [2.36, 27], [2.65, 30], [3.0, 33],
  [3.35, 36], [3.75, 39], [4.25, 43], [4.75, 47], [5.3, 52], [6.0, 57], [6.7, 63], [7.5, 69], [8.5, 75], [9.5, 81],
  [10.6, 87], [11.8, 94], [13.2, 101], [14.0, 108], [15.0, 114], [16.0, 120], [17.0, 125], [18.0, 130], [19.0, 135],
  [20.0, 140],
];
/** Flute length of the DIN 338 jobber drill for this diameter, mm — null outside the table (Ø < 0.95 or > 20). */
export function jobberFluteMm(diaMm: number): number | null {
  if (!(diaMm >= 0.95) || diaMm > 20) return null;
  return DIN338_FLUTE_MM.find(([upTo]) => diaMm <= upTo + 1e-9)?.[1] ?? null;
}

/**
 * Above this diameter the costing does not drill: it helical-mills or bores (feature-machining.ts, d > 26). Drill-reach
 * and stock-drill rules stop here — a Ø29.9 bore through a hollow driveshaft is not a drilling question.
 */
export const DRILLED_MAX_DIA_MM = 26;

/**
 * Stock drill diameters: Hubs, "specify hole diameters in 0.1 mm increments up to 10 mm, and in 0.5 mm increments
 * above 10 mm" (the ISO 235 pattern). The old 49-size list called stock drills (5.2, 6.5, 11.5, 13.5) "special".
 */
export const FINE_STEP_TO_MM = 13;
export function isStockDrill(dia: number): boolean {
  const step = dia <= FINE_STEP_TO_MM ? 0.1 : 0.5;
  return Math.abs(dia / step - Math.round(dia / step)) * step <= 0.01;
}
export function nearestStockDrill(dia: number): number {
  const step = dia <= FINE_STEP_TO_MM ? 0.1 : 0.5;
  return Math.round(Math.round(dia / step) * step * 100) / 100;
}
const DRILL_SIZE_SOURCE = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 stock jobber-drill diameters',
  note: 'Jobber drills (DIN 338) are commonly stocked in 0.1 mm steps to \u230013 and 0.5 mm steps above; a diameter off that '
    + 'grid is treated as a special tool. The grid is the tool\u2019s own reading of distributor stock, not a clause of the '
    + 'standard. Only holes the costing drills are judged (not cored or bored bores, spot faces or ISO 866 centre holes).',
};

/**
 * Cutter length-to-diameter. Hubs: cutting length "2-3 times" the diameter is best and "up to four times" costs more;
 * a cavity "greater than six times the tool diameter" is deep.
 */
export const CUTTER_LD_STANDARD = 4;
export const CUTTER_LD_LONG = 6;
const LONG_REACH_SOURCE = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 cutter reach past 4\u00d7 and 6\u00d7 its diameter',
  note: 'An end mill cuts best within a few diameters of the holder; beyond that it deflects and is run at reduced feed and '
    + 'depth of cut. Reported past 4\u00d7D, as a risk past 6\u00d7D \u2014 the tool\u2019s own thresholds (engineering-typical, not '
    + 'sourced).',
};

const DRILL_DEPTH_SOURCE = {
  standard: 'DIN 338 (type N, jobber-length twist drills) \u2014 flute length l2 by diameter; ISO 235-1 gives the same series',
  note: 'A hole deeper than the jobber drill\u2019s flute needs a long-series drill (DIN 340) or deep-hole drilling. The '
    + 'amount is the costing\u2019s own deep-hole premium: its drilling time pecks 1.5\u00d7 slower past 5\u00d7D (feature-machining '
    + 'model, engineering-typical, not sourced) \u2014 the part of the hole\u2019s cost a shallower or larger hole takes out. The '
    + 'hole\u2019s own drilling time is not a saving and is not shown.',
};

/** Centre-drill pilot diameters d1 of ISO 866 (form A centre holes, R10 series) — a stock centre drill, not a hole size. */
export const ISO866_D1_MM: readonly number[] = [0.5, 0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10];
/** A land shallower than this fraction of its diameter is a spot face / seat, not a hole — the costing's own test
 *  (feature-machining.ts spot-faces a land under \u00bc Ø). */
export const SPOT_FACE_DEPTH_RATIO = 0.25;

/**
 * A centre hole: a blind hole at an ISO 866 pilot diameter on the axis of a turned diameter (a boss on the same line — the
 * part is turned between centres), or which opens into a larger coaxial recess at its mouth (the centre drill's
 * countersink). A centre drill is a stock tool; the hole is not a drill size, a non-stock size or a deep hole.
 */
export function isCentreHole(f: import('../types.js').ManufacturingFeature, part: import('../types.js').PartContext): boolean {
  if (f.kind !== 'hole' || f.diaMm === undefined || f.openEnds === 2) return false;
  if (!ISO866_D1_MM.some(d => Math.abs(d - f.diaMm!) <= 0.02)) return false;
  if (!f.axis || !f.positionMm) return false;
  const a = f.axis, p = f.positionMm;
  const coaxial = (g: import('../types.js').ManufacturingFeature) => !!g.axis && !!g.positionMm
    && Math.abs(a[0] * g.axis[0] + a[1] * g.axis[1] + a[2] * g.axis[2]) >= Math.cos(Math.PI / 90)
    && lineGap(g.positionMm, p, a) < 0.5;
  return (part.featureSet.features ?? []).some(g => g !== f && coaxial(g) && (
    (g.kind === 'boss' && (g.diaMm ?? 0) > f.diaMm!)
    || (g.kind === 'hole' && (g.diaMm ?? 0) > f.diaMm!
      && Math.hypot(g.positionMm![0] - p[0], g.positionMm![1] - p[1], g.positionMm![2] - p[2]) <= ((g.depthMm ?? 0) + (f.depthMm ?? 0)) / 2 + 0.5)));
}
function lineGap(q: readonly number[], c: readonly number[], a: readonly number[]): number {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  const u = [a[0] / l, a[1] / l, a[2] / l];
  const v = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
  const t = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]);
}

/** Is this hole drilled in the costing (not cored and finish-bored, not helical-milled, not a spot face)? */
export function drilledInCosting(f: import('../types.js').ManufacturingFeature, part: import('../types.js').PartContext): boolean {
  if (f.kind !== 'hole' || !(f.diaMm && f.diaMm > 0)) return false;
  if (f.diaMm > DRILLED_MAX_DIA_MM) return false;
  const cast = part.commodity === 'cast_and_machine' || part.commodity === 'casting';
  if (cast && f.diaMm > coredAbove(part.process)) return false;
  if (part.commodity === 'forging' && f.diaMm > coredAbove('forging')) return false;
  if (f.depthMm !== undefined && f.depthMm > 0 && f.depthMm < SPOT_FACE_DEPTH_RATIO * f.diaMm) return false;
  return true;
}

export const MACHINING_RULES: readonly GeometricRule[] = [
  {
    id: 'machining.hole.depth-beyond-standard-drill',
    commodity: 'machining',
    title: 'Hole deeper than a jobber drill reaches',
    appliesTo: ['hole'],
    source: DRILL_DEPTH_SOURCE,
    evaluate(f, part) {
      if (f.diaMm === undefined || f.depthMm === undefined) return null;
      if (!drilledInCosting(f, part) || isCentreHole(f, part)) return null;   // bored, cored or a centre hole: not drilled
      const flute = jobberFluteMm(f.diaMm);
      // Measured or silent: outside DIN 338's range there is no reach to judge against.
      if (flute === null || f.depthMm <= flute) return null;
      return finding(this, f, part, {
        severity: 'info',     // 'cost' once the costing's deep-hole premium is priced on it
        detail: `⌀${f.diaMm.toFixed(1)} mm hole is ${f.depthMm.toFixed(1)} mm deep (${(f.depthMm / f.diaMm).toFixed(1)}×D) — `
              + `beyond the ${flute} mm flute of a DIN 338 jobber drill of that diameter.`,
        measuredField: 'depthMm', measuredValue: f.depthMm, unit: 'mm',
        thresholdValue: flute, comparator: '>',
        recommendation: 'Shorten the hole to the jobber drill\'s reach, open the diameter, or drill from both ends; otherwise '
          + 'it needs a long-series (DIN 340) or deep-hole drill and runs at the costing\'s deep-hole (peck) rate.',
      });
    },
  },

  {
    id: 'machining.hole.non-preferred-diameter',
    commodity: 'machining',
    title: 'Non-stock hole diameter — special tool',
    appliesTo: ['hole'],
    source: DRILL_SIZE_SOURCE,
    evaluate(f, part) {
      if (f.diaMm === undefined || f.diaMm <= 0) return null;
      if (isStockDrill(f.diaMm)) return null;
      // Only a hole the costing DRILLS: above the drilled range it is bored / helical-milled (any size, one tool), on a
      // casting above the cored size it is cast in and finish-bored, a shallow land is a spot face.
      if (!drilledInCosting(f, part)) return null;
      // An ISO 866 centre hole (Ø3.15 …) is made by a stock centre drill.
      if (isCentreHole(f, part)) return null;
      const closest = nearestStockDrill(f.diaMm);
      return finding(this, f, part, {
        severity: 'info',
        detail: `⌀${f.diaMm.toFixed(2)} mm is not a stock drill size (0.1 mm steps to ⌀13, 0.5 mm above); nearest is `
              + `⌀${closest} mm.`,
        measuredField: 'diaMm', measuredValue: f.diaMm, unit: 'mm',
        thresholdValue: closest, comparator: '>',
        recommendation: `If the fit allows, move to ⌀${closest} mm and save a special tool or a `
          + 'separate bore/ream cycle.',
      });
    },
  },

  {
    id: 'machining.corner.radius-below-economic-cutter',
    commodity: 'machining',
    title: 'Internal corner radius below any economic end mill',
    appliesTo: ['fillet'],
    source: OWN_HEURISTIC('An internal corner cannot be smaller than the cutter that makes it; below R1 mm the cutter is '
      + 'fragile and slow, and the corner is usually EDM or a broach. R1 is the tool\u2019s own threshold, not a published figure.'),
    evaluate(f, part) {
      // An INTERNAL corner (concave) — the radius a cutter must fit. An external round is cut by the
      // side of the tool and costs nothing extra; it used to be the only kind this rule ever saw.
      // Only on a part cut from solid: a cast or forged corner is formed, not milled.
      if (f.concave !== true || part.commodity !== 'machining' || !isBlend(f)) return null;
      // A vertical corner an end mill cuts along its axis (reachable at an end). A floor fillet closed at both
      // ends is cut by a bull-nose cutter whose corner radius IS the fillet — not a small-cutter problem.
      if (f.toolReachMm === undefined) return null;
      if (f.radiusMm === undefined || f.radiusMm <= 0) return null;
      if (f.radiusMm >= 1.0) return null;
      return finding(this, f, part, {
        severity: 'info',
        detail: `Internal corner at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm.`,
        measuredField: 'radiusMm', measuredValue: f.radiusMm, unit: 'mm',
        thresholdValue: 1.0, comparator: '<',
        recommendation: 'Open the corner to at least R1 mm so a standard end mill can cut it; '
          + 'below that expect a slow small-diameter cutter, or EDM.',
      });
    },
  },

  {
    id: 'machining.corner.long-reach-cutter',
    commodity: 'machining',
    title: 'Deep internal corner — long-reach end mill',
    appliesTo: ['fillet'],
    source: LONG_REACH_SOURCE,
    evaluate(f, part) {
      if (part.commodity !== 'machining') return null; // a cast or forged corner is formed, not milled
      if (f.concave !== true || !isBlend(f) || f.radiusMm === undefined || f.radiusMm <= 0 || f.toolReachMm === undefined) return null;
      // The cutter that makes an R corner is at most Ø2R and must reach from outside the part to the corner's far end.
      const ld = f.toolReachMm / (2 * f.radiusMm);
      if (ld <= CUTTER_LD_STANDARD) return null;
      const extreme = ld > CUTTER_LD_LONG;
      return finding(this, f, part, {
        severity: extreme ? 'risk' : 'info',
        detail: `R${f.radiusMm.toFixed(1)} mm internal corner reached ${f.toolReachMm.toFixed(1)} mm deep — a ≤ Ø${(2 * f.radiusMm).toFixed(1)} mm `
          + `cutter at ${ld.toFixed(1)}× its diameter.`,
        measuredField: 'cutterLD', measuredValue: ld, unit: '×D',
        thresholdValue: CUTTER_LD_STANDARD, comparator: '>',
        recommendation: extreme
          ? 'Beyond ~' + CUTTER_LD_LONG + '×D the cutter deflects and chatters: light passes at reduced feed, or EDM. Open the '
            + 'corner radius (a third of the depth or more lets a stiff standard cutter in), or make the pocket shallower.'
          : 'Past a standard cutter\'s reach a long-series end mill runs at reduced feed and depth of cut. Open the corner '
            + 'radius toward a third of the depth so a stiffer, shorter cutter can do it.',
      });
    },
  },
];

/** What machining DFM cannot check from geometry. Printed on every report. */
export const MACHINING_LIMITATIONS: readonly string[] = [
  'Tolerance and surface-finish callouts were not checked — they are on the drawing, not in the '
  + 'solid, and they drive whether a feature is milled, ground or honed.',
  'Tool access and fixturing were not simulated: a feature can be geometrically fine and still '
  + 'unreachable in the chosen setup.',
  'Thread specifications were not verified against standard tap sizes.',
  'Workholding and part distortion under clamping were not assessed.',
];
