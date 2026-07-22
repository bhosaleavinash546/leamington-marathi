/**
 * Pure-TypeScript STL parser — no external dependencies.
 * Supports both ASCII and binary STL formats.
 *
 * Volume uses the signed-tetrahedron method (exact for closed meshes).
 * Surface area uses |cross(e1, e2)| / 2 per triangle.
 * Wall thickness estimate: (volume_mm3 / surfaceArea_mm2) * 2
 *
 * Coordinates are assumed to be in millimetres (standard for STL).
 * Output volumes in cm³, surface areas in cm².
 */

export interface STLGeometry {
  triangleCount: number;
  volume: number;               // cm³ (absolute, corrected for orientation)
  surfaceArea: number;          // cm²
  boundingBox: {
    xMin: number; xMax: number;
    yMin: number; yMax: number;
    zMin: number; zMax: number;
    xSpan: number; ySpan: number; zSpan: number; // mm
  };
  estimatedWallThicknessMm: number; // heuristic: (vol_mm3 / sa_mm2) * 2
  estimatedPartWeightKg: (densityKgPerM3: number) => number;
  format: 'ascii' | 'binary';
  /** True when the file declared more triangles than maxTriangles, so the mesh
   *  was parsed only partially — volume/area/bbox are computed over the prefix. */
  truncated: boolean;
  parseTimeMs: number;
}

// ─── Internal triangle accumulator ──────────────────────────────────────────

interface Accumulator {
  signedVolume: number;
  surfaceArea: number;
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
  count: number;
}

function makeAccumulator(): Accumulator {
  return {
    signedVolume: 0,
    surfaceArea: 0,
    xMin: Infinity, xMax: -Infinity,
    yMin: Infinity, yMax: -Infinity,
    zMin: Infinity, zMax: -Infinity,
    count: 0,
  };
}

/**
 * Accumulate one triangle defined by three (x,y,z) vertices.
 * Mutates acc in place — no allocation in the hot loop.
 */
function accumulateTriangle(
  acc: Accumulator,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
): void {
  // ── Signed tetrahedron volume contribution ─────────────────────────────────
  // (v1 · (v2 × v3)) / 6
  // cross(v2, v3):
  const cx = y2 * z3 - z2 * y3;
  const cy = z2 * x3 - x2 * z3;
  const cz = x2 * y3 - y2 * x3;
  // dot(v1, cross):
  acc.signedVolume += (x1 * cx + y1 * cy + z1 * cz) / 6;

  // ── Surface area ───────────────────────────────────────────────────────────
  // cross(v2-v1, v3-v1):
  const ex = x2 - x1; const ey = y2 - y1; const ez = z2 - z1;
  const fx = x3 - x1; const fy = y3 - y1; const fz = z3 - z1;
  const gcx = ey * fz - ez * fy;
  const gcy = ez * fx - ex * fz;
  const gcz = ex * fy - ey * fx;
  acc.surfaceArea += 0.5 * Math.sqrt(gcx * gcx + gcy * gcy + gcz * gcz);

  // ── Bounding box ───────────────────────────────────────────────────────────
  if (x1 < acc.xMin) acc.xMin = x1; if (x1 > acc.xMax) acc.xMax = x1;
  if (x2 < acc.xMin) acc.xMin = x2; if (x2 > acc.xMax) acc.xMax = x2;
  if (x3 < acc.xMin) acc.xMin = x3; if (x3 > acc.xMax) acc.xMax = x3;
  if (y1 < acc.yMin) acc.yMin = y1; if (y1 > acc.yMax) acc.yMax = y1;
  if (y2 < acc.yMin) acc.yMin = y2; if (y2 > acc.yMax) acc.yMax = y2;
  if (y3 < acc.yMin) acc.yMin = y3; if (y3 > acc.yMax) acc.yMax = y3;
  if (z1 < acc.zMin) acc.zMin = z1; if (z1 > acc.zMax) acc.zMax = z1;
  if (z2 < acc.zMin) acc.zMin = z2; if (z2 > acc.zMax) acc.zMax = z2;
  if (z3 < acc.zMin) acc.zMin = z3; if (z3 > acc.zMax) acc.zMax = z3;

  acc.count++;
}

// ─── Binary STL parser ───────────────────────────────────────────────────────

/**
 * Binary STL layout:
 *   [0..79]   80-byte header (ignored)
 *   [80..83]  uint32LE  triangle count
 *   Per triangle (50 bytes):
 *     [0..11]  3×float32  normal  (ignored — we recompute)
 *     [12..23] 3×float32  vertex 1
 *     [24..35] 3×float32  vertex 2
 *     [36..47] 3×float32  vertex 3
 *     [48..49] uint16     attribute byte count (ignored)
 */
function parseBinary(buf: Buffer, maxTriangles: number): { acc: Accumulator; triangleCount: number; truncated: boolean } {
  if (buf.length < 84) throw new Error('STL binary: buffer too small (< 84 bytes)');

  const declaredCount = buf.readUInt32LE(80);
  const expectedSize = 84 + declaredCount * 50;

  // Some exporters write a few extra bytes; allow 1 % slack but flag if clearly wrong.
  if (buf.length < expectedSize - 50) {
    throw new Error(
      `STL binary: declared ${declaredCount} triangles but buffer is ${buf.length} bytes (need ${expectedSize})`,
    );
  }

  const truncated = declaredCount > maxTriangles;
  const triangleCount = Math.min(declaredCount, maxTriangles);
  const acc = makeAccumulator();

  for (let i = 0; i < triangleCount; i++) {
    const base = 84 + i * 50;
    // Vertices start at base+12
    const x1 = buf.readFloatLE(base + 12);
    const y1 = buf.readFloatLE(base + 16);
    const z1 = buf.readFloatLE(base + 20);
    const x2 = buf.readFloatLE(base + 24);
    const y2 = buf.readFloatLE(base + 28);
    const z2 = buf.readFloatLE(base + 32);
    const x3 = buf.readFloatLE(base + 36);
    const y3 = buf.readFloatLE(base + 40);
    const z3 = buf.readFloatLE(base + 44);
    accumulateTriangle(acc, x1, y1, z1, x2, y2, z2, x3, y3, z3);
  }

  return { acc, triangleCount, truncated };
}

// ─── ASCII STL parser ────────────────────────────────────────────────────────

/**
 * ASCII STL format (each facet):
 *   facet normal nx ny nz
 *     outer loop
 *       vertex x1 y1 z1
 *       vertex x2 y2 z2
 *       vertex x3 y3 z3
 *     endloop
 *   endfacet
 */
function parseAscii(buf: Buffer, maxTriangles: number): { acc: Accumulator; triangleCount: number; truncated: boolean } {
  const text = buf.toString('utf-8');
  const acc = makeAccumulator();

  // Regex that extracts three consecutive "vertex x y z" lines from one facet.
  // Using a global scan with a vertex-specific regex is faster than splitting
  // the whole file into tokens for large ASCII STLs.
  const vertexRe = /vertex\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;

  let triangleCount = 0;

  while (triangleCount < maxTriangles) {
    // Three consecutive vertex lines form one triangle
    const m1 = vertexRe.exec(text);
    const m2 = vertexRe.exec(text);
    const m3 = vertexRe.exec(text);
    if (!m1 || !m2 || !m3) break;

    accumulateTriangle(
      acc,
      parseFloat(m1[1]), parseFloat(m1[2]), parseFloat(m1[3]),
      parseFloat(m2[1]), parseFloat(m2[2]), parseFloat(m2[3]),
      parseFloat(m3[1]), parseFloat(m3[2]), parseFloat(m3[3]),
    );
    triangleCount++;
  }

  // Hit the cap AND more vertices remain → the mesh was only partially parsed.
  const truncated = triangleCount === maxTriangles && vertexRe.exec(text) !== null;
  return { acc, triangleCount, truncated };
}

// ─── Format detection ────────────────────────────────────────────────────────

/**
 * Binary STL files begin with an 80-byte header that may start with "solid"
 * (many exporters do this). The distinguishing heuristic:
 *   - Read the declared triangle count from bytes 80–83.
 *   - If 84 + count * 50 ≈ bufferLength → binary.
 *   - If the first non-null text looks like "solid <name>" followed by "facet" → ascii.
 *
 * We prefer the size check because it is fast and reliable.
 */
function detectFormat(buf: Buffer): 'ascii' | 'binary' {
  if (buf.length < 84) {
    // Too small to be binary (min: 84-byte header); must be ASCII or corrupt
    const header = buf.toString('utf-8', 0, Math.min(buf.length, 256)).trimStart();
    if (header.toLowerCase().startsWith('solid')) return 'ascii';
    throw new Error('STL: buffer too small and not ASCII solid');
  }

  // Try binary heuristic first
  const declaredCount = buf.readUInt32LE(80);
  const expectedBinarySize = 84 + declaredCount * 50;
  // Accept within 1% or 200 bytes slack for padding/garbage-at-end
  const sizeDelta = Math.abs(buf.length - expectedBinarySize);
  if (sizeDelta <= Math.max(200, buf.length * 0.01)) {
    return 'binary';
  }

  // Fallback: check for ASCII "solid" keyword
  // Read only the first 256 bytes for the check — avoids large string allocation
  const headerSlice = buf.toString('utf-8', 0, Math.min(buf.length, 256)).trimStart();
  if (headerSlice.toLowerCase().startsWith('solid')) {
    return 'ascii';
  }

  // Default to binary — misidentifying binary as ASCII is more expensive than vice versa
  return 'binary';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse an STL file buffer and return exact geometry.
 *
 * @param buffer    Node.js Buffer containing the raw .stl file bytes
 * @param options   { maxTriangles?: number }  default 2_000_000
 */
export function parseSTL(
  buffer: Buffer,
  options: { maxTriangles?: number } = {},
): STLGeometry {
  const t0 = Date.now();
  const maxTriangles = options.maxTriangles ?? 2_000_000;

  const format = detectFormat(buffer);
  const { acc, triangleCount, truncated } =
    format === 'binary'
      ? parseBinary(buffer, maxTriangles)
      : parseAscii(buffer, maxTriangles);

  if (triangleCount === 0) {
    throw new Error('STL parse error: no triangles found in file');
  }

  // ── Integrity guard: reject non-finite geometry ────────────────────────────
  // A malformed/adversarial STL can carry NaN or ±Infinity vertex bytes. NaN
  // poisons signedVolume/surfaceArea (any + NaN = NaN) and, because NaN fails
  // every < / > test, an all-NaN mesh leaves the bbox seeds at ±Infinity. Left
  // unchecked this silently yields garbage volume/weight/cost. Reject it here so
  // a corrupt file is a clear error, never a plausible-looking wrong number.
  const finite = (n: number) => Number.isFinite(n);
  if (!finite(acc.signedVolume) || !finite(acc.surfaceArea) ||
      !finite(acc.xMin) || !finite(acc.xMax) ||
      !finite(acc.yMin) || !finite(acc.yMax) ||
      !finite(acc.zMin) || !finite(acc.zMax)) {
    throw new Error('STL parse error: file contains non-finite (NaN/Infinity) vertex data — file is corrupt');
  }

  // ── Convert units ─────────────────────────────────────────────────────────
  // Input coordinates assumed mm → volume in mm³, area in mm²
  const volumeMm3 = Math.abs(acc.signedVolume);
  const surfaceAreaMm2 = acc.surfaceArea;

  const volumeCm3 = volumeMm3 / 1000;       // mm³ → cm³
  const surfaceAreaCm2 = surfaceAreaMm2 / 100; // mm² → cm²

  // ── Wall thickness heuristic ──────────────────────────────────────────────
  // For a shell of uniform thickness t and large surface area A:
  //   volume ≈ A × t  →  t ≈ volume / area  (× 2 for double-sided shell)
  const estimatedWallThicknessMm =
    surfaceAreaMm2 > 0 ? (volumeMm3 / surfaceAreaMm2) * 2 : 0;

  // ── Bounding box ──────────────────────────────────────────────────────────
  const boundingBox = {
    xMin: acc.xMin, xMax: acc.xMax,
    yMin: acc.yMin, yMax: acc.yMax,
    zMin: acc.zMin, zMax: acc.zMax,
    xSpan: acc.xMax - acc.xMin,
    ySpan: acc.yMax - acc.yMin,
    zSpan: acc.zMax - acc.zMin,
  };

  const parseTimeMs = Date.now() - t0;

  return {
    triangleCount,
    volume: volumeCm3,
    surfaceArea: surfaceAreaCm2,
    boundingBox,
    estimatedWallThicknessMm,
    estimatedPartWeightKg: (densityKgPerM3: number) =>
      (volumeCm3 / 1e6) * densityKgPerM3,   // cm³ → m³ → kg
    format,
    truncated,
    parseTimeMs,
  };
}
