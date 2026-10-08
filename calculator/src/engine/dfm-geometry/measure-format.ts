/**
 * How a geometric DFM measurement reads to an engineer — one formatter for the findings panel, the 3D viewer and the
 * PDF report (the PDF printed the engine's raw keys, "ldRatio 4.214-4.214:1", after the screen had stopped).
 */
/**
 * The engine's measured-field keys as an engineer reads them. A key missing here prints as itself, so a new rule is
 * never blank — `tests/dfm-geometry-panel.test.ts` fails on any rule field this table does not name.
 */
export const MEASURE_LABELS: Record<string, string> = {
  angleToDrawDeg: 'Angle to the draw',
  axisGapMm: 'Gap between the hole axes',
  blockedAtMm: 'Blocked by the part at',
  bossWallToWall: 'Boss wall ÷ nominal wall',
  characteristicWallMm: 'Wall',
  cutterLD: 'Cutter reach ÷ diameter',
  depthMm: 'Depth',
  diaMm: 'Diameter',
  diaToThicknessRatio: 'Hole Ø ÷ sheet thickness',
  draftDeg: 'Draft',
  holeSizes: 'Distinct hole sizes',
  ldRatio: 'Depth ÷ diameter',
  offFrameDeg: 'Angle off the part axes',
  partLtoD: 'Length ÷ diameter',
  radiusMm: 'Radius',
  roots: 'Tooth roots',
  sectionRatio: 'Thick ÷ thin section',
  setups: 'Fixturings',
  thicknessMm: 'Thickness',
  thicknessRatio: 'Thickness ratio',
};
export function measureLabel(field: string): string { return MEASURE_LABELS[field] ?? field; }

/** A measured number at the precision it deserves: 5.455 → 5.5, 0.25 → 0.25, 142.7 → 143. */
export function fmtMeasureNum(v: number): string {
  const a = Math.abs(v);
  const d = a === 0 || Number.isInteger(v) ? 0 : a < 1 ? 2 : a < 100 ? 1 : 0;
  return v.toFixed(d).replace(/\.0+$/, '');
}

/** "8.8 : 1", "0.5°", "12 mm", "3 fixturings" — a unit spaced the way it is written. */
export function withUnit(text: string, unit: string): string {
  if (!unit) return text;
  if (unit === ':1') return `${text} : 1`;
  if (unit === '°' || unit === '×' || unit === '%') return `${text}${unit}`;
  if (unit === '×D') return `${text} × D`;
  return `${text} ${unit}`;
}

/** Measured spread across instances — the range, not one cherry-picked case; one value when they all agree. */
export function measuredText(range: { min: number; max: number; unit: string }, count = 2): string {
  const a = fmtMeasureNum(range.min), b = fmtMeasureNum(range.max);
  return withUnit(count > 1 && a !== b ? `${a}–${b}` : a, range.unit);
}


/** "limit > 4 : 1" */
export function thresholdText(t: { comparator: string; value: number; unit: string }): string {
  const cmp = t.comparator === '>' ? 'above' : t.comparator === '<' ? 'below' : t.comparator === '>=' ? 'at or above' : t.comparator === '<=' ? 'at or below' : t.comparator;
  return `flagged ${cmp} ${withUnit(fmtMeasureNum(t.value), t.unit)}`;
}
