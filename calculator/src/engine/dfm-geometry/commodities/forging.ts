/**
 * Forging DFM, measured per feature.
 *
 * Every threshold here is read from `FORGING_PROCESS_REFERENCE` in
 * `modules/forging-advisor.ts` rather than restated. That table is documented,
 * unit-tested and already drives the costing, so a forging rule and a forging
 * cost cannot disagree about what a closed-die minimum web is. Restating the
 * numbers would create exactly the second-source-of-truth problem that made the
 * casting yield constants drift 2x from the advisor bands.
 *
 * Process matters more here than on any other commodity: a 3 mm web is a
 * non-fill on closed-die (minimum 3.0 mm) and perfectly routine on cold-forming
 * (minimum 1.0 mm). Where the route is unstated the pack applies the MOST
 * PERMISSIVE minimum across all routes, so an unknown process under-reports
 * rather than inventing failures.
 */
import type { GeometricRule, PartContext, RuleSource } from '../types.js';
import { finding } from '../types.js';
import {
  FORGING_PROCESS_REFERENCE, type ForgingProcess,
} from '../../modules/forging-advisor.js';

const ROUTES = Object.keys(FORGING_PROCESS_REFERENCE) as ForgingProcess[];

/** Resolve the route from the part context, or null when it was not stated. */
function routeOf(part: PartContext): ForgingProcess | null {
  const p = String(part.process ?? '').toLowerCase().replace(/[\s_]/g, '-');
  return (ROUTES as string[]).includes(p) ? p as ForgingProcess : null;
}

/**
 * The most permissive web across all routes — used when the route is unknown.
 *
 * There is deliberately no equivalent for draft: three of the five routes
 * (open-die, ring-rolling, cold-forming) require none at all, so the permissive
 * value is zero and the draft rule simply does not run without a stated route.
 */
const LOOSEST_WEB_MM = Math.min(...ROUTES.map(r => FORGING_PROCESS_REFERENCE[r].minWebMm));

function webSource(route: ForgingProcess | null): RuleSource {
  const ref = route ? FORGING_PROCESS_REFERENCE[route] : null;
  return {
    standard: 'ASM Handbook Vol. 14A, Metalworking: Bulk Forming — forging design',
    clause: ref ? `${ref.label}: minimum web ${ref.minWebMm} mm` : 'Minimum forged web by route',
    note: ref
      ? `Threshold read from FORGING_PROCESS_REFERENCE.${route}, the same table the forging `
        + 'costing uses, so a DFM finding and a cost estimate cannot disagree about the route.'
      : `Forging route not stated, so the most permissive minimum across all routes `
        + `(${LOOSEST_WEB_MM} mm, cold-forming) is applied. A stated route tightens this `
        + `considerably — closed-die is ${FORGING_PROCESS_REFERENCE['closed-die'].minWebMm} mm.`,
  };
}

function draftSource(route: ForgingProcess | null): RuleSource {
  const ref = route ? FORGING_PROCESS_REFERENCE[route] : null;
  return {
    standard: 'ASM Handbook Vol. 14A, Metalworking: Bulk Forming — die draft',
    clause: ref ? `${ref.label}: minimum draft ${ref.draftDegMin}°` : 'Minimum die draft by route',
    note: ref
      ? 'Threshold read from FORGING_PROCESS_REFERENCE, the table the costing uses. Deep '
        + 'impressions need more than the minimum — 5–7° is common practice.'
      : 'Forging route not stated. Open-die, ring-rolling and cold-forming carry no draft '
        + 'requirement at all, so with an unknown route this check does not run rather than '
        + 'assume an impression die.',
  };
}

export const FORGING_RULES: readonly GeometricRule[] = [
  {
    id: 'forging.web.below-process-minimum',
    commodity: 'forging',
    title: 'Web thinner than the route will reliably fill',
    appliesTo: ['planar_face'],
    source: webSource(null),
    evaluate(f, part) {
      // Wall readings on a solid forging are the part envelope, not a web —
      // the same guard the casting pack uses.
      if (part.featureSet.wallAnalysisValid === false) return null;
      if (f.thicknessMm === undefined) return null;
      const route = routeOf(part);
      const min = route ? FORGING_PROCESS_REFERENCE[route].minWebMm : LOOSEST_WEB_MM;
      if (f.thicknessMm >= min) return null;
      const scoped = { ...this, source: webSource(route) };
      return finding(scoped, f, part, {
        severity: f.thicknessMm < min * 0.6 ? 'critical' : 'major',
        detail: `Face ${f.faceIds.join(', ')} measures ${f.thicknessMm.toFixed(2)} mm against a `
              + `${min} mm minimum web for ${route ?? 'the most permissive forging route'}.`,
        measuredField: 'thicknessMm', measuredValue: f.thicknessMm, unit: 'mm',
        thresholdValue: min, comparator: '<',
        recommendation: `Thicken the web to at least ${min} mm, or move to a route that reaches `
          + `it — precision forging fills to ${FORGING_PROCESS_REFERENCE.precision.minWebMm} mm and `
          + `cold forming to ${FORGING_PROCESS_REFERENCE['cold-forming'].minWebMm} mm. A thin web `
          + 'chills before the die closes, giving non-fill, laps and heavy die pressure.',
      });
    },
  },

  {
    id: 'forging.draft.below-process-minimum',
    commodity: 'forging',
    title: 'Impression wall below minimum die draft',
    appliesTo: ['planar_face'],
    source: draftSource(null),
    evaluate(f, part) {
      if (f.draftClass === 'not_applicable' || f.draftDeg === undefined) return null;
      if (f.draftClass === 'undercut') return null;          // its own rule
      const route = routeOf(part);
      // With no route stated this check does NOT run: three of the five forging
      // routes require no draft at all, so firing here would invent failures on
      // open-die, ring-rolled and cold-formed parts.
      if (!route) return null;
      const min = FORGING_PROCESS_REFERENCE[route].draftDegMin;
      if (min <= 0) return null;                              // route needs no draft
      if (f.draftDeg >= min) return null;
      const scoped = { ...this, source: draftSource(route) };
      return finding(scoped, f, part, {
        severity: f.draftDeg === 0 ? 'major' : 'minor',
        detail: `Face ${f.faceIds.join(', ')} draws at ${f.draftDeg.toFixed(2)}° against a `
              + `${min}° minimum for ${route}.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg, unit: '°',
        thresholdValue: min, comparator: '<',
        recommendation: `Add at least ${min}° of draft on impression walls — deep cavities need `
          + '5–7°. Without it the forging galls in the die, ejection cracks appear and die life '
          + 'falls sharply.',
      });
    },
  },

  {
    id: 'forging.undercut.cannot-release',
    commodity: 'forging',
    title: 'Undercut — cannot release from an impression die',
    appliesTo: ['planar_face'],
    source: {
      standard: 'ASM Handbook Vol. 14A, Metalworking: Bulk Forming — die design and parting',
      note: 'A forging die has no slides or cores: the part must lift straight out of the '
          + 'impression. A face whose normal opposes the draw cannot be forged on that parting '
          + 'and has to be machined afterwards, or the parting has to move.',
    },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      const toDraw = 90 + (f.draftDeg ?? 0);
      return finding(this, f, part, {
        severity: 'major',
        detail: `Face ${f.faceIds.join(', ')} sits at ${toDraw.toFixed(1)}° to the draw (past 90°) `
              + 'and cannot lift out of an impression die.',
        measuredField: 'angleToDrawDeg', measuredValue: toDraw, unit: '°',
        thresholdValue: 90, comparator: '>',
        recommendation: 'Move the parting line, or accept the feature as a machined operation '
          + 'after forging and carry that cost. Unlike casting or moulding, a forging die cannot '
          + 'buy its way out with a slide.',
      });
    },
  },

  {
    id: 'forging.fillet.too-sharp-for-metal-flow',
    commodity: 'forging',
    title: 'Fillet too sharp for hot metal flow',
    appliesTo: ['fillet'],
    source: {
      standard: 'ASM Handbook Vol. 14A, Metalworking: Bulk Forming — fillet and corner radii',
      clause: 'Minimum fillet radius on hot forgings ≈ 3 mm',
      note: 'Mirrors the 3 mm threshold in analyseForgingDFM. Cold forming is exempt: it flows '
          + 'metal at room temperature into tighter radii, so the rule does not run for that route.',
    },
    evaluate(f, part) {
      if (f.radiusMm === undefined) return null;
      if (routeOf(part) === 'cold-forming') return null;
      if (f.radiusMm >= 3) return null;
      return finding(this, f, part, {
        severity: 'major',
        detail: `Fillet at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm against a `
              + '3 mm minimum for hot forging.',
        measuredField: 'radiusMm', measuredValue: f.radiusMm, unit: 'mm',
        thresholdValue: 3, comparator: '<',
        recommendation: 'Open the fillet to at least R3 mm. Hot metal will not turn a sharp '
          + 'corner: it folds instead, producing laps that only show up at magnetic-particle '
          + 'inspection, and the sharp die corner is where the die itself cracks first.',
      });
    },
  },
];

/**
 * What forging DFM cannot check from geometry.
 *
 * The first two are the ones a forging engineer will ask about immediately, and
 * neither is a shape question — which is exactly why they are listed rather
 * than approximated.
 */
export const FORGING_LIMITATIONS: readonly string[] = [
  'Grain-flow alignment was not assessed. Whether the forged flow lines follow the principal '
  + 'load path is the single largest reason to forge a part rather than cast or machine it, and '
  + 'it depends on the die design and preform, not on the finished shape.',
  'Parting-line position was assumed perpendicular to the draw. A different parting changes which '
  + 'faces are undercuts and where the flash line falls; if the flash line crosses a sealing or '
  + 'highly-loaded face that is a defect the geometry cannot reveal.',
  'Machining stock allowance on forged surfaces was not checked — it is a process decision.',
  'Rib height-to-thickness was not computed: it needs rib identification, and the kernel does not '
  + 'yet separate a rib from any other thin planar region.',
  'Billet and preform design, and therefore realistic flash loss, were not evaluated.',
];
