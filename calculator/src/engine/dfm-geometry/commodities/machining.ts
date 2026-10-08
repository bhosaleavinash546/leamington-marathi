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

/** Source text found in the publishers' OWN pages, as a search engine extracted them — the pages themselves could
 *  not be opened from this environment (egress policy), so every quote below says so. Verify against the live URL. */
const EXTRACT_NOTE = 'Quoted from the search engine’s extract of the publisher’s page (the page itself could not be opened '
  + 'here) — verify against the live URL.';

/** A CostVision rule of thumb with no published figure behind it — said so, not dressed as a citation. */
export const OWN_HEURISTIC = (what: string) => ({
  standard: 'CostVision engineering heuristic (not a published standard)',
  note: what,
});

/**
 * Depth-to-diameter beyond which a standard drill is no longer the recommended tool, and beyond which it is a
 * specialist operation. Hubs: "Recommended hole depth: 4 x nominal diameter. Typical: 10 x nominal diameter";
 * MSC: holes "more than 10 diameters deep … requires a specialty drill".
 */
export const STANDARD_DRILL_LD = 4;
export const EXTENDED_DRILL_LD = 10;
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
  standard: 'Hubs (Protolabs Network), "How to design parts for CNC machining" — holes',
  url: 'https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/',
  note: '"Specify hole diameters in 0.1 mm increments up to 10 mm, and in 0.5 mm increments above 10 mm." ' + EXTRACT_NOTE
    + ' The tool accepts 0.1 mm steps to \u230013 because jobber drills are stocked that finely there (the M12 tap drill is \u230010.2), '
    + 'so a stock tap drill is never called special.',
};

/**
 * Cutter length-to-diameter. Hubs: cutting length "2-3 times" the diameter is best and "up to four times" costs more;
 * a cavity "greater than six times the tool diameter" is deep.
 */
export const CUTTER_LD_STANDARD = 4;
export const CUTTER_LD_LONG = 6;
const LONG_REACH_SOURCE = {
  standard: 'Hubs (Protolabs Network), "How to design parts for CNC machining" — internal edges and cavities',
  url: 'https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/',
  note: 'Tools cut best at 2–3× their diameter and reach "up to four times" at extra cost; cavities "greater than six times '
    + 'the tool diameter are considered deep"; internal corner radius "⅓ x cavity depth (or larger)". Sandvik Coromant fits '
    + 'damped adaptors from 4×D overhang. Reported past 4×D, major past 6×D. ' + EXTRACT_NOTE,
};

const DRILL_DEPTH_SOURCE = {
  standard: 'Hubs (Protolabs Network), "How to design parts for CNC machining" — holes; MSC Industrial Supply, deep-hole drilling',
  url: 'https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/',
  note: 'Hubs: "Recommended hole depth: 4 x nominal diameter. Typical: 10 x nominal diameter." MSC: a hole "more than 10 '
    + 'diameters deep … requires a specialty drill". Major past 4×D, critical past 10×D (gun drilling). ' + EXTRACT_NOTE,
};

export const MACHINING_RULES: readonly GeometricRule[] = [
  {
    id: 'machining.hole.depth-beyond-standard-drill',
    commodity: 'machining',
    title: 'Hole deeper than standard drill reach',
    appliesTo: ['hole'],
    source: DRILL_DEPTH_SOURCE,
    evaluate(f, part) {
      if (f.ldRatio === undefined || f.diaMm === undefined) return null;
      if (f.diaMm > DRILLED_MAX_DIA_MM) return null;   // bored / helical-milled, not drilled
      if (f.ldRatio <= STANDARD_DRILL_LD) return null;
      const extreme = f.ldRatio > EXTENDED_DRILL_LD;
      return finding(this, f, part, {
        // Major from 4×D: peck drilling or extended-reach tooling is a slower cycle, dearer tools and broken drills —
        // a cost driver, not a footnote. Critical past 10×D: a gun-drilling / trepanning operation of its own, often a
        // specialist subcontract (demo review, Oct 2026).
        severity: extreme ? 'critical' : 'major',
        detail: `⌀${f.diaMm.toFixed(1)} mm hole is ${f.depthMm?.toFixed(1)} mm deep — `
              + `${f.ldRatio.toFixed(1)}:1 depth-to-diameter.`,
        measuredField: 'ldRatio', measuredValue: f.ldRatio, unit: ':1',
        thresholdValue: STANDARD_DRILL_LD, comparator: '>',
        recommendation: extreme
          ? 'Beyond ~10:1 this is a gun-drilling or trepanning operation. Open the diameter, '
            + 'drill from both ends, or accept a specialist operation and its setup.'
          : 'Beyond ~4:1 needs peck-drilling or extended-reach tooling — slower cycle, higher '
            + 'tool cost and greater breakage risk. Open the diameter if the function allows.',
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
      if (f.diaMm > DRILLED_MAX_DIA_MM) return null;   // above the drilled range — bored / helical-milled, any size, one tool
      // On a casting a hole above the cored size is cast in and finish-bored, never drilled (CORED_ABOVE_MM).
      if (part.commodity === 'cast_and_machine' && f.diaMm > coredAbove(part.process)) return null;
      const closest = nearestStockDrill(f.diaMm);
      return finding(this, f, part, {
        severity: 'advisory',
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
