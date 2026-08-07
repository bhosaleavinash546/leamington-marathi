/**
 * Injection-moulding DFM, measured per feature.
 *
 * The rib-to-wall and boss-to-wall ratios below are the two most-cited
 * moulding rules in existence, and both are computable from the measured
 * geometry — which is why the old cost-ratio engine's inability to reach them
 * was the whole complaint.
 */
import type { GeometricRule } from '../types.js';
import { finding } from '../types.js';

/** Rib base thickness as a fraction of the wall it sits on, above which sink shows. */
export const RIB_TO_WALL_MAX = 0.6;
/** Boss outer diameter as a multiple of wall, above which sink shows on the A-side. */
export const BOSS_TO_WALL_MAX = 2.5;
/** Minimum draft per side on a moulded wall, degrees. */
export const MIN_MOULD_DRAFT_DEG = 0.5;

const DFM_TEXT = {
  standard: 'Injection-moulding design guidelines (widely published; e.g. Protolabs / Xometry '
          + 'design-for-moulding guides and the Plastics Design Library handbook)',
  note: 'These are industry design-guide figures rather than a formal standard, and are stated '
      + 'as such so an engineer can argue with the number rather than with the tool.',
};

export const INJECTION_MOULDING_RULES: readonly GeometricRule[] = [
  {
    id: 'moulding.rib.thicker-than-0p6-wall',
    commodity: 'injection_moulding',
    title: 'Rib or wall thicker than 0.6× the adjoining wall — sink risk',
    appliesTo: ['planar_face'],
    source: { ...DFM_TEXT, clause: 'Rib thickness ≤ 0.5–0.6 × nominal wall' },
    evaluate(f, part) {
      if (part.featureSet.wallAnalysisValid === false) return null;
      if (f.thicknessMm === undefined || f.neighbourMinThicknessMm === undefined) return null;
      const thin = f.neighbourMinThicknessMm;
      if (thin <= 0) return null;
      // Only meaningful in the thick-relative-to-neighbour direction.
      const ratio = f.thicknessMm / thin;
      if (ratio <= 1 / RIB_TO_WALL_MAX) return null;     // 1/0.6 = 1.67
      return finding(this, f, part, {
        severity: ratio > 2.5 ? 'major' : 'minor',
        detail: `Face ${f.faceIds.join(', ')} is ${f.thicknessMm.toFixed(2)} mm against an `
              + `adjoining ${thin.toFixed(2)} mm — ${ratio.toFixed(2)}× the thinner section.`,
        measuredField: 'thicknessRatio', measuredValue: ratio, unit: '×',
        thresholdValue: Number((1 / RIB_TO_WALL_MAX).toFixed(2)), comparator: '>',
        recommendation: `Reduce the thick section to ≤${RIB_TO_WALL_MAX}× the nominal wall, or `
          + 'core it out. Expect a visible sink mark on the opposite face otherwise.',
      });
    },
  },

  {
    id: 'moulding.boss.wall-ratio',
    commodity: 'injection_moulding',
    title: 'Boss diameter large relative to the local wall — sink risk',
    appliesTo: ['boss'],
    source: { ...DFM_TEXT, clause: 'Boss outer diameter ≈ 2–2.5 × nominal wall' },
    evaluate(f, part) {
      if (part.featureSet.wallAnalysisValid === false) return null;
      if (f.bossToWallRatio === undefined || f.diaMm === undefined) return null;
      if (f.bossToWallRatio <= BOSS_TO_WALL_MAX) return null;
      return finding(this, f, part, {
        severity: 'minor',
        detail: `Boss ⌀${f.diaMm.toFixed(1)} mm sits on a ${f.neighbourWallMm?.toFixed(2)} mm wall `
              + `— ${f.bossToWallRatio.toFixed(2)}× the wall.`,
        measuredField: 'bossToWallRatio', measuredValue: f.bossToWallRatio, unit: '×',
        thresholdValue: BOSS_TO_WALL_MAX, comparator: '>',
        recommendation: 'Core the boss to a uniform wall and support it with gussets rather than '
          + 'making it solid; a solid boss this size will sink on the show face.',
      });
    },
  },

  {
    id: 'moulding.draft.insufficient',
    commodity: 'injection_moulding',
    title: 'Moulded wall below minimum draft',
    appliesTo: ['planar_face'],
    source: { ...DFM_TEXT, clause: 'Draft ≥ 0.5° per side on untextured walls; more with texture' },
    evaluate(f, part) {
      if (f.draftClass === 'not_applicable' || f.draftDeg === undefined) return null;
      if (f.draftClass === 'undercut') return null;
      if (f.draftDeg >= MIN_MOULD_DRAFT_DEG) return null;
      return finding(this, f, part, {
        severity: f.draftDeg === 0 ? 'major' : 'minor',
        detail: `Face ${f.faceIds.join(', ')} draws at ${f.draftDeg.toFixed(2)}° against a `
              + `${MIN_MOULD_DRAFT_DEG}° minimum.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg, unit: '°',
        thresholdValue: MIN_MOULD_DRAFT_DEG, comparator: '<',
        recommendation: 'Add draft to at least 0.5° per side — more if the face is textured, '
          + 'roughly 1° per 0.025 mm of texture depth. Otherwise expect ejector drag marks.',
      });
    },
  },

  {
    id: 'moulding.undercut.requires-side-action',
    commodity: 'injection_moulding',
    title: 'Undercut — needs a side action or lifter',
    appliesTo: ['planar_face'],
    source: { ...DFM_TEXT, clause: 'Undercuts and moving mould components' },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      return finding(this, f, part, {
        severity: 'major',
        detail: `Face ${f.faceIds.join(', ')} opposes the draw and cannot eject on the main parting.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg ?? 90, unit: '°',
        thresholdValue: 0, comparator: '<',
        recommendation: 'Re-orient the parting, redesign the feature to draw, or price a slide / '
          + 'lifter — each adds mould cost and lengthens the cycle.',
      });
    },
  },
];

/** What moulding DFM cannot check from geometry. Printed on every report. */
export const MOULDING_LIMITATIONS: readonly string[] = [
  'Gate position and flow length were not evaluated — they are a tooling decision, not a feature '
  + 'of the solid.',
  'Weld-line position was not checked; whether a knit line falls on a functional or cosmetic face '
  + 'is a moulding-simulation question.',
  'Texture depth was not read, so the draft threshold applied is the untextured minimum — a '
  + 'textured face needs roughly 1° more per 0.025 mm of texture depth.',
  'Resin shrinkage and warp were not modelled; those need the material and a flow analysis.',
];
