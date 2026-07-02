// ─────────────────────────────────────────────────────────────────────────────
// B-rep analysis from occt-import-js meshes (STEP/IGES via OpenCascade WASM).
//
// occt gives, per solid: position[], normal[], index[], and brep_faces[] (each a
// {first,last} triangle range = ONE real B-rep face). That lets us do genuine
// feature recognition that a raw mesh cannot:
//   • true face count (not triangle count)
//   • per-face surface classification (planar / cylindrical-conical / freeform)
//   • cylindrical faces split into concave (HOLES, with diameter) vs convex (bosses)
//
// Pure & dependency-free (the WASM lives in the caller) so it is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
function unit(a) { const n = norm(a); return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; }

/**
 * Eigen-decomposition of a symmetric 3×3 matrix via cyclic Jacobi rotation.
 * Robust and order-independent. Returns eigenvalues sorted DESC with eigenvectors.
 * @param {number[][]} A  symmetric 3×3
 * @returns {{values:number[], vectors:number[][]}}
 */
export function eigenSym3(A) {
  // working copy
  const a = [A[0].slice(), A[1].slice(), A[2].slice()];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    // largest off-diagonal
    let p = 0, q = 1, max = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > max) { max = Math.abs(a[0][2]); p = 0; q = 2; }
    if (Math.abs(a[1][2]) > max) { max = Math.abs(a[1][2]); p = 1; q = 2; }
    if (max < 1e-12) break;
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi), s = Math.sin(phi);
    // rotate A
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][q];
      a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[q][k];
      a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
    }
    // rotate eigenvectors
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  const vecs = [[v[0][0], v[1][0], v[2][0]], [v[0][1], v[1][1], v[2][1]], [v[0][2], v[1][2], v[2][2]]];
  const idx = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
  return { values: idx.map(i => vals[i]), vectors: idx.map(i => unit(vecs[i])) };
}

// Build geometric (area-weighted) normals + a small vertex sample for one B-rep face.
function faceData(positions, index, first, last) {
  const normals = [];
  const verts = [];
  for (let t = first; t <= last; t++) {
    const i0 = index[t * 3] * 3, i1 = index[t * 3 + 1] * 3, i2 = index[t * 3 + 2] * 3;
    const v0 = [positions[i0], positions[i0 + 1], positions[i0 + 2]];
    const v1 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
    const v2 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];
    const n = cross(sub(v1, v0), sub(v2, v0));
    const a = norm(n);
    if (a > 1e-12) { normals.push([n[0] / a, n[1] / a, n[2] / a]); verts.push(v0, v1, v2); }
  }
  return { normals, verts };
}

/**
 * Classify a single B-rep face from its triangle normals + vertices.
 * @returns {{type:'planar'|'cylindrical'|'freeform', concave?:boolean, radius?:number}}
 */
export function classifyFace(normals, verts) {
  if (normals.length === 0) return { type: 'planar' };
  // mean-normal length: ~1 for a plane, lower for curved
  const mean = [0, 0, 0];
  for (const n of normals) { mean[0] += n[0]; mean[1] += n[1]; mean[2] += n[2]; }
  const meanLen = norm(mean) / normals.length;
  if (meanLen > 0.97) return { type: 'planar' };

  // covariance of normals → eigenstructure
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const n of normals) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += n[i] * n[j];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] /= normals.length;
  const { values, vectors } = eigenSym3(C);
  // cylindrical/conical: normals lie ~in a plane ⟂ axis → smallest eigenvalue ≈ 0
  const smallest = values[2];
  if (smallest < 0.04) {
    const axis = vectors[2]; // direction normals avoid → cylinder axis
    // estimate radius + concavity from vertex sample
    const centroid = [0, 0, 0];
    for (const p of verts) { centroid[0] += p[0]; centroid[1] += p[1]; centroid[2] += p[2]; }
    for (let i = 0; i < 3; i++) centroid[i] /= verts.length;
    let rSum = 0, concaveVotes = 0, votes = 0;
    const step = Math.max(1, Math.floor(verts.length / 60));
    for (let k = 0; k < verts.length; k += step) {
      const p = verts[k];
      const d = sub(p, centroid);
      const along = dot(d, axis);
      const radial = [d[0] - along * axis[0], d[1] - along * axis[1], d[2] - along * axis[2]];
      const r = norm(radial);
      if (r > 1e-9) {
        rSum += r; votes++;
        // outward radial vs the triangle's stored normal: concave (hole) if they oppose
        const ni = Math.floor(k / 3);
        const fn = normals[Math.min(ni, normals.length - 1)];
        if (dot(unit(radial), fn) < 0) concaveVotes++;
      }
    }
    const radius = votes ? rSum / votes : 0;
    return { type: 'cylindrical', concave: votes > 0 && concaveVotes / votes > 0.5, radius };
  }
  return { type: 'freeform' };
}

/**
 * Analyse all B-rep faces across the occt meshes.
 * @returns {{totalFaces:number, planarFaces:number, cylindricalFaces:number,
 *            holes:number, bosses:number, freeformFaces:number, holeDiametersMm:number[]}}
 */
export function analyzeBrep(meshes) {
  let totalFaces = 0, planar = 0, cyl = 0, holes = 0, bosses = 0, freeform = 0;
  const holeDiametersMm = [];
  for (const m of meshes) {
    const positions = m.attributes?.position?.array;
    const index = m.index?.array;
    const faces = m.brep_faces;
    if (!positions || !index || !Array.isArray(faces)) continue;
    for (const f of faces) {
      totalFaces++;
      const { normals, verts } = faceData(positions, index, f.first, f.last);
      const c = classifyFace(normals, verts);
      if (c.type === 'planar') planar++;
      else if (c.type === 'cylindrical') {
        cyl++;
        if (c.concave) { holes++; if (c.radius) holeDiametersMm.push(Math.round(c.radius * 200) / 100); }
        else bosses++;
      } else freeform++;
    }
  }
  return { totalFaces, planarFaces: planar, cylindricalFaces: cyl, holes, bosses, freeformFaces: freeform, holeDiametersMm };
}

/**
 * Aggregate occt meshes into the geometry inputs the cad-features engine expects
 * (volume, surface area, bbox, surface-normal histogram).
 */
export function aggregateOcctMeshes(meshes) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let surfaceArea = 0, volume = 0, triangleCount = 0;
  const buckets = new Map();
  for (const m of meshes) {
    const pos = m.attributes?.position?.array, index = m.index?.array;
    if (!pos || !index) continue;
    for (let t = 0; t < index.length; t += 3) {
      const i0 = index[t] * 3, i1 = index[t + 1] * 3, i2 = index[t + 2] * 3;
      const v0 = [pos[i0], pos[i0 + 1], pos[i0 + 2]];
      const v1 = [pos[i1], pos[i1 + 1], pos[i1 + 2]];
      const v2 = [pos[i2], pos[i2 + 1], pos[i2 + 2]];
      for (const p of [v0, v1, v2]) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
      }
      const cx = cross(sub(v1, v0), sub(v2, v0));
      const mag = norm(cx);
      surfaceArea += mag / 2;
      if (mag > 1e-9) {
        const q = (n) => Math.round(n / mag / 0.15);
        const key = `${q(cx[0])},${q(cx[1])},${q(cx[2])}`;
        buckets.set(key, (buckets.get(key) || 0) + mag / 2);
      }
      volume += (v0[0] * (v1[1] * v2[2] - v2[1] * v1[2]) + v1[0] * (v2[1] * v0[2] - v0[1] * v2[2]) + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2])) / 6;
      triangleCount++;
    }
  }
  if (!isFinite(minX)) return null;
  return {
    triangleCount,
    volumeCm3: Math.abs(volume) / 1000,
    surfaceAreaCm2: surfaceArea / 100,
    bbox: { x: Math.round((maxX - minX) * 10) / 10, y: Math.round((maxY - minY) * 10) / 10, z: Math.round((maxZ - minZ) * 10) / 10 },
    bucketAreas: Array.from(buckets.values()),
    totalArea: surfaceArea,
  };
}
