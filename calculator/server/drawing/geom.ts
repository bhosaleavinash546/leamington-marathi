/** Small geometry helpers for the drawing reader. No dependencies. */
import type { BBox, Segment } from './types.js';

export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function union(a: BBox, b: BBox): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
export function unionAll(boxes: BBox[]): BBox {
  let out: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) out = union(out, b);
  return out;
}
export function contains(outer: BBox, inner: BBox, slack = 0): boolean {
  return inner[0] >= outer[0] - slack && inner[1] >= outer[1] - slack && inner[2] <= outer[2] + slack && inner[3] <= outer[3] + slack;
}
export function containsPoint(b: BBox, x: number, y: number, slack = 0): boolean {
  return x >= b[0] - slack && x <= b[2] + slack && y >= b[1] - slack && y <= b[3] + slack;
}
export function centre(b: BBox): [number, number] { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
export function area(b: BBox): number { return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]); }
export function intersects(a: BBox, b: BBox, slack = 0): boolean {
  return a[0] <= b[2] + slack && b[0] <= a[2] + slack && a[1] <= b[3] + slack && b[1] <= a[3] + slack;
}
export function overlapArea(a: BBox, b: BBox): number {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}
export function roundBox(b: BBox): BBox { return [r2(b[0]), r2(b[1]), r2(b[2]), r2(b[3])]; }

/** Unit vectors of a text frame: `d` along the reading direction, `m` across it (towards the next line). */
export function frame(rotationDeg: number): { dx: number; dy: number; mx: number; my: number } {
  const t = rotationDeg * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return { dx: c, dy: -s, mx: s, my: c };
}

/** Snap a rotation to the four sheet directions when within 2°, else to a whole degree; always in [0, 360). */
export function snapRotation(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  for (const k of [0, 90, 180, 270, 360]) if (Math.abs(d - k) <= 2) { d = k % 360; return d; }
  return Math.round(d) % 360;
}

/** Merge collinear axis-aligned segments that touch or overlap. `horizontal` segments are keyed by y, vertical by x. */
export function mergeAxisSegments(segs: Segment[], horizontal: boolean, tol = 0.6, gap = 1.0): Segment[] {
  type S = { k: number; a: number; b: number };
  const list: S[] = segs.map(s => horizontal
    ? { k: (s.y0 + s.y1) / 2, a: Math.min(s.x0, s.x1), b: Math.max(s.x0, s.x1) }
    : { k: (s.x0 + s.x1) / 2, a: Math.min(s.y0, s.y1), b: Math.max(s.y0, s.y1) });
  list.sort((p, q) => p.k - q.k || p.a - q.a);
  const out: Segment[] = [];
  let i = 0;
  while (i < list.length) {
    // one band of the same k
    let j = i; const k0 = list[i].k;
    while (j < list.length && list[j].k - k0 <= tol) j++;
    const band = list.slice(i, j).sort((p, q) => p.a - q.a);
    const k = band.reduce((s, e) => s + e.k, 0) / band.length;
    let a = band[0].a, b = band[0].b;
    for (let n = 1; n < band.length; n++) {
      if (band[n].a <= b + gap) b = Math.max(b, band[n].b);
      else { out.push(horizontal ? { x0: a, y0: k, x1: b, y1: k } : { x0: k, y0: a, x1: k, y1: b }); a = band[n].a; b = band[n].b; }
    }
    out.push(horizontal ? { x0: a, y0: k, x1: b, y1: k } : { x0: k, y0: a, x1: k, y1: b });
    i = j;
  }
  return out;
}

export function segLength(s: Segment): number { return Math.hypot(s.x1 - s.x0, s.y1 - s.y0); }
