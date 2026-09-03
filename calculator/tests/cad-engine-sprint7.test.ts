/**
 * Sprint 7 engine changes, against the real kernel (skips without OCP):
 *  - the aggregate draft analysis no longer counts end faces (a flat bottom
 *    face at 180° used to be an "undercut" on every part), and it agrees with
 *    the per-face classification's wall gate;
 *  - the draw direction is searched over the three principal axes, with the
 *    runner-up reported;
 *  - the tessellation sidecar carries true B-rep edge polylines;
 *  - a thin drape is meshed at the finer angular deflection.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { analyzeGeometry, tessellateToSTL } from '../server/utils/geometry-bridge.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
const BUMPER = join(__dirname, '..', '..', 'cad-audit', 'parts', 'BUMPER.stp');
let kernel = false;
let block: OCCTGeometry | null = null;
beforeAll(async () => {
  process.env.AIR_GAPPED = '1';
  try { block = await analyzeGeometry(readFileSync(join(DIR, 'block-2holes.step')), 'block-2holes.step', 90_000); kernel = block.status === 'success'; }
  catch { kernel = false; }
}, 120_000);

describe('draft: only wall faces are classified', () => {
  it('a plain block with two holes has no undercuts along its best draw direction', () => {
    if (!kernel) return;
    const d = block!.draftAnalysis!;
    expect(d.undercutFaceCount).toBe(0);
    // The two end faces (top and bottom) are NOT in the analysed count any more.
    expect(d.analyzedFaceCount).toBeLessThan(block!.faces!.total);
  });
  it('the pull direction was searched and the runner-up reported', () => {
    if (!kernel) return;
    const s = block!.draftAnalysis!.pullDirectionSearch!;
    expect(s.candidates.length).toBe(3);
    expect(s.candidates[0].undercutFaceCount).toBeLessThanOrEqual(s.candidates[1].undercutFaceCount);
    expect(typeof s.ambiguous).toBe('boolean');
  });
});

describe('true edges in the sidecar', () => {
  it('the flange tessellation carries exact edge polylines', async () => {
    if (!kernel) return;
    const r = await tessellateToSTL(readFileSync(join(DIR, 'flange-6holes-boss.step')), 'flange.step', { withMeta: true });
    expect(r.status).toBe('success');
    if (r.status !== 'success') return;
    const e = r.meta?.edgeLines ?? [];
    expect(e.length % 6).toBe(0);
    expect(e.length / 6).toBeGreaterThan(100);      // hundreds of segments on a 6-hole flange
    expect(r.meta?.topology?.isClosedSolid).toBe(true);
    expect(r.meta?.bboxMm?.[0]).toBeCloseTo(80, 0);
  }, 60_000);
});

describe('adaptive deflection on a thin drape', () => {
  it('the bumper mesh volume is within 4% of the exact volume (was −11.9% at diag/500, 0.3 rad)', async () => {
    if (!kernel || !existsSync(BUMPER)) return;
    const buf = readFileSync(BUMPER);
    const [geo, mesh] = await Promise.all([analyzeGeometry(buf, 'BUMPER.stp', 300_000), tessellateToSTL(buf, 'BUMPER.stp', { withMeta: false, timeoutMs: 300_000 })]);
    expect(geo.status).toBe('success'); expect(mesh.status).toBe('success');
    if (geo.status !== 'success' || mesh.status !== 'success') return;
    // Signed-tetrahedron volume over the binary STL.
    const dv = new DataView(mesh.stl.buffer, mesh.stl.byteOffset, mesh.stl.byteLength);
    const n = dv.getUint32(80, true);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const ax = dv.getFloat32(o, true), ay = dv.getFloat32(o + 4, true), az = dv.getFloat32(o + 8, true);
      const bx = dv.getFloat32(o + 12, true), by = dv.getFloat32(o + 16, true), bz = dv.getFloat32(o + 20, true);
      const cx = dv.getFloat32(o + 24, true), cy = dv.getFloat32(o + 28, true), cz = dv.getFloat32(o + 32, true);
      v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    const meshCm3 = Math.abs(v) / 1000;
    const err = (meshCm3 - geo.volume!.cm3) / geo.volume!.cm3;
    expect(Math.abs(err)).toBeLessThan(0.04);   // −3.2% measured; the residual is sliver faces, not deflection
  }, 600_000);
});
