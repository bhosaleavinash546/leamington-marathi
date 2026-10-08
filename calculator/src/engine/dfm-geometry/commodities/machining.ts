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

/**
 * Depth-to-diameter beyond which a standard jobber drill will not reach and the
 * hole needs peck-drilling, an extended-reach tool or gun drilling.
 *
 * Standard jobber drills run to roughly 5×D; parabolic and coolant-through
 * tooling reaches 10–12×D; beyond that it is gun drilling. 5 is the point at
 * which the process changes and cost steps, so that is the reporting threshold.
 */
export const STANDARD_DRILL_LD = 5;
export const EXTENDED_DRILL_LD = 10;

/** Preferred metric drill diameters, mm — a non-listed size means a special tool. */
export const PREFERRED_DRILL_DIA_MM = [
  1, 1.5, 2, 2.5, 3, 3.3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6, 6.8, 7, 7.5, 8, 8.5, 9, 9.5,
  10, 10.5, 11, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 28, 30,
  32, 35, 36, 38, 40, 42, 45, 48, 50,
];

/**
 * Cutter length-to-diameter: a standard end mill cuts to about 3× its diameter; long-series cutters reach
 * further at reduced feed; past about 6× the tool deflects and the corner needs light passes or EDM.
 */
export const CUTTER_LD_STANDARD = 4;
export const CUTTER_LD_LONG = 6;
const LONG_REACH_SOURCE = {
  standard: 'Hubs (Protolabs Network), "How to design parts for CNC machining" — internal edges and cavities',
  url: 'https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/',
  note: '"End mill tools have a limited cutting length (typically 3-4 times their diameter)"; internal corner '
    + 'radius "⅓ x cavity depth (or larger)"; a tool past 6×D counts as deep. Sandvik Coromant fits damped '
    + 'adaptors from 4×D overhang (https://sandvik.coromant.com/en-us/tools/silent-tools/what-is-silent-tools). '
    + 'Reported past 4×D (beyond a standard flute), major past 6×D. ' + "Quoted from the search engine’s extract of the page (the page itself was not opened in this session) — verify against the live URL.",
};

const MACHINERYS = {
  standard: "Machinery's Handbook — drilling: depth-to-diameter limits and standard drill sizes",
  note: 'Standard jobber drills reach ~5×D; parabolic / coolant-through tooling reaches ~10×D; '
      + 'beyond that gun drilling. Reported at the point the process and the cost step.',
};

export const MACHINING_RULES: readonly GeometricRule[] = [
  {
    id: 'machining.hole.depth-beyond-standard-drill',
    commodity: 'machining',
    title: 'Hole deeper than standard drill reach',
    appliesTo: ['hole'],
    source: MACHINERYS,
    evaluate(f, part) {
      if (f.ldRatio === undefined || f.diaMm === undefined) return null;
      if (f.ldRatio <= STANDARD_DRILL_LD) return null;
      const extreme = f.ldRatio > EXTENDED_DRILL_LD;
      return finding(this, f, part, {
        severity: extreme ? 'major' : 'minor',
        detail: `⌀${f.diaMm.toFixed(1)} mm hole is ${f.depthMm?.toFixed(1)} mm deep — `
              + `${f.ldRatio.toFixed(1)}:1 depth-to-diameter.`,
        measuredField: 'ldRatio', measuredValue: f.ldRatio, unit: ':1',
        thresholdValue: STANDARD_DRILL_LD, comparator: '>',
        recommendation: extreme
          ? 'Beyond ~10:1 this is a gun-drilling or trepanning operation. Open the diameter, '
            + 'drill from both ends, or accept a specialist operation and its setup.'
          : 'Beyond ~5:1 needs peck-drilling or extended-reach tooling — slower cycle, higher '
            + 'tool cost and greater breakage risk. Open the diameter if the function allows.',
      });
    },
  },

  {
    id: 'machining.hole.non-preferred-diameter',
    commodity: 'machining',
    title: 'Non-preferred hole diameter — special tool',
    appliesTo: ['hole'],
    source: {
      standard: "Machinery's Handbook — standard twist-drill diameters (metric series)",
      note: 'A diameter off the standard series needs a special or a bore/ream cycle instead of a '
          + 'single drilled pass. Tolerance ±0.05 mm on the match.',
    },
    evaluate(f, part) {
      if (f.diaMm === undefined || f.diaMm <= 0) return null;
      const near = PREFERRED_DRILL_DIA_MM.some(d => Math.abs(d - f.diaMm!) <= 0.05);
      if (near) return null;
      if (f.diaMm > 50) return null;   // above the drilled range — bored anyway, not a finding
      // On a casting a hole above the cored size is cast in and finish-bored, never drilled (CORED_ABOVE_MM).
      if (part.commodity === 'cast_and_machine' && f.diaMm > coredAbove(part.process)) return null;
      const closest = PREFERRED_DRILL_DIA_MM
        .reduce((a, b) => (Math.abs(b - f.diaMm!) < Math.abs(a - f.diaMm!) ? b : a));
      return finding(this, f, part, {
        severity: 'advisory',
        detail: `⌀${f.diaMm.toFixed(2)} mm is not a standard drill size; nearest is `
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
    source: {
      standard: "Machinery's Handbook — end milling: cutter diameter and corner radii",
      note: 'An internal corner cannot be smaller than the cutter that makes it. Below R1 mm the '
          + 'cutter is fragile and slow; the corner is then usually EDM or a broach.',
    },
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
        severity: 'minor',
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
        severity: extreme ? 'major' : 'minor',
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
