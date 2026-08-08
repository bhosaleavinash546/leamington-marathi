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

// ─────────────────────────────────────────────────────────────────────────────
// SMOOTH NORMALS, WELDED WITHIN A B-REP FACE AND NEVER ACROSS ONE.
//
// This is the single reason the viewer looked faceted next to CATIA or
// SolidWorks, and it had nothing to do with mesh density. An STL carries no
// shared vertices — every triangle owns its three — so `computeVertexNormals()`
// on that geometry produces one normal per FACET. A cylinder tessellated into a
// thousand segments still renders as a thousand flat strips, because each strip
// is lit as though it were flat.
//
// The naive fix, welding every vertex in the mesh, is worse: it smooths across
// the sharp edge of a chamfer too, and the part turns into a bar of soap. CAD
// viewers get this right because they know where the real edges are.
//
// So do we. Every triangle carries the id of the B-rep face it came from, and a
// B-rep face boundary IS the edge — that is what it means for two faces to meet.
// Welding within a face id and never across one therefore reproduces exactly the
// hard/soft split the modeller drew: smooth around a bore, crisp at the chamfer,
// with no angle threshold to tune and no shading group to guess.
//
// Normals are accumulated as UN-normalised cross products, which weights each
// contribution by twice the triangle's area — a sliver triangle should not pull
// a vertex normal as hard as the large one beside it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Float32Array} positions   9 floats per triangle (non-indexed)
 * @param {ArrayLike<number>} faceOfTri  B-rep face id per triangle
 * @param {number} triOffset  index of the first triangle of this slice
 * @param {number} triCount   how many triangles in this slice
 * @param {number} weldTol    positions closer than this are the same vertex
 * @returns {Float32Array} one normal per vertex, same layout as `positions`
 */
export function smoothNormalsWithinFaces(positions, faceOfTri, triOffset, triCount, weldTol) {
  const normals = new Float32Array(triCount * 9);
  // Quantising to the weld tolerance is what makes two vertices "the same".
  // Too coarse and distinct vertices merge; too fine and a shared vertex written
  // twice with different rounding never meets itself, which silently returns the
  // faceted result this function exists to replace.
  const q = weldTol > 0 ? 1 / weldTol : 1e4;
  const acc = new Map();
  const keyOf = (f, x, y, z) =>
    `${f}|${Math.round(x * q)}|${Math.round(y * q)}|${Math.round(z * q)}`;

  for (let t = 0; t < triCount; t++) {
    const p = t * 9;
    const f = faceOfTri[triOffset + t];
    const ax = positions[p], ay = positions[p + 1], az = positions[p + 2];
    const bx = positions[p + 3], by = positions[p + 4], bz = positions[p + 5];
    const cx = positions[p + 6], cy = positions[p + 7], cz = positions[p + 8];
    // (b-a) x (c-a), un-normalised: magnitude is twice the area, so the sum is
    // area-weighted for free.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      const k = keyOf(f, x, y, z);
      const cur = acc.get(k);
      if (cur) { cur[0] += nx; cur[1] += ny; cur[2] += nz; }
      else acc.set(k, [nx, ny, nz]);
    }
  }

  for (let t = 0; t < triCount; t++) {
    const p = t * 9;
    const f = faceOfTri[triOffset + t];
    for (let v = 0; v < 3; v++) {
      const o = p + v * 3;
      const k = keyOf(f, positions[o], positions[o + 1], positions[o + 2]);
      const n = acc.get(k);
      if (!n) continue;
      const m = Math.hypot(n[0], n[1], n[2]) || 1;
      normals[o] = n[0] / m;
      normals[o + 1] = n[1] / m;
      normals[o + 2] = n[2] / m;
    }
  }
  return normals;
}
