/**
 * JLR Phase 1 readiness, change 3: the sheet-metal blank unfold runs off the event loop. On the main thread it stopped every
 * other user's request for ~40 s. Two proofs on the real seat-bracket STEP (needs the OCP kernel; skips without it, runs in
 * docker-cad.yml and on a developer machine):
 *  1. while the unfold runs, the event loop keeps ticking (no gap near a second);
 *  2. the worker's blank is the in-thread blank, figure for figure.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractSkinMesh } from '../server/utils/geometry-bridge.js';
import { developBlank, blankToDxf } from '../server/utils/blank-unfold.js';
import { developBlankOffThread } from '../server/utils/blank-unfold-worker.js';

const PART = resolve(import.meta.dirname, '..', '..', 'cad-audit', 'parts', 'Seat_Locking_Bracket.stp');
const kernel = existsSync(PART) && spawnSync(process.env.PYTHON_BIN ?? 'python3', ['-c', 'import OCP'], { stdio: 'ignore' }).status === 0;

describe.skipIf(!kernel)('blank unfold off the event loop (seat bracket STEP)', () => {
  it('keeps the server responsive and returns the same blank as the in-thread unfold', async () => {
    const mesh = await extractSkinMesh(readFileSync(PART), 'Seat_Locking_Bracket.stp', { timeoutMs: 300_000 });
    expect(mesh.status).toBe('success');
    if (mesh.status !== 'success') return;

    // 1. Event-loop gaps while the worker unfolds.
    let last = Date.now(), maxGap = 0;
    const tick = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
    const t0 = Date.now();
    const off = await developBlankOffThread(mesh.mesh, 'Seat_Locking_Bracket');
    const offMs = Date.now() - t0;
    clearInterval(tick);
    expect(maxGap).toBeLessThan(500);

    // 2. The same figures as the in-thread unfold (the function the service used to call).
    const inThread = developBlank(mesh.mesh);
    expect(off.developed.grossAreaMm2).toBe(inThread.grossAreaMm2);
    expect(off.developed.netAreaMm2).toBe(inThread.netAreaMm2);
    expect(off.developed.outerPerimeterMm).toBe(inThread.outerPerimeterMm);
    expect(off.developed.holeCount).toBe(inThread.holeCount);
    expect(off.developed.boundingRectMm).toEqual(inThread.boundingRectMm);
    expect(off.developed.skins[0].outline).toEqual(inThread.skins[0].outline);
    expect(off.dxf).toBe(blankToDxf(inThread.skins[0], 'Seat_Locking_Bracket'));
    console.log(`[off-thread unfold] ${offMs} ms, largest event-loop gap ${maxGap} ms`);
  }, 600_000);
});
