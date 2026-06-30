// ─────────────────────────────────────────────────────────────────────────────
// Benchmark fixtures — parts with KNOWN-CORRECT ground truth.
//
// Synthetic fixtures are generated procedurally, so their volume, bbox, face count,
// hole count, expected process and expected DFMA findings are known BY CONSTRUCTION
// (not by what the tool happens to output). Each fixture produces an occt-shaped
// mesh { attributes:{position:{array}}, index:{array}, brep_faces:[{first,last}] }
// so it flows through the EXACT production pipeline (aggregateOcctMeshes / analyzeBrep).
// ─────────────────────────────────────────────────────────────────────────────

// Build an occt-shaped mesh from a flat vertex list, triangle index list, and the
// triangle-index ranges that form each B-rep face.
function mesh(positions, index, faceRanges) {
  return {
    attributes: { position: { array: positions } },
    index: { array: index },
    brep_faces: faceRanges.map(([first, last]) => ({ first, last, color: null })),
  };
}

// Axis-aligned box [0..X]×[0..Y]×[0..Z] with outward normals; 6 B-rep faces.
export function boxMesh(X, Y, Z) {
  const v = [[0, 0, 0], [X, 0, 0], [X, Y, 0], [0, Y, 0], [0, 0, Z], [X, 0, Z], [X, Y, Z], [0, Y, Z]];
  const positions = v.flat();
  // 12 triangles, grouped as 6 coplanar B-rep faces (2 tris each), outward winding.
  const f = [
    [0, 2, 1], [0, 3, 2], // bottom  z=0  (-Z)
    [4, 5, 6], [4, 6, 7], // top     z=Z  (+Z)
    [0, 1, 5], [0, 5, 4], // front   y=0  (-Y)
    [1, 2, 6], [1, 6, 5], // right   x=X  (+X)
    [2, 3, 7], [2, 7, 6], // back    y=Y  (+Y)
    [3, 0, 4], [3, 4, 7], // left    x=0  (-X)
  ];
  const index = f.flat();
  const faceRanges = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
  return mesh(positions, index, faceRanges);
}

// Hollow cylinder (tube) along Z: outer R, inner r, height H, N segments.
// Surface = outer wall (convex) + inner wall (concave = HOLE) + top ring + bottom ring.
export function tubeMesh(R, r, H, N = 32) {
  const positions = [];
  const idx = (ring, i) => ring * N + (i % N);
  // rings: 0 outerBottom, 1 outerTop, 2 innerBottom, 3 innerTop
  for (const [rad, z] of [[R, 0], [R, H], [r, 0], [r, H]]) {
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      positions.push(rad * Math.cos(a), rad * Math.sin(a), z);
    }
  }
  const tris = [];
  const faceRanges = [];
  let start = tris.length;
  // outer wall — normals point radially OUTWARD (away from axis)
  for (let i = 0; i < N; i++) {
    tris.push([idx(0, i), idx(1, i), idx(1, i + 1)]);
    tris.push([idx(0, i), idx(1, i + 1), idx(0, i + 1)]);
  }
  faceRanges.push([start, tris.length - 1]); start = tris.length;
  // inner wall — normals point radially INWARD (toward axis) → concave hole
  for (let i = 0; i < N; i++) {
    tris.push([idx(2, i), idx(3, i + 1), idx(3, i)]);
    tris.push([idx(2, i), idx(2, i + 1), idx(3, i + 1)]);
  }
  faceRanges.push([start, tris.length - 1]); start = tris.length;
  // top ring (+Z)
  for (let i = 0; i < N; i++) {
    tris.push([idx(1, i), idx(3, i), idx(3, i + 1)]);
    tris.push([idx(1, i), idx(3, i + 1), idx(1, i + 1)]);
  }
  faceRanges.push([start, tris.length - 1]); start = tris.length;
  // bottom ring (-Z)
  for (let i = 0; i < N; i++) {
    tris.push([idx(0, i), idx(2, i + 1), idx(2, i)]);
    tris.push([idx(0, i), idx(0, i + 1), idx(2, i + 1)]);
  }
  faceRanges.push([start, tris.length - 1]);
  return mesh(positions, tris.flat(), faceRanges);
}

// Ray from a centred origin to the boundary of an X×Y rectangle, at angle a.
function rectBoundary(X, Y, a) {
  const cx = X / 2, cy = Y / 2;
  const dx = Math.cos(a), dy = Math.sin(a);
  const tx = Math.abs(dx) > 1e-9 ? cx / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-9 ? cy / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return [cx + t * dx, cy + t * dy];
}

// Box X×Y×Z with a centred BLIND cylindrical pocket (radius pr, depth pd) from the top.
// Faces: bottom, 4 sides, top(with hole), pocket wall (concave), pocket floor = 8.
export function blindHoleBox(X, Y, Z, pr, pd, N = 40) {
  const P = []; const vi = (p) => { P.push(p[0], p[1], p[2]); return P.length / 3 - 1; };
  const cx = X / 2, cy = Y / 2;
  const tris = []; const faceRanges = []; let s = 0;
  const pushFace = () => { faceRanges.push([s, tris.length - 1]); s = tris.length; };

  // bottom z=0 (−Z): two tris of the full rectangle
  const b0 = vi([0, 0, 0]), b1 = vi([X, 0, 0]), b2 = vi([X, Y, 0]), b3 = vi([0, Y, 0]);
  tris.push([b0, b2, b1], [b0, b3, b2]); pushFace();
  // four sides
  const t0 = vi([0, 0, Z]), t1 = vi([X, 0, Z]), t2 = vi([X, Y, Z]), t3 = vi([0, Y, Z]);
  tris.push([b0, b1, t1], [b0, t1, t0]); pushFace(); // y=0
  tris.push([b1, b2, t2], [b1, t2, t1]); pushFace(); // x=X
  tris.push([b2, b3, t3], [b2, t3, t2]); pushFace(); // y=Y
  tris.push([b3, b0, t0], [b3, t0, t3]); pushFace(); // x=0
  // top z=Z (+Z) with central circular hole — radial strip square↦circle
  const sq = [], ci = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const r = rectBoundary(X, Y, a);
    sq.push(vi([r[0], r[1], Z]));
    ci.push(vi([cx + pr * Math.cos(a), cy + pr * Math.sin(a), Z]));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tris.push([sq[i], ci[i], ci[j]], [sq[i], ci[j], sq[j]]);
  }
  pushFace();
  // pocket wall (concave, normals inward) from z=Z down to z=Z−pd
  const wTop = [], wBot = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    wTop.push(vi([cx + pr * Math.cos(a), cy + pr * Math.sin(a), Z]));
    wBot.push(vi([cx + pr * Math.cos(a), cy + pr * Math.sin(a), Z - pd]));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tris.push([wTop[i], wBot[j], wBot[i]], [wTop[i], wTop[j], wBot[j]]);
  }
  pushFace();
  // pocket floor at z=Z−pd, normal +Z (faces up into the pocket)
  const fc = vi([cx, cy, Z - pd]); const fr = [];
  for (let i = 0; i < N; i++) { const a = (2 * Math.PI * i) / N; fr.push(vi([cx + pr * Math.cos(a), cy + pr * Math.sin(a), Z - pd])); }
  for (let i = 0; i < N; i++) tris.push([fc, fr[i], fr[(i + 1) % N]]);
  pushFace();

  return { attributes: { position: { array: P } }, index: { array: tris.flat() }, brep_faces: faceRanges.map(([first, last]) => ({ first, last, color: null })) };
}

// L-section prism (concave outline) extruded in Z. 8 B-rep faces, 0 holes.
export function lBracketMesh(A, C, t, H) {
  const prof = [[0, 0], [A, 0], [A, t], [t, t], [t, C], [0, C]]; // CCW L
  const P = []; const vi = (p) => { P.push(p[0], p[1], p[2]); return P.length / 3 - 1; };
  const bot = prof.map(p => vi([p[0], p[1], 0]));
  const top = prof.map(p => vi([p[0], p[1], H]));
  const tris = []; const faceRanges = []; let s = 0;
  const pushFace = () => { faceRanges.push([s, tris.length - 1]); s = tris.length; };
  // bottom (−Z) and top (+Z): fan from vertex 0
  for (let i = 1; i < prof.length - 1; i++) tris.push([bot[0], bot[i + 1], bot[i]]); pushFace();
  for (let i = 1; i < prof.length - 1; i++) tris.push([top[0], top[i], top[i + 1]]); pushFace();
  // 6 side faces
  for (let i = 0; i < prof.length; i++) {
    const j = (i + 1) % prof.length;
    tris.push([bot[i], bot[j], top[j]], [bot[i], top[j], top[i]]); pushFace();
  }
  return { attributes: { position: { array: P } }, index: { array: tris.flat() }, brep_faces: faceRanges.map(([first, last]) => ({ first, last, color: null })) };
}

// ─── Fixture catalogue with ground truth ─────────────────────────────────────
// volumeCm3, bbox in mm; faces/holes are B-rep truth; process = acceptable top-1
// inferred process(es); dfma = DFMA finding ids that MUST be present.
export const SYNTHETIC_FIXTURES = [
  {
    name: 'Thin plate 200×200×2',
    mesh: () => boxMesh(200, 200, 2),
    truth: { volumeCm3: 80, bbox: { x: 200, y: 200, z: 2 }, faces: 6, holes: 0,
      process: ['Sheet metal / stamping'], dfma: ['thin-wall'] },
  },
  {
    name: 'Solid block 60×60×60',
    mesh: () => boxMesh(60, 60, 60),
    truth: { volumeCm3: 216, bbox: { x: 60, y: 60, z: 60 }, faces: 6, holes: 0,
      process: ['Forging → machining', 'Machined / cast (indeterminate)'], dfma: [] },
  },
  {
    name: 'Slender bar 240×20×20',
    mesh: () => boxMesh(240, 20, 20),
    truth: { volumeCm3: 96, bbox: { x: 240, y: 20, z: 20 }, faces: 6, holes: 0,
      process: null, dfma: ['slenderness'] },
  },
  {
    name: 'Tube R20 r12 H40 (one through-hole)',
    mesh: () => tubeMesh(20, 12, 40, 48),
    // volume = π(R²−r²)H = π(400−144)·40 = π·256·40 ≈ 32169 mm³ ≈ 32.17 cm³
    truth: { volumeCm3: 32.17, bbox: { x: 40, y: 40, z: 40 }, faces: 4, holes: 1,
      process: null, dfma: [] },
  },
  {
    name: 'Thin washer R25 r15 H1.5 (thin + hole)',
    mesh: () => tubeMesh(25, 15, 1.5, 48),
    // volume = π(625−225)·1.5 = π·400·1.5 ≈ 1885 mm³ ≈ 1.885 cm³
    truth: { volumeCm3: 1.885, bbox: { x: 50, y: 50, z: 1.5 }, faces: 4, holes: 1,
      process: ['Sheet metal / stamping'], dfma: ['thin-wall'] },
  },
  {
    name: 'L-bracket 60×60 t10 H40 (concave outline)',
    mesh: () => lBracketMesh(60, 60, 10, 40),
    // area = t(A+C−t) = 10·110 = 1100 mm²; volume = 1100·40 = 44,000 mm³ = 44 cm³
    truth: { volumeCm3: 44, bbox: { x: 60, y: 60, z: 40 }, faces: 8, holes: 0,
      process: null, dfma: [] },
  },
  {
    name: 'Blind-hole box 80×60×30, pocket r10 d15',
    mesh: () => blindHoleBox(80, 60, 30, 10, 15, 40),
    // bbox is orientation-independent; faces/holes verified; the SEMANTIC block
    // probes blind-vs-through detection the geometric pipeline cannot yet do.
    truth: {
      volumeCm3: null, bbox: { x: 80, y: 60, z: 30 }, faces: 8, holes: 1,
      process: null, dfma: [],
      semantic: { throughHoles: 0, blindHoles: 1 },
    },
  },
];

// Real STEP files shipped with occt-import-js (hand-verified ground truth).
// Skipped automatically if the package/test files are not present.
export const STEP_FIXTURES = [
  { name: 'STEP cube 10mm', file: 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp',
    truth: { volumeCm3: 1, bbox: { x: 10, y: 10, z: 10 }, faces: 6, holes: 0, process: null, dfma: [] } },
  { name: 'STEP rounded-cube', file: 'node_modules/occt-import-js/test/testfiles/rounded-cube/rounded-cube.step',
    truth: { volumeCm3: null, bbox: null, faces: 7, holes: 0, process: null, dfma: [] } },
];
