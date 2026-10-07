/**
 * Section measurement — cut the part's mesh with an axis plane and measure the cut face.
 *
 * Pure arithmetic on the tessellated surface (no three.js, no DOM), so it is unit-tested and reused by the
 * viewer for three things that must agree: the number in the panel, the hatched cap drawn on the cut, and
 * the DXF of the profile. What you see is what is measured.
 *
 * Method: every triangle that straddles the plane gives one segment. Each segment is oriented by its
 * triangle's outward normal (n_plane × dir points out of the material), so on a closed solid the cut loops
 * come out consistently wound — material boundaries one way, holes the other — and the signed areas simply
 * add up (islands and holes need no nesting test). The point where the plane crosses an edge is computed from
 * the edge's endpoints in a canonical order, so the two triangles sharing that edge produce the identical
 * point and the segments chain exactly. Other active section planes clip the loops (Sutherland–Hodgman per
 * half-plane, exact for the area of a simple polygon).
 *
 * Accuracy: exact for the mesh. On a curved face the mesh is a chordal approximation of the B-rep, so a
 * round bar's area reads a fraction of a percent low at the tessellation the viewer uses.
 */

export type Axis = 0 | 1 | 2; // part X, Y, Z
export type P2 = [number, number];

export interface SectionLoop {
  /** 2D points in the plane: (u, v) = the other two part axes in right-handed order (see `planeAxes`). */
  pts: P2[];
  /** Signed area (mm²): positive = material boundary, negative = a hole. */
  signedArea: number;
  perimeter: number;
}

export interface SectionResult {
  axis: Axis;
  /** Plane position along its axis (part coordinates, mm). */
  at: number;
  loops: SectionLoop[];
  /** Net cut-face area (material minus holes), mm². */
  areaMm2: number;
  /** Length of the material boundary in the cut (edges on another section plane excluded), mm. */
  perimeterMm: number;
  /** Separate solid regions and holes in the cut. */
  regions: number;
  holes: number;
  /** Extent of the cut face in (u, v), mm. */
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number } | null;
  /** Chains that did not close (an open shell or a mesh gap) — their area is not counted. */
  openChains: number;
}

/** The in-plane axes for a cut normal to `axis`, ordered so u × v = +axis. */
export function planeAxes(axis: Axis): [Axis, Axis] {
  return axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
}

export function signedArea2(pts: readonly P2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Clip a closed polygon to the half-plane coord[k] ≤ limit, or ≥ with `above` (Sutherland–Hodgman). */
export function clipHalfPlane(pts: readonly P2[], k: 0 | 1, limit: number, above = false): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ina = above ? a[k] >= limit : a[k] <= limit, inb = above ? b[k] >= limit : b[k] <= limit;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (limit - a[k]) / (b[k] - a[k]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export interface SliceBody {
  /** Triangle soup, 9 floats a triangle, part coordinates (mm). */
  positions: Float32Array | readonly number[];
  /** Optional column-major 4×4 (three.js `Matrix4.elements`) placing the body (explode / move / rotate). */
  matrix?: readonly number[] | null;
}

/**
 * Cut `bodies` with the plane coord[axis] = at, keeping coord[other] ≤ limit (≥ with keepAbove) for every
 * other active plane. Which side of THIS plane is kept does not change the cut face's area.
 */
export function sliceSection(
  bodies: readonly SliceBody[],
  axis: Axis,
  at: number,
  otherPlanes: ReadonlyArray<{ axis: Axis; at: number; keepAbove?: boolean }> = [],
): SectionResult {
  const [ua, va] = planeAxes(axis);
  // directed segments, keyed by their start point
  type Seg = { a: number[]; b: number[]; ka: string; kb: string; used: boolean };
  const byStart = new Map<string, Seg[]>();
  const segs: Seg[] = [];
  const key = (p: number[]) => `${p[0]},${p[1]},${p[2]}`;
  const lexLess = (p: number[], q: number[]) => p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2];
  /** Where the plane crosses edge pq — computed from the lexicographically smaller end, so both triangles agree. */
  const cross = (p: number[], q: number[]): number[] => {
    const [s, e] = lexLess(p, q) ? [p, q] : [q, p];
    const ds = s[axis] - at, de = e[axis] - at;
    const t = ds / (ds - de);
    const r = [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t, s[2] + (e[2] - s[2]) * t];
    r[axis] = at;
    return r;
  };
  const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const body of bodies) {
    const P = body.positions;
    const m = body.matrix;
    for (let o = 0; o + 8 < P.length; o += 9) {
      for (let v = 0; v < 3; v++) {
        const x = P[o + v * 3], y = P[o + v * 3 + 1], z = P[o + v * 3 + 2];
        if (m) {
          tri[v][0] = m[0] * x + m[4] * y + m[8] * z + m[12];
          tri[v][1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          tri[v][2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        } else { tri[v][0] = x; tri[v][1] = y; tri[v][2] = z; }
      }
      // A vertex exactly on the plane counts as below it — one consistent rule, so no double crossings.
      const s0 = tri[0][axis] > at, s1 = tri[1][axis] > at, s2 = tri[2][axis] > at;
      if (s0 === s1 && s1 === s2) continue;
      const pts: number[][] = [];
      if (s0 !== s1) pts.push(cross(tri[0], tri[1]));
      if (s1 !== s2) pts.push(cross(tri[1], tri[2]));
      if (s2 !== s0) pts.push(cross(tri[2], tri[0]));
      if (pts.length !== 2) continue;
      let [a, b] = pts;
      // orient: (plane normal × dir) · triangle normal > 0
      const ux = tri[1][0] - tri[0][0], uy = tri[1][1] - tri[0][1], uz = tri[1][2] - tri[0][2];
      const vx = tri[2][0] - tri[0][0], vy = tri[2][1] - tri[0][1], vz = tri[2][2] - tri[0][2];
      const N = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      // n_plane = e_axis; e_axis × d has components: [i]=..., computed generally:
      const n = [0, 0, 0]; n[axis] = 1;
      const c = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]];
      if (c[0] * N[0] + c[1] * N[1] + c[2] * N[2] < 0) [a, b] = [b, a];
      const ka = key(a), kb = key(b);
      if (ka === kb) continue; // degenerate sliver
      const sg: Seg = { a, b, ka, kb, used: false };
      segs.push(sg);
      const list = byStart.get(ka);
      if (list) list.push(sg); else byStart.set(ka, [sg]);
    }
  }

  // chain into loops
  const raw: P2[][] = [];
  const open: number[][][] = [];
  let openChains = 0;
  for (const s0 of segs) {
    if (s0.used) continue;
    s0.used = true;
    const loop: number[][] = [s0.a];
    let cur = s0;
    let closed = false;
    for (let guard = 0; guard < segs.length + 1; guard++) {
      if (cur.kb === s0.ka) { closed = true; break; }
      const next = byStart.get(cur.kb)?.find(s => !s.used);
      if (!next) break;
      next.used = true;
      loop.push(next.a);
      cur = next;
    }
    if (closed && loop.length >= 3) raw.push(loop.map(p => [p[ua], p[va]] as P2));
    else { loop.push(cur.b); open.push(loop); }
  }
  // A mesh whose shared vertices are not bit-identical (a re-exported STL, a T-junction) leaves chains that
  // nearly meet. Join an end to the nearest start within a tiny tolerance before calling a chain open.
  if (open.length) {
    let ext = 0;
    for (const c of open) for (const p of c) ext = Math.max(ext, Math.abs(p[ua]), Math.abs(p[va]));
    const tol = Math.max(ext, 1) * 1e-6;
    const near = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol;
    const pool = open.slice();
    while (pool.length) {
      let chain = pool.shift()!;
      let grew = true;
      while (grew && !near(chain[chain.length - 1], chain[0])) {
        grew = false;
        // grow at either end — a walk that started mid-chain left the earlier part as its own fragment
        const i = pool.findIndex(c => near(chain[chain.length - 1], c[0]));
        if (i >= 0) { chain = chain.concat(pool.splice(i, 1)[0].slice(1)); grew = true; continue; }
        const j = pool.findIndex(c => near(c[c.length - 1], chain[0]));
        if (j >= 0) { chain = pool.splice(j, 1)[0].concat(chain.slice(1)); grew = true; }
      }
      if (chain.length >= 4 && near(chain[chain.length - 1], chain[0])) raw.push(chain.slice(0, -1).map(p => [p[ua], p[va]] as P2));
      else openChains++;
    }
  }

  // clip by the other planes that lie in this section's plane axes
  const clips = otherPlanes.filter(p => p.axis !== axis).map(p => ({ k: (p.axis === ua ? 0 : 1) as 0 | 1, at: p.at, above: !!p.keepAbove }));
  const onClipLine = (q: P2) => clips.some(c => Math.abs(q[c.k] - c.at) < 1e-9 * (1 + Math.abs(c.at)));
  const loops: SectionLoop[] = [];
  for (let pts of raw) {
    for (const c of clips) pts = clipHalfPlane(pts, c.k, c.at, c.above);
    if (pts.length < 3) continue;
    const sa = signedArea2(pts);
    if (Math.abs(sa) < 1e-12) continue;
    let per = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (clips.length && onClipLine(p) && onClipLine(q)) continue; // an edge made by the other plane, not the part
      per += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    loops.push({ pts, signedArea: sa, perimeter: per });
  }
  // Material loops wind one way, holes the other: the sign of the total names the material side.
  const total = loops.reduce((t, l) => t + l.signedArea, 0);
  const sign = total < 0 ? -1 : 1;
  // Normalise the winding too: material loops counter-clockwise, holes clockwise in (u, v) — so the material
  // is always on the LEFT of an edge (wall thickness reads the inward normal from it).
  for (const l of loops) { l.signedArea *= sign; if (sign < 0) l.pts.reverse(); }
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const l of loops) for (const [u, v] of l.pts) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }
  return {
    axis, at, loops,
    areaMm2: Math.abs(total),
    perimeterMm: loops.reduce((t, l) => t + l.perimeter, 0),
    regions: loops.filter(l => l.signedArea > 0).length,
    holes: loops.filter(l => l.signedArea < 0).length,
    bounds: loops.length ? { uMin, uMax, vMin, vMax } : null,
    openChains,
  };
}

/** Each material loop with the holes inside it — the shapes the cap is drawn from. */
export function nestLoops(loops: readonly SectionLoop[]): Array<{ outer: P2[]; holes: P2[][] }> {
  const outers = loops.filter(l => l.signedArea > 0);
  const holes = loops.filter(l => l.signedArea < 0);
  const inside = (p: P2, poly: readonly P2[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const out = outers.map(o => ({ outer: o.pts, holes: [] as P2[][], area: o.signedArea }));
  for (const h of holes) {
    // the smallest material loop that contains the hole
    let best: (typeof out)[number] | null = null;
    for (const o of out) if (inside(h.pts[0], o.outer) && (!best || o.area < best.area)) best = o;
    best?.holes.push(h.pts);
  }
  return out.map(({ outer, holes: hs }) => ({ outer, holes: hs }));
}

/** The cut profile as a DXF (closed LWPOLYLINEs, layers SECTION / SECTION_HOLES in the plane's u, v), mm. */
export function sectionDxf(r: SectionResult): string {
  const AX = 'XYZ';
  const [ua, va] = planeAxes(r.axis);
  const lines = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const l of r.loops) {
    lines.push('0', 'LWPOLYLINE', '8', l.signedArea > 0 ? 'SECTION' : 'SECTION_HOLES', '90', String(l.pts.length), '70', '1');
    for (const [u, v] of l.pts) lines.push('10', u.toFixed(5), '20', v.toFixed(5));
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `999\nCostVision section ${AX[r.axis]} = ${r.at.toFixed(3)} mm (x = part ${AX[ua]}, y = part ${AX[va]})\n` + lines.join('\n') + '\n';
}
