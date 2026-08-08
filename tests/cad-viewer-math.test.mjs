// Measurement-math unit tests for the CAD viewer. Ported from the CostVision
// reference (vitest) to node:test — the repo's test runner (`node --test`).
// Exercises the pure helpers in src/services/cad-viewer-math.mjs.
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dist3, circumcircle3, angle3, closestPointOnSegment, smoothNormalsWithinFaces,
} from '../src/services/cad-viewer-math.mjs';

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

// ── Smooth normals, welded within a B-rep face ───────────────────────────────
//
// The viewer looked faceted next to CATIA for one reason and it was not mesh
// density: an STL has no shared vertices, so three's computeVertexNormals()
// produces one normal per FACET and a cylinder renders as a fan of flat strips
// however finely it is meshed. Welding every vertex instead is worse — it rounds
// off chamfers. Welding within a face id and never across one is the fix, and
// these tests pin both halves of it.

/** A 64-segment cylinder as face 1, capped by a fan as face 2. */
function cylinderWithCap(R = 10, H = 20, N = 64) {
  const pos = [], face = [];
  const p = (a, z) => [R * Math.cos(a), R * Math.sin(a), z];
  for (let i = 0; i < N; i++) {
    const a0 = (2 * Math.PI * i) / N, a1 = (2 * Math.PI * (i + 1)) / N;
    pos.push(...p(a0, 0), ...p(a1, 0), ...p(a0, H)); face.push(1);
    pos.push(...p(a1, 0), ...p(a1, H), ...p(a0, H)); face.push(1);
    pos.push(...p(a0, H), ...p(a1, H), 0, 0, H); face.push(2);
  }
  return { positions: new Float32Array(pos), faceOfTri: new Uint32Array(face), N };
}

test('a bore shades smooth: wall normals are radial, not per-facet', () => {
  const { positions, faceOfTri } = cylinderWithCap();
  const n = smoothNormalsWithinFaces(positions, faceOfTri, 0, faceOfTri.length, 1e-4);
  // A cylinder wall's true normal is purely radial, so its Z component is zero.
  // A per-facet normal is also radial here, so the real test is the next one —
  // this just confirms nothing was rotated in the process.
  // Only the WALL triangles — the generator interleaves two wall triangles and
  // one cap triangle per segment, and a cap normal is supposed to be axial.
  for (let t = 0; t < faceOfTri.length; t++) {
    if (faceOfTri[t] !== 1) continue;
    for (let v = 0; v < 3; v++) {
      assert.ok(Math.abs(n[t * 9 + v * 3 + 2]) < 1e-4,
        `wall normal must have no axial component (triangle ${t})`);
    }
  }
  // THE ACTUAL TEST. Two triangles that share an edge must share that edge's
  // normal. Under computeVertexNormals they differ by the facet angle, which is
  // what makes the strips visible.
  const { N } = cylinderWithCap();
  const segAngle = (2 * Math.PI) / N;
  // Triangle 0 is [p(a0,0), p(a1,0), p(a0,H)] and triangle 1 is
  // [p(a1,0), p(a1,H), p(a0,H)], so triangle 0's vertex 1 and triangle 1's
  // vertex 0 are the SAME 3D point on the same face. Their normals must agree
  // exactly; under per-facet shading they differ by the segment angle.
  const a = [n[3], n[4], n[5]];        // tri 0, vertex 1
  const b = [n[9], n[10], n[11]];      // tri 1, vertex 0
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(dot > 0.9999,
    `shared edge must carry ONE normal (dot ${dot.toFixed(6)}); a facet split would give ~${Math.cos(segAngle).toFixed(4)}`);
});

test('a chamfer stays crisp: normals are NOT welded across a face boundary', () => {
  const { positions, faceOfTri } = cylinderWithCap();
  const n = smoothNormalsWithinFaces(positions, faceOfTri, 0, faceOfTri.length, 1e-4);
  // The cap's rim shares its 3D points with the wall's top rim. If the weld
  // crossed the face boundary the cap normal would tilt toward the wall and the
  // part would look like a bar of soap.
  const capFirstVertex = 64 * 2 * 9;      // first cap triangle, first vertex
  const nz = Math.abs(n[capFirstVertex + 2]);
  assert.ok(nz > 0.9999, `cap normal must stay axial, got z=${nz.toFixed(6)}`);
});

test('a degenerate sliver cannot poison the vertices it touches', () => {
  // Zero-area triangles contribute a zero cross product, so they must drop out
  // of the average rather than producing NaN — and OCCT does emit slivers.
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,      // a real triangle
    0, 0, 0, 1, 0, 0, 1, 0, 0,      // degenerate: two coincident vertices
  ]);
  const n = smoothNormalsWithinFaces(positions, new Uint32Array([1, 1]), 0, 2, 1e-4);
  assert.ok(n.every(Number.isFinite), 'a sliver must not produce NaN normals');
  assert.ok(Math.abs(Math.abs(n[2]) - 1) < 1e-6, 'the real triangle still decides the normal');
});
