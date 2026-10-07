/**
 * 3D viewer redesign (Oct 2026, docs/ui/3d-viewer-plan-2026-10.md) — the pure helpers behind the
 * colour ranges, inspector, view cube and issue list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  weightedQuantile, robustRange, normInRange, histogram, meshVolumeArea, cubeHitToDirection, viewName,
  geometryChecks, rankCostItems, esc, isRoundFeature, cylinderSweep,
} from '../src/ui/cad-viewer-model.js';

describe('robust colour range', () => {
  it('ignores single-ray outliers that flattened the casting bracket to one colour', () => {
    // 98 faces read 6–14 mm; one 0.2 mm reading at a fillet, one 105 mm ray down the long axis.
    const vals = [0.2, 105, ...Array.from({ length: 98 }, (_, i) => 6 + (i % 9))];
    const r = robustRange(vals)!;
    expect(r.min).toBeGreaterThanOrEqual(6);
    expect(r.max).toBeLessThanOrEqual(14);
    expect(r.absMin).toBe(0.2);
    expect(r.absMax).toBe(105);
    expect(r.clippedLow && r.clippedHigh).toBe(true);
    // A 10 mm wall now sits mid-scale instead of at 9% of a 0.2–105 mm ramp.
    expect(normInRange(10, r)).toBeGreaterThan(0.3);
    expect(normInRange(10, r)).toBeLessThan(0.7);
  });
  it('weights by area: a big thin face outweighs many small thick ones', () => {
    const vals = [2, 20, 20, 20];
    const w = [97, 1, 1, 1];
    expect(weightedQuantile(vals, 0.5, w)).toBe(2);
    expect(weightedQuantile(vals, 0.5)).toBe(20);
  });
  it('falls back to min / max when the spread collapses, and refuses < 2 values', () => {
    const r = robustRange([5, 5, 5, 5, 9])!;
    expect(r.min).toBe(5); expect(r.max).toBe(9);
    expect(robustRange([3])).toBeNull();
    expect(robustRange([NaN, 4])).toBeNull();
  });
  it('normInRange clamps', () => {
    expect(normInRange(-1, { min: 0, max: 10 })).toBe(0);
    expect(normInRange(50, { min: 0, max: 10 })).toBe(1);
  });
  it('histogram puts outliers in the end bins and keeps weight', () => {
    const h = histogram([0, 5, 10, 99], 0, 10, 5, [1, 2, 3, 4]);
    expect(h.reduce((a, b) => a + b, 0)).toBe(10);
    expect(h[0]).toBe(1);
    expect(h[4]).toBe(7);
  });
});

describe('mesh volume and area', () => {
  // Unit cube, 12 outward triangles.
  const v = (x: number, y: number, z: number) => [x, y, z];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
  const cube = new Float32Array([
    ...quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), // z=0 (down)
    ...quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)), // z=1 (up)
    ...quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), // y=0
    ...quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)), // y=1
    ...quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)), // x=0
    ...quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), // x=1
  ].map(n => n * 10)); // 10 mm cube
  it('a 10 mm cube is 1000 mm³ and 600 mm²', () => {
    const r = meshVolumeArea(cube, true);
    expect(r.volumeMm3).toBeCloseTo(1000, 6);
    expect(r.areaMm2).toBeCloseTo(600, 6);
  });
  it('an open shell reports no volume', () => {
    expect(meshVolumeArea(cube, false).volumeMm3).toBeNull();
  });
});

describe('view cube', () => {
  it('face centres give principal views, edges 45°, corners isometric', () => {
    expect(cubeHitToDirection(0.1, 1, -0.2)).toEqual([0, 1, 0]);
    expect(cubeHitToDirection(0, 0.1, 1)).toEqual([0, 0, 1]);
    expect(cubeHitToDirection(1, 0.8, 0)).toEqual([1, 1, 0]);
    expect(cubeHitToDirection(-1, 0.9, 0.95)).toEqual([-1, 1, 1]);
  });
  it('names views the way the cube is labelled', () => {
    expect(viewName([0, 1, 0])).toBe('Top');
    expect(viewName([1, 1, 1])).toBe('Top-Front-Right');
    expect(viewName([-1, 0, -1])).toBe('Back-Left');
  });
});

describe('geometry checks (standalone viewer, before a costing)', () => {
  const full = (r: number, l: number) => (2 * Math.PI * r * l) / 100; // lateral area of a full turn, cm²
  const face = (o: Partial<Parameters<typeof geometryChecks>[0][number]> & { id: number }) =>
    ({ type: 'cylinder', radiusMm: null, depthMm: null, hole: null, thicknessMm: null, areaCm2: 1, ...o });
  it('flags deep, small and thin features with the measured value and its source', () => {
    const issues = geometryChecks([
      face({ id: 1, radiusMm: 2, depthMm: 30, hole: true, areaCm2: full(2, 30) }),        // Ø4 × 30 = 7.5 × Ø
      face({ id: 2, radiusMm: 5, depthMm: 10, hole: true, areaCm2: full(5, 10) }),        // Ø10 × 10 — fine
      face({ id: 3, radiusMm: 0.6, depthMm: 2, hole: true, areaCm2: full(0.6, 2) / 2 }),  // Ø1.2, a half-turn face — small
      face({ id: 4, type: 'plane', thicknessMm: 0.7, areaCm2: 3 }),                         // thin
      face({ id: 5, radiusMm: 2, depthMm: 40, hole: false, areaCm2: full(2, 40) }),       // a boss, not a hole
      face({ id: 6, radiusMm: 2, depthMm: 70.7, hole: true, areaCm2: full(2, 70.7) / 4 }), // R2 edge fillet: a quarter turn
      face({ id: 7, type: 'plane', thicknessMm: 0.17, areaCm2: 0.2 }),                      // a sliver's grazing ray
    ]);
    const by = Object.fromEntries(issues.map(i => [i.id, i]));
    expect(by['deep-holes'].faceIds).toEqual([1]);
    expect(by['deep-holes'].detail).toContain('7.5 × Ø');
    expect(by['small-holes'].faceIds).toEqual([3]);
    expect(by['thin-walls'].faceIds).toEqual([4]);
    expect(by['thin-walls'].detail).toMatch(/confirm/);
    for (const i of issues) expect(i.source.length).toBeGreaterThan(10);
  });
  it('an edge fillet is not a hole (the casting bracket read nine R2 fillets as 17 × Ø holes)', () => {
    expect(isRoundFeature({ type: 'cylinder', radiusMm: 2, depthMm: 70.7, areaCm2: full(2, 70.7) / 4 })).toBe(false);
    expect(isRoundFeature({ type: 'cylinder', radiusMm: 3, depthMm: 12, areaCm2: full(3, 12) / 2 })).toBe(true); // split bore
    expect(cylinderSweep({ radiusMm: 3, depthMm: 12, areaCm2: full(3, 12) })).toBeCloseTo(1, 6);
  });
  it('a clean part has no findings', () => {
    expect(geometryChecks([face({ id: 1, radiusMm: 5, depthMm: 10, hole: true }), face({ id: 2, type: 'plane', thicknessMm: 4 })])).toEqual([]);
  });
});

describe('cost on model', () => {
  it('ranks by £ with shares, dropping lines with no faces or no money', () => {
    const r = rankCostItems([
      { label: 'a', faceIds: [1], gbp: 1 },
      { label: 'b', faceIds: [2, 3], gbp: 3 },
      { label: 'c', faceIds: [], gbp: 9 },
      { label: 'd', faceIds: [4], gbp: 0 },
    ]);
    expect(r.map(x => x.label)).toEqual(['b', 'a']);
    expect(r[0].share).toBeCloseTo(0.75);
  });
});

describe('viewer source guards', () => {
  const src = readFileSync('src/ui/cad-viewer.ts', 'utf8');
  it('escapes every host / file string it puts in the inspector', () => {
    expect(esc('<img onerror=x>"\'&')).toBe('&lt;img onerror=x&gt;&quot;&#39;&amp;');
    expect(src).toMatch(/esc\(r\.label\)/);
    expect(src).toMatch(/esc\(it\.title\)/);
    expect(src).toMatch(/esc\(m\.record\.label\)/);
  });
  it('never prints a bare £ figure — money goes through the host formatter', () => {
    // the only £ literal left is the default formatter for a host that passes none
    const pounds = src.split('\n').filter(l => /£\$\{/.test(l));
    expect(pounds).toEqual(["  let fmtMoney: (gbp: number) => string = (gbp) => `£${gbp.toFixed(2)}`;"]);
  });
  it('the kernel edges move with the re-centred mesh (the ghost outline)', () => {
    expect(src).toMatch(/serverEdges\[i\] -= cx; serverEdges\[i \+ 1\] -= cy; serverEdges\[i \+ 2\] -= cz;/);
    expect(src).toMatch(/serverEdges = null; \/\/ an STL after a STEP/);
  });
  it('three.js ViewHelper is gone; the labelled cube is lazy with the viewer', () => {
    expect(src).not.toMatch(/ViewHelper/);
    expect(src).toMatch(/await import\('\.\/cad-viewcube\.js'\)/);
  });
});
