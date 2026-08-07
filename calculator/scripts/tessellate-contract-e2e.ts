/**
 * Live check of the tessellate binary frame — the wire format the 3D viewer reads.
 *
 * `faces_meta` changed shape when `triFace` was fixed to carry the B-rep map
 * index: it is now indexed BY face id, so index 0 and any face the mesher
 * skipped are null. Typecheck proves the TypeScript agrees; it proves nothing
 * about the JSON that actually crosses the wire, because the header is built by
 * `JSON.stringify` on the server and parsed as a plain object on the client.
 * The one bug this file exists to catch is the one a compiler cannot see.
 *
 * It drives the real route over HTTP and decodes the frame exactly as
 * `cad-viewer.ts` does, then asserts the invariants the viewer depends on:
 * a triangle's face id indexes `faces`, that record is its own, and a DFM
 * finding's faceIds land on the geometry the finding describes.
 *
 *   npx tsx scripts/tessellate-contract-e2e.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';

const PORT = Number(process.env.CV_E2E_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = process.env.CV_E2E_STEP ?? 'tests/fixtures/cad-parts/flange-6holes-boss.step';

interface FaceMeta { id: number; type: string; bodyId?: number; hole?: boolean | null }

let failures = 0;
const check = (ok: boolean, what: string, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

async function waitForServer(deadlineMs = 40_000): Promise<void> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`server did not start on ${BASE} within ${deadlineMs}ms`);
}

/** Decode [u32 headerLen][header JSON][raw STL][triFace u32] — the viewer's reader. */
function decodeFrame(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  const headerLen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen))) as {
    triangles: number; stlBytes: number; triFaceCount: number;
    faces: (FaceMeta | null)[]; bodies: number | null; skippedFaces: number;
  };
  const triOff = 4 + headerLen + header.stlBytes;
  const triFace = new Uint32Array(header.triFaceCount);
  for (let i = 0; i < header.triFaceCount; i++) triFace[i] = dv.getUint32(triOff + i * 4, true);
  return { header, triFace };
}

async function main() {
  console.log(`tessellate wire contract · ${basename(FIXTURE)}`);
  const server: ChildProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), AIR_GAPPED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = () => { try { server.kill('SIGKILL'); } catch { /* already gone */ } };

  try {
    await waitForServer();

    const bytes = await readFile(FIXTURE);
    const form = new FormData();
    form.append('cadFile', new Blob([new Uint8Array(bytes)]), basename(FIXTURE));
    const resp = await fetch(`${BASE}/api/cad/tessellate?meta=bin`, { method: 'POST', body: form });
    check(resp.ok, 'route returns 200', resp.ok ? '' : `${resp.status} ${await resp.text()}`);
    if (!resp.ok) return;

    const { header, triFace } = decodeFrame(await resp.arrayBuffer());
    const { faces } = header;
    check(triFace.length === header.triangles, 'one face id per triangle',
      `${triFace.length} ids, ${header.triangles} triangles`);

    // The viewer indexes `faces` BY the triangle's face id. Before the fix these
    // were two different numbering schemes and this read the wrong record.
    const ids = [...new Set(triFace)];
    check(Math.max(...ids) < faces.length, 'every triangle id indexes the faces array',
      `max id ${Math.max(...ids)}, faces length ${faces.length}`);
    const wrongRecord = ids.filter(i => !faces[i] || faces[i]!.id !== i);
    check(wrongRecord.length === 0, 'each id resolves to its own face record',
      `${wrongRecord.length} mismatched: ${wrongRecord.slice(0, 5).join(', ')}`);

    // `bodyOf` reads `faces[id]?.bodyId` for every triangle to group bodies. A
    // null at a live id would silently collapse the model into one body.
    const nullAtLiveId = ids.filter(i => faces[i] == null);
    check(nullAtLiveId.length === 0, 'no meshed id maps to a null record',
      `${nullAtLiveId.length} null`);
    check(faces[0] === null, 'index 0 is the reserved null slot (ids are 1-based)',
      `got ${JSON.stringify(faces[0])}`);

    // The reason the ids matter: a DFM finding names faces, and the viewer
    // highlights them through this exact map.
    const geo = await analyzeGeometry(bytes, basename(FIXTURE), 600_000,
      { CV_EXTRACT_FEATURES: '1' });
    if (geo.status !== 'success') { check(false, 'geometry analysis succeeds', geo.error); return; }
    const feats = geo.manufacturingFeatures?.features ?? [];
    const holes = feats.filter(f => f.kind === 'hole' || f.kind === 'boss');
    check(holes.length > 0, 'fixture yields hole/boss features', `${holes.length} found`);

    const meshed = new Set(ids);
    let hit = 0, miss = 0, wrongType = 0;
    for (const f of holes) {
      for (const id of f.faceIds ?? []) {
        if (!meshed.has(id)) { miss++; continue; }
        if (faces[id]!.type === 'cylinder') hit++; else wrongType++;
      }
    }
    check(hit > 0, 'finding face ids reach meshed triangles', `${hit} resolved`);
    check(miss === 0, 'no finding face id is absent from the mesh', `${miss} missing`);
    check(wrongType === 0, 'every hole/boss face id IS a cylinder over the wire',
      `${wrongType} resolved to something else`);
  } finally {
    kill();
  }

  console.log(failures ? `\nFAILED — ${failures} check(s)` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
