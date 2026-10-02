/**
 * The one-step inverse forming solve (server/utils/forming-inverse.ts) and
 * the forming-limit check (src/engine/forming-properties.ts).
 *
 * The drawn cup is the textbook case: by volume constancy its blank has the
 * same area as the formed skin, and the research prototype's inverse pass
 * landed within 0.62% of that where the geometric unfold was ~13% short.
 */
import { describe, it, expect } from 'vitest';
import { unfoldSkin, type SkinMesh } from '../server/utils/blank-unfold.js';
import { inverseForm, gradientCheck, strainSummary } from '../server/utils/forming-inverse.js';
import { flc0, flcLimit, formingLimitCheck, formingPropertiesFor } from '../src/engine/forming-properties.js';

/**
 * A drawn cup as a surface of revolution: flat base of radius (R − r), a
 * quarter-torus punch corner of radius r, a cylindrical wall of height h.
 * Profile parameter s runs base → corner → wall; the mesh is a disk topology
 * (the base centre is a fan), so the skin has one boundary — the cup rim.
 */
function drawnCup(R = 40, r = 8, h = 50, nRing = 48, nProfile = 60): { skin: SkinMesh; area3d: number } {
  const base = R - r, corner = (Math.PI / 2) * r, wall = h - r;
  const L = base + corner + wall;
  const profile = (s: number): [number, number] => {   // → [radius, z]
    if (s <= base) return [s, 0];
    if (s <= base + corner) { const th = (s - base) / r; return [base + r * Math.sin(th), r - r * Math.cos(th)]; }
    return [R, r + (s - base - corner)];
  };
  const vertices: number[][] = [[0, 0, 0]];
  const ring = (k: number) => 1 + (k - 1) * nRing;   // first vertex of profile ring k ≥ 1
  for (let k = 1; k <= nProfile; k++) {
    const [rad, z] = profile((k / nProfile) * L);
    for (let j = 0; j < nRing; j++) {
      const a = (j / nRing) * 2 * Math.PI;
      vertices.push([rad * Math.cos(a), rad * Math.sin(a), z]);
    }
  }
  const triangles: number[][] = [];
  for (let j = 0; j < nRing; j++) triangles.push([0, ring(1) + ((j + 1) % nRing), ring(1) + j]);   // same winding as the quads
  for (let k = 1; k < nProfile; k++) for (let j = 0; j < nRing; j++) {
    const a = ring(k) + j, b = ring(k) + ((j + 1) % nRing), c = ring(k + 1) + j, d = ring(k + 1) + ((j + 1) % nRing);
    triangles.push([a, b, d], [a, d, c]);
  }
  let area3d = 0;
  for (const [a, b, c] of triangles) {
    const A = vertices[a], B = vertices[b], C = vertices[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    area3d += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  }
  return { skin: { vertices, triangles, area3dMm2: area3d }, area3d };
}

describe('the drawn cup', () => {
  const { skin, area3d } = drawnCup();
  const unfolded = unfoldSkin(skin, { keepInternals: true });
  const solved = inverseForm(unfolded.internals!, { nValue: 1 });

  it('is not developable: the geometric unfold strains and comes out short', () => {
    expect(unfolded.maxStrainPct).toBeGreaterThan(3);
    expect(unfolded.grossAreaMm2).toBeLessThan(area3d * 0.95);
  });
  it('the inverse pass recovers the area-equivalent blank within 1.5%', () => {
    expect(solved.energyEnd).toBeLessThan(solved.energyStart);
    expect(Math.abs(solved.flat.grossAreaMm2 - area3d) / area3d).toBeLessThan(0.015);
    // A round blank: the minimum rectangle is a square of the blank diameter.
    const D = 2 * Math.sqrt(solved.flat.grossAreaMm2 / Math.PI);
    expect(solved.flat.rect.lengthMm / D).toBeCloseTo(1, 1);
    expect(solved.flat.rect.widthMm / D).toBeCloseTo(1, 1);
    expect(solved.flat.flipped).toBe(0);
  });
  it('thins at the punch corner and thickens in the flange, as a drawn cup does', () => {
    expect(solved.strain.maxThinningPct).toBeGreaterThan(3);
    expect(solved.strain.maxThickeningPct).toBeGreaterThan(3);
    expect(solved.strain.strainPoints.length).toBeGreaterThan(50);
    expect(solved.strain.strainPoints[0][0]).toBeGreaterThan(0);          // worst major strain is tensile
  });
  it('has an analytic gradient that matches finite differences', () => {
    expect(gradientCheck(unfolded.internals!, 1).maxRelErr).toBeLessThan(1e-4);
    expect(gradientCheck(unfolded.internals!, 0.22).maxRelErr).toBeLessThan(1e-3);
  });
  it('leaves a bent part alone: the L-bracket strains nowhere, so there is nothing to minimise', () => {
    const DEV = 60 + 40 + (Math.PI / 2) * 3;
    const n = 60;
    const vertices: number[][] = [];
    for (let j = 0; j <= 10; j++) for (let i = 0; i <= n; i++) {
      const s = (i / n) * DEV, y = (j / 10) * 50;
      if (s <= 60) vertices.push([s - 60, y, 0]);
      else if (s <= 60 + (Math.PI / 2) * 3) { const th = (s - 60) / 3; vertices.push([3 * Math.sin(th), y, -3 + 3 * Math.cos(th)]); }
      else vertices.push([3, y, -3 - (s - 60 - (Math.PI / 2) * 3)]);
    }
    const id = (i: number, j: number) => j * (n + 1) + i;
    const triangles: number[][] = [];
    for (let j = 0; j < 10; j++) for (let i = 0; i < n; i++) triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    const u = unfoldSkin({ vertices, triangles, area3dMm2: DEV * 50 }, { keepInternals: true });
    const s = inverseForm(u.internals!, { nValue: 1 });
    expect(Math.abs(s.flat.grossAreaMm2 - u.grossAreaMm2) / u.grossAreaMm2).toBeLessThan(1e-3);
    expect(s.strain.maxThinningPct).toBeLessThan(0.5);
    expect(strainSummary(u.internals!, u.internals!.U).thinningP95Pct).toBeLessThan(0.5);
  });
});

describe('the forming limit (Keeler–Brazier)', () => {
  it('reproduces the plane-strain limit for mild steel', () => {
    // n = 0.21, t = 1.0 mm: ln(1 + (23.3 + 14.13)·0.21/21) = ln(1.3743) = 0.318
    expect(flc0(0.21, 1.0)).toBeCloseTo(0.318, 3);
    // Thicker and better-hardening sheet forms further; the correlation caps n at 0.21.
    expect(flc0(0.21, 2.0)).toBeGreaterThan(flc0(0.21, 1.0));
    expect(flc0(0.45, 1.0)).toBeCloseTo(flc0(0.21, 1.0), 6);
    expect(flc0(0.10, 1.0)).toBeLessThan(flc0(0.21, 1.0));
  });
  it('has the standard branches', () => {
    expect(flcLimit(0.2, 1, -0.1)).toBeCloseTo(flc0(0.2, 1) + 0.1, 6);
    expect(flcLimit(0.2, 1, 0.1)).toBeCloseTo(flc0(0.2, 1) + 0.06, 6);
  });
  it('grades a part pass / marginal / fail by the worst point', () => {
    const f0 = flc0(0.21, 1.0);
    expect(formingLimitCheck([[0.5 * f0, 0], [0.1, -0.05]], 0.21, 1.0).verdict).toBe('pass');
    expect(formingLimitCheck([[0.9 * f0, 0]], 0.21, 1.0).verdict).toBe('marginal');
    const fail = formingLimitCheck([[1.2 * f0, 0.0]], 0.21, 1.0);
    expect(fail.verdict).toBe('fail');
    expect(fail.worstRatio).toBeCloseTo(1.2, 6);
    expect(fail.thinningPct).toBeGreaterThan(20);
    expect(formingLimitCheck([], 0.21, 1.0).verdict).toBe('pass');
  });
  it('looks up a grade, falls back to the family, and says which', () => {
    expect(formingPropertiesFor('mat-dc01', 'steel')!.nValue).toBe(0.21);
    expect(formingPropertiesFor('mat-dc01', 'steel')!.gradeSpecific).toBe(true);
    const fb = formingPropertiesFor('mat-unknown', 'aluminium')!;
    expect(fb.gradeSpecific).toBe(false);
    expect(fb.source).toContain('family fallback');
    expect(formingPropertiesFor(null, 'plastic')).toBeNull();
  });
});
