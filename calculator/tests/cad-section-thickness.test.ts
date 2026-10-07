/**
 * Section wall thickness (rolling-ball method) — shapes with known answers, cut by the real slicer.
 */
import { describe, it, expect } from 'vitest';
import { sliceSection, type SectionResult, type P2, signedArea2 } from '../src/ui/cad-section.js';
import { sectionThickness, thicknessAt } from '../src/ui/cad-section-thickness.js';

/** A SectionResult straight from 2D loops (material CCW, holes CW). */
function section(loops: P2[][]): SectionResult {
  const ls = loops.map(pts => ({ pts, signedArea: signedArea2(pts), perimeter: 0 }));
  return { axis: 2, at: 0, loops: ls, areaMm2: ls.reduce((t, l) => t + l.signedArea, 0), perimeterMm: 0, regions: 1, holes: 0, bounds: null, openChains: 0 };
}
const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n: number, cw = false): P2[] => {
  const pts: P2[] = [];
  for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return cw ? pts.reverse() : pts;
};

describe('sectionThickness', () => {
  it('a 40 × 6 strip: wall 6, and the corners do not read thin', () => {
    const th = sectionThickness(section([rect(0, 0, 40, 6)]));
    expect(th.min!.t).toBeCloseTo(6, 4);
    expect(th.max!.d).toBeCloseTo(6, 3);
    expect(th.median).toBeCloseTo(6, 3);
    // the corner samples exist but are not walls
    expect(th.samples.some(s => !s.wall && 2 * s.r < 1)).toBe(true);
  });
  it('a tube R10 / R7: wall 3 (within the chord sagitta)', () => {
    const n = 180;
    const th = sectionThickness(section([circle(0, 0, 10, n), circle(0, 0, 7, n, true)]));
    const sag = 10 * (1 - Math.cos(Math.PI / n));
    expect(Math.abs(th.min!.t - 3)).toBeLessThanOrEqual(sag + 1e-6);
  });
  it('an L with legs 5 and 8: the thin leg is 5, the inner corner does not read thin', () => {
    const L: P2[] = [[0, 0], [40, 0], [40, 5], [8, 5], [8, 40], [0, 40]];
    const th = sectionThickness(section([L]));
    expect(th.min!.t).toBeCloseTo(5, 4);
    const thick = th.samples.filter(s => s.wall).map(s => 2 * s.r);
    expect(Math.max(...thick)).toBeGreaterThan(7.9);
  });
  it('a 20 × 20 block: hot spot ⌀20', () => {
    expect(sectionThickness(section([rect(0, 0, 20, 20)])).max!.d).toBeCloseTo(20, 2);
  });
  it('a tapered wall reads its thinnest end', () => {
    const taper: P2[] = [[0, 0], [60, 0], [60, 3], [0, 9]]; // 9 → 3 over 60 mm
    const th = sectionThickness(section([taper]));
    expect(th.min!.t).toBeGreaterThan(2.9);
    expect(th.min!.t).toBeLessThan(3.4);
  });
  it('the hydraulic manifold at Z = 50 (from its modelling script): min wall 4.5 (bolt hole to face), hot spot ⌀35', () => {
    // 120 × 80 block, 50 × 30 pocket with R5 corners, 4 × Ø11 bolt holes, 4 × Ø5 tapping holes
    const n = 96;
    const pocket: P2[] = [];
    for (const [cx, cy, a0] of [[80, 30, -90], [80, 50, 0], [40, 50, 90], [40, 30, 180]] as const) {
      for (let k = 0; k <= 12; k++) { const a = ((a0 + (90 * k) / 12) * Math.PI) / 180; pocket.push([cx + 5 * Math.cos(a), cy + 5 * Math.sin(a)]); }
    }
    const loops: P2[][] = [rect(0, 0, 120, 80), pocket.slice().reverse()];
    for (const [x, y] of [[10, 10], [110, 10], [10, 70], [110, 70]]) loops.push(circle(x, y, 5.5, n, true));
    for (const [x, y] of [[28, 18], [92, 18], [28, 62], [92, 62]]) loops.push(circle(x, y, 2.5, n, true));
    const th = sectionThickness(section(loops));
    expect(th.min!.t).toBeGreaterThan(4.5 - 1e-6);
    expect(th.min!.t).toBeLessThan(4.5 + 0.01);  // polygon holes sit inside the circle: wall a hair over 4.5
    expect(th.max!.d).toBeGreaterThan(34.9);
    expect(th.max!.d).toBeLessThan(35.1);
  });
  it('thicknessAt reads the wall THROUGH the point: 4.5 at the middle of a 4.5 mm gap, not a wider neighbour', () => {
    // a Ø11 hole 10 mm from a face: 4.5 mm gap; the largest covering circle there would be ⌀4.88
    const th = sectionThickness(section([rect(0, 0, 40, 40), circle(10, 20, 5.5, 360, true)]));
    expect(2 * thicknessAt(th, [2.25, 20])!.r).toBeCloseTo(4.5, 2);
  });
  it('thicknessAt: a uniform wall', () => {
    const th = sectionThickness(section([rect(0, 0, 40, 6)]));
    expect(2 * thicknessAt(th, [20, 3])!.r).toBeCloseTo(6, 3);
    expect(thicknessAt(th, [100, 100])).toBeNull();
  });
  it('works on a real slice (box with a void → 10 mm walls)', () => {
    const box = (min: number[], max: number[], inward = false): number[] => {
      const c = (i: number) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
      const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
      const out: number[] = [];
      for (const [a, b, cc, d] of quads) for (const t of inward ? [[a, cc, b], [a, d, cc]] : [[a, b, cc], [a, cc, d]]) for (const i of t) out.push(...c(i));
      return out;
    };
    const sec = sliceSection([{ positions: [...box([0, 0, 0], [50, 50, 50]), ...box([10, 10, 10], [40, 40, 40], true)] }], 2, 25);
    const th = sectionThickness(sec);
    expect(th.min!.t).toBeCloseTo(10, 4);
    expect(th.median).toBeCloseTo(10, 3);
  });
});
