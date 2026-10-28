/**
 * The STL feature pass off the event loop. `extractMeshFeatures` is synchronous and takes seconds on a real part (14 s
 * at 216k triangles); run inline in the DFM job it would stall every request the server is handling meanwhile — the
 * STEP path spawns Python for the same reason. One worker per job, ended when it answers.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readStlTriangles, extractMeshFeatures, type MeshFeatureResult } from './mesh-features.js';

/** What the DFM job needs: the features, the measures the rules read, and the faces for the viewer. */
export type MeshFeatureSummary = Pick<MeshFeatureResult, 'featureSet' | 'volumeMm3' | 'surfaceMm2' | 'bboxMm' | 'projectedAlongDrawMm2' | 'stats' | 'triFace'>
  & { faces: MeshFaceMeta[] };
/** A recovered face as the viewer's `FaceMeta` reads it (cad-viewer.ts) — the triangle lists stay behind. */
export interface MeshFaceMeta {
  id: number; type: string; radiusMm: number | null; areaCm2: number; hole: boolean | null; thicknessMm: number | null;
}

export function extractStlFeaturesOffThread(buf: Buffer, timeoutMs = 120_000): Promise<MeshFeatureSummary> {
  return new Promise((resolve, reject) => {
    // Every deployment runs the server under tsx (dev, Docker, the Windows package), whose loader is registered in the
    // main thread only, and a worker's execArgv cannot carry `--import`: the worker registers tsx itself, then loads
    // this file.
    const self = import.meta.url;
    const w = self.endsWith('.ts')
      ? new Worker(`import(${JSON.stringify(import.meta.resolve('tsx/esm/api'))}).then(m => { m.register(); return import(${JSON.stringify(self)}); })`,
          { eval: true, workerData: buf })
      : new Worker(new URL(self), { workerData: buf });
    const timer = setTimeout(() => { void w.terminate(); reject(new Error(`STL feature pass exceeded ${timeoutMs / 1000} s`)); }, timeoutMs);
    w.once('message', (m: { ok: true; r: MeshFeatureSummary } | { ok: false; error: string }) => {
      clearTimeout(timer); void w.terminate();
      if (m.ok) resolve(m.r); else reject(new Error(m.error));
    });
    w.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

if (!isMainThread && parentPort) {
  try {
    const { featureSet, volumeMm3, surfaceMm2, bboxMm, projectedAlongDrawMm2, stats, triFace, faces } =
      extractMeshFeatures(readStlTriangles(Buffer.from(workerData as Uint8Array)));
    const meta: MeshFaceMeta[] = faces.map(f => ({
      id: f.id, type: f.type, radiusMm: f.cyl ? Math.round(f.cyl.r * 1000) / 1000 : null,
      areaCm2: Math.round(f.areaMm2) / 100,
      hole: f.cyl ? (f.cyl.concave && f.cyl.coverage >= 0.83) : null, thicknessMm: f.thicknessMm ?? null,
    }));
    parentPort.postMessage({ ok: true, r: { featureSet, volumeMm3, surfaceMm2, bboxMm, projectedAlongDrawMm2, stats, triFace, faces: meta } },
      [triFace.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String((e as Error).message ?? e) });
  }
}
