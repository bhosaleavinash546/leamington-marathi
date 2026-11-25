/**
 * The sheet-metal blank unfold off the event loop (JLR Phase 1 readiness, change 3, Nov 2026).
 *
 * `developBlank` (Tutte → ARAP, and the one-step forming inverse on a non-developable skin) is synchronous and takes tens
 * of seconds on a real pressing (about 40 s measured); run on the main thread it stopped EVERY request the server was
 * handling for every user meanwhile. It now runs in a worker — one per unfold, ended when it answers — the same pattern as
 * the STL feature pass (mesh-features-worker.ts). The arithmetic is the same function on the same input, so the blank is
 * identical to the penny; only where it runs changed.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { developBlank, blankToDxf, type DevelopedBlank, type SkinMeshFile } from './blank-unfold.js';

/** The developed blank as the service reads it (the skins' solver internals stay in the worker) and its DXF. */
export interface OffThreadBlank { developed: DevelopedBlank; dxf: string }

export function developBlankOffThread(mesh: SkinMeshFile, name: string, timeoutMs = 300_000): Promise<OffThreadBlank> {
  return new Promise((resolve, reject) => {
    // The server runs under tsx (dev, Docker, the Windows package), whose loader is registered in the main thread only;
    // a worker's execArgv cannot carry `--import`, so the worker registers tsx itself, then loads this file.
    const self = import.meta.url;
    const data = { mesh, name };
    const w = self.endsWith('.ts')
      ? new Worker(`import(${JSON.stringify(import.meta.resolve('tsx/esm/api'))}).then(m => { m.register(); return import(${JSON.stringify(self)}); })`,
          { eval: true, workerData: data })
      : new Worker(new URL(self), { workerData: data });
    const timer = setTimeout(() => { void w.terminate(); reject(new Error(`blank unfold exceeded ${timeoutMs / 1000} s`)); }, timeoutMs);
    w.once('message', (m: { ok: true; r: OffThreadBlank } | { ok: false; error: string }) => {
      clearTimeout(timer); void w.terminate();
      if (m.ok) resolve(m.r); else reject(new Error(m.error));
    });
    w.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

if (!isMainThread && parentPort) {
  try {
    const { mesh, name } = workerData as { mesh: SkinMeshFile; name: string };
    const developed = developBlank(mesh);
    const dxf = blankToDxf(developed.skins[0], name);
    // The solver internals (typed arrays of every vertex) are not read after this point — keep the message small.
    const slim = { ...developed, skins: developed.skins.map(s => ({ ...s, internals: undefined })) } as DevelopedBlank;
    parentPort.postMessage({ ok: true, r: { developed: slim, dxf } });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
