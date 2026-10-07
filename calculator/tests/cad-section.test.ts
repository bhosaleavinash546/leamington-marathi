/**
 * Section measurement (Oct 2026): cut-face area from the mesh, checked against hand-computable answers.
 */
import { describe, it, expect } from 'vitest';
import { sliceSection, nestLoops, sectionDxf, clipHalfPlane, signedArea2, planeAxes } from '../src/ui/cad-section.js';

type V = [number, number, number];
/** Outward-wound box (12 triangles). `inward` flips it — the wall of an internal void. */
function box(min: V, max: V, inward = false): number[] {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const c = (i: number): V => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  // each face as a quad (a, b, c, d) wound counter-clockwise seen from outside
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const out: number[] = [];
  for (const [a, b, cc, d] of quads) {
    const tris = inward ? [[a, cc, b], [a, d, cc]] : [[a, b, cc], [a, cc, d]];
    for (const t of tris) for (const i of t) out.push(...c(i));
  }
  return out;
}
/** Regular n-gon prism (outward), radius r, along Z from 0 to h. */
function prism(n: number, r: number, h: number): number[] {
  const out: number[] = [];
  const p = (k: number, z: number): V => [r * Math.cos((2 * Math.PI * (k % n)) / n), r * Math.sin((2 * Math.PI * (k % n)) / n), z];
  for (let k = 0; k < n; k++) {
    const a0 = p(k, 0), a1 = p(k + 1, 0), b0 = p(k, h), b1 = p(k + 1, h);
    out.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);         // side
    out.push(0, 0, h, ...b0, ...b1);                             // top (outward +z)
    out.push(0, 0, 0, ...a1, ...a0);                             // bottom (outward −z)
  }
  return out;
}

describe('sliceSection', () => {
  it('a 40 × 30 × 20 box cut across Z: 1200 mm², perimeter 140, one region', () => {
    const r = sliceSection([{ positions: box([0, 0, 0], [40, 30, 20]) }], 2, 7.5);
    expect(r.areaMm2).toBeCloseTo(1200, 6);
    expect(r.perimeterMm).toBeCloseTo(140, 6);
    expect([r.regions, r.holes, r.openChains]).toEqual([1, 0, 0]);
    expect(r.bounds).toEqual({ uMin: 0, uMax: 40, vMin: 0, vMax: 30 });
  });
  it('every axis, and the in-plane axes are right-handed', () => {
    const b = box([0, 0, 0], [40, 30, 20]);
    expect(sliceSection([{ positions: b }], 0, 10).areaMm2).toBeCloseTo(600, 6);
    expect(sliceSection([{ positions: b }], 1, 10).areaMm2).toBeCloseTo(800, 6);
    expect(planeAxes(0)).toEqual([1, 2]);
    expect(planeAxes(1)).toEqual([2, 0]);
  });
  it('a hollow box: the void is a hole — 50² − 30² = 1600 mm², two loops, perimeter of both', () => {
    const r = sliceSection([{ positions: [...box([0, 0, 0], [50, 50, 50]), ...box([10, 10, 10], [40, 40, 40], true)] }], 2, 25);
    expect(r.areaMm2).toBeCloseTo(1600, 6);
    expect([r.regions, r.holes]).toEqual([1, 1]);
    expect(r.perimeterMm).toBeCloseTo(200 + 120, 6);
    const shapes = nestLoops(r.loops);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
  });
  it('a 64-gon bar: exactly the polygon area (a chordal round bar reads a fraction of a percent low)', () => {
    const n = 64, rad = 10;
    const r = sliceSection([{ positions: prism(n, rad, 50) }], 2, 20);
    expect(r.areaMm2).toBeCloseTo((n / 2) * rad * rad * Math.sin((2 * Math.PI) / n), 6);
    expect(1 - r.areaMm2 / (Math.PI * rad * rad)).toBeLessThan(0.0017);
    expect(r.openChains).toBe(0);
  });
  it('two separate bodies give two regions; a moved body is cut where it now is', () => {
    const a = box([0, 0, 0], [10, 10, 10]), b = box([0, 0, 0], [10, 20, 10]);
    const moveX30 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, 0, 1];
    const r = sliceSection([{ positions: a }, { positions: b, matrix: moveX30 }], 2, 5);
    expect(r.areaMm2).toBeCloseTo(100 + 200, 6);
    expect(r.regions).toBe(2);
    expect(r.bounds!.uMax).toBeCloseTo(40, 9);
  });
  it('another active plane clips the cut (and its line is not counted as perimeter)', () => {
    // Z cut of a 40 × 30 box, X plane keeps x ≤ 25 → 25 × 30
    const r = sliceSection([{ positions: box([0, 0, 0], [40, 30, 20]) }], 2, 5, [{ axis: 0, at: 25 }]);
    expect(r.areaMm2).toBeCloseTo(750, 6);
    expect(r.perimeterMm).toBeCloseTo(25 + 30 + 25, 6);
  });
  it('a flipped other plane keeps the other side', () => {
    const r = sliceSection([{ positions: box([0, 0, 0], [40, 30, 20]) }], 2, 5, [{ axis: 0, at: 25, keepAbove: true }]);
    expect(r.areaMm2).toBeCloseTo(15 * 30, 6);
  });
  it('a plane exactly on a face, or outside the part, gives a sane answer', () => {
    const b = box([0, 0, 0], [40, 30, 20]);
    // exactly on the bottom face: that face (on-plane vertices count as below) — never garbage
    expect([0, 1200]).toContain(Math.round(sliceSection([{ positions: b }], 2, 0).areaMm2));
    expect(sliceSection([{ positions: b }], 2, 20).areaMm2).toBe(0);
    expect(sliceSection([{ positions: b }], 2, 25).loops).toHaveLength(0);
  });
  it('joins a loop whose shared vertices are a hair apart (re-exported STL), but not a real gap', () => {
    const n = 48, rad = 10;
    const out: number[] = [];
    const p = (k: number, z: number): V => [rad * Math.cos((2 * Math.PI * k) / n), rad * Math.sin((2 * Math.PI * k) / n), z];
    for (let k = 0; k < n; k++) { // k = n reuses cos(2π), sin(2π) ≈ −2.4e-16: not bit-identical to k = 0
      const a0 = p(k, 0), a1 = p(k + 1, 0), b0 = p(k, 50), b1 = p(k + 1, 50);
      out.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    }
    const r = sliceSection([{ positions: out }], 2, 20);
    expect(r.openChains).toBe(0);
    expect(r.areaMm2).toBeCloseTo((n / 2) * rad * rad * Math.sin((2 * Math.PI) / n), 6);
    const gap = out.slice(0, out.length - 18); // a missing side face is a real gap
    expect(sliceSection([{ positions: gap }], 2, 20).openChains).toBe(1);
  });
  it('an open shell reports open chains instead of a false area', () => {
    const b = box([0, 0, 0], [40, 30, 20]);
    const open = b.slice(0, b.length - 18); // drop one side face
    const r = sliceSection([{ positions: open }], 2, 10);
    expect(r.openChains).toBeGreaterThan(0);
    expect(r.areaMm2).toBe(0);
  });
});

describe('helpers', () => {
  it('half-plane clipping keeps the area of a simple polygon exactly', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(signedArea2(clipHalfPlane(sq, 0, 4))).toBeCloseTo(40, 9);
    expect(signedArea2(clipHalfPlane(sq, 1, -1))).toBe(0);
  });
  it('writes a DXF with one closed polyline per loop, holes on their own layer', () => {
    const r = sliceSection([{ positions: [...box([0, 0, 0], [50, 50, 50]), ...box([10, 10, 10], [40, 40, 40], true)] }], 2, 25);
    const dxf = sectionDxf(r);
    expect(dxf.match(/LWPOLYLINE/g)).toHaveLength(2);
    expect(dxf).toContain('SECTION_HOLES');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
});
