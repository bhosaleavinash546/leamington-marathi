/**
 * Manufacturing features from a triangle mesh (STL) — the STL counterpart of the kernel's
 * `_extract_manufacturing_features` (server/utils/cad-geometry-engine.py), so geometric DFM can run on a part that
 * arrives as STL. Pure TypeScript; rays through three-mesh-bvh (the viewer's own index).
 *
 * A mesh has no B-rep faces, so they are recovered first:
 *   1. Weld the soup; orient it outward (signed volume).
 *   2. Flat regions: triangles grown across edges while coplanar (normal within 1°, vertices on the seed plane).
 *   3. Cylinders: an exporter writes a cylinder as narrow flat strips whose shared edges are parallel to its axis.
 *      Neighbouring flat regions turning by 0.5–36° form a cylinder candidate when the turn axis agrees and each
 *      strip's width gives the same radius (w / 2 sin(θ/2)); the candidate is kept only when a least-squares circle
 *      through its shared-edge lines fits and every member's vertices sit on that cylinder. A plane tangent to a
 *      fillet is expelled by that test. Chains of short "cylinders" turning round a ring are a torus (an edge round),
 *      not fillets, and are dropped.
 *   4. What is left and joined smoothly is a free-form patch (cone, torus, sphere, B-spline): one face, no feature —
 *      as the kernel types it.
 * Then the kernel's own definitions, ported, on those faces: holes / bosses (≥ 0.83 of a turn) and fillets (partial,
 * with concavity and sweep), coaxial pieces re-joined on the axis LINE; through / blind by the same ring of breakout
 * probes; single-ray wall thickness; the two-half release test, cavity probe and undercut regions; the draw axis with
 * the fewest undercuts (ties → largest silhouette).
 *
 * Stated limits (in the result's `note`): a hole tessellated coarser than 36° a facet (fewer than 10 a turn) is not
 * recognised; a polygonal prism of ≥ 10 sides reads as a cylinder; a fillet written as ONE strip has no curvature to
 * measure. Measured on real parts against the kernel by `scripts/stl-dfm-validate.ts`.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { ManufacturingFeature, ManufacturingFeatureSet } from '../../src/engine/ai-analysis.js';

// ── Kernel constants (cad-geometry-engine.py) ───────────────────────────────
const RELEASE_PARALLEL_COS = Math.sin((0.5 * Math.PI) / 180);
const RELEASE_OFFSET_MM = 0.1;
const MIN_BLOCK_MM = 0.5;
const MIN_RELEASE_FACE_MM2 = 1.0;
const BLEND_MAX_RADIUS_MM = 10.0;
const FULL_TURN = 0.83;
// ── Mesh segmentation ────────────────────────────────────────────────────────
const PLANAR_COS = Math.cos((1 * Math.PI) / 180);
const STRIP_MIN_DEG = 0.5;
const STRIP_MAX_DEG = 36;
const SMOOTH_MAX_DEG = 40;
/** Above this the pass is skipped, stated: 216k triangles took 14 s and 0.9 GB (PRCR002 at 0.1 rad), and the shipped VM
 *  has 2 GB. A viewer-quality export of a real part is 2–30k. */
export const MAX_TRIANGLES = 300_000;

export interface MeshFace {
  id: number;
  type: 'plane' | 'cylinder' | 'freeform';
  tris: number[];
  areaMm2: number;
  centroid: [number, number, number];
  normal?: [number, number, number];
  cyl?: { r: number; axis: [number, number, number]; foot: [number, number, number]; s0: number; s1: number;
    concave: boolean; coverage: number };
  thicknessMm?: number;
}

export interface MeshFeatureResult {
  featureSet: ManufacturingFeatureSet;
  /** 1-based face id per triangle of the ORIGINAL file order (0 = degenerate) — the viewer's `triFace`. */
  triFace: Uint32Array;
  faces: MeshFace[];
  stats: { triangles: number; vertices: number; regions: number; faces: number; cylinders: number; ms: number };
  /** Measured off the mesh: the inputs the STEP path's thickness clean-up reads (2·V/S). */
  volumeMm3: number;
  surfaceMm2: number;
  /** Envelope and the silhouette along the chosen draw (rasterised), as the kernel's bbox / `projectedArea.alongDrawMm2`. */
  bboxMm?: { x: number; y: number; z: number };
  projectedAlongDrawMm2?: number;
  /** The kernel's `projectedArea` and `draftAnalysis`, measured on the mesh — what the STL costing reads (the press
   *  closes over the silhouette, the slides follow the undercut faces). */
  projectedArea?: { xMm2: number; yMm2: number; zMm2: number; alongDrawMm2: number; method: string };
  draftAnalysis?: {
    drawDirectionXYZ: [number, number, number]; undercutFaceCount: number; cavityFaceCount: number;
    zeroDraftFaceCount: number; adequateDraftFaceCount: number; minPositiveDraftDeg: number | null;
    maxPositiveDraftDeg: number | null; analyzedFaceCount: number;
    pullDirectionSearch: { candidates: Array<{ drawDirectionXYZ: number[]; undercutFaceCount: number }>;
      runnerUp: { drawDirectionXYZ: number[]; undercutFaceCount: number } | null; ambiguous: boolean };
  };
}

// ── STL reading ──────────────────────────────────────────────────────────────
/** Triangle soup, 9 floats a triangle, in file order. */
export function readStlTriangles(buf: Buffer): Float32Array {
  if (buf.length >= 84) {
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 === buf.length) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) out[i * 9 + k] = buf.readFloatLE(o + k * 4);
      }
      return out;
    }
  }
  const text = buf.toString('utf8');
  const nums: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  return new Float32Array(nums.length - (nums.length % 9) ? nums.slice(0, nums.length - (nums.length % 9)) : nums);
}

// ── small vector helpers ─────────────────────────────────────────────────────
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r3 = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const rv = (a: V3, d = 3): V3 => [r3(a[0], d), r3(a[1], d), r3(a[2], d)];
/** Sign-normalised direction: the first non-zero component positive (the kernel's axis identity). */
function canon(d: V3): V3 {
  for (const c of d) if (Math.abs(c) > 1e-6) return c > 0 ? d : mul(d, -1);
  return d;
}
/** Two unit vectors spanning the plane perpendicular to `a`. */
function basis(a: V3): [V3, V3] {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(a[i]) < Math.abs(a[m]) ? i : m), 0);
  const e: V3 = [0, 0, 0]; e[k] = 1;
  const e1 = unit(sub(e, mul(a, dot(e, a))));
  return [e1, cross(a, e1)];
}

class DSU {
  p: Int32Array;
  constructor(n: number) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(a: number): number { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  union(a: number, b: number): number { const ra = this.find(a), rb = this.find(b); if (ra === rb) return ra; const lo = Math.min(ra, rb); this.p[Math.max(ra, rb)] = lo; return lo; }
}

/** Least-squares circle (Kåsa) through 2-D points: centre and radius, with the RMS radial residual. */
function fitCircle(pts: Array<[number, number]>): { cx: number; cy: number; r: number; rms: number } | null {
  if (pts.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = pts.length;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // [sxx sxy sx; sxy syy sy; sx sy n] [a b c]' = [sxz syz sz]'
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const B = [sxz, syz, sz];
  const det = (M: number[][]) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  if (!Number.isFinite(D) || Math.abs(D) < 1e-18) return null;
  const col = (i: number) => A.map((row, k) => row.map((v, j) => (j === i ? B[k] : v)));
  const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D;
  const cx = a / 2, cy = b / 2;
  const r2 = c + cx * cx + cy * cy;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let ss = 0;
  for (const [x, y] of pts) { const d = Math.hypot(x - cx, y - cy) - r; ss += d * d; }
  return { cx, cy, r, rms: Math.sqrt(ss / n) };
}

export function extractMeshFeatures(soup: Float32Array, opts: { maxTriangles?: number } = {}): MeshFeatureResult {
  const t0 = Date.now();
  const nSoup = Math.floor(soup.length / 9);
  if (nSoup > (opts.maxTriangles ?? MAX_TRIANGLES)) {
    return emptyResult(nSoup, `${nSoup.toLocaleString('en-GB')} triangles exceeds the cap — feature extraction skipped`, t0);
  }
  // ── 1. weld ────────────────────────────────────────────────────────────────
  let mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], soup[i + k]); mx[k] = Math.max(mx[k], soup[i + k]); }
  const ext = sub(mx, mn);
  const diag = len(ext) || 1;
  const tol = Math.max(diag * 1e-6, 1e-5);
  const vIndex = new Map<string, number>();
  const V: number[] = [];
  const triV = new Int32Array(nSoup * 3);
  for (let t = 0; t < nSoup; t++) {
    for (let j = 0; j < 3; j++) {
      const o = t * 9 + j * 3;
      const key = `${Math.round(soup[o] / tol)},${Math.round(soup[o + 1] / tol)},${Math.round(soup[o + 2] / tol)}`;
      let vi = vIndex.get(key);
      if (vi === undefined) { vi = V.length / 3; vIndex.set(key, vi); V.push(soup[o], soup[o + 1], soup[o + 2]); }
      triV[t * 3 + j] = vi;
    }
  }
  const P = (i: number): V3 => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]];
  // signed volume → outward orientation
  let vol6 = 0;
  for (let t = 0; t < nSoup; t++) {
    const a = P(triV[t * 3]), b = P(triV[t * 3 + 1]), c = P(triV[t * 3 + 2]);
    vol6 += dot(a, cross(b, c));
  }
  const flip = vol6 < 0;
  if (flip) for (let t = 0; t < nSoup; t++) { const b = triV[t * 3 + 1]; triV[t * 3 + 1] = triV[t * 3 + 2]; triV[t * 3 + 2] = b; }
  const volumeMm3 = Math.abs(vol6) / 6;
  // triangle normals, areas, centroids; degenerate triangles drop out
  const N = new Float64Array(nSoup * 3), A = new Float64Array(nSoup), C = new Float64Array(nSoup * 3);
  const alive = new Uint8Array(nSoup);
  for (let t = 0; t < nSoup; t++) {
    const a = P(triV[t * 3]), b = P(triV[t * 3 + 1]), c = P(triV[t * 3 + 2]);
    const cr = cross(sub(b, a), sub(c, a));
    const l = len(cr);
    if (l < 1e-12 || triV[t * 3] === triV[t * 3 + 1] || triV[t * 3 + 1] === triV[t * 3 + 2] || triV[t * 3] === triV[t * 3 + 2]) continue;
    alive[t] = 1;
    A[t] = l / 2;
    N[t * 3] = cr[0] / l; N[t * 3 + 1] = cr[1] / l; N[t * 3 + 2] = cr[2] / l;
    C[t * 3] = (a[0] + b[0] + c[0]) / 3; C[t * 3 + 1] = (a[1] + b[1] + c[1]) / 3; C[t * 3 + 2] = (a[2] + b[2] + c[2]) / 3;
  }
  const nT = (t: number): V3 => [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]];
  const cT = (t: number): V3 => [C[t * 3], C[t * 3 + 1], C[t * 3 + 2]];
  // edges → triangles
  const nV = V.length / 3;
  const edgeTris = new Map<number, number[]>();
  const ek = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a);
  for (let t = 0; t < nSoup; t++) {
    if (!alive[t]) continue;
    for (let j = 0; j < 3; j++) {
      const k = ek(triV[t * 3 + j], triV[t * 3 + ((j + 1) % 3)]);
      const l = edgeTris.get(k);
      if (l) l.push(t); else edgeTris.set(k, [t]);
    }
  }
  const nbrs = (t: number): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = [];
    for (let j = 0; j < 3; j++) {
      const a = triV[t * 3 + j], b = triV[t * 3 + ((j + 1) % 3)];
      const l = edgeTris.get(ek(a, b));
      if (l && l.length === 2) out.push([l[0] === t ? l[1] : l[0], a, b]);
    }
    return out;
  };
  let openEdges = 0;
  for (const l of edgeTris.values()) if (l.length !== 2) openEdges++;

  // ── 2. flat regions ────────────────────────────────────────────────────────
  const region = new Int32Array(nSoup).fill(-1);
  const order = Array.from({ length: nSoup }, (_, i) => i).filter(t => alive[t]).sort((a, b) => A[b] - A[a]);
  // a CAD plane is flat to float precision; a slow B-spline (a forged or cast skin) is not — 3 µm let it read as planes
  const planeTol = Math.max(2e-4, diag * 1e-6);
  const regions: Array<{ tris: number[]; n: V3; area: number }> = [];
  for (const s of order) {
    if (region[s] >= 0) continue;
    const id = regions.length;
    const n0 = nT(s), p0 = cT(s);
    const tris = [s];
    region[s] = id;
    const stack = [s];
    while (stack.length) {
      const t = stack.pop()!;
      for (const [u] of nbrs(t)) {
        // the vertices decide (a sliver's float normal wobbles past 1° while its corners sit on the plane); the normal
        // only has to face the same side
        if (region[u] >= 0 || dot(nT(u), n0) < (A[u] > A[s] * 1e-3 ? PLANAR_COS : 0.5)) continue;
        let on = true;
        for (let j = 0; j < 3 && on; j++) on = Math.abs(dot(sub(P(triV[u * 3 + j]), p0), n0)) <= planeTol;
        if (!on) continue;
        region[u] = id; tris.push(u); stack.push(u);
      }
    }
    let nn: V3 = [0, 0, 0], ar = 0;
    for (const t of tris) { nn = add(nn, mul(nT(t), A[t])); ar += A[t]; }
    regions.push({ tris, n: unit(nn), area: ar });
  }
  const R = regions.length;
  // region adjacency: shared edges (vertex pairs) per region pair
  const pairEdges = new Map<number, Array<[number, number]>>();
  const pk = (a: number, b: number) => (a < b ? a * R + b : b * R + a);
  for (const [k, l] of edgeTris) {
    if (l.length !== 2) continue;
    const ra = region[l[0]], rb = region[l[1]];
    if (ra === rb || ra < 0 || rb < 0) continue;
    const a = Math.floor(k / nV), b = k % nV;
    const key = pk(ra, rb);
    const arr = pairEdges.get(key);
    if (arr) arr.push([a, b]); else pairEdges.set(key, [[a, b]]);
  }
  const regionNbrs: Array<Set<number>> = Array.from({ length: R }, () => new Set());
  for (const key of pairEdges.keys()) { const a = Math.floor(key / R), b = key % R; regionNbrs[a].add(b); regionNbrs[b].add(a); }
  const regionVerts = (r: number): number[] => { const s = new Set<number>(); for (const t of regions[r].tris) for (let j = 0; j < 3; j++) s.add(triV[t * 3 + j]); return [...s]; };
  const vertCache = new Map<number, number[]>();
  const rVerts = (r: number) => { let v = vertCache.get(r); if (!v) { v = regionVerts(r); vertCache.set(r, v); } return v; };
  const angDeg = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;
  const RADIAL_TILT = Math.sin((15 * Math.PI) / 180);
  /** Each triangle's normal within 15° of the radial line through it (outward or inward — concavity is decided later). */
  const radialNormal = (r: number, f: { e1: V3; e2: V3; cx: number; cy: number }): boolean => regions[r].tris.every(t => {
    const c0 = cT(t); const rd = unit(add(mul(f.e1, dot(c0, f.e1) - f.cx), mul(f.e2, dot(c0, f.e2) - f.cy)));
    return Math.abs(dot(nT(t), rd)) >= Math.cos((15 * Math.PI) / 180);
  });

  // ── 3. cylinders: grown facet by facet against a fitted cylinder ──────────
  // A facet joins while it turns smoothly (≤ 36°) from the member it touches, its normal stays perpendicular to the
  // axis (within 2°) and its vertices lie on the fitted cylinder. Independent of how the mesher cut the surface
  // (strips, or the diagonal triangles a trimmed face gets). A plane tangent to the cylinder has a perpendicular normal
  // but its far vertices are off the cylinder, so it stays out.
  type Fit = { axis: V3; e1: V3; e2: V3; cx: number; cy: number; r: number; n: number; rms: number };
  const fitMembers = (members: number[], axis: V3): Fit | null => {
    const [e1, e2] = basis(axis);
    const pts: Array<[number, number]> = [];
    const seen = new Set<string>();
    for (const m of members) for (const v of rVerts(m)) {
      const q = P(v); const x = dot(q, e1), y = dot(q, e2);
      const key = `${Math.round(x / (tol * 100))},${Math.round(y / (tol * 100))}`;
      if (!seen.has(key)) { seen.add(key); pts.push([x, y]); }
    }
    const f = fitCircle(pts);
    return f && f.r < diag * 10 ? { axis, e1, e2, cx: f.cx, cy: f.cy, r: f.r, n: pts.length, rms: f.rms } : null;
  };
  const onCyl = (r: number, f: Fit): boolean => {
    // an exporter writes a cylinder's vertices ON the surface (float precision): a free-form patch only comes close
    const tolR = Math.max(0.002 * f.r, 0.003);
    return rVerts(r).every(v => { const q = P(v); return Math.abs(Math.hypot(dot(q, f.e1) - f.cx, dot(q, f.e2) - f.cy) - f.r) <= tolR; });
  };
  /** The axis the members' normals are all perpendicular to: the least eigenvector of Σ a·n nᵀ. */
  const axisFromNormals = (members: number[], prev: V3): V3 => {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const m of members) { const n = regions[m].n, w = regions[m].area; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += w * n[i] * n[j]; }
    // inverse iteration toward the smallest eigenvalue (M + εI)⁻¹ v
    let v: V3 = prev;
    const tr = M[0][0] + M[1][1] + M[2][2];
    const eps = 1e-9 * (tr || 1);
    const S = M.map((row, i) => row.map((x, j) => x + (i === j ? eps : 0)));
    const det = S[0][0] * (S[1][1] * S[2][2] - S[1][2] * S[2][1]) - S[0][1] * (S[1][0] * S[2][2] - S[1][2] * S[2][0]) + S[0][2] * (S[1][0] * S[2][1] - S[1][1] * S[2][0]);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return prev;
    const inv = [
      [S[1][1] * S[2][2] - S[1][2] * S[2][1], S[0][2] * S[2][1] - S[0][1] * S[2][2], S[0][1] * S[1][2] - S[0][2] * S[1][1]],
      [S[1][2] * S[2][0] - S[1][0] * S[2][2], S[0][0] * S[2][2] - S[0][2] * S[2][0], S[0][2] * S[1][0] - S[0][0] * S[1][2]],
      [S[1][0] * S[2][1] - S[1][1] * S[2][0], S[0][1] * S[2][0] - S[0][0] * S[2][1], S[0][0] * S[1][1] - S[0][1] * S[1][0]],
    ].map(row => row.map(x => x / det));
    for (let k = 0; k < 20; k++) v = unit([dot(inv[0] as V3, v), dot(inv[1] as V3, v), dot(inv[2] as V3, v)]);
    return dot(v, prev) < 0 ? mul(v, -1) : v;
  };
  type Cyl = { members: number[]; r: number; axis: V3; foot: V3; s0: number; s1: number; concave: boolean; coverage: number; area: number };
  const cyls: Cyl[] = [];
  const inCyl = new Int32Array(R).fill(-1);
  const turns = (a: number, b: number) => { const g = angDeg(regions[a].n, regions[b].n); return g >= STRIP_MIN_DEG && g <= STRIP_MAX_DEG; };
  const seeds = Array.from({ length: R }, (_, i) => i).filter(r => [...regionNbrs[r]].some(nb => turns(r, nb)))
    .sort((a, b) => regions[a].area - regions[b].area);
  /** Grow a cylinder from a seed and the neighbour it turns into; kept (true) only when it is one — a full turn only
   *  when `fullOnly`. */
  const tryCylinder = (s: number, partner: number, fullOnly: boolean): boolean => {
    let axis = canon(unit(cross(regions[s].n, regions[partner].n)));
    const members = [s, partner];
    const mset = new Set(members);
    let fit = fitMembers(members, axis);
    if (!fit || !onCyl(s, fit) || !onCyl(partner, fit) || !radialNormal(s, fit) || !radialNormal(partner, fit)) return false;
    const queue: Array<[number, number]> = [];
    const pushNbrs = (m: number) => { for (const nb of regionNbrs[m]) if (!mset.has(nb) && inCyl[nb] < 0) queue.push([nb, m]); };
    pushNbrs(s); pushNbrs(partner);
    let lastFit = members.length;
    while (queue.length) {
      const [u, from] = queue.shift()!;
      if (mset.has(u) || inCyl[u] >= 0) continue;
      if (angDeg(regions[u].n, regions[from].n) > STRIP_MAX_DEG) continue;
      // a trimmed face is meshed with diagonal triangles whose normals tilt off the axis while their vertices sit
      // exactly on the surface: the vertices decide, the normal only has to point (roughly) radially
      if (Math.abs(dot(regions[u].n, axis)) > RADIAL_TILT) continue;
      if (!onCyl(u, fit) || !radialNormal(u, fit)) continue;
      members.push(u); mset.add(u); pushNbrs(u);
      if (members.length <= 8 || members.length >= lastFit * 1.5 + 2) {
        const ax2 = canon(axisFromNormals(members, axis));
        const f2 = fitMembers(members, ax2);
        if (f2 && members.every(m => onCyl(m, f2))) { axis = ax2; fit = f2; }
        else { const f3 = fitMembers(members, axis); if (f3 && members.every(m => onCyl(m, f3))) fit = f3; }
        lastFit = members.length;
      }
    }
    if (members.length < 3 || fit.n < 6) return false;
    // final stats over the member TRIANGLES
    const f = fit;
    let s0 = Infinity, s1 = -Infinity, area = 0, conc = 0;
    const iv: Array<[number, number]> = [];
    for (const m of members) for (const t of regions[m].tris) {
      const angs: number[] = [];
      for (let j = 0; j < 3; j++) {
        const q = P(triV[t * 3 + j]); const sa = dot(q, f.axis); s0 = Math.min(s0, sa); s1 = Math.max(s1, sa);
        angs.push(Math.atan2(dot(q, f.e2) - f.cy, dot(q, f.e1) - f.cx));
      }
      angs.sort((x, y) => x - y);
      // the smallest arc holding the triangle's three angles
      const gaps = [angs[1] - angs[0], angs[2] - angs[1], angs[0] + 2 * Math.PI - angs[2]];
      const gi = gaps.indexOf(Math.max(...gaps));
      const startA = angs[(gi + 1) % 3], arc = 2 * Math.PI - gaps[gi];
      const a0 = ((startA % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (a0 + arc <= 2 * Math.PI) iv.push([a0, a0 + arc]); else { iv.push([a0, 2 * Math.PI]); iv.push([0, a0 + arc - 2 * Math.PI]); }
      area += A[t];
      const c0 = cT(t);
      const radial: V3 = unit(add(mul(f.e1, dot(c0, f.e1) - f.cx), mul(f.e2, dot(c0, f.e2) - f.cy)));
      conc += dot(nT(t), radial) * A[t];
    }
    iv.sort((x, y) => x[0] - y[0]);
    let covered = 0, curS = -1, curE = -1;
    for (const [a, b] of iv) {
      if (a > curE) { if (curE > curS) covered += curE - curS; curS = a; curE = b; } else curE = Math.max(curE, b);
    }
    if (curE > curS) covered += curE - curS;
    // a partial cylinder must be a blend's worth of evidence: ≥ 25° of sweep, running along its edge
    const cov = covered / (2 * Math.PI);
    if (cov < FULL_TURN && (fullOnly || cov * 360 < 25 || s1 - s0 < Math.max(1, 0.5 * f.r))) return false;
    const idx = cyls.length;
    for (const m of members) inCyl[m] = idx;
    cyls.push({ members, r: f.r, axis: f.axis, foot: add(mul(f.e1, f.cx), mul(f.e2, f.cy)), s0, s1,
      concave: conc < 0, coverage: covered / (2 * Math.PI), area });
    return true;
  };
  for (const s of seeds) {
    if (inCyl[s] >= 0) continue;
    // The neighbour it turns into most sharply first. Where a cylinder meets a round tangentially the round's first row
    // turns more than the next strip of the cylinder (11° v 5° on a revolved boss), so that pairing takes the round's
    // axis and fails; the next neighbours are then tried for a HOLE or BOSS only (a full turn — partial pieces found
    // that way were mostly torus and free-form patches: PRCR002 +27 false fillets).
    const partners = [...regionNbrs[s]].filter(nb => inCyl[nb] < 0 && turns(s, nb))
      .sort((x, y) => angDeg(regions[s].n, regions[y].n) - angDeg(regions[s].n, regions[x].n));
    partners.slice(0, 4).some((partner, k) => inCyl[s] < 0 && tryCylinder(s, partner, k > 0));
  }
  // A torus (a round along a curved edge) tessellates as short coaxial-looking sectors whose axes turn along the ring:
  // a candidate touching another of the same radius at a 2–45° axis is part of such a chain, not a fillet.
  const cylOfRegion = new Int32Array(R).fill(-1);
  cyls.forEach((c, i) => c.members.forEach(m => { cylOfRegion[m] = i; }));
  const toroidal = new Set<number>();
  cyls.forEach((c, i) => {
    for (const m of c.members) for (const nb of regionNbrs[m]) {
      const j = cylOfRegion[nb];
      if (j < 0 || j === i) continue;
      const o = cyls[j];
      const ang = Math.acos(Math.min(1, Math.abs(dot(c.axis, o.axis)))) * 180 / Math.PI;
      if (ang > 2 && ang < 45 && Math.max(c.r, o.r) / Math.min(c.r, o.r) < 1.1) { toroidal.add(i); toroidal.add(j); }
    }
  });
  // Sectors of one round need not touch (thin strips the fit left out sit between them, as on PRCR002's bore edges).
  // A torus of tube radius r is, piece by piece, cylinders of radius r whose axes lie in ONE plane and are tangent to ONE
  // circle there at the sector's middle. Two sectors fix that plane and circle; a third that fits it makes it a round.
  // Two straight fillets meeting at a corner fit a pair too, so a pair alone is never enough.
  const midOf = (c: Cyl): V3 => add(c.foot, mul(c.axis, (c.s0 + c.s1) / 2));
  const partial = cyls.map((c, i) => ({ c, i, m: midOf(c) })).filter(({ c }) => c.coverage < FULL_TURN)
    .sort((x, y) => x.c.r - y.c.r);
  const SIN3 = Math.sin(3 * Math.PI / 180);
  const sameR = (x: number, y: number) => Math.max(x, y) / Math.min(x, y) <= 1.03;
  for (let a = 0; a < partial.length; a++) {
    // the same-radius window of the r-sorted list: pairs and inliers are only looked for there
    let hi = a; while (hi + 1 < partial.length && sameR(partial[a].c.r, partial[hi + 1].c.r)) hi++;
    let lo = a; while (lo > 0 && sameR(partial[a].c.r, partial[lo - 1].c.r)) lo--;
    const P = partial[a];
    for (let b = a + 1; b <= hi; b++) {
      const Q = partial[b];
      if (toroidal.has(P.i) && toroidal.has(Q.i)) continue;
      const r = Math.min(P.c.r, Q.c.r);
      // neighbouring sectors of one round sit a few spans apart
      if (len(sub(Q.m, P.m)) > 4 * Math.max(P.c.s1 - P.c.s0, Q.c.s1 - Q.c.s0) + 4 * r) continue;
      const nA = cross(P.c.axis, Q.c.axis);
      if (len(nA) < SIN3) continue;                                     // parallel: no torus plane
      const A = unit(nA), tol = Math.max(0.15 * r, 0.05);
      if (Math.abs(dot(sub(Q.m, P.m), A)) > tol) continue;               // axes not in one plane
      // centre: on each sector's in-plane normal through its middle
      const uP = cross(A, P.c.axis), uQ = cross(A, Q.c.axis), d = sub(Q.m, P.m);
      const den = dot(cross(uP, uQ), A);
      if (Math.abs(den) < 1e-9) continue;
      const t = dot(cross(d, uQ), A) / den, s2 = dot(cross(d, uP), A) / den;
      const C = add(P.m, mul(uP, t)), R = Math.abs(t);
      if (!(R > r) || Math.abs(R - Math.abs(s2)) > Math.max(0.05 * R, tol)) continue;
      const inliers = partial.slice(lo, Math.max(hi, b) + 1).filter(({ c, m }) => {
        if (!sameR(c.r, r) || Math.abs(dot(c.axis, A)) > SIN3) return false;
        const v = sub(m, C);
        if (Math.abs(dot(v, A)) > tol || Math.abs(dot(unit(v), c.axis)) > 0.1) return false;
        return Math.abs(len(v) - R) <= Math.max(0.05 * R, tol);
      });
      if (inliers.length >= 3) for (const k of inliers) toroidal.add(k.i);
    }
  }
  const goodCyls = cyls.filter((_, i) => !toroidal.has(i));
  inCyl.fill(-1);
  goodCyls.forEach((c, i) => c.members.forEach(m => { inCyl[m] = i; }));

  // ── 4. faces: planes, cylinders, free-form patches ─────────────────────────
  const faceOfRegion = new Int32Array(R).fill(-1);
  const faces: MeshFace[] = [];
  const newFace = (type: MeshFace['type'], regs: number[]): MeshFace => {
    const f: MeshFace = { id: faces.length + 1, type, tris: [], areaMm2: 0, centroid: [0, 0, 0] };
    let c: V3 = [0, 0, 0];
    for (const r of regs) { faceOfRegion[r] = f.id; for (const t of regions[r].tris) { f.tris.push(t); f.areaMm2 += A[t]; c = add(c, mul(cT(t), A[t])); } }
    f.centroid = mul(c, 1 / (f.areaMm2 || 1));
    faces.push(f);
    return f;
  };
  goodCyls.forEach(c => {
    const f = newFace('cylinder', c.members);
    f.cyl = { r: c.r, axis: c.axis, foot: c.foot, s0: c.s0, s1: c.s1, concave: c.concave, coverage: c.coverage };
  });
  // leftovers joined smoothly (< 40°) form patches; a region far larger than its patch's typical facet is a plane in it
  const left = Array.from({ length: R }, (_, i) => i).filter(r => inCyl[r] < 0);
  const lset = new Set(left);
  const ldsu = new DSU(R);
  for (const r of left) for (const nb of regionNbrs[r]) {
    if (!lset.has(nb) || nb < r) continue;
    if (dot(regions[r].n, regions[nb].n) >= Math.cos(SMOOTH_MAX_DEG * Math.PI / 180)) ldsu.union(r, nb);
  }
  // A STRIP of a curved surface (cone, torus, a cylinder too coarse to read) turns into its neighbour by the same angle
  // that neighbour turns into the next facet about the same line; a plane tangent to a blend turns by about HALF of it
  // (the first facet's chord leaves the tangent plane at half its arc). Size says nothing: a cone's strips can be larger
  // than the facets round them, and a "4× the patch median" test read 190 of Part1's cone and torus strips as planes.
  const turnDeg = (a: number, b: number) => angDeg(regions[a].n, regions[b].n);
  const isStrip = (r: number): boolean => {
    for (const nb of regionNbrs[r]) {
      const d1 = turnDeg(r, nb);
      if (d1 < STRIP_MIN_DEG || d1 > STRIP_MAX_DEG) continue;
      const a1 = unit(cross(regions[r].n, regions[nb].n));
      for (const nb2 of regionNbrs[nb]) {
        if (nb2 === r) continue;
        const d2 = turnDeg(nb, nb2);
        if (d2 < STRIP_MIN_DEG || d2 > STRIP_MAX_DEG) continue;
        if (Math.abs(dot(unit(cross(regions[nb].n, regions[nb2].n)), a1)) < 0.95) continue;
        const ratio = d1 / d2;
        if (ratio > 0.7 && ratio < 1.4) return true;
      }
    }
    return false;
  };
  const smoothSomewhere = (r: number) => [...regionNbrs[r]].some(nb => { const t = turnDeg(r, nb); return t >= STRIP_MIN_DEG && t < SMOOTH_MAX_DEG; });
  const facetsByComp = new Map<number, number[]>();
  for (const r of left) {
    // What the cylinder pass left is a plane unless it is a facet of a curved surface: part of a strip pattern (a run of
    // narrow faces turning by equal steps about parallel edges — also a hole too coarse to read), or a lone triangle
    // that joins a neighbour smoothly (the edge triangles of a curved surface touch one face sharply and the surface's
    // own facets smoothly). The facets of one smooth patch become one free-form face.
    const facet = isStrip(r) || (regions[r].tris.length < 2 && smoothSomewhere(r));
    if (!facet) { newFace('plane', [r]).normal = rv(regions[r].n, 5); continue; }
    const k = ldsu.find(r);
    const l = facetsByComp.get(k); if (l) l.push(r); else facetsByComp.set(k, [r]);
  }
  for (const facets of facetsByComp.values()) newFace('freeform', facets);
  // per-triangle face id in the ORIGINAL file order (the viewer's triFace)
  const triFace = new Uint32Array(nSoup);
  for (let t = 0; t < nSoup; t++) if (alive[t] && region[t] >= 0) triFace[t] = faceOfRegion[region[t]];
  // face adjacency
  const fAdj: Array<Set<number>> = faces.map(() => new Set());
  for (const key of pairEdges.keys()) {
    const fa = faceOfRegion[Math.floor(key / R)], fb = faceOfRegion[key % R];
    if (fa > 0 && fb > 0 && fa !== fb) { fAdj[fa - 1].add(fb); fAdj[fb - 1].add(fa); }
  }

  // ── rays ──────────────────────────────────────────────────────────────────
  const pos = new Float32Array(nSoup * 9);
  for (let t = 0; t < nSoup; t++) for (let j = 0; j < 3; j++) { const v = triV[t * 3 + j]; pos[t * 9 + j * 3] = V[v * 3]; pos[t * 9 + j * 3 + 1] = V[v * 3 + 1]; pos[t * 9 + j * 3 + 2] = V[v * 3 + 2]; }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geom, { indirect: true });
  const ray = new THREE.Ray();
  /** Distance to the first surface along d from p (within maxD), or null. */
  const hit = (p: V3, d: V3, maxD = diag * 1.05): number | null => {
    ray.origin.set(p[0], p[1], p[2]); ray.direction.set(d[0], d[1], d[2]).normalize();
    const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxD);
    return h && h.distance <= maxD ? h.distance : null;
  };
  /** Point in air (outside the solid): parity of crossings along three skew directions, majority. */
  const SKEW: V3[] = [unit([0.5773, 0.5774, 0.5775]), unit([-0.62, 0.48, 0.62]), unit([0.31, -0.71, 0.63])];
  const air = (p: V3): boolean => {
    let outside = 0;
    for (const d of SKEW) {
      ray.origin.set(p[0], p[1], p[2]); ray.direction.set(d[0], d[1], d[2]);
      const hs = bvh.raycast(ray, THREE.DoubleSide);
      const ds = hs.map(h => h.distance).sort((x, y) => x - y);
      let n = 0, last = -1;
      for (const x of ds) { if (x - last > 1e-6) n++; last = x; }
      if (n % 2 === 0) outside++;
    }
    return outside >= 2;
  };
  /** A sample point on a face: the triangle nearest its centroid (an area centroid can lie off a non-convex face). */
  const sampleTri = (f: MeshFace): number => {
    let best = f.tris[0], bd = Infinity;
    for (const t of f.tris) { const d = len(sub(cT(t), f.centroid)); if (d < bd) { bd = d; best = t; } }
    return best;
  };

  // ── thickness (single ray into the material) ──────────────────────────────
  const eps = Math.max(diag * 1e-4, 1e-3);
  const tmax = diag * 1.05;
  for (const f of faces) {
    const t = sampleTri(f); const n = nT(t); const p = cT(t);
    const start = sub(p, mul(n, eps));
    const d = hit(start, mul(n, -1), tmax);
    if (d !== null) { const th = d + eps; if (th > 0.05 && th < tmax) f.thicknessMm = r3(th); }
  }

  // ── release table per candidate draw, pick the draw ───────────────────────
  type Rel = { half: number; blocked: number | null; cavity: boolean };
  const releaseOne = (p: V3, n: V3, d: V3): [number, number | null] => {
    const c = dot(n, d);
    if (Math.abs(c) < RELEASE_PARALLEL_COS) return [0, null];
    const s = c > 0 ? 1 : -1;
    const off = Math.max(diag * 5e-5, RELEASE_OFFSET_MM);
    const dist = hit(add(p, mul(n, off)), mul(d, s));
    return [s, dist !== null && dist > MIN_BLOCK_MM ? r3(dist) : null];
  };
  const PROBE: V3[] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) {
    if ((a | b | c) === 0 || Math.abs(a) + Math.abs(b) + Math.abs(c) === 2) continue;
    PROBE.push(unit([a, b, c]));
  }
  const facesCavity = (p: V3, n: V3, axis?: V3): boolean => {
    const off = Math.max(diag * 5e-5, RELEASE_OFFSET_MM);
    const st = add(p, mul(n, off));
    for (const d of [...PROBE, ...(axis ? [axis, mul(axis, -1)] : [])]) if (hit(st, d) === null) return false;
    return true;
  };
  const releaseTable = (d: V3): Map<number, Rel> => {
    const out = new Map<number, Rel>();
    for (const f of faces) {
      if (f.type === 'freeform') continue;
      const t = sampleTri(f);
      let [half, blocked] = releaseOne(cT(t), nT(t), d);
      if (f.type === 'cylinder' && blocked === null) {
        // the strip facing +draw and the one facing −draw (a bore side-on to the draw reads clear at its mid strip)
        for (const sgn of [1, -1]) {
          let best = -1, bt = -1;
          for (const tt of f.tris) { const v = sgn * dot(nT(tt), d); if (v > best) { best = v; bt = tt; } }
          if (bt >= 0 && best > RELEASE_PARALLEL_COS) {
            const [h2, b2] = releaseOne(cT(bt), nT(bt), d);
            if (b2 !== null && (blocked === null || b2 < blocked)) { half = h2; blocked = b2; }
          }
        }
      }
      if (blocked !== null && f.areaMm2 < MIN_RELEASE_FACE_MM2) blocked = null;
      out.set(f.id, { half, blocked, cavity: false });
    }
    // cavity per blocked face; confirm an undercut at two more points (majority)
    for (const f of faces) {
      const r = out.get(f.id);
      if (!r || r.blocked === null) continue;
      const t = sampleTri(f);
      if (facesCavity(cT(t), nT(t), f.cyl?.axis)) { r.cavity = true; continue; }
      const more = [...f.tris].sort((x, y) => A[y] - A[x]).filter(x => x !== t).slice(0, 2);
      if (more.length) {
        const hits = [r.blocked, ...more.map(x => releaseOne(cT(x), nT(x), d)[1]).filter((b): b is number => b !== null)];
        r.blocked = hits.length * 2 > more.length + 1 ? Math.min(...hits) : null;
      }
    }
    return out;
  };
  const silhouette = (axisIdx: number): number => {
    const [ia, ib] = [0, 1, 2].filter(k => k !== axisIdx);
    const span = Math.max(ext[ia], ext[ib]) || 1;
    const cells = 400, cs = span / cells;
    const W = Math.ceil(ext[ia] / cs) + 2, H = Math.ceil(ext[ib] / cs) + 2;
    const grid = new Uint8Array(W * H);
    for (let t = 0; t < nSoup; t++) {
      if (!alive[t]) continue;
      const xs = [0, 1, 2].map(j => (V[triV[t * 3 + j] * 3 + ia] - mn[ia]) / cs);
      const ys = [0, 1, 2].map(j => (V[triV[t * 3 + j] * 3 + ib] - mn[ib]) / cs);
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5; let lo = Infinity, hi = -Infinity;
        for (let j = 0; j < 3; j++) {
          const xa = xs[j], ya = ys[j], xb = xs[(j + 1) % 3], yb = ys[(j + 1) % 3];
          if ((ya <= yc && yb >= yc) || (yb <= yc && ya >= yc)) {
            const x = Math.abs(yb - ya) < 1e-12 ? Math.min(xa, xb) : xa + (yc - ya) * (xb - xa) / (yb - ya);
            lo = Math.min(lo, x, Math.abs(yb - ya) < 1e-12 ? Math.max(xa, xb) : x); hi = Math.max(hi, x, Math.abs(yb - ya) < 1e-12 ? Math.max(xa, xb) : x);
          }
        }
        if (lo > hi) continue;
        for (let x = Math.max(0, Math.floor(lo)); x <= Math.min(W - 1, Math.floor(hi)); x++) grid[y * W + x] = 1;
      }
    }
    let n = 0; for (const g of grid) n += g;
    return n * cs * cs;
  };
  const cands = ([[0, 0, 1], [0, 1, 0], [1, 0, 0]] as V3[]).map((d, i) => {
    const table = releaseTable(d);
    const undercuts = [...table.values()].filter(r => r.blocked !== null && !r.cavity).length;
    return { d, table, undercuts, sil: silhouette(2 - i) };
  });
  const silByAxis = { zMm2: r3(cands[0].sil, 1), yMm2: r3(cands[1].sil, 1), xMm2: r3(cands[2].sil, 1) };
  cands.sort((x, y) => x.undercuts - y.undercuts || y.sil - x.sil);
  const draw = cands[0];
  const dd = draw.d;
  /** The kernel's `_compute_draft_analysis` on the same release table: undercut (blocked, not a cavity), zero draft
   *  (|90° − angle| < 1°), adequate (≥ 1°); end faces (normal within ~18° of the draw) count only when blocked. */
  const draftSummary = (c: typeof draw) => {
    let undercut = 0, zero = 0, adequate = 0, cavity = 0;
    const pos: number[] = [];
    for (const [id, r] of c.table) {
      if (r.blocked !== null) { if (r.cavity) cavity++; else undercut++; continue; }
      const cosA = Math.max(-1, Math.min(1, dot(nT(sampleTri(faces[id - 1])), c.d)));
      if (Math.abs(cosA) > 0.95) continue;
      const draft = Math.abs(90 - Math.acos(cosA) * 180 / Math.PI);
      if (draft < 1) zero++; else { adequate++; pos.push(r3(draft, 2)); }
    }
    return { undercut, zero, adequate, cavity, pos };
  };
  const ds = draftSummary(draw);
  const draftAnalysis: NonNullable<MeshFeatureResult['draftAnalysis']> = {
    drawDirectionXYZ: [dd[0], dd[1], dd[2]],
    undercutFaceCount: ds.undercut, cavityFaceCount: ds.cavity, zeroDraftFaceCount: ds.zero, adequateDraftFaceCount: ds.adequate,
    minPositiveDraftDeg: ds.pos.length ? Math.min(...ds.pos) : null, maxPositiveDraftDeg: ds.pos.length ? Math.max(...ds.pos) : null,
    analyzedFaceCount: ds.undercut + ds.zero + ds.adequate,
    pullDirectionSearch: {
      candidates: cands.map(c => ({ drawDirectionXYZ: [...c.d], undercutFaceCount: c.undercuts })),
      runnerUp: cands[1] ? { drawDirectionXYZ: [...cands[1].d], undercutFaceCount: cands[1].undercuts } : null,
      ambiguous: !!cands[1] && draw.undercuts > 0 && Math.abs(cands[1].undercuts - draw.undercuts) <= Math.max(1, Math.floor(0.1 * draw.undercuts)),
    },
  };
  const projectedArea = { ...silByAxis, alongDrawMm2: r3(draw.sil, 1), method: 'mesh_silhouette_raster' };

  // ── assemble features (the kernel's pass 3) ───────────────────────────────
  const fillRatio = ext[0] * ext[1] * ext[2] > 0 ? volumeMm3 / (ext[0] * ext[1] * ext[2]) : null;
  const wallValid = fillRatio !== null && fillRatio < 0.55;
  const F = new Map<number, Record<string, unknown>>();
  for (const f of faces) {
    if (f.type !== 'plane') continue;
    const n = f.normal as V3;
    const rel = draw.table.get(f.id);
    const rec: Record<string, unknown> = {};
    const cosA = Math.max(-1, Math.min(1, dot(n, dd)));
    const ang = Math.acos(cosA) * 180 / Math.PI;
    let blocked = rel?.blocked ?? null;
    if (rel?.half) rec.releaseHalf = rel.half;
    if (blocked !== null) {
      rec.blockedAtMm = blocked;
      if (rel?.cavity) { rec.facesCavity = true; blocked = null; }
    }
    if (Math.abs(cosA) > 0.95) rec.draftClass = blocked !== null ? 'undercut' : 'not_applicable';
    else {
      rec.draftDeg = r3(Math.abs(90 - ang), 2);
      rec.draftClass = blocked !== null ? 'undercut' : Math.abs(90 - ang) < 1 ? 'zero_draft' : 'drafted';
    }
    if (rec.facesCavity) { rec.draftClass = 'not_applicable'; delete rec.draftDeg; }
    F.set(f.id, rec);
  }
  // undercut regions: touching blocked faces, or across a blend / a side wall, are ONE slide
  const uc = [...F.entries()].filter(([, r]) => r.draftClass === 'undercut').map(([i]) => i);
  const ucs = new Set(uc);
  const udsu = new DSU(faces.length + 1);
  const isBlend = (j: number) => { const f = faces[j - 1]; return f.type === 'freeform' || (f.type === 'cylinder' && f.cyl!.r <= BLEND_MAX_RADIUS_MM); };
  const sideWall = (j: number) => { const f = faces[j - 1]; return f.type === 'plane' && Math.abs(dot(f.normal as V3, dd)) < 0.1; };
  for (const i of uc) for (const j of fAdj[i - 1]) {
    if (ucs.has(j)) udsu.union(i, j);
    else if (isBlend(j) || sideWall(j)) for (const k of fAdj[j - 1]) if (ucs.has(k) && k !== i) udsu.union(i, k);
  }
  for (const i of uc) F.get(i)!.undercutRegion = udsu.find(i);

  const thk = (i: number) => faces[i - 1]?.thicknessMm;
  const feats: ManufacturingFeature[] = [];
  // cylinders → holes / bosses / fillets; coaxial pieces on one LINE with overlapping ranges are one feature
  // one LINE: parallel axes, the lines within max(2 % of the diameter, 0.05 mm), the same radius (1 %, min 0.02 mm)
  const lines: MeshFace[][] = [];
  for (const f of faces) {
    if (f.type !== 'cylinder') continue;
    const c = f.cyl!;
    const same = (g: MeshFace[]) => {
      const o = g[0].cyl!;
      if (o.concave !== c.concave || Math.abs(dot(o.axis, c.axis)) < 0.999) return false;
      if (Math.abs(o.r - c.r) > Math.max(0.01 * c.r, 0.02)) return false;
      const d = sub(c.foot, o.foot);
      const perp = len(sub(d, mul(o.axis, dot(d, o.axis))));
      return perp <= Math.max(0.04 * c.r, 0.05);
    };
    const g = lines.find(same);
    if (g) g.push(f); else lines.push([f]);
  }
  const byLine = new Map<number, MeshFace[]>(lines.map((g, i) => [i, g]));
  // a cylinder's s-range is along ITS axis sign; a line's members share the first one's
  for (const g of lines) {
    const ax0 = g[0].cyl!.axis;
    for (const f of g.slice(1)) if (dot(f.cyl!.axis, ax0) < 0) { const c = f.cyl!; c.axis = ax0; const t0 = c.s0; c.s0 = -c.s1; c.s1 = -t0; }
  }
  for (const fs of byLine.values()) {
    fs.sort((a, b) => a.cyl!.s0 - b.cyl!.s0);
    const groups: Array<{ fs: MeshFace[]; s0: number; s1: number }> = [];
    for (const f of fs) {
      const g = groups[groups.length - 1];
      if (g && f.cyl!.s0 <= g.s1 + 0.05) { g.fs.push(f); g.s1 = Math.max(g.s1, f.cyl!.s1); }
      else groups.push({ fs: [f], s0: f.cyl!.s0, s1: f.cyl!.s1 });
    }
    for (const g of groups) {
      const c0 = g.fs[0].cyl!;
      const ax = c0.axis, r = c0.r, concave = c0.concave;
      const ids = g.fs.map(f => f.id).sort((a, b) => a - b);
      const span = g.s1 - g.s0;
      const area = g.fs.reduce((s, f) => s + f.areaMm2, 0);
      const coverage = Math.min(g.fs.reduce((s, f) => s + f.cyl!.coverage, 0), 2);
      const p0 = add(c0.foot, mul(ax, g.s0)), p1 = add(c0.foot, mul(ax, g.s1));
      const mid = mul(add(p0, p1), 0.5);
      const openEnd = (pt: V3, dir: V3) => hit(sub(pt, mul(dir, Math.min(0.05, r * 0.05))), dir) === null;
      const ends = [openEnd(p0, mul(ax, -1)), openEnd(p1, ax)];
      const openDirs = [...(ends[0] ? [rv(mul(ax, -1), 5)] : []), ...(ends[1] ? [rv(ax, 5)] : [])] as Array<[number, number, number]>;
      const full = coverage >= FULL_TURN;
      if (full) {
        const dia = r3(2 * r);
        const rec: ManufacturingFeature = {
          id: `${concave ? 'H' : 'B'}${ids[0]}`, kind: concave ? 'hole' : 'boss', faceIds: ids,
          diaMm: dia, depthMm: r3(span), areaMm2: r3(area), positionMm: rv(mid), axis: rv(ax, 5),
        };
        if (dia > 0) rec.ldRatio = r3(span / dia);
        if (concave) {
          // breakout: a ring of four points at 0.8 r, sampled from 0.5 mm past the end to past a drill point
          const [e1, e2] = basis(ax);
          const reach = 0.6 * r + 0.5;
          const samples = Array.from({ length: 7 }, (_, i) => 0.5 + (reach - 0.5) * i / 6);
          const ring = [0, Math.PI / 2, Math.PI, 1.5 * Math.PI].map(a => add(mul(e1, 0.8 * r * Math.cos(a)), mul(e2, 0.8 * r * Math.sin(a))));
          const breaks = (pt: V3, dir: V3) => {
            let opens = 0;
            for (const off of ring) {
              let open = true;
              for (const s of samples) if (!air(add(add(pt, off), mul(dir, s)))) { open = false; break; }
              if (open) opens++;
            }
            return opens >= 3;
          };
          rec.openEnds = (breaks(p0, mul(ax, -1)) ? 1 : 0) + (breaks(p1, ax) ? 1 : 0);
          rec.openDirs = openDirs;
        }
        const nbt = ids.flatMap(j => [...fAdj[j - 1]].map(thk)).filter((x): x is number => x !== undefined);
        if (nbt.length) {
          rec.neighbourWallMm = r3(Math.min(...nbt));
          if (!concave && Math.min(...nbt) > 0) rec.bossToWallRatio = r3(dia / Math.min(...nbt));
        }
        feats.push(rec);
      } else {
        const nb = [...new Set(ids.flatMap(j => [...fAdj[j - 1]].filter(k => faces[k - 1].type === 'plane')))].sort((a, b) => a - b);
        const rec: ManufacturingFeature = {
          id: `FIL${ids[0]}`, kind: 'fillet', faceIds: ids, radiusMm: r3(r, 4), depthMm: r3(span), areaMm2: r3(area),
          positionMm: rv(mid), axis: rv(ax, 5), concave, sweepDeg: r3(Math.min(coverage, 1) * 360, 1),
          adjacentFaceIds: nb.slice(0, 6),
        };
        if (concave && (ends[0] || ends[1])) { rec.toolReachMm = r3(span); rec.openDirs = openDirs; }
        feats.push(rec);
      }
    }
  }
  for (const f of faces) {
    if (f.type !== 'plane') continue;
    const r = F.get(f.id) ?? {};
    const rec: ManufacturingFeature = { id: `P${f.id}`, kind: 'planar_face', faceIds: [f.id], areaMm2: r3(f.areaMm2), positionMm: rv(f.centroid) };
    if (f.normal) rec.axis = f.normal;
    if (f.thicknessMm !== undefined) rec.thicknessMm = f.thicknessMm;
    for (const k of ['draftClass', 'draftDeg', 'releaseHalf', 'blockedAtMm', 'undercutRegion', 'facesCavity'] as const) {
      if (r[k] !== undefined) (rec as unknown as Record<string, unknown>)[k] = r[k];
    }
    const t = f.thicknessMm;
    if (t && wallValid) {
      const nbt = [...fAdj[f.id - 1]].map(thk).filter((x): x is number => x !== undefined);
      if (nbt.length) {
        const thin = Math.min(...nbt);
        if (thin > 0) { rec.neighbourMinThicknessMm = r3(thin); rec.sectionRatio = r3(Math.max(t, thin) / Math.min(t, thin)); }
      }
    }
    feats.push(rec);
  }
  const tvals = faces.map(f => f.thicknessMm).filter((x): x is number => !!x && x > 0).sort((a, b) => a - b);
  const hot: NonNullable<ManufacturingFeatureSet['hotSpots']> = [];
  if (wallValid && tvals.length >= 8) {
    const med = tvals[Math.floor(tvals.length / 2)];
    for (const f of faces) if (f.thicknessMm && f.thicknessMm > 2 * med) hot.push({ faceId: f.id, thicknessMm: f.thicknessMm, vsMedianRatio: r3(f.thicknessMm / med, 2), positionMm: rv(f.centroid) });
    hot.sort((a, b) => b.thicknessMm - a.thicknessMm);
  }
  const notes = [
    'Read from a triangle mesh (STL): faces were recovered by segmentation — planes, cylinders, free-form patches. '
      + 'A hole tessellated coarser than 36° a facet is not recognised; a polygonal prism of 10+ sides reads as a cylinder.',
    ...(openEdges ? [`${openEdges} open / non-manifold edge(s): the mesh is not a closed solid, so through / blind and wall readings near them are uncertain.`] : []),
    ...(!wallValid ? [`solid-bodied part (fill ratio ${fillRatio === null ? 'unknown' : r3(fillRatio)}) — single-ray thickness measures part extent, not wall; section-change and hot-spot rules suppressed`] : []),
  ];
  const featureSet: ManufacturingFeatureSet = {
    available: true, features: feats, faceCount: faces.length, thicknessSampledFaces: tvals.length,
    medianThicknessMm: tvals.length ? tvals[Math.floor(tvals.length / 2)] : null,
    hotSpots: hot.slice(0, 25), wallAnalysisValid: wallValid, fillRatio: fillRatio === null ? null : r3(fillRatio, 4),
    adjacencyAvailable: fAdj.some(s => s.size > 0), drawDirectionXYZ: [...dd], note: notes.join(' '),
  };
  let surfaceMm2 = 0; for (let t = 0; t < nSoup; t++) surfaceMm2 += A[t];
  return { featureSet, triFace, faces, volumeMm3, surfaceMm2,
    bboxMm: { x: r3(ext[0]), y: r3(ext[1]), z: r3(ext[2]) }, projectedAlongDrawMm2: r3(draw.sil, 1), projectedArea, draftAnalysis,
    stats: { triangles: nSoup, vertices: nV, regions: R, faces: faces.length, cylinders: goodCyls.length, ms: Date.now() - t0 } };
}

function emptyResult(n: number, note: string, t0: number): MeshFeatureResult {
  return { featureSet: { available: false, features: [], note }, triFace: new Uint32Array(n), faces: [], volumeMm3: 0, surfaceMm2: 0,
    stats: { triangles: n, vertices: 0, regions: 0, faces: 0, cylinders: 0, ms: Date.now() - t0 } };
}
