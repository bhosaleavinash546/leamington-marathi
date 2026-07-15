// Pure measurement math + face palette for the CAD viewer.
//
// Framework-free (no three.js, no DOM) so it runs under `node --test` and is
// the single source of truth shared with cad-viewer.ts (which re-exports it).
// Extracted verbatim from the ported viewer; see cad-viewer-math.d.mts for types.

export function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Circumcircle of 3 points in 3D → centre + radius, or null when degenerate.
 *  The collinearity test is SCALE-RELATIVE (d is a length⁴ quantity — an
 *  absolute epsilon breaks for meter-unit or huge-coordinate models). */
export function circumcircle3(p1, p2, p3) {
  const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
  const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
  const abab = ax * ax + ay * ay + az * az;
  const abac = ax * bx + ay * by + az * bz;
  const acac = bx * bx + by * by + bz * bz;
  const scale = abab * acac;
  const d = 2 * (abab * acac - abac * abac);
  if (scale === 0 || Math.abs(d) < 1e-10 * scale) return null; // coincident or collinear
  const s = (acac * (abab - abac)) / d;
  const t = (abab * (acac - abac)) / d;
  const center = { x: p1.x + s * ax + t * bx, y: p1.y + s * ay + t * by, z: p1.z + s * az + t * bz };
  return { center, radius: dist3(center, p1) };
}

/** Angle at p2 formed by p1–p2–p3, in degrees; null when a leg is zero-length. */
export function angle3(p1, p2, p3) {
  const ux = p1.x - p2.x, uy = p1.y - p2.y, uz = p1.z - p2.z;
  const vx = p3.x - p2.x, vy = p3.y - p2.y, vz = p3.z - p2.z;
  const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
  if (lu === 0 || lv === 0) return null;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Closest point on segment ab to point p (all V3), returned as tuple. */
export function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  t = Math.min(1, Math.max(0, t));
  return { x: a.x + t * abx, y: a.y + t * aby, z: a.z + t * abz };
}

// ── Face-type palette (colour-by-machining-surface mode) ─────────────────────
export const FACE_COLORS = {
  plane:    [0.42, 0.55, 0.78], // milling faces — steel blue
  cylinder: [0.95, 0.65, 0.25], // holes / bores / turned — amber
  cone:     [0.30, 0.75, 0.68], // chamfers / tapers — teal
  sphere:   [0.72, 0.45, 0.85], // ball features — violet
  torus:    [0.85, 0.45, 0.55], // fillets — rose
  freeform: [0.65, 0.50, 0.90], // 5-axis sculpted — purple
  other:    [0.62, 0.66, 0.72],
};
export const FACE_TYPE_LABEL = {
  plane: 'Planar (mill/face)', cylinder: 'Cylindrical (drill/bore/turn)', cone: 'Conical (chamfer/taper)',
  sphere: 'Spherical', torus: 'Toroidal (fillet)', freeform: 'Freeform (5-axis)', other: 'Other',
};
