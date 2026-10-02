/**
 * Geometry Feature Table → machining operations mapping.
 *
 * Input rows are EXACT kernel data (hole/boss × Ø × depth × through, counted
 * per physical feature by the OCCT engine). This module turns them into the
 * operations a process engineer would plan, plus a measured drilling operation
 * for the machining form. Pure functions — unit-tested.
 */

export interface FeatureRow {
  kind: 'hole' | 'boss' | 'face' | 'pocket' | 'slot';
  diaMm: number;
  depthMm: number;
  through: boolean | null;
  count: number;
  /** Planar face / pocket-floor area (mm²) — present on 'face' | 'pocket' | 'slot'. */
  areaMm2?: number;
  /** 1-based B-rep face ids this row was built from. */
  faceIds?: number[];
}

/**
 * Metric coarse tapping-drill diameters (M3–M12) that are not also a common
 * clearance size. A hole at one of these, at least 1.5 Ø deep, is a tapped hole
 * — the kernel's own thread flag counts free-form edges and is too loose to use
 * (it says the flat seat bracket is threaded). Inferred, and stated as such.
 */
export const TAPPING_DRILL_MM: Readonly<Record<string, number>> = {
  M3: 2.5, M4: 3.3, M5: 4.2, M6: 5.0, M8: 6.8, M10: 8.5, M12: 10.2,
};
export function tappedThread(row: FeatureRow): string | null {
  if (row.kind !== 'hole' || row.depthMm < 1.5 * row.diaMm) return null;
  const hit = Object.entries(TAPPING_DRILL_MM).find(([, d]) => Math.abs(d - row.diaMm) <= 0.1);
  return hit ? hit[0] : null;
}
/** Map a feature row to the machining operation it implies. */
export function featureToOperation(row: FeatureRow): string {
  if (row.kind === 'face') return 'Face milling (facing)';
  if (row.kind === 'pocket') return 'Pocket milling (rough + finish)';
  if (row.kind === 'slot') return 'Slot milling';
  if (row.kind === 'boss') return 'Turning (external Ø)';
  const thread = tappedThread(row);
  if (thread) return `Drill + tap ${thread}`;
  if (row.through === false) return row.diaMm <= 13 ? 'Drilling (blind)' : 'Drill + bore (blind)';
  if (row.diaMm <= 13) return 'Drilling';
  if (row.diaMm <= 26) return row.depthMm > 2 * row.diaMm ? 'Drill + ream/bore' : 'Drilling (clearance)';
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
