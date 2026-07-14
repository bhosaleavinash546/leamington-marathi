/**
 * Geometry Feature Table → machining operations mapping.
 *
 * Input rows are EXACT kernel data (hole/boss × Ø × depth × through, counted
 * per physical feature by the OCCT engine). This module turns them into the
 * operations a process engineer would plan, plus a measured drilling operation
 * for the machining form. Pure functions — unit-tested.
 */

export interface FeatureRow {
  kind: 'hole' | 'boss';
  diaMm: number;
  depthMm: number;
  through: boolean | null;
  count: number;
}

/** Map a feature row to the machining operation it implies. */
export function featureToOperation(row: FeatureRow): string {
  if (row.kind === 'boss') return 'Turning (external Ø)';
  if (row.through === false) return row.diaMm <= 13 ? 'Drilling (blind)' : 'Drill + bore (blind)';
  if (row.diaMm <= 13) return 'Drilling';
  if (row.diaMm <= 26) return 'Drill + ream/bore';
  return 'Helical mill / bore';
}

export interface DrillingOpPlan {
  holeCount: number;
  cycleTimeHr: number;
  /** e.g. "50×Ø6.0×10, 2×Ø16.0×20" */
  summary: string;
  name: string;
}

/**
 * Build the measured drilling operation from the feature table.
 * Prefers the OCCT bottom-up drill/bore minutes when available; otherwise a
 * conservative 0.4 min per hole. Returns null when the part has no holes.
 */
export function drillingOpFromFeatures(
  rows: FeatureRow[] | undefined,
  occtDrillBoreTimeMins?: number | null,
): DrillingOpPlan | null {
  const holes = (rows ?? []).filter(r => r.kind === 'hole' && r.count > 0);
  const holeCount = holes.reduce((s, r) => s + r.count, 0);
  if (holeCount === 0) return null;
  const mins = occtDrillBoreTimeMins && occtDrillBoreTimeMins > 0 ? occtDrillBoreTimeMins : holeCount * 0.4;
  const summary = holes.map(r => `${r.count}×Ø${r.diaMm.toFixed(1)}×${r.depthMm.toFixed(0)}`).join(', ');
  return {
    holeCount,
    cycleTimeHr: mins / 60,
    summary,
    name: `Drilling — ${holeCount} holes (${summary}) [geometry-measured]`,
  };
}
