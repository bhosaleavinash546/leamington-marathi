/**
 * Blow-moulding DFM, measured per feature.
 *
 * Thresholds mirror `analyseBlowDFM` in `modules/blow-advisor.ts` — the wall
 * floor, the 2x-wall corner radius, the parison L/D — so the geometric pack and
 * the advisor cannot drift apart.
 *
 * Blow moulding is the commodity where the measurement is weakest, and the pack
 * is written around that rather than over it. A blown part is a sealed thin
 * shell, so the single-ray wall reading is unreliable almost everywhere and the
 * kernel's 2·V/S characteristic thickness is the honest wall figure. Rules that
 * need a genuine local wall therefore run on the characteristic value, and say
 * so, instead of pretending each face was measured independently.
 */
import type { GeometricRule, PartContext } from '../types.js';
import { finding } from '../types.js';

/** Below this, a blown wall pinholes and fails top-load. Mirrors analyseBlowDFM. */
export const MIN_BLOWN_WALL_MM = 0.5;
/** External corners must be radiused to at least this multiple of wall. */
export const CORNER_RADIUS_WALL_MULTIPLE = 2;
/** Parison length-to-diameter beyond which sag drifts the wall shot-to-shot. */
export const MAX_PARISON_L_TO_D = 8;

const BLOW_GUIDE = {
  standard: 'Blow-moulding design guidance (SPI/SPE extrusion blow-moulding design guides; '
          + 'mirrored in this tool\'s blow-advisor module)',
  note: 'Industry design-guide figures rather than a formal standard, stated as such so the '
      + 'threshold can be argued with directly.',
};

export const BLOW_MOULDING_RULES: readonly GeometricRule[] = [
  {
    id: 'blow.corner.radius-below-2x-wall',
    commodity: 'blow_moulding',
    title: 'External corner too sharp for the parison to reach',
    appliesTo: ['fillet'],
    source: { ...BLOW_GUIDE, clause: 'External corner radius ≥ 2–3 × nominal wall' },
    evaluate(f, part) {
      const wall = part.medianWallMm;
      if (!wall || wall <= 0 || f.radiusMm === undefined) return null;
      const min = wall * CORNER_RADIUS_WALL_MULTIPLE;
      if (f.radiusMm >= min) return null;
      return finding(this, f, part, {
        severity: 'major',
        detail: `Corner at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm against a `
              + `${min.toFixed(2)} mm minimum (2× the ${wall.toFixed(2)} mm characteristic wall).`,
        measuredField: 'radiusMm', measuredValue: f.radiusMm, unit: 'mm',
        thresholdValue: Number(min.toFixed(2)), comparator: '<',
        recommendation: 'Radius external corners to at least 2–3× wall. A corner is where the '
          + 'parison stretches hardest, so it thins to a fraction of nominal and cracks in '
          + 'service; sharp detail belongs on the least-stretched face.',
      });
    },
  },

  {
    id: 'blow.undercut.needs-split-or-insert',
    commodity: 'blow_moulding',
    title: 'Undercut — the split mould cannot release it',
    appliesTo: ['planar_face'],
    source: {
      ...BLOW_GUIDE,
      clause: 'Undercuts and mould splits',
      note: 'A blow mould is two halves closing on a parison. A face opposing the draw needs a '
          + 'third split, a moving insert or post-mould trimming — each adds tool cost and cycle.',
    },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      const toDraw = 90 + (f.draftDeg ?? 0);
      return finding(this, f, part, {
        severity: 'major',
        detail: `Face ${f.faceIds.join(', ')} sits at ${toDraw.toFixed(1)}° to the mould draw `
              + '(past 90°) and cannot release from a two-part split.',
        measuredField: 'angleToDrawDeg', measuredValue: toDraw, unit: '°',
        thresholdValue: 90, comparator: '>',
        recommendation: 'Re-orient the split line, relax the feature so it draws, or price a '
          + 'moving insert. Deep undercuts on a blown part are often cheaper to trim after '
          + 'moulding than to tool for.',
      });
    },
  },
];

/**
 * Part-level blow-moulding checks — these read the whole part, not a feature.
 *
 * Emitted separately by the runner, the same way casting hot spots are.
 */
export function blowPartLevelFindings(part: PartContext) {
  const out = [];
  const rule = (id: string, title: string, clause: string): GeometricRule => ({
    id, commodity: 'blow_moulding', title, appliesTo: ['planar_face'],
    source: { ...BLOW_GUIDE, clause }, evaluate: () => null,
  });
  const anchor = { id: 'PART', kind: 'planar_face' as const, faceIds: [] as number[] };

  // Wall floor. The characteristic 2·V/S thickness is the honest figure on a
  // sealed thin shell — per-face rays are unreliable there, which is why this
  // is a part-level check rather than a per-face one.
  const wall = part.medianWallMm;
  if (wall && wall > 0 && wall < MIN_BLOWN_WALL_MM) {
    out.push(finding(
      rule('blow.wall.below-minimum', 'Nominal wall below the blow-moulding floor',
           `Nominal wall ≥ ${MIN_BLOWN_WALL_MM} mm`),
      anchor, part, {
        severity: 'major',
        detail: `Characteristic wall (2·V/S) is ${wall.toFixed(2)} mm against a `
              + `${MIN_BLOWN_WALL_MM} mm floor.`,
        measuredField: 'characteristicWallMm', measuredValue: wall, unit: 'mm',
        thresholdValue: MIN_BLOWN_WALL_MM, comparator: '<',
        recommendation: 'Raise nominal wall to 0.6–0.8 mm, or add axial parison programming to '
          + 'thicken the load-bearing zones. Below 0.5 mm a blown wall pinholes and fails top-load.',
      }));
  }

  // Parison sag, from the part's own slenderness. The parison L/D is a process
  // figure, but the PART's length-to-diameter sets the parison it needs, and
  // that is measurable.
  const b = part.bboxMm;
  if (b) {
    const d = [b.x, b.y, b.z].sort((p, q) => p - q);
    const dia = (d[0] + d[1]) / 2;          // mean cross-section, not the long axis
    const lToD = dia > 0 ? d[2] / dia : 0;
    if (lToD > MAX_PARISON_L_TO_D) {
      out.push(finding(
        rule('blow.parison.slenderness-sag', 'Part slenderness implies a sag-prone parison',
             `Parison L/D ≤ ${MAX_PARISON_L_TO_D}`),
        anchor, part, {
          severity: 'minor',
          detail: `Part is ${d[2].toFixed(0)} mm long on a ${dia.toFixed(0)} mm mean section — `
                + `L/D ${lToD.toFixed(1)}.`,
          measuredField: 'partLtoD', measuredValue: lToD, unit: ':1',
          thresholdValue: MAX_PARISON_L_TO_D, comparator: '>',
          recommendation: 'A parison this long sags and thins under its own weight before the '
            + 'mould closes, drifting wall distribution shot to shot. Use an accumulator head or '
            + 'parison programming, or split the part.',
        }));
    }
  }
  return out;
}

/**
 * What blow-moulding DFM cannot check from geometry.
 *
 * Longer than the other packs, and deliberately so: on a blown part the
 * measurement itself is weak, and a reader is entitled to know that before
 * treating a short finding list as reassurance.
 */
export const BLOW_LIMITATIONS: readonly string[] = [
  'Wall figures are the characteristic 2·V/S thickness, not a per-face measurement. On a sealed '
  + 'thin shell the single-ray wall reading is unreliable, so local thin spots — which is where a '
  + 'blown part actually fails — cannot be located from this geometry.',
  'Blow-up ratio was not computed: it needs the parison die diameter, which is a process choice '
  + 'rather than a feature of the part.',
  'Pinch-off and weld-line position were not checked. On an extrusion-blown part the pinch weld '
  + 'is the weakest line and a common failure origin, and where it falls depends on the mould.',
  'Multi-layer barrier construction was not detected. An automotive fuel tank is typically a '
  + 'six-layer coextrusion, and costing it as a monolayer understates material significantly — '
  + 'the layer schedule has to be stated by an engineer.',
  'Top-load and drop performance were not assessed; those need the material and a structural check.',
];
