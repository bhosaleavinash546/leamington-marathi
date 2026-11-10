/**
 * Line work from pixels: long horizontal and vertical runs of ink, so a scanned sheet gets the same border,
 * title-block grid and table dividers a vector sheet gets from its paths. Runs, not a Hough transform: a drawing's
 * frame lines are straight and (after deskew) axis-aligned.
 */
import type { Segment } from '../types.js';

interface Run { k: number; a: number; b: number }

function mergeRuns(runs: Run[], maxThickness: number): Run[] {
  // runs of adjacent rows that overlap along their length are one line (its thickness)
  runs.sort((p, q) => p.a - q.a || p.k - q.k);
  const out: Run[] = [];
  const open: Array<Run & { k1: number; n: number; ks: number }> = [];
  runs.sort((p, q) => p.k - q.k || p.a - q.a);
  for (const r of runs) {
    let hit: (typeof open)[number] | undefined;
    for (let i = open.length - 1; i >= 0; i--) {
      const o = open[i];
      if (r.k - o.k1 > 1) { if (r.k - o.k1 > 2) { out.push({ k: o.ks / o.n, a: o.a, b: o.b }); open.splice(i, 1); } continue; }
      const overlap = Math.min(o.b, r.b) - Math.max(o.a, r.a);
      if (overlap > 0.5 * Math.min(o.b - o.a, r.b - r.a) && r.k - o.k < maxThickness) { hit = o; break; }
    }
    if (hit) { hit.a = Math.min(hit.a, r.a); hit.b = Math.max(hit.b, r.b); hit.k1 = r.k; hit.ks += r.k; hit.n++; }
    else open.push({ ...r, k1: r.k, n: 1, ks: r.k });
  }
  for (const o of open) out.push({ k: o.ks / o.n, a: o.a, b: o.b });
  return out;
}

/** Long axis-aligned ink runs, in pixels. `minLen` is the shortest run kept; gaps of up to `gap` px are bridged. */
export function rasterLineWork(ink: Uint8Array, w: number, h: number, minLen: number, gap = 2): { h: Segment[]; v: Segment[] } {
  const hr: Run[] = [], vr: Run[] = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let start = -1, last = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && ink[row + x] === 1;
      if (on) { if (start < 0) start = x; last = x; }
      else if (start >= 0 && x - last > gap) { if (last - start + 1 >= minLen) hr.push({ k: y, a: start, b: last + 1 }); start = -1; }
    }
  }
  for (let x = 0; x < w; x++) {
    let start = -1, last = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && ink[y * w + x] === 1;
      if (on) { if (start < 0) start = y; last = y; }
      else if (start >= 0 && y - last > gap) { if (last - start + 1 >= minLen) vr.push({ k: x, a: start, b: last + 1 }); start = -1; }
    }
  }
  const thick = Math.max(6, Math.round(minLen / 4));
  return {
    h: mergeRuns(hr, thick).map(r => ({ x0: r.a, y0: r.k, x1: r.b, y1: r.k })),
    v: mergeRuns(vr, thick).map(r => ({ x0: r.k, y0: r.a, x1: r.k, y1: r.b })),
  };
}
