/**
 * Develop the flat blank of a formed sheet part from its skin mesh.
 *
 * WHAT THIS IS. The kernel (`cad-geometry-engine.py --skin-mesh`) meshes the
 * solid and hands over its two skins — the faces whose inward ray exits one
 * gauge away, bends included, edge band excluded — as welded triangle meshes.
 * This file flattens each skin into the plane and measures what the stamping
 * cost needs from the blank: the outline, its area and perimeter, the pierced
 * holes, and the smallest rectangle the outline nests in. It is phase 2 of
 * docs/sheet-metal/blank-development-research-2026-10.md: the bent-part
 * unfold. It gives, without a FASTBLANK file, the outline the rules were
 * guessing from the bounding box.
 *
 * HOW. Tutte embedding first (boundary on a circle, interior harmonic — a
 * fold-free start), then as-rigid-as-possible local/global iterations (Liu,
 * Zhang, Gotsman & Gortler 2008): each triangle finds the rotation closest
 * to its current flat image, and one sparse solve moves the vertices to fit
 * those rotations. For a developable surface — a bent part — the minimum is
 * the exact development, so the result is not an approximation: the research
 * prototype hit a hand-calculated L-bracket to 0.001%. The sparse system is
 * the cotangent Laplacian, symmetric positive definite once one vertex is
 * pinned, factorised once by an envelope Cholesky under a reverse
 * Cuthill–McKee ordering and reused for every iteration. Meshes here are a
 * few thousand vertices, so a skin solves in a second or two; no numpy, no
 * native code, and it runs in the Windows package as it is.
 *
 * WHAT IT IS NOT. A drawn part is not developable: the metal stretched, and no
 * flattening is distortion-free. The per-triangle strain says how far from
 * developable the skin is; above a few percent the outline is reported with
 * a warning, and the physics solve (phase 4) is what makes it right. The
 * blank is also the mid-surface at K = 0.5 — the mean of the two skins —
 * where a press-brake K of 0.38–0.45 would shorten each bend by a fraction
 * of a millimetre. On a 15-bend bracket that is under 1% of area.
 *
 * Holes are capped with a fan to their centroid before the solve so the skin
 * is a disk (Tutte needs one); the caps are dropped before measuring.
 */

export interface SkinMesh {
  vertices: number[][];
  triangles: number[][];
  area3dMm2: number;
}

export interface SkinMeshFile {
  status: 'success';
  thicknessMm: number;
  thicknessSource: 'bend-pairs' | 'bulk-wall';
  bendCount: number;
  linearDeflectionMm: number;
  volumeMm3: number;
  surfaceAreaMm2: number;
  triangles: number;
  skinFaces: number;
  faces: number;
  skins: SkinMesh[];
}

export interface UnfoldedSkin {
  /** The outer profile: the metal bought. */
  grossAreaMm2: number;
  /** Sum of the flat triangle areas: the metal left in the part. */
  netAreaMm2: number;
  outerPerimeterMm: number;
  holePerimeterMm: number;
  holeCount: number;
  /** Closed outline in the strip frame (rotated so the minimum rectangle is axis-aligned). */
  outline: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
  /** Minimum-area enclosing rectangle of the outline, length ≥ width. */
  rect: { lengthMm: number; widthMm: number; angleDeg: number };
  /** Area-weighted 95th-percentile and mean |ln σ| over the real triangles, percent — ~0 on a developable skin. */
  maxStrainPct: number;
  meanStrainPct: number;
  /** Triangles whose flat image is inverted — should be 0. */
  flipped: number;
  iterations: number;
  area3dMm2: number;
  vertexCount: number;
  triangleCount: number;
}

export interface DevelopedBlank {
  grossAreaMm2: number;
  netAreaMm2: number;
  outerPerimeterMm: number;
  holePerimeterMm: number;
  holeCount: number;
  boundingRectMm: { lengthMm: number; widthMm: number };
  rectangleFill: number;
  /** Per-skin results, largest first; the DXF is written from the first. */
  skins: UnfoldedSkin[];
  /** |gross₁ − gross₂| ÷ mean, percent; null with one skin. */
  skinAgreementPct: number | null;
  maxStrainPct: number;
  developable: boolean;
  gaugeMm: number;
  source: string;
  warnings: string[];
}

export interface UnfoldOptions {
  /** ARAP iteration cap. */
  maxIterations?: number;
  /** Stop when no vertex moved more than this fraction of the mesh diagonal. */
  tolerance?: number;
}

// ─── Sparse matrix (CSR) and a direct envelope Cholesky ──────────────────────

interface CSR { n: number; rowPtr: Int32Array; col: Int32Array; val: Float64Array }

function buildCSR(n: number, rows: Array<Map<number, number>>): CSR {
  const rowPtr = new Int32Array(n + 1);
  let nnz = 0;
  for (let i = 0; i < n; i++) { nnz += rows[i].size; rowPtr[i + 1] = nnz; }
  const col = new Int32Array(nnz);
  const val = new Float64Array(nnz);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const keys = Array.from(rows[i].keys()).sort((x, y) => x - y);
    for (const j of keys) { col[k] = j; val[k] = rows[i].get(j)!; k++; }
  }
  return { n, rowPtr, col, val };
}

/** Reverse Cuthill–McKee ordering of the free vertices, to keep the Cholesky envelope narrow. */
function rcmOrder(A: CSR, free: Int32Array): Int32Array {
  const nf = free.length;
  const localOf = new Int32Array(A.n).fill(-1);
  for (let i = 0; i < nf; i++) localOf[free[i]] = i;
  const deg = new Int32Array(nf);
  for (let i = 0; i < nf; i++) {
    const r = free[i];
    for (let k = A.rowPtr[r]; k < A.rowPtr[r + 1]; k++) if (localOf[A.col[k]] >= 0 && A.col[k] !== r) deg[i]++;
  }
  const order = new Int32Array(nf);
  const seen = new Uint8Array(nf);
  let filled = 0;
  while (filled < nf) {
    // Start each component at a vertex of minimum degree.
    let start = -1;
    for (let i = 0; i < nf; i++) if (!seen[i] && (start < 0 || deg[i] < deg[start])) start = i;
    const queue: number[] = [start];
    seen[start] = 1;
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      order[filled++] = i;
      const r = free[i];
      const nb: number[] = [];
      for (let k = A.rowPtr[r]; k < A.rowPtr[r + 1]; k++) {
        const j = localOf[A.col[k]];
        if (j >= 0 && !seen[j]) { seen[j] = 1; nb.push(j); }
      }
      nb.sort((x, y) => deg[x] - deg[y]);
      for (const j of nb) queue.push(j);
    }
  }
  order.reverse();
  return order;   // order[newIndex] = local free index
}

/**
 * Solves A x = b on the free vertices with the fixed vertices held at their
 * values in x — the Dirichlet problem — by an envelope (skyline) Cholesky of
 * the free block, factorised once and reused for every right-hand side.
 * The matrix must be symmetric positive definite on the free block, which
 * the graph and cotangent Laplacians are once at least one vertex is fixed.
 */
class DirichletSolver {
  private readonly nf: number;
  private readonly free: Int32Array;         // free[new] = global vertex
  private readonly newOf: Int32Array;        // newOf[global] = new index or -1
  private readonly lo: Int32Array;           // first stored column of each row
  private readonly rowStart: Float64Array[]; // L rows (envelope), row i holds cols lo[i]..i
  private readonly A: CSR;

  constructor(A: CSR, fixed: Uint8Array) {
    this.A = A;
    const freeList: number[] = [];
    for (let i = 0; i < A.n; i++) if (!fixed[i]) freeList.push(i);
    const localFree = Int32Array.from(freeList);
    const order = rcmOrder(A, localFree);
    this.nf = order.length;
    this.free = new Int32Array(this.nf);
    this.newOf = new Int32Array(A.n).fill(-1);
    for (let k = 0; k < this.nf; k++) { this.free[k] = localFree[order[k]]; this.newOf[this.free[k]] = k; }
    // Envelope: lo[i] = smallest column index with a nonzero in row i (symmetric).
    this.lo = new Int32Array(this.nf);
    for (let i = 0; i < this.nf; i++) {
      let lo = i;
      const r = this.free[i];
      for (let k = A.rowPtr[r]; k < A.rowPtr[r + 1]; k++) { const j = this.newOf[A.col[k]]; if (j >= 0 && j < lo) lo = j; }
      this.lo[i] = lo;
    }
    // Scatter A into the envelope, then factor in place: L Lᵀ, row-oriented.
    this.rowStart = new Array(this.nf);
    for (let i = 0; i < this.nf; i++) {
      const row = new Float64Array(i - this.lo[i] + 1);
      const r = this.free[i];
      for (let k = A.rowPtr[r]; k < A.rowPtr[r + 1]; k++) {
        const j = this.newOf[A.col[k]];
        if (j >= 0 && j <= i) row[j - this.lo[i]] = A.val[k];
      }
      this.rowStart[i] = row;
    }
    const L = this.rowStart, lo = this.lo;
    for (let i = 0; i < this.nf; i++) {
      const Li = L[i], loi = lo[i];
      for (let j = loi; j < i; j++) {
        const Lj = L[j], loj = lo[j];
        let s = Li[j - loi];
        const from = Math.max(loi, loj);
        for (let k = from; k < j; k++) s -= Li[k - loi] * Lj[k - loj];
        Li[j - loi] = s / Lj[j - loj];
      }
      let d = Li[i - loi];
      for (let k = loi; k < i; k++) d -= Li[k - loi] * Li[k - loi];
      if (!(d > 1e-14)) d = 1e-14;   // a degenerate sliver cannot be allowed to stop the solve
      Li[i - loi] = Math.sqrt(d);
    }
  }

  /** Fill the free entries of x so that A x = b, given the fixed entries of x. */
  solve(b: Float64Array, x: Float64Array): void {
    const { A, nf, free, newOf, lo, rowStart: L } = this;
    const y = new Float64Array(nf);
    for (let i = 0; i < nf; i++) {
      const r = free[i];
      let s = b[r];
      for (let k = A.rowPtr[r]; k < A.rowPtr[r + 1]; k++) if (newOf[A.col[k]] < 0) s -= A.val[k] * x[A.col[k]];
      y[i] = s;
    }
    for (let i = 0; i < nf; i++) {          // forward: L y = rhs
      const Li = L[i], loi = lo[i];
      let s = y[i];
      for (let k = loi; k < i; k++) s -= Li[k - loi] * y[k];
      y[i] = s / Li[i - loi];
    }
    for (let i = nf - 1; i >= 0; i--) {     // back: Lᵀ z = y
      const Li = L[i], loi = lo[i];
      const zi = y[i] / Li[i - loi];
      y[i] = zi;
      for (let k = loi; k < i; k++) y[k] -= Li[k - loi] * zi;
    }
    for (let i = 0; i < nf; i++) x[free[i]] = y[i];
  }
}

// ─── Mesh helpers ────────────────────────────────────────────────────────────

/** Boundary loops of a triangle set, each a closed list of vertex ids in boundary direction. */
export function boundaryLoops(T: Int32Array, m: number): number[][] {
  const count = new Map<number, number>();
  const dir = new Map<number, [number, number]>();
  const key = (u: number, v: number) => (u < v ? u * 4294967296 + v : v * 4294967296 + u);
  for (let i = 0; i < m; i++) {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const k = key(u, v);
      count.set(k, (count.get(k) ?? 0) + 1);
      dir.set(k, [u, v]);
    }
  }
  const next = new Map<number, number>();
  for (const [k, n] of count) if (n === 1) { const [u, v] = dir.get(k)!; next.set(u, v); }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop: number[] = [];
    let x = s;
    while (!seen.has(x) && next.has(x)) { seen.add(x); loop.push(x); x = next.get(x)!; }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

function dist3(V: Float64Array, a: number, b: number): number {
  const dx = V[3 * a] - V[3 * b], dy = V[3 * a + 1] - V[3 * b + 1], dz = V[3 * a + 2] - V[3 * b + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function loopLength3(V: Float64Array, loop: number[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) s += dist3(V, loop[i], loop[(i + 1) % loop.length]);
  return s;
}

/** Shoelace area (signed) and perimeter of a closed 2D loop. */
function loopMeasure2(U: Float64Array, loop: number[]): { area: number; perimeter: number } {
  let a = 0, p = 0;
  for (let i = 0; i < loop.length; i++) {
    const u = loop[i], v = loop[(i + 1) % loop.length];
    const x0 = U[2 * u], y0 = U[2 * u + 1], x1 = U[2 * v], y1 = U[2 * v + 1];
    a += x0 * y1 - x1 * y0;
    p += Math.hypot(x1 - x0, y1 - y0);
  }
  return { area: a / 2, perimeter: p };
}

/** Andrew's monotone chain; returns the hull counter-clockwise. */
export function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: Array<[number, number]> = [];
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/**
 * Minimum-area enclosing rectangle. One side of it is collinear with a hull
 * edge, so trying every hull edge direction is exact — not a 1° sweep.
 */
export function minAreaRect(pts: Array<[number, number]>): { lengthMm: number; widthMm: number; angleDeg: number } {
  const hull = convexHull(pts);
  if (hull.length < 2) return { lengthMm: 0, widthMm: 0, angleDeg: 0 };
  let best = { area: Infinity, lengthMm: 0, widthMm: 0, angleDeg: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of hull) {
      const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX, h = maxY - minY;
    if (w * h < best.area) {
      best = { area: w * h, lengthMm: Math.max(w, h), widthMm: Math.min(w, h), angleDeg: (ang * 180) / Math.PI };
      if (h > w) best.angleDeg += 90;   // report the angle that puts the long side on x
    }
  }
  return { lengthMm: best.lengthMm, widthMm: best.widthMm, angleDeg: best.angleDeg };
}

// ─── The unfold ──────────────────────────────────────────────────────────────

export function unfoldSkin(skin: SkinMesh, opts: UnfoldOptions = {}): UnfoldedSkin {
  const maxIterations = opts.maxIterations ?? 400;
  const tolerance = opts.tolerance ?? 2e-6;
  const nReal = skin.vertices.length;
  const mReal = skin.triangles.length;
  if (nReal < 3 || mReal < 1) throw new Error('skin mesh is empty');

  // 1. Pack the mesh; find loops; cap holes with a fan so the skin is a disk.
  const V3: number[] = [];
  for (const v of skin.vertices) V3.push(v[0], v[1], v[2]);
  const T3: number[] = [];
  for (const t of skin.triangles) T3.push(t[0], t[1], t[2]);
  const Treal = Int32Array.from(T3);
  const loopsRaw = boundaryLoops(Treal, mReal);
  if (!loopsRaw.length) throw new Error('skin mesh has no boundary — a closed surface cannot be unfolded');
  const Vtmp = Float64Array.from(V3);
  loopsRaw.sort((a, b) => loopLength3(Vtmp, b) - loopLength3(Vtmp, a));
  const outer = loopsRaw[0];
  const holes = loopsRaw.slice(1);
  for (const h of holes) {
    let cx = 0, cy = 0, cz = 0;
    for (const v of h) { cx += V3[3 * v]; cy += V3[3 * v + 1]; cz += V3[3 * v + 2]; }
    const c = V3.length / 3;
    V3.push(cx / h.length, cy / h.length, cz / h.length);
    for (let i = 0; i < h.length; i++) T3.push(h[i], h[(i + h.length - 1) % h.length], c);
  }
  const V = Float64Array.from(V3);
  const T = Int32Array.from(T3);
  const n = V.length / 3;
  const m = T.length / 3;

  // Mesh diagonal, for the convergence test.
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[3 * i + k]); hi[k] = Math.max(hi[k], V[3 * i + k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;

  // 2. Tutte: boundary on a circle by arc length, interior harmonic.
  const U = new Float64Array(2 * n);
  const fixed = new Uint8Array(n);
  {
    const seg: number[] = [];
    let total = 0;
    for (let i = 0; i < outer.length; i++) { const d = dist3(V, outer[i], outer[(i + 1) % outer.length]); seg.push(d); total += d; }
    const R = total / (2 * Math.PI);
    let s = 0;
    for (let i = 0; i < outer.length; i++) {
      const ang = (s / total) * 2 * Math.PI;
      U[2 * outer[i]] = R * Math.cos(ang); U[2 * outer[i] + 1] = R * Math.sin(ang);
      fixed[outer[i]] = 1;
      s += seg[i];
    }
    const rows: Array<Map<number, number>> = Array.from({ length: n }, () => new Map());
    for (let i = 0; i < m; i++) {
      const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        rows[u].set(v, -1); rows[v].set(u, -1);
      }
    }
    for (let i = 0; i < n; i++) { let d = 0; for (const [j] of rows[i]) if (j !== i) d++; rows[i].set(i, d || 1); }
    const Lg = buildCSR(n, rows);
    const tutte = new DirichletSolver(Lg, fixed);
    const zero = new Float64Array(n);
    const ux = new Float64Array(n), uy = new Float64Array(n);
    for (let i = 0; i < n; i++) { ux[i] = U[2 * i]; uy[i] = U[2 * i + 1]; }
    tutte.solve(zero, ux);
    tutte.solve(zero, uy);
    for (let i = 0; i < n; i++) { U[2 * i] = ux[i]; U[2 * i + 1] = uy[i]; }
    fixed.fill(0);
  }

  // 3. Local isometric frames X (3 × 2 per triangle) and cotangent weights.
  const X = new Float64Array(6 * m);        // x0 y0 x1 y1 x2 y2, with vertex 0 at origin
  const C = new Float64Array(3 * m);        // weight of edge opposite vertex k: (1,2), (2,0), (0,1)
  for (let i = 0; i < m; i++) {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    const e1 = [V[3 * b] - V[3 * a], V[3 * b + 1] - V[3 * a + 1], V[3 * b + 2] - V[3 * a + 2]];
    const e2 = [V[3 * c] - V[3 * a], V[3 * c + 1] - V[3 * a + 1], V[3 * c + 2] - V[3 * a + 2]];
    const l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1e-12;
    const ex = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(nr[0], nr[1], nr[2]) || 1e-12;
    const ey = [(nr[1] * ex[2] - nr[2] * ex[1]) / nl, (nr[2] * ex[0] - nr[0] * ex[2]) / nl, (nr[0] * ex[1] - nr[1] * ex[0]) / nl];
    const x1 = l1, y1 = 0;
    const x2 = e2[0] * ex[0] + e2[1] * ex[1] + e2[2] * ex[2];
    const y2 = e2[0] * ey[0] + e2[1] * ey[1] + e2[2] * ey[2];
    X[6 * i] = 0; X[6 * i + 1] = 0; X[6 * i + 2] = x1; X[6 * i + 3] = y1; X[6 * i + 4] = x2; X[6 * i + 5] = y2;
    const cot = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
      const ux = bx - ax, uy = by - ay, vx = cx - ax, vy = cy - ay;
      const cr = Math.abs(ux * vy - uy * vx);
      return Math.min(1e4, Math.max(1e-4, (ux * vx + uy * vy) / Math.max(1e-12, cr)));
    };
    C[3 * i] = cot(0, 0, x1, y1, x2, y2);         // at vertex 0, opposite edge (1,2)
    C[3 * i + 1] = cot(x1, y1, x2, y2, 0, 0);     // at vertex 1, opposite edge (2,0)
    C[3 * i + 2] = cot(x2, y2, 0, 0, x1, y1);     // at vertex 2, opposite edge (0,1)
  }
  const EDGES: Array<[number, number]> = [[1, 2], [2, 0], [0, 1]];
  const rows: Array<Map<number, number>> = Array.from({ length: n }, () => new Map());
  const add = (r: number, c: number, w: number) => rows[r].set(c, (rows[r].get(c) ?? 0) + w);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < 3; k++) {
      const vi = T[3 * i + EDGES[k][0]], vj = T[3 * i + EDGES[k][1]];
      const w = C[3 * i + k];
      add(vi, vi, w); add(vj, vj, w); add(vi, vj, -w); add(vj, vi, -w);
    }
  }
  const Lc = buildCSR(n, rows);

  // 4. ARAP local/global, vertex 0 pinned to kill the translation. The
  //    cotangent Laplacian never changes, so it is factorised once.
  fixed[0] = 1;
  const arap = new DirichletSolver(Lc, fixed);
  const bx = new Float64Array(n), by = new Float64Array(n);
  const ux = new Float64Array(n), uy = new Float64Array(n);
  for (let i = 0; i < n; i++) { ux[i] = U[2 * i]; uy[i] = U[2 * i + 1]; }
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    bx.fill(0); by.fill(0);
    for (let i = 0; i < m; i++) {
      // Covariance S = Σ_k w_k (du_k ⊗ dx_k); the closest rotation is the polar factor.
      let s00 = 0, s01 = 0, s10 = 0, s11 = 0;
      for (let k = 0; k < 3; k++) {
        const vi = T[3 * i + EDGES[k][0]], vj = T[3 * i + EDGES[k][1]];
        const w = C[3 * i + k];
        const dux = ux[vi] - ux[vj], duy = uy[vi] - uy[vj];
        const dxx = X[6 * i + 2 * EDGES[k][0]] - X[6 * i + 2 * EDGES[k][1]];
        const dxy = X[6 * i + 2 * EDGES[k][0] + 1] - X[6 * i + 2 * EDGES[k][1] + 1];
        s00 += w * dux * dxx; s01 += w * dux * dxy; s10 += w * duy * dxx; s11 += w * duy * dxy;
      }
      // Proper rotation maximising trace(Rᵀ S): angle = atan2(s10 − s01, s00 + s11).
      const th = Math.atan2(s10 - s01, s00 + s11);
      const cs = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < 3; k++) {
        const vi = T[3 * i + EDGES[k][0]], vj = T[3 * i + EDGES[k][1]];
        const w = C[3 * i + k];
        const dxx = X[6 * i + 2 * EDGES[k][0]] - X[6 * i + 2 * EDGES[k][1]];
        const dxy = X[6 * i + 2 * EDGES[k][0] + 1] - X[6 * i + 2 * EDGES[k][1] + 1];
        const rx = w * (cs * dxx - sn * dxy), ry = w * (sn * dxx + cs * dxy);
        bx[vi] += rx; bx[vj] -= rx; by[vi] += ry; by[vj] -= ry;
      }
    }
    const px = Float64Array.from(ux), py = Float64Array.from(uy);
    arap.solve(bx, ux);
    arap.solve(by, uy);
    let moved = 0;
    for (let i = 0; i < n; i++) moved = Math.max(moved, Math.hypot(ux[i] - px[i], uy[i] - py[i]));
    if (moved < tolerance * diag) { iterations++; break; }
  }
  for (let i = 0; i < n; i++) { U[2 * i] = ux[i]; U[2 * i + 1] = uy[i]; }

  // 5. Strain on the real triangles (F maps flat → formed), inverted count, net area.
  //    Statistics are area-weighted: OCCT meshes a bend wall as tall slivers, and a
  //    sliver's strain says nothing about the metal around it.
  let maxStrain = 0, sumStrain = 0, flipped = 0, net = 0, posDet = 0, negDet = 0;
  const dets = new Float64Array(mReal);
  const strainOf = new Float64Array(mReal), areaOf = new Float64Array(mReal);
  for (let i = 0; i < mReal; i++) {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    const f00 = U[2 * b] - U[2 * a], f10 = U[2 * b + 1] - U[2 * a + 1];
    const f01 = U[2 * c] - U[2 * a], f11 = U[2 * c + 1] - U[2 * a + 1];
    const det = f00 * f11 - f01 * f10;
    dets[i] = det;
    if (det > 0) posDet++; else negDet++;
    net += Math.abs(det) / 2;
    const g00 = X[6 * i + 2], g10 = X[6 * i + 3], g01 = X[6 * i + 4], g11 = X[6 * i + 5];
    areaOf[i] = Math.abs(g00 * g11 - g01 * g10) / 2;
    if (Math.abs(det) < 1e-14) { strainOf[i] = 1; continue; }
    // F = J3 · Jf⁻¹
    const i00 = f11 / det, i01 = -f01 / det, i10 = -f10 / det, i11 = f00 / det;
    const F00 = g00 * i00 + g01 * i10, F01 = g00 * i01 + g01 * i11;
    const F10 = g10 * i00 + g11 * i10, F11 = g10 * i01 + g11 * i11;
    // Singular values of a 2×2 via E/F decomposition.
    const E = (F00 + F11) / 2, Fv = (F00 - F11) / 2, G = (F10 + F01) / 2, H = (F10 - F01) / 2;
    const Q = Math.hypot(E, H), R = Math.hypot(Fv, G);
    const s1 = Q + R, s2 = Math.abs(Q - R);
    strainOf[i] = Math.max(Math.abs(Math.log(Math.max(1e-9, s1))), Math.abs(Math.log(Math.max(1e-9, s2))));
  }
  const majority = posDet >= negDet ? 1 : -1;
  for (let i = 0; i < mReal; i++) if (Math.sign(dets[i]) !== majority) flipped++;
  let totalArea = 0;
  for (let i = 0; i < mReal; i++) { totalArea += areaOf[i]; sumStrain += strainOf[i] * areaOf[i]; }
  // Area-weighted 95th percentile: the strain that 95% of the metal stays under.
  const idx = Array.from({ length: mReal }, (_, i) => i).sort((p, q) => strainOf[p] - strainOf[q]);
  let acc = 0, p95 = 0;
  for (const i of idx) { acc += areaOf[i]; p95 = strainOf[i]; if (acc >= 0.95 * totalArea) break; }
  maxStrain = p95;

  // 6. Outline, holes, rectangle; rotate everything into the strip frame.
  const outerPts: Array<[number, number]> = outer.map(v => [U[2 * v], U[2 * v + 1]]);
  const rect = minAreaRect(outerPts);
  const ang = (-rect.angleDeg * Math.PI) / 180;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const rot = (p: [number, number]): [number, number] => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  const outlineR = outerPts.map(rot);
  let minX = Infinity, minY = Infinity;
  for (const p of outlineR) { if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1]; }
  const shift = (p: [number, number]): [number, number] => [Math.round((p[0] - minX) * 1000) / 1000, Math.round((p[1] - minY) * 1000) / 1000];
  const outline = outlineR.map(shift);
  const holesOut = holes.map(h => h.map(v => shift(rot([U[2 * v], U[2 * v + 1]]))));
  const om = loopMeasure2(U, outer);
  let holePer = 0;
  for (const h of holes) holePer += loopMeasure2(U, h).perimeter;

  return {
    grossAreaMm2: Math.abs(om.area),
    netAreaMm2: net,
    outerPerimeterMm: om.perimeter,
    holePerimeterMm: holePer,
    holeCount: holes.length,
    outline, holes: holesOut,
    rect: { lengthMm: rect.lengthMm, widthMm: rect.widthMm, angleDeg: rect.angleDeg },
    maxStrainPct: maxStrain * 100,
    meanStrainPct: (sumStrain / Math.max(1e-12, totalArea)) * 100,
    flipped, iterations,
    area3dMm2: skin.area3dMm2,
    vertexCount: nReal, triangleCount: mReal,
  };
}

/** 95th-percentile strain up to which a skin counts as bent (developable). */
export const DEVELOPABLE_STRAIN_PCT = 3;
/** ...and up to which it counts as stretch-formed in places rather than drawn outright. */
export const STRETCH_FORMED_STRAIN_PCT = 15;

/** Unfold every skin the kernel exported and combine them into one blank. */
export function developBlank(file: SkinMeshFile, opts: UnfoldOptions = {}): DevelopedBlank {
  if (!file.skins?.length) throw new Error('no skins to unfold');
  const skins = file.skins.map(s => unfoldSkin(s, opts)).sort((a, b) => b.grossAreaMm2 - a.grossAreaMm2);
  const mean = (f: (s: UnfoldedSkin) => number) => skins.reduce((t, s) => t + f(s), 0) / skins.length;
  const gross = mean(s => s.grossAreaMm2);
  const net = mean(s => s.netAreaMm2);
  const outerP = mean(s => s.outerPerimeterMm);
  const holeP = mean(s => s.holePerimeterMm);
  const L = mean(s => s.rect.lengthMm), W = mean(s => s.rect.widthMm);
  const agreement = skins.length > 1 ? (Math.abs(skins[0].grossAreaMm2 - skins[1].grossAreaMm2) / gross) * 100 : null;
  const maxStrain = Math.max(...skins.map(s => s.maxStrainPct));
  const developable = maxStrain <= DEVELOPABLE_STRAIN_PCT;
  const meanStrain = Math.max(...skins.map(s => s.meanStrainPct));
  const warnings: string[] = [];
  if (!developable && maxStrain <= STRETCH_FORMED_STRAIN_PCT) {
    warnings.push(`Parts of this pressing are stretch-formed, not just bent: flattening it took up to ${maxStrain.toFixed(1)}% stretch over `
      + `5% of the metal (${meanStrain.toFixed(1)}% on average). The outline is a geometric unfold there and slightly understates the blank `
      + 'where the metal thinned; the FASTBLANK profile is the formed-process answer.');
  } else if (!developable) {
    warnings.push(`The skin stretched by up to ${maxStrain.toFixed(1)}% when flattened (${meanStrain.toFixed(1)}% on average), so this is a drawn part, `
      + 'not a bent one; the outline is a geometric unfold and understates the blank where the metal thinned. A forming solve or the FASTBLANK profile is the answer.');
  }
  if (agreement != null && agreement > 2) {
    warnings.push(`The two skins developed to blanks ${agreement.toFixed(1)}% apart; the mean is used.`);
  }
  if (skins.some(s => s.flipped > 0)) {
    warnings.push(`${skins.reduce((t, s) => t + s.flipped, 0)} triangle(s) inverted in the flat pattern — check the outline.`);
  }
  const tris = skins.reduce((t, s) => t + s.triangleCount, 0);
  const source = `developed from the solid — ${skins.length} skin${skins.length > 1 ? 's' : ''} unfolded at K = 0.5 (mid-surface), `
    + `${tris.toLocaleString('en-GB')} triangles, ${file.bendCount} bend(s), ${file.thicknessMm.toFixed(2)} mm gauge`
    + (agreement != null ? `, skins agree within ${agreement.toFixed(1)}%` : '')
    + (developable ? '' : maxStrain <= STRETCH_FORMED_STRAIN_PCT
      ? ` — stretch-formed in places (${maxStrain.toFixed(1)}% stretch at the 95th percentile)`
      : ` — NOT developable (${maxStrain.toFixed(1)}% stretch)`);
  return {
    grossAreaMm2: Math.round(gross), netAreaMm2: Math.round(net),
    outerPerimeterMm: Math.round(outerP), holePerimeterMm: Math.round(holeP),
    holeCount: Math.max(...skins.map(s => s.holeCount)),
    boundingRectMm: { lengthMm: Math.round(L * 10) / 10, widthMm: Math.round(W * 10) / 10 },
    rectangleFill: L * W > 0 ? gross / (L * W) : 0,
    skins, skinAgreementPct: agreement, maxStrainPct: maxStrain, developable,
    gaugeMm: file.thicknessMm, source, warnings,
  };
}

/** A minimal DXF (AC1015, millimetres) of the outline and holes as closed LWPOLYLINEs. */
export function blankToDxf(skin: UnfoldedSkin, partName = 'blank'): string {
  const lines: string[] = [];
  const push = (code: number, value: string | number) => { lines.push(String(code), String(value)); };
  push(999, `CostVision developed blank — ${partName}`);
  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1015');
  push(9, '$INSUNITS'); push(70, 4);
  push(0, 'ENDSEC');
  push(0, 'SECTION'); push(2, 'ENTITIES');
  const poly = (pts: Array<[number, number]>, layer: string) => {
    push(0, 'LWPOLYLINE'); push(8, layer); push(90, pts.length); push(70, 1);
    for (const [x, y] of pts) { push(10, x.toFixed(3)); push(20, y.toFixed(3)); }
  };
  poly(skin.outline, 'OUTLINE');
  for (const h of skin.holes) poly(h, 'HOLES');
  push(0, 'ENDSEC'); push(0, 'EOF');
  return lines.join('\n') + '\n';
}
