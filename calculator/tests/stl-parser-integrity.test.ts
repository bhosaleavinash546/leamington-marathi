import { describe, it, expect } from 'vitest';
import { parseSTL } from '../server/services/stl-parser.js';

/** Build a minimal binary STL from an array of triangles (each = 9 vertex floats). */
function binarySTL(tris: number[][]): Buffer {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) {
    o += 12; // skip the (ignored) normal
    for (let v = 0; v < 9; v++) { buf.writeFloatLE(t[v], o); o += 4; }
    o += 2;  // attribute byte count
  }
  return buf;
}

// a unit tetrahedron-ish triangle set with finite coords
const GOOD: number[][] = [
  [0, 0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 1],
];

describe('STL parser — integrity guards (audit RK2/RK3)', () => {
  it('parses a valid binary STL and reports not-truncated', () => {
    const geo = parseSTL(binarySTL(GOOD));
    expect(geo.triangleCount).toBe(2);
    expect(geo.truncated).toBe(false);
    expect(Number.isFinite(geo.volume)).toBe(true);
    expect(Number.isFinite(geo.surfaceArea)).toBe(true);
  });

  it('REJECTS a binary STL carrying a NaN vertex', () => {
    const bad = [GOOD[0], [0, 0, 0, NaN, 0, 0, 0, 1, 0]];
    expect(() => parseSTL(binarySTL(bad))).toThrow(/non-finite/i);
  });

  it('REJECTS a binary STL carrying an Infinity vertex', () => {
    const bad = [[0, 0, 0, Infinity, 0, 0, 0, 1, 0]];
    expect(() => parseSTL(binarySTL(bad))).toThrow(/non-finite/i);
  });

  it('REJECTS an all-NaN mesh (bbox seeds would otherwise stay ±Infinity)', () => {
    const bad = [[NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN]];
    expect(() => parseSTL(binarySTL(bad))).toThrow(/non-finite/i);
  });

  it('flags truncated=true when the file exceeds the parse cap', () => {
    const geo = parseSTL(binarySTL(GOOD), { maxTriangles: 1 });
    expect(geo.triangleCount).toBe(1);
    expect(geo.truncated).toBe(true);
  });

  it('REJECTS a NaN vertex in an ASCII STL too', () => {
    const ascii = `solid t
 facet normal 0 0 0
  outer loop
   vertex 0 0 0
   vertex NaN 0 0
   vertex 0 1 0
  endloop
 endfacet
endsolid t`;
    // NaN is not matched by the numeric vertex regex, so this file yields zero
    // complete triangles → the empty-mesh guard fires (still a clean rejection).
    expect(() => parseSTL(Buffer.from(ascii, 'utf-8'))).toThrow();
  });
});
