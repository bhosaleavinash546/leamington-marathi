/**
 * Wall thickness in a section — the "rolling ball" (inscribed circle) method CAD wall-thickness tools use,
 * on the cut loops from cad-section.ts (pure: no three.js, no DOM).
 *
 * At each sample on the cut's outline, the largest circle tangent there that stays inside the material is
 * found by the shrinking-ball iteration (exact; a few nearest-point queries on a segment tree). Its diameter is the wall there, and the point where it first touches the outline elsewhere is
 * the opposite wall. A reading counts as a WALL only when the two contacts face each other (normals ≥ 120°
 * apart): at a convex corner or round a fillet the circle is stopped by the NEXT edge, which measures the
 * corner, not a wall — those are kept out of the minimum.
 *
 * Exact for the polygonal cut to the bisection tolerance; on curved faces the mesh chords move a hole's wall
 * by at most the chord sagitta (hundredths of a mm at the viewer's tessellation).
 */
import type { P2, SectionResult } from './cad-section.js';

export interface WallReading {
  /** Tangent point on the outline, its inward normal, and the circle's centre / radius (u, v, mm). */
  p: P2;
  n: P2;
  c: P2;
  r: number;
  /** Where the circle touches the outline elsewhere (the opposite wall). */
  q: P2;
  /** Outline length this sample stands for (weights the distribution). */
  weight: number;
  /** The two contacts face each other — a wall, not a corner. */
  wall: boolean;
}

export interface SectionThickness {
  /** Thinnest wall in the cut: diameter, its two contact points. */
  min: { t: number; p: P2; q: P2; c: P2 } | null;
  /** Largest inscribed circle — the thickest spot (a casting / moulding hot spot). */
  max: { d: number; c: P2 } | null;
  /** Length-weighted thickness of the wall samples, for the distribution. */
  samples: WallReading[];
  /** Median wall by outline length. */
  median: number | null;
}

interface Seg { a: P2; b: P2; n: P2; loop: number; idx: number }

/**
 * Bounding-volume tree over the segments: best-first nearest-point search, O(log n) a query whatever the
 * distance (a uniform grid swept most of its cells for a centre deep inside a thick section).
 */
function buildIndex(segs: Seg[]) {
  type Node = { x0: number; y0: number; x1: number; y1: number; l?: Node; r?: Node; items?: number[] };
  const box = (ids: number[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of ids) { const s = segs[k]; x0 = Math.min(x0, s.a[0], s.b[0]); x1 = Math.max(x1, s.a[0], s.b[0]); y0 = Math.min(y0, s.a[1], s.b[1]); y1 = Math.max(y1, s.a[1], s.b[1]); }
    return { x0, y0, x1, y1 };
  };
  const mid = (k: number, ax: 0 | 1) => (segs[k].a[ax] + segs[k].b[ax]) / 2;
  const build = (ids: number[]): Node => {
    const n: Node = box(ids);
    if (ids.length <= 6) { n.items = ids; return n; }
    const ax: 0 | 1 = n.x1 - n.x0 >= n.y1 - n.y0 ? 0 : 1;
    ids.sort((p, q) => mid(p, ax) - mid(q, ax));
    const h = ids.length >> 1;
    n.l = build(ids.slice(0, h)); n.r = build(ids.slice(h));
    return n;
  };
  const root = build(segs.map((_, k) => k));
  const boxDist = (n: Node, x: P2) => Math.hypot(Math.max(n.x0 - x[0], 0, x[0] - n.x1), Math.max(n.y0 - x[1], 0, x[1] - n.y1));
  function nearest(x: P2): { d: number; k: number; foot: P2 } {
    let best = Infinity, bk = -1, bf: P2 = [0, 0];
    const visit = (n: Node) => {
      if (boxDist(n, x) >= best) return;
      if (n.items) {
        for (const k of n.items) {
          const s = segs[k];
          const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1];
          const L2 = ex * ex + ey * ey || 1e-30;
          let t = ((x[0] - s.a[0]) * ex + (x[1] - s.a[1]) * ey) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const fx = s.a[0] + ex * t, fy = s.a[1] + ey * t;
          const d = Math.hypot(x[0] - fx, x[1] - fy);
          if (d < best) { best = d; bk = k; bf = [fx, fy]; }
        }
        return;
      }
      const dl = boxDist(n.l!, x), dr = boxDist(n.r!, x);
      if (dl <= dr) { visit(n.l!); if (dr < best) visit(n.r!); } else { visit(n.r!); if (dl < best) visit(n.l!); }
    };
    visit(root);
    return { d: best, k: bk, foot: bf };
  }
  return { nearest };
}

/**
 * Wall thickness of a section. `maxSamples` bounds the work on a very fine cut (samples are spread evenly
 * along the outline).
 */
export function sectionThickness(sec: SectionResult, maxSamples = 3000): SectionThickness {
  const segs: Seg[] = [];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, total = 0; // extent of the cut
  sec.loops.forEach((l, li) => {
    const n = l.pts.length;
    for (let i = 0; i < n; i++) {
      const a = l.pts[i], b = l.pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L === 0) continue;
      // material is on the LEFT of every edge (cad-section normalises the winding)
      segs.push({ a, b, n: [-dy / L, dx / L], loop: li, idx: segs.length });
      total += L;
      u0 = Math.min(u0, a[0]); u1 = Math.max(u1, a[0]); v0 = Math.min(v0, a[1]); v1 = Math.max(v1, a[1]);
    }
  });
  if (!segs.length) return { min: null, max: null, samples: [], median: null };
  const ext = Math.max(u1 - u0, v1 - v0);
  const index = buildIndex(segs);
  const tol = Math.max(ext, 1) * 1e-7;
  const step = Math.max(total / maxSamples, ext / 2000);

  /**
   * The largest circle tangent at parameter t of segment s — the shrinking-ball iteration (Ma et al. 2012):
   * start big; while the circle holds a point q of the outline inside it, shrink it to the circle tangent at p
   * that passes through q, r = |p − q|² / (2 (q − p)·n). Converges in a few steps to the exact radius.
   */
  function tangentDisk(sg: Seg, t: number, weight: number): WallReading | null {
    const p: P2 = [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t];
    let r = ext;
    let contact: { k: number; foot: P2 } | null = null;
    for (let it = 0; it < 64; it++) {
      const c: P2 = [p[0] + sg.n[0] * r, p[1] + sg.n[1] * r];
      const near = index.nearest(c);
      if (near.d >= r - tol) break;                       // nothing inside: this circle fits
      const qx = near.foot[0] - p[0], qy = near.foot[1] - p[1];
      const along = qx * sg.n[0] + qy * sg.n[1];
      if (along <= tol) { r = 0; contact = { k: near.k, foot: near.foot }; break; } // q behind p: a sharp spot
      const rNew = (qx * qx + qy * qy) / (2 * along);
      contact = { k: near.k, foot: near.foot };
      if (rNew >= r - tol) break;
      r = rNew;
    }
    if (!contact) return null;
    const nq = segs[contact.k].n;
    return { p, n: sg.n, c: [p[0] + sg.n[0] * r, p[1] + sg.n[1] * r], r, q: contact.foot, weight,
      wall: sg.n[0] * nq[0] + sg.n[1] * nq[1] <= -0.5 };
  }

  // Samples by arc length along each loop, so the work follows the cut's size, not its tessellation
  // (a fine mesh has many short chords; one sample per chord made 45 000 samples on a 45 000-edge cut).
  const samples: WallReading[] = [];
  const at: Array<{ sg: Seg; t: number; k: number }> = [];
  const byLoop = new Map<number, Seg[]>();
  for (const sg of segs) { const l = byLoop.get(sg.loop); if (l) l.push(sg); else byLoop.set(sg.loop, [sg]); }
  for (const loopSegs of byLoop.values()) {
    const lens = loopSegs.map(sg => Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]));
    const per = lens.reduce((x, y) => x + y, 0);
    const h = Math.min(step, per / 8);               // at least 8 samples round even a small hole
    let next = h / 2, run = 0;
    loopSegs.forEach((sg, i) => {
      const L = lens[i];
      const kSeg = Math.max(1, Math.ceil(L / h));     // the refine window, in this segment's parameter
      while (next <= run + L) {
        const t = (next - run) / L;
        const w = tangentDisk(sg, t, h);
        if (w) { samples.push(w); at.push({ sg, t, k: kSeg }); }
        next += h;
      }
      run += L;
    });
  }

  /** Golden-section search on a segment around a sample, for the exact extreme between samples. */
  function refine(i: number, better: (a: WallReading, b: WallReading) => boolean, wallOnly: boolean): WallReading {
    const { sg, t, k } = at[i];
    let a = Math.max(0, t - 1 / k), b = Math.min(1, t + 1 / k);
    let best = samples[i];
    const g = (Math.sqrt(5) - 1) / 2;
    const val = (x: number) => { const w = tangentDisk(sg, x, 0); return w && (!wallOnly || w.wall) ? w : null; };
    let x1 = b - g * (b - a), x2 = a + g * (b - a);
    let f1 = val(x1), f2 = val(x2);
    for (let it = 0; it < 40 && b - a > 1e-9; it++) {
      if (f1 && (!f2 || better(f1, f2))) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = val(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = val(x2); }
    }
    for (const f of [f1, f2]) if (f && better(f, best)) best = f;
    return best;
  }

  let min: SectionThickness['min'] = null;
  let max: SectionThickness['max'] = null;
  let iMin = -1, iMax = -1;
  samples.forEach((w, i) => {
    if (w.wall && (iMin < 0 || w.r < samples[iMin].r)) iMin = i;
    if (iMax < 0 || w.r > samples[iMax].r) iMax = i;
  });
  if (iMin >= 0) { const w = refine(iMin, (x, y) => x.r < y.r, true); min = { t: 2 * w.r, p: w.p, q: w.q, c: w.c }; }
  if (iMax >= 0) { const w = refine(iMax, (x, y) => x.r > y.r, false); max = { d: 2 * w.r, c: w.c }; }
  const walls = samples.filter(w => w.wall).sort((a, b) => a.r - b.r);
  let median: number | null = null;
  if (walls.length) {
    const half = walls.reduce((t, w) => t + w.weight, 0) / 2;
    let run = 0;
    for (const w of walls) { run += w.weight; if (run >= half) { median = 2 * w.r; break; } }
  }
  return { min, max, samples, median };
}

/**
 * The wall through a point of the cut: of the circles that cover it, the one whose centre is nearest — the
 * medial line runs through the middle of the wall, so this is the wall the point sits in. (The textbook "local
 * thickness" takes the LARGEST covering circle instead, which in a narrowing gap reads a neighbouring, wider
 * circle: ⌀4.88 at the middle of a 4.5 mm gap between a bolt hole and a face.) Wall circles first; a point
 * covered only by corner circles gets the corner reading. Null outside every circle.
 */
export function thicknessAt(th: SectionThickness, x: P2): WallReading | null {
  let best: WallReading | null = null, bestD = Infinity, bestWall = false;
  for (const w of th.samples) {
    const d = Math.hypot(x[0] - w.c[0], x[1] - w.c[1]);
    if (d > w.r * (1 + 1e-9)) continue;
    if ((w.wall && !bestWall) || (w.wall === bestWall && d < bestD)) { best = w; bestD = d; bestWall = w.wall; }
  }
  return best;
}
