// Measurement-math unit tests for the CAD viewer. Ported from the CostVision
// reference (vitest) to node:test — the repo's test runner (`node --test`).
// Exercises the pure helpers in src/services/cad-viewer-math.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dist3, circumcircle3, angle3, closestPointOnSegment } from '../src/services/cad-viewer-math.mjs';

// vitest's toBeCloseTo(expected, digits): |a-b| < 0.5 * 10^-digits
const close = (actual, expected, digits = 9) =>
  assert.ok(Math.abs(actual - expected) < 0.5 * Math.pow(10, -digits),
    `expected ${actual} ≈ ${expected} (${digits} digits)`);

describe('cad-viewer measurement math', () => {
  it('dist3 measures euclidean distance', () => {
    close(dist3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5, 12);
    assert.strictEqual(dist3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), 0);
    close(dist3({ x: -2, y: -3, z: -6 }, { x: 0, y: 0, z: 0 }), 7, 12);
  });

  it('circumcircle3 recovers a known circle in the XY plane', () => {
    const r = 15, cx = 10, cy = 5;
    const pt = (deg) => ({
      x: cx + r * Math.cos((deg * Math.PI) / 180),
      y: cy + r * Math.sin((deg * Math.PI) / 180),
      z: 0,
    });
    const res = circumcircle3(pt(10), pt(120), pt(260));
    assert.notStrictEqual(res, null);
    close(res.radius, 15, 9);
    close(res.center.x, 10, 9);
    close(res.center.y, 5, 9);
    close(res.center.z, 0, 9);
  });

  it('circumcircle3 works for a tilted circle in 3D (bore rim)', () => {
    const r = 8;
    const c = { x: 1, y: 2, z: 3 };
    const u = { x: 1, y: 0, z: 0 };
    const s = Math.SQRT1_2;
    const v = { x: 0, y: s, z: s };
    const pt = (deg) => {
      const t = (deg * Math.PI) / 180;
      return {
        x: c.x + r * (Math.cos(t) * u.x + Math.sin(t) * v.x),
        y: c.y + r * (Math.cos(t) * u.y + Math.sin(t) * v.y),
        z: c.z + r * (Math.cos(t) * u.z + Math.sin(t) * v.z),
      };
    };
    const res = circumcircle3(pt(0), pt(85), pt(200));
    assert.notStrictEqual(res, null);
    close(res.radius, 8, 9);
    close(res.center.x, 1, 9);
    close(res.center.y, 2, 9);
    close(res.center.z, 3, 9);
  });

  it('circumcircle3 returns null for collinear points', () => {
    assert.strictEqual(circumcircle3({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }), null);
    assert.strictEqual(circumcircle3({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }, { x: 9, y: 1, z: 2 }), null);
  });

  it('circumcircle3 epsilon is scale-relative: a tiny meter-unit bore still fits', () => {
    const r = 0.005, c = { x: 0.12, y: 0.34, z: 0.02 };
    const pt = (deg) => ({
      x: c.x + r * Math.cos((deg * Math.PI) / 180),
      y: c.y + r * Math.sin((deg * Math.PI) / 180),
      z: c.z,
    });
    const res = circumcircle3(pt(5), pt(100), pt(215));
    assert.notStrictEqual(res, null);
    close(res.radius, 0.005, 12);
  });

  it('circumcircle3 rejects near-collinear picks on large-coordinate parts', () => {
    const res = circumcircle3(
      { x: 3000, y: 3000, z: 0 },
      { x: 3010, y: 3010.0000001, z: 0 },
      { x: 3020, y: 3020, z: 0 },
    );
    assert.strictEqual(res, null);
  });

  it('angle3 measures the angle at the middle point', () => {
    close(angle3({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), 90, 9);
    close(angle3({ x: -5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }), 180, 9);
    close(angle3({ x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 45, 9);
    const a = { x: Math.cos(Math.PI / 3), y: Math.sin(Math.PI / 3), z: 2 };
    close(angle3({ x: 1, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }, a), 60, 9);
  });

  it('angle3 returns null for zero-length legs', () => {
    assert.strictEqual(angle3({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), null);
  });

  it('closestPointOnSegment clamps to endpoints and projects onto the middle', () => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 10, y: 0, z: 0 };
    assert.deepStrictEqual(closestPointOnSegment({ x: 4, y: 3, z: 0 }, a, b), { x: 4, y: 0, z: 0 });
    assert.deepStrictEqual(closestPointOnSegment({ x: -5, y: 2, z: 0 }, a, b), { x: 0, y: 0, z: 0 });
    assert.deepStrictEqual(closestPointOnSegment({ x: 99, y: 2, z: 0 }, a, b), { x: 10, y: 0, z: 0 });
    assert.deepStrictEqual(closestPointOnSegment({ x: 1, y: 1, z: 1 }, a, { x: 0, y: 0, z: 0 }), a);
  });
});
