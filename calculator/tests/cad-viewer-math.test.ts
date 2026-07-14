import { describe, it, expect } from 'vitest';
import { dist3, circumcircle3 } from '../src/ui/cad-viewer.js';

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
});
