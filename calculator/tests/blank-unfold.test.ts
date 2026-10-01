/**
 * The bent-part unfold (server/utils/blank-unfold.ts) against cases whose
 * answer is known on paper. A developable skin must flatten with no strain
 * and the exact developed length; a flat plate with a hole must come back
 * unchanged; the DXF it writes must measure the same through dxf-blank.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  unfoldSkin, developBlank, blankToDxf, minAreaRect, convexHull, boundaryLoops,
  type SkinMesh, type SkinMeshFile,
} from '../server/utils/blank-unfold.js';
import { measureBlankDxf } from '../server/utils/dxf-blank.js';

/** A w × h grid of nx × ny cells, mapped through `f(u, v)` to 3D; returns a skin mesh. */
function gridSkin(nx: number, ny: number, f: (u: number, v: number) => [number, number, number], area3d: number): SkinMesh {
  const vertices: number[][] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vertices.push(f(i / nx, j / ny));
  const id = (i: number, j: number) => j * (nx + 1) + i;
  const triangles: number[][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]);
    triangles.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
  }
  return { vertices, triangles, area3dMm2: area3d };
}

/**
 * An L-bracket skin: a 60 mm flat, a quarter-cylinder bend of radius 3, a 40 mm
 * flat, 50 mm wide. Developed length 60 + 40 + (π/2)·3 = 104.712 mm.
 */
const R = 3, A = 60, B = 40, W = 50;
const DEV = A + B + (Math.PI / 2) * R;
function lBracket(): SkinMesh {
  const n = 120;   // along the developed length
  return gridSkin(n, 20, (u, v) => {
    const s = u * DEV, y = v * W;
    if (s <= A) return [s - A, y, 0];                                   // first flat, ends at the bend start (x = 0)
    if (s <= A + (Math.PI / 2) * R) {                                   // bend: centre (0, y, -R)
      const th = (s - A) / R;
      return [R * Math.sin(th), y, -R + R * Math.cos(th)];
    }
    return [R, y, -R - (s - A - (Math.PI / 2) * R)];                    // second flat, down
  }, DEV * W);
}

describe('a bent L-bracket develops to its hand-calculated blank', () => {
  const u = unfoldSkin(lBracket());
  it('has the developed length, width and area', () => {
    // The mesh chords the 90° bend in ~5 segments, which is 0.35% short of the
    // arc (1 − sin x / x); the 0.015 mm gap here is that chord, not the solver.
    expect(u.rect.lengthMm).toBeCloseTo(DEV, 1);
    expect(u.rect.widthMm).toBeCloseTo(W, 2);
    expect(u.grossAreaMm2 / (DEV * W)).toBeCloseTo(1, 3);
    expect(u.netAreaMm2 / (DEV * W)).toBeCloseTo(1, 3);
    expect(u.outerPerimeterMm).toBeCloseTo(2 * (DEV + W), 1);
  });
  it('is strain-free and fold-free: a bend is developable', () => {
    expect(u.maxStrainPct).toBeLessThan(0.05);
    expect(u.meanStrainPct).toBeLessThan(0.01);
    expect(u.flipped).toBe(0);
    expect(u.holeCount).toBe(0);
  });
  it('converges in far fewer iterations than the cap', () => {
    expect(u.iterations).toBeLessThan(200);
  });
});

describe('a flat plate with a hole comes back as itself', () => {
  // 100 × 50 plate as a grid with a 10 × 10 cell cut out of the middle (a square hole).
  function plateWithHole(): SkinMesh {
    const nx = 20, ny = 10;
    const vertices: number[][] = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vertices.push([i * 5, j * 5, 0]);
    const id = (i: number, j: number) => j * (nx + 1) + i;
    const triangles: number[][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i >= 9 && i < 11 && j >= 4 && j < 6) continue;   // the hole: cells 9–10 × 4–5 → 10 × 10 mm
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]);
      triangles.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    return { vertices, triangles, area3dMm2: 5000 - 100 };
  }
  const u = unfoldSkin(plateWithHole());
  it('keeps its outline, its hole and its area', () => {
    expect(u.holeCount).toBe(1);
    expect(u.grossAreaMm2).toBeCloseTo(5000, 3);
    expect(u.netAreaMm2).toBeCloseTo(4900, 3);
    expect(u.outerPerimeterMm).toBeCloseTo(300, 3);
    expect(u.holePerimeterMm).toBeCloseTo(40, 3);
    expect(u.rect.lengthMm).toBeCloseTo(100, 2);
    expect(u.rect.widthMm).toBeCloseTo(50, 2);
    expect(u.maxStrainPct).toBeLessThan(0.01);
  });
  it('finds two boundary loops, the outline first', () => {
    const T = Int32Array.from(plateWithHole().triangles.flat());
    const loops = boundaryLoops(T, T.length / 3);
    expect(loops.length).toBe(2);
    expect(loops.map(l => l.length).sort((a, b) => b - a)).toEqual([60, 8]);
  });
});

describe('developBlank combines the skins and writes a DXF the reader measures back', () => {
  const file: SkinMeshFile = {
    status: 'success', thicknessMm: 1.5, thicknessSource: 'bend-pairs', bendCount: 1,
    linearDeflectionMm: 0.3, volumeMm3: DEV * W * 1.5, surfaceAreaMm2: 2 * DEV * W + 2 * (DEV + W) * 1.5,
    triangles: 0, skinFaces: 3, faces: 7, skins: [lBracket(), lBracket()],
  };
  const b = developBlank(file);
  it('reports the blank, the rectangle and that the part is developable', () => {
    expect(Math.abs(b.grossAreaMm2 - DEV * W)).toBeLessThan(2);
    expect(b.boundingRectMm.lengthMm).toBeCloseTo(DEV, 1);
    expect(b.boundingRectMm.widthMm).toBeCloseTo(W, 1);
    expect(b.rectangleFill).toBeCloseTo(1, 3);
    expect(b.developable).toBe(true);
    expect(b.skinAgreementPct).toBeCloseTo(0, 3);
    expect(b.warnings).toEqual([]);
    expect(b.source).toContain('2 skins unfolded at K = 0.5');
    expect(b.source).toContain('1 bend(s)');
  });
  it('round-trips through the DXF reader', () => {
    const dxf = blankToDxf(b.skins[0], 'l-bracket');
    expect(dxf).toContain('$INSUNITS');
    const m = measureBlankDxf(dxf);
    expect(m.grossAreaMm2).toBeCloseTo(b.skins[0].grossAreaMm2, 0);
    expect(m.outerPerimeterMm).toBeCloseTo(b.skins[0].outerPerimeterMm, 0);
    expect(m.boundingRectMm.lengthMm).toBeCloseTo(DEV, 1);
    expect(m.boundingRectMm.widthMm).toBeCloseTo(W, 1);
    expect(m.unitsAssumed).toBe(false);
  });
});

describe('the minimum-area rectangle', () => {
  it('finds a rotated rectangle exactly', () => {
    const ang = (37 * Math.PI) / 180;
    const pts: Array<[number, number]> = [];
    for (const [x, y] of [[0, 0], [120, 0], [120, 40], [0, 40], [60, 20], [30, 10]] as Array<[number, number]>) {
      pts.push([x * Math.cos(ang) - y * Math.sin(ang) + 5, x * Math.sin(ang) + y * Math.cos(ang) - 3]);
    }
    const r = minAreaRect(pts);
    expect(r.lengthMm).toBeCloseTo(120, 6);
    expect(r.widthMm).toBeCloseTo(40, 6);
    expect(convexHull(pts).length).toBe(4);
  });
});
