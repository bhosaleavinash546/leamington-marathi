/**
 * 3D viewer — pure helpers (no three.js, no DOM), shared by the viewer, its inspector and the tests.
 *
 * Everything here is arithmetic on what the kernel measured or the mesh carries: robust colour ranges,
 * histograms, mesh volume / area, the view cube's hit → view direction, the issue list's geometry checks
 * and the cost-on-model ranking. Nothing here prices anything — £ figures come in from the engine.
 */

/** Weighted quantile of `values` (weights default 1). `q` in [0, 1]. Empty → NaN. */
export function weightedQuantile(values: readonly number[], q: number, weights?: readonly number[]): number {
  const idx = values.map((_, i) => i).filter(i => Number.isFinite(values[i]) && (weights ? weights[i] > 0 : true));
  if (!idx.length) return NaN;
  idx.sort((a, b) => values[a] - values[b]);
  const w = (i: number) => (weights ? weights[i] : 1);
  const total = idx.reduce((t, i) => t + w(i), 0);
  const target = Math.min(1, Math.max(0, q)) * total;
  let run = 0;
  for (const i of idx) {
    run += w(i);
    if (run >= target) return values[i];
  }
  return values[idx[idx.length - 1]];
}

export interface RobustRange {
  /** Colour-scale ends: the lo / hi quantiles. Values outside are drawn at the end colour. */
  min: number;
  max: number;
  /** The true extremes, so the legend can say "≤ 3.1 mm (min 0.2)". */
  absMin: number;
  absMax: number;
  /** Whether either end was clamped (the legend then prints ≤ / ≥). */
  clippedLow: boolean;
  clippedHigh: boolean;
}

/**
 * Colour range that ignores the outliers: the 5th–95th (area-weighted) percentile. A single-ray wall
 * reading of 0.2 mm at a fillet, or one 105 mm ray down a casting's long axis, used to stretch the scale so
 * the whole part was one colour. Falls back to the plain min / max when the spread collapses.
 */
export function robustRange(values: readonly number[], weights?: readonly number[], lo = 0.05, hi = 0.95): RobustRange | null {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length < 2) return null;
  const absMin = Math.min(...finite), absMax = Math.max(...finite);
  let min = weightedQuantile(values, lo, weights);
  let max = weightedQuantile(values, hi, weights);
  if (!(max > min)) { min = absMin; max = absMax; }
  return { min, max, absMin, absMax, clippedLow: absMin < min, clippedHigh: absMax > max };
}

/** Normalise v into [0, 1] over the range (clamped). */
export function normInRange(v: number, r: { min: number; max: number }): number {
  const span = r.max - r.min || 1;
  return Math.min(1, Math.max(0, (v - r.min) / span));
}

/** Weighted histogram over [min, max] in `bins` equal bins; values outside land in the end bins. */
export function histogram(values: readonly number[], min: number, max: number, bins = 16, weights?: readonly number[]): number[] {
  const out = new Array(bins).fill(0);
  const span = max - min || 1;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / span) * bins)));
    out[b] += weights ? weights[i] : 1;
  });
  return out;
}

/**
 * Volume (signed tetrahedra from the origin) and area of a triangle soup, in the mesh's units (mm³ / mm²).
 * Exact for a closed mesh; on an open shell the volume is meaningless and is reported as null.
 */
export function meshVolumeArea(positions: Float32Array | readonly number[], closed: boolean): { volumeMm3: number | null; areaMm2: number } {
  let vol = 0, area = 0;
  for (let o = 0; o + 8 < positions.length; o += 9) {
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return { volumeMm3: closed ? Math.abs(vol) : null, areaMm2: area };
}

/** Typical densities (g/cm³) for the inspector's mass read-out — physical constants, not prices. */
export const VIEWER_DENSITIES: ReadonlyArray<{ id: string; label: string; gPerCm3: number }> = [
  { id: 'steel', label: 'Steel', gPerCm3: 7.85 },
  { id: 'stainless', label: 'Stainless steel', gPerCm3: 7.95 },
  { id: 'cast-iron', label: 'Cast iron (grey / ductile)', gPerCm3: 7.1 },
  { id: 'aluminium', label: 'Aluminium', gPerCm3: 2.7 },
  { id: 'magnesium', label: 'Magnesium', gPerCm3: 1.8 },
  { id: 'titanium', label: 'Titanium', gPerCm3: 4.43 },
  { id: 'copper', label: 'Copper / brass', gPerCm3: 8.5 },
  { id: 'zinc', label: 'Zinc (die-cast)', gPerCm3: 6.6 },
  { id: 'pp', label: 'PP', gPerCm3: 0.905 },
  { id: 'abs', label: 'ABS', gPerCm3: 1.05 },
  { id: 'pa66-gf30', label: 'PA66-GF30', gPerCm3: 1.37 },
  { id: 'rubber', label: 'Rubber (EPDM)', gPerCm3: 1.2 },
];

/**
 * The view cube: a hit on the unit cube (local coords in [-1, 1]³) → the view direction (world, Y up).
 * Any coordinate beyond the edge band counts, so a face centre gives a principal view, an edge band a
 * 45° view and a corner an isometric one — 26 directions, as on Onshape / Fusion.
 */
export function cubeHitToDirection(x: number, y: number, z: number, band = 0.62): [number, number, number] {
  const pick = (c: number) => (Math.abs(c) >= band ? Math.sign(c) : 0);
  let d: [number, number, number] = [pick(x), pick(y), pick(z)];
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) {
    // centre of a face: take the dominant axis
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    d = ax >= ay && ax >= az ? [Math.sign(x), 0, 0] : ay >= az ? [0, Math.sign(y), 0] : [0, 0, Math.sign(z)];
  }
  return d;
}

/** The name of a view direction (world, Y up): "Top", "Front-Right", "Top-Front-Right" … */
export function viewName(d: readonly [number, number, number]): string {
  const parts: string[] = [];
  if (d[1] > 0) parts.push('Top'); else if (d[1] < 0) parts.push('Bottom');
  if (d[2] > 0) parts.push('Front'); else if (d[2] < 0) parts.push('Back');
  if (d[0] > 0) parts.push('Right'); else if (d[0] < 0) parts.push('Left');
  return parts.join('-') || 'Front';
}

// ── Issues on the model ──────────────────────────────────────────────────────

export type IssueSeverity = 'high' | 'medium' | 'low' | 'info';
export interface ViewerIssue {
  id: string;
  title: string;
  severity: IssueSeverity;
  /** One line under the title: the measured value against the threshold. */
  detail?: string;
  faceIds: number[];
  /** A figure from the engine, already formatted in the display currency ("£1.20/part"). */
  amount?: string;
  /** Where the rule comes from — shown so it can be argued with. */
  source: string;
}

interface CheckFace {
  id: number;
  type: string;
  radiusMm: number | null;
  depthMm?: number | null;
  hole?: boolean | null;
  thicknessMm?: number | null;
  areaCm2: number | null;
}

/**
 * The fraction of a full turn a cylindrical face sweeps, from the kernel's own area, radius and length
 * (area ÷ 2πR·L). A drilled or bored hole is a full turn — or two half-turn faces, which is how most
 * STEP writers split it — while an edge fillet is about a quarter. Null when a figure is missing.
 */
export function cylinderSweep(f: { radiusMm: number | null; depthMm?: number | null; areaCm2: number | null }): number | null {
  if (!f.radiusMm || !f.depthMm || f.areaCm2 == null || f.radiusMm <= 0 || f.depthMm <= 0) return null;
  return (f.areaCm2 * 100) / (2 * Math.PI * f.radiusMm * f.depthMm);
}
/** A cylinder that is a real hole / boss, not a fillet or a sliver: sweeps at least 0.4 of a turn. */
export function isRoundFeature(f: { type: string; radiusMm: number | null; depthMm?: number | null; areaCm2: number | null }): boolean {
  if (f.type !== 'cylinder') return false;
  const sw = cylinderSweep(f);
  return sw == null || sw >= 0.4;
}

/**
 * Process-independent geometry checks the viewer can make on its own from the kernel's face data —
 * used when the app has not supplied the costed DFM findings (the standalone viewer, before a costing).
 * Rules of thumb, labelled as such; every figure is a measured B-rep value.
 */
export function geometryChecks(faces: readonly CheckFace[]): ViewerIssue[] {
  const out: ViewerIssue[] = [];
  // Only round features: an edge fillet is a concave quarter-cylinder the kernel also marks "hole".
  const holes = faces.filter(f => f.type === 'cylinder' && f.hole && f.radiusMm != null && f.radiusMm > 0 && isRoundFeature(f));
  const deep = holes.filter(f => f.depthMm != null && f.depthMm / (2 * f.radiusMm!) >= 5);
  if (deep.length) {
    const worst = deep.reduce((a, b) => (b.depthMm! / b.radiusMm! > a.depthMm! / a.radiusMm! ? b : a));
    out.push({
      id: 'deep-holes', severity: 'medium', faceIds: deep.map(f => f.id),
      title: `${deep.length} deep hole face${deep.length > 1 ? 's' : ''} (depth ≥ 5 × Ø)`,
      detail: `Worst Ø${(2 * worst.radiusMm!).toFixed(1)} × ${worst.depthMm!.toFixed(1)} mm deep (${(worst.depthMm! / (2 * worst.radiusMm!)).toFixed(1)} × Ø) — peck or gun drilling, slower cycle`,
      source: 'Rule of thumb: twist drills run without pecking to ~4–5 × Ø',
    });
  }
  const small = holes.filter(f => 2 * f.radiusMm! < 2);
  if (small.length) {
    const min = Math.min(...small.map(f => 2 * f.radiusMm!));
    out.push({
      id: 'small-holes', severity: 'low', faceIds: small.map(f => f.id),
      title: `${small.length} small hole face${small.length > 1 ? 's' : ''} (Ø < 2 mm)`,
      detail: `Smallest Ø${min.toFixed(2)} mm — micro-drill, breakage risk; cannot be cast or moulded as cored`,
      source: 'Rule of thumb: Ø < 2 mm needs micro-drilling',
    });
  }
  // A single ray from a small face's centre (a fillet, a chamfer, a sliver) often grazes the next face —
  // only faces big enough for the reading to mean a wall are judged.
  const thk = faces.filter(f => f.thicknessMm != null && f.thicknessMm > 0 && (f.areaCm2 ?? 0) >= 1 && f.type !== 'torus' && !(f.type === 'cylinder' && !isRoundFeature(f)));
  const thin = thk.filter(f => f.thicknessMm! < 1.0);
  if (thin.length) {
    const min = Math.min(...thin.map(f => f.thicknessMm!));
    out.push({
      id: 'thin-walls', severity: 'medium', faceIds: thin.map(f => f.id),
      title: `${thin.length} face${thin.length > 1 ? 's' : ''} with a wall reading below 1 mm`,
      detail: `Thinnest reading ${min.toFixed(2)} mm — a single ray from the face centre; confirm with Measure → Face to face`,
      source: 'Measured: one ray per face (kernel). Below ~1 mm most casting and moulding routes struggle to fill',
    });
  }
  return out;
}

export interface CostItem {
  label: string;
  faceIds: number[];
  /** £ (GBP) per part from the engine's costed feature line. */
  gbp: number;
}

/** Cost items ranked by money, with each one's share of the attributed total. */
export function rankCostItems(items: readonly CostItem[]): Array<CostItem & { share: number }> {
  const valid = items.filter(i => Number.isFinite(i.gbp) && i.gbp > 0 && i.faceIds.length);
  const total = valid.reduce((t, i) => t + i.gbp, 0) || 1;
  return valid.map(i => ({ ...i, share: i.gbp / total })).sort((a, b) => b.gbp - a.gbp);
}

/** Escape a string for innerHTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
