import { describe, it, expect } from 'vitest';
import { dist3, circumcircle3, angle3, closestPointOnSegment, draftBucket, thicknessColor } from '../src/ui/cad-viewer.js';

describe('cad-viewer measurement math', () => {
  it('dist3 measures euclidean distance', () => {
    expect(dist3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 12);
    expect(dist3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
    expect(dist3({ x: -2, y: -3, z: -6 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(7, 12);
  });

  it('circumcircle3 recovers a known circle in the XY plane', () => {
    // three points on the circle centre (10, 5, 0), radius 15
    const r = 15, cx = 10, cy = 5;
    const pt = (deg: number) => ({
      x: cx + r * Math.cos((deg * Math.PI) / 180),
      y: cy + r * Math.sin((deg * Math.PI) / 180),
      z: 0,
    });
    const res = circumcircle3(pt(10), pt(120), pt(260));
    expect(res).not.toBeNull();
    expect(res!.radius).toBeCloseTo(15, 9);
    expect(res!.center.x).toBeCloseTo(10, 9);
    expect(res!.center.y).toBeCloseTo(5, 9);
    expect(res!.center.z).toBeCloseTo(0, 9);
  });

  it('circumcircle3 works for a tilted circle in 3D (bore rim)', () => {
    // circle of radius 8 around centre (1, 2, 3) in a plane tilted 45° about X
    const r = 8;
    const c = { x: 1, y: 2, z: 3 };
    const u = { x: 1, y: 0, z: 0 };
    const s = Math.SQRT1_2;
    const v = { x: 0, y: s, z: s };
    const pt = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      return {
        x: c.x + r * (Math.cos(t) * u.x + Math.sin(t) * v.x),
        y: c.y + r * (Math.cos(t) * u.y + Math.sin(t) * v.y),
        z: c.z + r * (Math.cos(t) * u.z + Math.sin(t) * v.z),
      };
    };
    const res = circumcircle3(pt(0), pt(85), pt(200));
    expect(res).not.toBeNull();
    expect(res!.radius).toBeCloseTo(8, 9);
    expect(res!.center.x).toBeCloseTo(1, 9);
    expect(res!.center.y).toBeCloseTo(2, 9);
    expect(res!.center.z).toBeCloseTo(3, 9);
  });

  it('circumcircle3 returns null for collinear points', () => {
    expect(circumcircle3({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 })).toBeNull();
    // coincident points are also degenerate
    expect(circumcircle3({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }, { x: 9, y: 1, z: 2 })).toBeNull();
  });

  it('circumcircle3 epsilon is scale-relative: a tiny meter-unit bore still fits', () => {
    // Ø10 mm bore in an STL exported in METERS: radius 0.005 units.
    // The old absolute-epsilon test (d < 1e-12, d being length⁴) rejected this
    // as collinear; the relative test must recover it exactly.
    const r = 0.005, c = { x: 0.12, y: 0.34, z: 0.02 };
    const pt = (deg: number) => ({
      x: c.x + r * Math.cos((deg * Math.PI) / 180),
      y: c.y + r * Math.sin((deg * Math.PI) / 180),
      z: c.z,
    });
    const res = circumcircle3(pt(5), pt(100), pt(215));
    expect(res).not.toBeNull();
    expect(res!.radius).toBeCloseTo(0.005, 12);
  });

  it('circumcircle3 rejects near-collinear picks on large-coordinate parts', () => {
    // three near-collinear points ~3 m from origin (mm coords) — the old code
    // accepted these and produced an absurd multi-kilometre "circle"
    const res = circumcircle3(
      { x: 3000, y: 3000, z: 0 },
      { x: 3010, y: 3010.0000001, z: 0 },
      { x: 3020, y: 3020, z: 0 },
    );
    expect(res).toBeNull();
  });

  it('angle3 measures the angle at the middle point', () => {
    expect(angle3({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90, 9);
    expect(angle3({ x: -5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBeCloseTo(180, 9);
    expect(angle3({ x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(45, 9);
    // 3D: chamfer-like 120°
    const a = { x: Math.cos(Math.PI / 3), y: Math.sin(Math.PI / 3), z: 2 };
    expect(angle3({ x: 1, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }, a)).toBeCloseTo(60, 9);
  });

  it('angle3 returns null for zero-length legs', () => {
    expect(angle3({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it('closestPointOnSegment clamps to endpoints and projects onto the middle', () => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 10, y: 0, z: 0 };
    expect(closestPointOnSegment({ x: 4, y: 3, z: 0 }, a, b)).toEqual({ x: 4, y: 0, z: 0 });
    expect(closestPointOnSegment({ x: -5, y: 2, z: 0 }, a, b)).toEqual({ x: 0, y: 0, z: 0 });
    expect(closestPointOnSegment({ x: 99, y: 2, z: 0 }, a, b)).toEqual({ x: 10, y: 0, z: 0 });
    // degenerate segment
    expect(closestPointOnSegment({ x: 1, y: 1, z: 1 }, a, { x: 0, y: 0, z: 0 })).toEqual(a);
  });
});

describe('cad-viewer draft / undercut analysis', () => {
  // pull axis = +Z throughout
  it('top & bottom faces (normal parallel to pull) are neutral — no draft needed', () => {
    expect(draftBucket(0, 0, 1, 0, 0, 1)).toBe('neutral');   // top face, normal +Z
    expect(draftBucket(0, 0, -1, 0, 0, 1)).toBe('neutral');  // bottom face, normal −Z
    expect(draftBucket(0.05, 0.05, 1, 0, 0, 1)).toBe('neutral'); // ~4° off-axis, still a top face
  });

  it('a perfectly vertical wall (normal ⟂ pull) is a near-zero-draft risk', () => {
    expect(draftBucket(1, 0, 0, 0, 0, 1)).toBe('zero');   // wall facing +X
    expect(draftBucket(0, 1, 0, 0, 0, 1)).toBe('zero');   // wall facing +Y
  });

  it('a wall tapering outward (positive draft) releases cleanly', () => {
    // normal tilted 5° toward +Z from horizontal → +5° draft → adequate
    const t = (5 * Math.PI) / 180;
    expect(draftBucket(Math.cos(t), 0, Math.sin(t), 0, 0, 1)).toBe('ok');
  });

  it('a wall leaning the wrong way is flagged as an undercut', () => {
    // normal tilted 5° BELOW horizontal (toward −Z) → negative draft → undercut
    const t = (5 * Math.PI) / 180;
    expect(draftBucket(Math.cos(t), 0, -Math.sin(t), 0, 0, 1)).toBe('undercut');
  });

  it('honours a non-Z pull axis', () => {
    // pull = +X: a wall whose normal is +Z is now a vertical wall (zero draft)
    expect(draftBucket(0, 0, 1, 1, 0, 0)).toBe('zero');
    // and the +X face is now a top face (neutral)
    expect(draftBucket(1, 0, 0, 1, 0, 0)).toBe('neutral');
  });

  it('is robust to unnormalised inputs', () => {
    expect(draftBucket(0, 0, 7, 0, 0, 3)).toBe('neutral'); // both scaled, still parallel
  });
});

describe('cad-viewer wall-thickness heatmap ramp', () => {
  const rgb = (c: readonly number[]) => c.map(x => Math.round(x * 255));

  it('endpoints are red (thin) and blue (thick)', () => {
    expect(rgb(thicknessColor(0))).toEqual([219, 51, 56]);   // thinnest → red
    expect(rgb(thicknessColor(1))).toEqual([64, 115, 230]);  // thickest → blue
  });

  it('every output channel stays in [0,1]', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      for (const ch of thicknessColor(t)) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(1); }
    }
  });

  it('clamps out-of-range inputs to the endpoints', () => {
    expect(thicknessColor(-3)).toEqual(thicknessColor(0));
    expect(thicknessColor(9)).toEqual(thicknessColor(1));
  });

  it('the ramp goes hot→cold: red channel falls and blue channel rises overall', () => {
    expect(thicknessColor(0)[0]).toBeGreaterThan(thicknessColor(1)[0]); // more red at the thin end
    expect(thicknessColor(1)[2]).toBeGreaterThan(thicknessColor(0)[2]); // more blue at the thick end
  });
});
