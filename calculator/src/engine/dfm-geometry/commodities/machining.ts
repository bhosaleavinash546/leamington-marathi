/**
 * Machining DFM, measured per feature.
 *
 * The old engine's machining rules key off `topOpShare` and station counts —
 * shop-loading observations. These read the holes and pockets the kernel
 * actually measured.
 */
import type { GeometricRule } from '../types.js';
import { finding } from '../types.js';

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
