/**
 * Sheet-metal DFM, measured per feature.
 *
 * The kernel's aggregate view gives bend count and total bend length but no bend line; the bend-line checks (hole to
 * edge, hole to bend, minimum flange, bend relief) run on the developed blank instead — `sheet-blank.ts`. What neither
 * can check is declared in `SHEET_METAL_LIMITATIONS`, printed so nobody reads a short finding list as a clean part.
 */
import type { GeometricRule, PartContext } from '../types.js';
import { finding } from '../types.js';

export { HOLE_TO_BEND_MIN_T } from './sheet-blank.js';

/** Minimum hole diameter as a multiple of thickness for punching without cracking. */
export const MIN_PUNCH_DIA_T = 1.0;

const SM_GUIDE = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 pierced hole \u2265 the gauge',
  note: 'A punch smaller than the sheet it pierces buckles or breaks; a hole under the gauge is drilled or laser-cut after the '
      + 'press. The 1 \u00d7 t floor is the tool\u2019s own (engineering-typical, not sourced).',
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
        severity: 'risk',
        detail: `⌀${f.diaMm.toFixed(2)} mm hole in ${t.toFixed(2)} mm material — `
              + `${ratio.toFixed(2)}× thickness.`,
        measuredField: 'diaToThicknessRatio', measuredValue: ratio, unit: '×',
        thresholdValue: MIN_PUNCH_DIA_T, comparator: '<',
        recommendation: 'Open the hole to at least material thickness, or drill/laser it instead '
          + 'of punching — a punch this small breaks and tears the edge.',
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
  'Bend radius against material thickness was not checked — it needs the per-bend inner radius.',
  'Burr side and springback were not checked — they are die and process decisions.',
  'Blank nesting and utilisation are in the costing (strip layout), not repeated here.',
];

/** A hole deeper than this × its diameter is not a pierced sheet feature — a classifier check, reported as a note. */
export const SHEET_HOLE_LD_NOTE = 3;
/** The note for holes too deep for a sheet part (formed collars, or not a sheet part) — never a finding. */
export function sheetDeepHoleNote(part: PartContext): string | null {
  const deep = (part.featureSet.features ?? []).filter(f => f.kind === 'hole' && (f.ldRatio ?? 0) > SHEET_HOLE_LD_NOTE);
  if (!deep.length) return null;
  return `${deep.length} hole(s) are deeper than ${SHEET_HOLE_LD_NOTE}× their diameter (deepest ⌀${deep[0].diaMm?.toFixed(1)} mm, `
    + `${deep[0].depthMm?.toFixed(1)} mm) — a formed collar or extruded hole, or the part is not sheet: confirm on the drawing `
    + '(CostVision engineering heuristic, not a finding).';
}

/** Sheet-metal fab shares the pack; the commodity label differs only in costing. */
export function sheetMetalRulesFor(commodity: PartContext['commodity']): readonly GeometricRule[] {
  return SHEET_METAL_RULES.map(r => ({ ...r, commodity }));
}
