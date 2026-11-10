/**
 * The reader off the event loop. Parsing a large PDF and OCR are CPU-bound and would stall every request the server
 * is handling: `readDrawingOffThread` runs `readDrawing` in a worker thread, one per job, ended when it answers.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { DrawingExtraction } from '../../src/engine/engineering-data/model.js';
import { DrawingReadError, type ReadOptions } from './types.js';
import { readDrawing } from './index.js';

type Answer = { ok: true; r: DrawingExtraction } | { ok: false; error: string; code?: DrawingReadError['code'] };

export type OffThreadOptions = Omit<ReadOptions, 'ocrEngine'> & { timeoutMs?: number };

/** Run the reader in a worker thread. Rejects with `DrawingReadError` for an unreadable file, `Error` on a timeout. */
export function readDrawingOffThread(buffer: Uint8Array, filename: string, opts: OffThreadOptions = {}): Promise<DrawingExtraction> {
  const { timeoutMs = 300_000, ...readOpts } = opts;
  return new Promise((resolve, reject) => {
    // The server runs under tsx, whose loader is registered in the main thread only: the worker registers it itself
    // (the same arrangement as server/utils/mesh-features-worker.ts).
    const self = import.meta.url;
    const data = { buffer: new Uint8Array(buffer), filename, opts: readOpts };
    const w = self.endsWith('.ts')
      ? new Worker(`import(${JSON.stringify(import.meta.resolve('tsx/esm/api'))}).then(m => { m.register(); return import(${JSON.stringify(self)}); })`,
          { eval: true, workerData: data })
      : new Worker(new URL(self), { workerData: data });
    const timer = setTimeout(() => { void w.terminate(); reject(new Error(`Reading the drawing exceeded ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    w.once('message', (m: Answer) => {
      clearTimeout(timer); void w.terminate();
      if (m.ok) resolve(m.r);
      else reject(m.code ? new DrawingReadError(m.code, m.error) : new Error(m.error));
    });
    w.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

if (!isMainThread && parentPort && workerData && (workerData as { filename?: unknown }).filename !== undefined) {
  const { buffer, filename, opts } = workerData as { buffer: Uint8Array; filename: string; opts: ReadOptions };
  const port = parentPort;
  readDrawing(buffer, filename, opts).then(
    r => port.postMessage({ ok: true, r } satisfies Answer),
    e => port.postMessage({ ok: false, error: String((e as Error)?.message ?? e), ...(e instanceof DrawingReadError ? { code: e.code } : {}) } satisfies Answer),
  );
}
