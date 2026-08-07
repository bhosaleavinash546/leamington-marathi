/**
 * Sheet-metal DFM, measured per feature.
 *
 * Sheet metal is the commodity where the kernel's aggregate view is weakest —
 * it measures bend count and total bend length but not per-bend geometry, so
 * the bend-relief and flange-length rules that need a named bend cannot run
 * from what is measured today. Those are declared as gaps rather than
 * approximated: `SHEET_METAL_LIMITATIONS` is printed on the report so nobody
 * reads a short finding list as a clean part.
 */
import type { GeometricRule, PartContext } from '../types.js';
import { finding } from '../types.js';

/**
 * Minimum distance from a hole edge to a bend line, as a multiple of material
 * thickness, before the hole distorts as the bend forms.
 */
export const HOLE_TO_BEND_MIN_T = 2.5;

/** Minimum hole diameter as a multiple of thickness for punching without cracking. */
export const MIN_PUNCH_DIA_T = 1.0;

const SM_GUIDE = {
  standard: 'Sheet-metal design guidelines (widely published; e.g. Xometry / Protolabs '
          + 'sheet-metal design guides, and Machinery\'s Handbook press-working sections)',
  note: 'Industry design-guide figures rather than a formal standard, stated as such so the '
      + 'threshold can be argued with directly.',
};

export const SHEET_METAL_RULES: readonly GeometricRule[] = [
  {
    id: 'sheetmetal.hole.smaller-than-thickness',
    commodity: 'sheet_metal',
    title: 'Punched hole smaller than material thickness',
    appliesTo: ['hole'],
    source: { ...SM_GUIDE, clause: 'Minimum punched hole diameter ≥ material thickness' },
    evaluate(f, part) {
      const t = part.medianWallMm;
      if (!t || t <= 0 || f.diaMm === undefined) return null;
      // Only meaningful when the wall reading is a genuine sheet thickness.
      if (part.featureSet.wallAnalysisValid === false) return null;
      const ratio = f.diaMm / t;
      if (ratio >= MIN_PUNCH_DIA_T) return null;
      return finding(this, f, part, {
        severity: 'major',
        detail: `⌀${f.diaMm.toFixed(2)} mm hole in ${t.toFixed(2)} mm material — `
              + `${ratio.toFixed(2)}× thickness.`,
        measuredField: 'diaToThicknessRatio', measuredValue: ratio, unit: '×',
        thresholdValue: MIN_PUNCH_DIA_T, comparator: '<',
        recommendation: 'Open the hole to at least material thickness, or drill/laser it instead '
          + 'of punching — a punch this small breaks and tears the edge.',
      });
    },
  },

  {
    id: 'sheetmetal.hole.deep-relative-to-diameter',
    commodity: 'sheet_metal',
    title: 'Hole depth inconsistent with a sheet part',
    appliesTo: ['hole'],
    source: { ...SM_GUIDE, clause: 'Punched features in thin material' },
    evaluate(f, part) {
      if (f.ldRatio === undefined || f.diaMm === undefined) return null;
      if (f.ldRatio <= 3) return null;
      return finding(this, f, part, {
        severity: 'advisory',
        detail: `⌀${f.diaMm.toFixed(1)} mm hole is ${f.depthMm?.toFixed(1)} mm deep `
              + `(${f.ldRatio.toFixed(1)}:1) — deeper than a punched sheet feature.`,
        measuredField: 'ldRatio', measuredValue: f.ldRatio, unit: ':1',
        thresholdValue: 3, comparator: '>',
        recommendation: 'Confirm this is a formed collar / extruded hole rather than a punched '
          + 'one — the two cost very differently. If it is a plain hole, the part may not be '
          + 'sheet metal.',
      });
    },
  },
];

/**
 * What sheet-metal DFM CANNOT check from the geometry as measured today.
 *
 * Stated explicitly and printed on the report. A DFM tool that returns two
 * findings on a stamping and says nothing else invites the reader to conclude
 * the part is fine; these are the checks a press-shop engineer would expect and
 * we cannot yet perform.
 */
export const SHEET_METAL_LIMITATIONS: readonly string[] = [
  'Bend-to-hole distance was not checked: the kernel measures bend COUNT and total bend length '
  + 'but does not yet emit per-bend lines, so the distance from each hole to its nearest bend '
  + 'cannot be computed.',
  'Flange length against tooling minimum was not checked, for the same reason.',
  'Bend relief at notches was not checked — it needs per-bend endpoints.',
  'Bend radius against material thickness was not checked — it needs the per-bend inner radius.',
  'Blank utilisation was not checked — it needs a flat pattern, which the kernel does not unfold.',
];

/** Sheet-metal fab shares the pack; the commodity label differs only in costing. */
export function sheetMetalRulesFor(commodity: PartContext['commodity']): readonly GeometricRule[] {
  return SHEET_METAL_RULES.map(r => ({ ...r, commodity }));
}
