/**
 * CAD STEP-parse worker — runs occt-import-js (WASM) OFF the main event loop so a
 * large upload can no longer stall every concurrent request. Receives
 * { fileBase64 } via workerData, posts back the same payload shape the
 * /api/cad-step endpoint returns (or { error }).
 */
import { parentPort, workerData } from 'worker_threads';
import { analyzeFeatures } from '../src/services/cad-features.mjs';
import { aggregateOcctMeshes, analyzeBrep } from '../src/services/cad-brep.mjs';

async function run() {
  try {
    const occtimport = (await import('occt-import-js')).default;
    const occt = await occtimport();
    const buf = Buffer.from(workerData.fileBase64, 'base64');
    const result = occt.ReadStepFile(new Uint8Array(buf), null);
    if (!result || !result.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
      return parentPort.postMessage({ error: 'Could not read solid geometry from this STEP file.', status: 422 });
    }
    const agg = aggregateOcctMeshes(result.meshes);
    if (!agg) return parentPort.postMessage({ error: 'STEP file contained no tessellable solid.', status: 422 });
    const { featureMap, processes, dfma } = analyzeFeatures(agg);
    const brep = analyzeBrep(result.meshes);
    parentPort.postMessage({
      ok: true,
      payload: {
        triangleCount: agg.triangleCount,
        estimatedVolume: agg.volumeCm3,
        estimatedSurfaceArea: agg.surfaceAreaCm2,
        boundingBox: agg.bbox,
        featureMap, processGuesses: processes, dfmaFindings: dfma,
        featureCounts: { faces: brep.totalFaces, holes: brep.holes, bosses: brep.bosses },
        brep,
      },
    });
  } catch (e) {
    parentPort.postMessage({ error: e?.message || 'STEP parsing failed', status: 500 });
  }
}
run();
