/**
 * Geometry sanity corrections — shared, pure, testable.
 *
 * Ray-cast wall thickness measures the distance from an outer face to the first
 * surface it hits inward. On a large THIN SHELL (a bumper, a housing cover) the
 * few planar faces available fire their ray across the whole cavity to the far
 * wall, reporting the part's local depth (tens of mm) instead of the ~2-3 mm wall.
 * A wrong wall corrupts injection-moulding cooling time (∝ wall²) and pushes the
 * classifier toward a chunky-solid process (casting) over moulding/sheet.
 *
 * For a thin shell the wall is well-approximated by 2·volume/surface (both faces
 * of the shell are counted in the surface area). We prefer that estimate only when
 * the part is clearly shell-like, so chunky solids are never touched.
 */

export interface WallCorrection {
  meanMm: number;
  corrected: boolean;
  method: 'ray_cast' | 'volume_surface_shell';
  shellWallMm: number;
}

/**
 * Size-aware packaging cost per part (£). A flat default (£0.15) is wrong for a
 * bumper (bulky → custom dunnage/racks) and for a 3 g part (trivial). Scales with
 * shipping envelope (bounding-box volume) + weight, floored/capped to sane bounds.
 */
export function estimatePackagingPerPart(bboxVolumeCm3: number, weightKg: number): number {
  const volM3 = Math.max(0, bboxVolumeCm3) / 1e6;          // cm³ → m³ (shipping envelope)
  const pkg = 0.05 + volM3 * 1.4 + Math.max(0, weightKg) * 0.04;
  return Math.round(Math.min(6, Math.max(0.05, pkg)) * 100) / 100;
}

/**
 * Size-aware inbound-freight (logistics) cost per part (£). The flat £0.25 default
 * overcharges a 0.2 kg stamping (it read 35% of a hood bracket's cost) and
 * undercharges a heavy casting. Freight scales with mass + shipping envelope.
 */
export function estimateLogisticsPerPart(weightKg: number, bboxVolumeCm3: number): number {
  const volM3 = Math.max(0, bboxVolumeCm3) / 1e6;
  const log = 0.04 + Math.max(0, weightKg) * 0.09 + volM3 * 0.8;   // base + per-kg + volumetric
  return Math.round(Math.min(4, Math.max(0.03, log)) * 100) / 100;
}

/** Shell-wall estimate (mm) from volume + surface: 2·V/S (both shell faces). */
export function shellWallEstimateMm(volumeCm3: number, surfaceAreaCm2: number): number {
  if (!(surfaceAreaCm2 > 0) || !(volumeCm3 > 0)) return 0;
  return (2 * volumeCm3 / surfaceAreaCm2) * 10;   // cm → mm
}

/**
 * Correct a ray-cast wall mean when the part is a thin shell and the measurement
 * clearly overshot. Chunky solids (higher fill ratio, thicker shell estimate) are
 * left untouched.
 */
export function correctShellWallMm(
  measuredMeanMm: number | null | undefined,
  volumeCm3: number,
  surfaceAreaCm2: number,
  fillRatio: number,
): WallCorrection {
  const shellWallMm = shellWallEstimateMm(volumeCm3, surfaceAreaCm2);
  const m = measuredMeanMm ?? 0;
  // Shell-like: a genuinely thin wall (≤5 mm by the V/S estimate) in an open
  // envelope (low fill ratio). Both must hold, so a chunky forging/casting whose
  // ray-cast happens to read a few mm is never rewritten.
  const shellLike = shellWallMm > 0 && shellWallMm < 5 && fillRatio < 0.05;
  if (shellLike && (m <= 0 || m > 3 * shellWallMm)) {
    return { meanMm: Math.round(shellWallMm * 100) / 100, corrected: true, method: 'volume_surface_shell', shellWallMm };
  }
  return { meanMm: m, corrected: false, method: 'ray_cast', shellWallMm };
}
