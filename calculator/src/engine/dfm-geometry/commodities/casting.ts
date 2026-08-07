/**
 * Casting DFM, measured per feature.
 *
 * What this replaces: the entire casting block in `dfm-dfa.ts` is two rules —
 * "die cost > 18% of part cost" and "material < 35%, verify alloy grade". Both
 * are cost-ratio observations. Neither is casting DFM, and neither can name a
 * face. A foundry engineer asks about draft, section transitions, hot spots,
 * fillets and cores; that is what is here.
 *
 * Thresholds are published figures, cited per rule. Where a source gives a band
 * rather than a number the midpoint is used and the note says so.
 */
import type { GeometricRule, PartContext, ManufacturingFeature } from '../types.js';
import { finding } from '../types.js';

/**
 * Minimum draft by casting route, degrees per side, on an external wall.
 *
 * NADCA publishes 1/2°–1° for die casting on external surfaces; sand casting
 * guidance is 1°–3°; investment tolerates the least because the pattern is
 * consumed. The lower bound of each published band is used as the FAILURE
 * threshold — a wall below the lower bound is unarguable, a wall inside the
 * band is a judgement call and this engine does not raise judgement calls.
 */
export const MIN_DRAFT_DEG: Record<string, number> = {
  hpdc: 0.5, diecast: 0.5, gravity: 1.0, sand: 1.0, investment: 0.5, shell: 1.0,
};
const DEFAULT_MIN_DRAFT = 0.5;   // the most permissive — never over-report

/**
 * The draft source depends on the ROUTE, and getting this wrong is the kind of
 * error a foundry engineer spots immediately: NADCA is the die-casting
 * association and has nothing to say about sand practice. Each route therefore
 * carries its own citation rather than sharing one.
 */
const DRAFT_SOURCE: Record<string, { standard: string; clause?: string; note?: string }> = {
  hpdc: {
    standard: 'NADCA Product Specification Standards for Die Castings',
    clause: 'Draft requirements, external surfaces',
    note: 'Published band 0.5°–1° per side on external walls; the lower bound is used so that '
        + 'only an unarguable failure is reported.',
  },
  investment: {
    standard: 'Investment Casting Institute — design guidance for draft and pattern removal',
    note: 'Investment tolerates the least draft because the pattern is consumed; band 0.5°–1°, '
        + 'lower bound used.',
  },
  sand: {
    standard: 'ASM Handbook Vol. 15, Casting — sand mould design, pattern draft',
    note: 'Sand practice needs more draft than die casting because the pattern must withdraw from '
        + 'a rammed mould. Published band 1°–3° per side; the lower bound is used.',
  },
};
const GENERIC_DRAFT_SOURCE = {
  standard: 'ASM Handbook Vol. 15, Casting — pattern and die draft',
  note: 'Route not stated, so the most permissive published minimum (0.5°) is applied — this '
      + 'under-reports rather than over-reports when the process is unknown.',
};
DRAFT_SOURCE.diecast = DRAFT_SOURCE.hpdc;
DRAFT_SOURCE.gravity = DRAFT_SOURCE.sand;
DRAFT_SOURCE.shell = DRAFT_SOURCE.sand;

export const CASTING_RULES: readonly GeometricRule[] = [
  {
    id: 'casting.draft.insufficient',
    commodity: 'casting',
    title: 'Wall below minimum draft for the casting route',
    appliesTo: ['planar_face'],
    // Declared source is the generic one; `evaluate` swaps in the route-specific
    // citation so the printed reference always matches the threshold applied.
    source: GENERIC_DRAFT_SOURCE,
    evaluate(f, part) {
      // Draft is only defined on wall-like faces. `not_applicable` means an end
      // face perpendicular to the draw — nothing to check, not a failure.
      if (f.draftClass === 'not_applicable' || f.draftDeg === undefined) return null;
      if (f.draftClass === 'undercut') return null;      // its own rule below
      const route = String(part.process ?? '').toLowerCase();
      const min = MIN_DRAFT_DEG[route] ?? DEFAULT_MIN_DRAFT;
      if (f.draftDeg >= min) return null;
      const scoped = { ...this, source: DRAFT_SOURCE[route] ?? GENERIC_DRAFT_SOURCE };
      return finding(scoped, f, part, {
        severity: f.draftDeg === 0 ? 'major' : 'minor',
        detail: `Face ${f.faceIds.join(', ')} draws at ${f.draftDeg.toFixed(2)}° against a `
              + `${min}° minimum for ${part.process ?? 'this route'}.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg, unit: '°',
        thresholdValue: min, comparator: '<',
        recommendation: `Add draft to at least ${min}° per side, or accept the ejection drag and `
          + 'the die wear it causes.',
      });
    },
  },

  {
    id: 'casting.undercut.requires-core',
    commodity: 'casting',
    title: 'Undercut face — needs a slide or a core',
    appliesTo: ['planar_face'],
    source: {
      standard: 'NADCA Product Specification Standards for Die Castings',
      clause: 'Undercuts and moving die components',
      note: 'Any face whose normal opposes the draw cannot release on the main parting; it '
          + 'requires a slide, a loose piece or a core, each of which adds die cost and cycle time.',
    },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      return finding(this, f, part, {
        severity: 'major',
        detail: `Face ${f.faceIds.join(', ')} lies at ${f.draftDeg?.toFixed(1) ?? '>90'}° to the `
              + 'draw and cannot release on the main parting.',
        measuredField: 'draftDeg', measuredValue: f.draftDeg ?? 90, unit: '°',
        thresholdValue: 0, comparator: '<',
        recommendation: 'Re-orient the parting line, or price a slide/core for this feature and '
          + 'carry the die cost and cycle penalty explicitly.',
      });
    },
  },

  {
    id: 'casting.section.abrupt-change',
    commodity: 'casting',
    title: 'Abrupt section change',
    appliesTo: ['planar_face'],
    source: {
      standard: 'ASM Handbook Vol. 15, Casting — design for solidification',
      note: 'A thick-to-thin ratio above ~2:1 across a junction concentrates solidification '
          + 'shrinkage and residual stress. Widely published as a 2:1 guideline; blended '
          + 'transitions are the standard remedy.',
    },
    evaluate(f, part) {
      // Gated at the source: on a solid part `sectionRatio` is never emitted,
      // because single-ray thickness there measures the envelope, not a wall.
      if (part.featureSet.wallAnalysisValid === false) return null;
      if (f.sectionRatio === undefined || f.neighbourMinThicknessMm === undefined) return null;
      if (f.sectionRatio <= 2) return null;
      return finding(this, f, part, {
        severity: f.sectionRatio > 3 ? 'major' : 'minor',
        detail: `Section steps ${f.sectionRatio.toFixed(2)}:1 at face ${f.faceIds.join(', ')} `
              + `(${f.thicknessMm?.toFixed(1)} mm against an adjacent ${f.neighbourMinThicknessMm.toFixed(1)} mm).`,
        measuredField: 'sectionRatio', measuredValue: f.sectionRatio, unit: ':1',
        thresholdValue: 2, comparator: '>',
        recommendation: 'Blend the transition with a taper or a generous fillet so the section '
          + 'changes gradually; expect shrinkage porosity at the junction otherwise.',
      });
    },
  },

  {
    id: 'casting.fillet.sharp-internal-corner',
    commodity: 'casting',
    title: 'Sharp internal corner',
    appliesTo: ['fillet'],
    source: {
      standard: 'ASM Handbook Vol. 15, Casting — fillets and corner radii',
      note: 'Internal corners are stress raisers and hot spots. Common guidance is a fillet of '
          + 'roughly half the local wall; a radius under ~1 mm is treated as effectively sharp.',
    },
    evaluate(f, part) {
      if (f.radiusMm === undefined) return null;
      if (f.radiusMm >= 1.0) return null;
      return finding(this, f, part, {
        severity: 'minor',
        detail: `Fillet at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm — `
              + 'effectively a sharp internal corner.',
        measuredField: 'radiusMm', measuredValue: f.radiusMm, unit: 'mm',
        thresholdValue: 1.0, comparator: '<',
        recommendation: 'Increase the fillet toward half the adjoining wall thickness to relieve '
          + 'the stress concentration and the local hot spot.',
      });
    },
  },
];

/**
 * Hot spots are a PART-level finding, not a per-feature one — they come from
 * the thickness field rather than from a named feature — so they are produced
 * separately and appended by the runner.
 */
export function castingHotSpotFindings(part: PartContext) {
  const fs = part.featureSet;
  if (fs.wallAnalysisValid === false) return [];
  const med = fs.medianThicknessMm;
  if (!med || !fs.hotSpots?.length) return [];
  const rule: GeometricRule = {
    id: 'casting.hotspot.isolated-heavy-section',
    commodity: 'casting',
    title: 'Isolated heavy section — shrinkage porosity risk',
    appliesTo: ['planar_face'],
    source: {
      standard: 'ASM Handbook Vol. 15, Casting — riser and feeding design',
      note: 'A section markedly heavier than the surrounding wall solidifies last and cannot be '
          + 'fed, producing centreline shrinkage. Flagged at 2x the part median wall.',
    },
    evaluate: () => null,
  };
  return fs.hotSpots.map(h => finding(
    rule,
    { id: `HS${h.faceId}`, kind: 'planar_face', faceIds: [h.faceId],
      positionMm: h.positionMm as [number, number, number] } as ManufacturingFeature,
    part,
    {
      severity: h.vsMedianRatio >= 3 ? 'major' : 'minor',
      detail: `Face ${h.faceId} measures ${h.thicknessMm.toFixed(1)} mm against a part median of `
            + `${med.toFixed(1)} mm — ${h.vsMedianRatio.toFixed(1)}x heavier.`,
      measuredField: 'thicknessMm', measuredValue: h.thicknessMm, unit: 'mm',
      thresholdValue: med * 2, comparator: '>',
      recommendation: 'Core out the heavy section, or add a riser/chill so it can be fed. '
        + 'Untreated, expect centreline shrinkage porosity here.',
    },
  ));
}

/**
 * What casting DFM cannot check from geometry, whatever the part.
 *
 * Printed on every report. A short finding list must never be mistaken for a
 * clean part — these are the checks a foundry engineer would expect and that
 * no amount of B-rep analysis can supply.
 */
export const CASTING_LIMITATIONS: readonly string[] = [
  'Tolerance and datum callouts were not checked — they live on the drawing, not in the solid.',
  'Parting-line position was assumed to lie perpendicular to the draw direction; a different '
  + 'parting choice changes which faces are undercuts.',
  'Machining stock allowance on cast surfaces was not assessed — it is a process decision, not a '
  + 'measurable feature.',
  'Gating and feeding layout was not evaluated; hot spots are reported, but where to place risers '
  + 'is a foundry decision.',
];
