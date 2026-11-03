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
import { finding, isBlend, undercutEvidence, onMachinedFace, plausibleWall } from '../types.js';
import {
  FORGING_PROCESS_REFERENCE, type ForgingProcess,
} from '../../modules/forging-advisor.js';

const ROUTES = Object.keys(FORGING_PROCESS_REFERENCE) as ForgingProcess[];
/** Below this a radius on a finished (machined) model is more likely an edge break than a formed fillet. */
export const EDGE_BREAK_MAX_MM = 0.5;

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
    standard: 'CostVision engineering heuristic \u2014 the forging route table (engineering-typical values, not sourced)',
    clause: ref ? `${ref.label}: minimum web ${ref.minWebMm} mm` : 'Minimum forged web by route',
    note: ref
      ? 'The same route table the forging costing uses, so a DFM finding and the costing cannot disagree about the route. '
        + 'EN 10243-1 sets the tolerances of steel die forgings; it is not the source of this minimum.'
      : `Forging route not stated, so the most permissive minimum across all routes `
        + `(${LOOSEST_WEB_MM} mm, cold-forming) is applied. A stated route tightens this `
        + `considerably — closed-die is ${FORGING_PROCESS_REFERENCE['closed-die'].minWebMm} mm.`,
  };
}

function draftSource(route: ForgingProcess | null): RuleSource {
  const ref = route ? FORGING_PROCESS_REFERENCE[route] : null;
  return {
    standard: 'CostVision engineering heuristic \u2014 the forging route table (engineering-typical values, not sourced)',
    clause: ref ? `${ref.label}: minimum draft ${ref.draftDegMin}°` : 'Minimum die draft by route',
    note: ref
      ? 'The route table the forging costing uses. DIN 7523-2 gives die-forging draft by impression depth; it is not applied '
        + 'here, and deep impressions need more than this floor.'
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
      // a wall, not a ray grazing a sliver (the knuckle read a 0.15 mm "web" at a fillet) or crossing a cavity
      if (!plausibleWall(f.thicknessMm, part)) return null;
      if (onMachinedFace(f, part)) return null;
      const route = routeOf(part);
      const min = route ? FORGING_PROCESS_REFERENCE[route].minWebMm : LOOSEST_WEB_MM;
      if (f.thicknessMm >= min) return null;
      const scoped = { ...this, source: webSource(route) };
      return finding(scoped, f, part, {
        severity: f.thicknessMm < min * 0.6 ? 'blocking' : 'risk',
        detail: `As-forged face ${f.faceIds.join(', ')} measures ${f.thicknessMm.toFixed(2)} mm against a `
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
      if (onMachinedFace(f, part)) return null;              // a machined face carries stock, not draft
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
        severity: 'risk',
        detail: `As-forged face ${f.faceIds.join(', ')}${f.areaMm2 !== undefined ? ` (${f.areaMm2.toFixed(0)} mm²)` : ''} draws at `
              + `${f.draftDeg.toFixed(2)}° against a ${min}° minimum for ${route}.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg, unit: '°',
        thresholdValue: min, comparator: '<',
        recommendation: `Add at least ${min}° of draft on impression walls (deep impressions need more). Without it the `
          + 'forging galls in the die and die life falls. Draft adds metal: the costed as-forged weight is the finished model '
          + 'plus machining stock and carries no draft metal.',
      });
    },
  },

  {
    id: 'forging.undercut.cannot-release',
    commodity: 'forging',
    title: 'Undercut — cannot release from an impression die',
    appliesTo: ['planar_face'],
    source: {
      standard: 'Impression-die forging practice (a forging die has no slides) \u2014 a principle, not a numeric threshold',
      note: 'A forging die has no slides or cores: the part must lift straight out of the '
          + 'impression. A face the part blocks along its line of release cannot be forged on that parting '
          + 'and has to be machined afterwards, or the parting has to move.',
    },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      if (onMachinedFace(f, part)) return null;              // cut after forging, not formed by the die
      return finding(this, f, part, {
        // On a face the costing leaves as-forged, the part cannot leave the die as drawn.
        severity: 'blocking',
        ...undercutEvidence(f, 'impression die'),
        recommendation: 'Move the parting line, or machine the feature after forging and add that operation to the costing '
          + '(it is not in it: the costing leaves this face as-forged). A forging die has no slides.',
      });
    },
  },

  {
    id: 'forging.fillet.too-sharp-for-metal-flow',
    commodity: 'forging',
    title: 'Fillet too sharp for hot metal flow',
    appliesTo: ['fillet'],
    source: {
      standard: 'CostVision engineering heuristic (not a published standard) \u2014 3 mm floor for an internal fillet in hot forging',
      clause: 'DIN 7523-2 gives fillet radii (internal) and edge radii (external) by rib height; that table is not applied here',
      note: 'The same 3 mm floor the forging advisor uses. Only concave (internal) fillets on as-forged faces are judged: an '
          + 'external round is an edge radius with a smaller floor, and a radius on a machined face is the tool\u2019s. Cold '
          + 'forming is exempt.',
    },
    evaluate(f, part) {
      if (!isBlend(f) || f.radiusMm === undefined) return null; // a blend — not a slot end or a half-hole
      // An INTERNAL fillet: a convex blend is an edge radius (an edge break on a finished model), not where metal folds.
      if (f.concave !== true) return null;
      if (onMachinedFace(f, part)) return null;              // cut with a machined face: the tool's radius
      if (routeOf(part) === 'cold-forming') return null;
      if (f.radiusMm >= 3) return null;
      const edgeBreak = f.radiusMm < EDGE_BREAK_MAX_MM;
      return finding(this, f, part, {
        severity: 'risk',
        detail: `As-forged internal fillet at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm against a `
              + '3 mm minimum for hot forging.'
              + (edgeBreak ? ' Under R0.5 on a finished model it may be a machined feature the costing does not machine — '
                + 'check it against the forging drawing.' : ''),
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
