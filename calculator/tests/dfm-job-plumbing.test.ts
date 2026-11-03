/**
 * The DFM job carries what the costing decided (report standard, Nov 2026): the machined-face set from the same feature
 * table, the machines the rules routed the part on, and — for a route with no rule pack — a job of its own that replaces
 * the upload's (a roto tank kept the blow-moulding job its leaning route had queued and printed pinch-off text).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/dfm/${f}`, 'utf8'));
const created: string[] = [];

describe('the job builds the part as the costing sees it', () => {
  it('attaches the machined set and the costed machines', async () => {
    const { partFromKernelGeometry } = await import('../server/utils/dfm-job-runner.js');
    const g = { status: 'success', ...load('stub-axle-features.json') };
    const part = partFromKernelGeometry(g as never, { commodity: 'cast_and_machine', process: 'sand', materialFamily: 'cast iron',
      annualVolume: 200_000, region: 'UK', machineIds: ['mach-hmc-400', 'mach-lathe-cnc'] });
    expect(part.machined?.counts.faced).toBe(8);
    expect(part.machineIds).toEqual(['mach-hmc-400', 'mach-lathe-cnc']);
    // a moulding carries no machined set
    const im = partFromKernelGeometry({ status: 'success', ...load('ecu-cover-features.json') } as never, { commodity: 'injection_moulding' });
    expect(im.machined).toBeUndefined();
  }, 60_000);   // the first import loads the server modules

  it('a no-pack route gets a job that reads no file and reports its checklist', async () => {
    const { queueNoPackDFMJob, drain, getDFMJob } = await import('../server/utils/dfm-job-runner.js');
    const id = queueNoPackDFMJob({ commodity: 'rotational_moulding', partName: 'ROTO_Header_Tank', materialFamily: 'plastic', annualVolume: 200_000 });
    created.push(id);
    await drain();
    const job = getDFMJob(id)!;
    expect(job.status).toBe('done');
    expect(job.result?.packAvailable).toBe(false);
    expect(job.result?.limitations.join(' ')).toMatch(/Checks a design engineer should make on this part: wall uniformity/);
    expect(job.result?.limitations.join(' ')).not.toMatch(/pinch|parison/i);
    expect(job.result?.dfa.available).toBe(false);
  });
});

describe('the sheet blank facts come from the unfold', () => {
  it('an L-shaped two-face skin unfolds to one straight bend', async () => {
    const { sheetBlankFromSkinMesh } = await import('../server/utils/dfm-job-runner.js');
    // base 30 × 20 at z = 0, a 90° bend of R = 2 in four strips, a 10 mm flange
    const R = 2, L = (Math.PI * R) / 2;
    const ss = [0, 10, 20, 30, ...[1, 2, 3, 4].map(k => 30 + (L * k) / 4), 30 + L + 10];
    const at = (s: number, y: number) => s <= 30 ? [s, y, 0]
      : s <= 30 + L + 1e-9 ? [30 + R * Math.sin((s - 30) / R), y, R * (1 - Math.cos((s - 30) / R))] : [30 + R, y, R + (s - 30 - L)];
    const vertices: number[][] = [];
    for (const s of ss) for (const y of [0, 20]) vertices.push(at(s, y));
    const triangles: number[][] = [];
    for (let i = 0; i < ss.length - 1; i++) triangles.push([2 * i, 2 * i + 2, 2 * i + 1], [2 * i + 1, 2 * i + 2, 2 * i + 3]);
    const sb = sheetBlankFromSkinMesh({ status: 'success', thicknessMm: 1.5, thicknessSource: 'bend-pairs', bendCount: 1,
      linearDeflectionMm: 0.1, volumeMm3: 0, surfaceAreaMm2: 0, triangles: triangles.length, skinFaces: 3, faces: 6,
      skins: [{ vertices, triangles, area3dMm2: 20 * (40 + L) }] })!;
    expect(sb.bends).toHaveLength(1);
    expect(sb.bends[0].nMax - sb.bends[0].nMin).toBeCloseTo(L, 1);   // the unfold is near-isometric on a developable skin
    expect(sb.developable).toBe(true);
    expect(sb.gaugeMm).toBe(1.5);
  });
});

afterAll(async () => {
  const { default: db } = await import('../server/db.js');
  for (const id of created) db.prepare('DELETE FROM dfm_jobs WHERE id = ?').run(id);
});
