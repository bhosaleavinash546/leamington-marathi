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

/**
 * Apply the thin-shell wall correction to a measured geometry, in place.
 *
 * This used to live inline in `server/routes/cad.ts`, immediately after
 * `analyzeGeometry`. That worked for the one caller that existed, and it made
 * the correction invisible to every caller that came later: a bumper measured
 * through any other path kept its 27.1 mm ray-cast wall, and moulding cooling
 * goes as wall², so the cycle came out 115x long and the part costed at £339
 * against a manual of £8-9.
 *
 * Wall thickness is a property of the measurement, not of one HTTP route, so
 * the correction belongs at the geometry boundary where nobody can forget it.
 *
 * Idempotent: a corrected geometry re-measures the same 2·V/S and the guard
 * (`m > 3 x shellWallMm`) no longer fires, so calling it twice is a no-op.
 *
 * @returns the before/after pair when it changed something, else null.
 */
export function applyShellWallCorrection(
  geo: { wallThickness?: { meanMm?: number | null; minMm?: number | null; maxMm?: number | null; method?: string } | null;
         volume?: { cm3: number } | null; surfaceArea?: { cm2: number } | null; fillRatio?: number | null } | null,
): { fromMm: number; toMm: number } | null {
  if (!geo?.wallThickness || !geo.volume || !geo.surfaceArea) return null;
  const before = geo.wallThickness.meanMm ?? 0;
  const wc = correctShellWallMm(before, geo.volume.cm3, geo.surfaceArea.cm2, geo.fillRatio ?? 1);
  if (!wc.corrected) return null;
  geo.wallThickness.meanMm = wc.meanMm;
  geo.wallThickness.minMm = Math.min(geo.wallThickness.minMm ?? wc.meanMm, wc.meanMm);
  geo.wallThickness.maxMm = wc.meanMm * 1.4;
  geo.wallThickness.method = wc.method;
  return { fromMm: before, toMm: wc.meanMm };
}
