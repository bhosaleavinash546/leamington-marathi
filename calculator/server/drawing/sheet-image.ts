/**
 * One sheet of a drawing as a PNG picture — for the review screen, so an engineer can see where a reading sits.
 *
 * The same local renderers the reader uses (pdfjs onto an @napi-rs/canvas surface; the canvas decoder for PNG / JPEG;
 * utif2 for TIFF). No network. A DXF has no page picture and is refused in words. `renderSheetOffThread` runs it in a
 * worker thread: drawing a large sheet is CPU-bound and must not stall the server.
 */
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DrawingReadError } from './types.js';
import { detectFileKind, openPdf, closePdf } from './ingest.js';

const require = createRequire(import.meta.url);

export interface SheetImage {
  png: Uint8Array;
  widthPx: number; heightPx: number;
  /** The sheet in page points — the frame every reading's bbox is given in. */
  widthPt: number; heightPt: number;
}

/** The longest side of the picture, in pixels: enough to read 2.5 mm text on an A1 sheet shown at screen width. */
export const SHEET_IMAGE_MAX_PX = 2400;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canvasLib(): any {
  try { return require('@napi-rs/canvas'); }
  catch { throw new DrawingReadError('unsupported-type', 'The image library (@napi-rs/canvas) is not installed: the sheet cannot be drawn.'); }
}

/** Draw sheet `sheet` (1-based) of a PDF, PNG, JPEG or TIFF drawing. */
export async function renderSheetImage(buffer: Uint8Array, sheet: number, maxPx = SHEET_IMAGE_MAX_PX): Promise<SheetImage> {
  const kind = detectFileKind(buffer);
  if (kind === 'dxf') throw new DrawingReadError('unsupported-type', 'A DXF drawing has no page picture: its readings are listed without a view of the sheet.');
  const lib = canvasLib();
  const limit = Math.max(400, Math.min(maxPx, 6000));
  if (kind === 'pdf') {
    const { doc } = await openPdf(buffer);
    try {
      if (!(sheet >= 1 && sheet <= doc.numPages)) throw new DrawingReadError('empty', `This drawing has no sheet ${sheet}.`);
      const page = await doc.getPage(sheet);
      const base = page.getViewport({ scale: 1 });
      const scale = limit / Math.max(base.width, base.height);
      const vp = page.getViewport({ scale });
      const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
      const canvas = lib.createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      page.cleanup();
      return { png: new Uint8Array(canvas.toBuffer('image/png')), widthPx: w, heightPx: h, widthPt: base.width, heightPt: base.height };
    } finally { await closePdf(doc); }
  }
  // An image: every reading's bbox is in points at the resolution the reader assumed, so only the proportions matter here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let source: any; let sw: number; let sh: number;
  if (kind === 'tiff') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const UTIF: any = require('utif2');
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) as ArrayBuffer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages: any[] = (UTIF.decode(ab) as any[]).filter(i => !(i.t254 && (i.t254[0] & 1)));
    const ifd = pages[sheet - 1];
    if (!ifd) throw new DrawingReadError('empty', `This drawing has no sheet ${sheet}.`);
    UTIF.decodeImage(ab, ifd);
    sw = ifd.width; sh = ifd.height;
    const tmp = lib.createCanvas(sw, sh);
    const tctx = tmp.getContext('2d');
    const img = tctx.createImageData(sw, sh);
    img.data.set(UTIF.toRGBA8(ifd) as Uint8Array);
    tctx.putImageData(img, 0, 0);
    source = tmp;
  } else {
    if (sheet !== 1) throw new DrawingReadError('empty', `This drawing has no sheet ${sheet}.`);
    try { source = await lib.loadImage(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.length)); }
    catch (e) { throw new DrawingReadError('corrupt', `This image cannot be decoded (${String((e as Error).message ?? e).slice(0, 120)}).`); }
    sw = source.width; sh = source.height;
  }
  const k = Math.min(1, limit / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const canvas = lib.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return { png: new Uint8Array(canvas.toBuffer('image/png')), widthPx: w, heightPx: h, widthPt: sw, heightPt: sh };
}

type Answer = { ok: true; r: SheetImage } | { ok: false; error: string; code?: DrawingReadError['code'] };
const TASK = 'sheet-image';

/** `renderSheetImage` in a worker thread. Rejects with `DrawingReadError` for a sheet that cannot be drawn. */
export function renderSheetOffThread(buffer: Uint8Array, sheet: number, opts: { maxPx?: number; timeoutMs?: number } = {}): Promise<SheetImage> {
  const { timeoutMs = 60_000, maxPx } = opts;
  return new Promise((resolve, reject) => {
    const self = import.meta.url;
    const data = { task: TASK, buffer: new Uint8Array(buffer), sheet, maxPx };
    // Under tsx the loader lives in the main thread only: the worker registers it itself (as worker.ts does).
    const w = self.endsWith('.ts')
      ? new Worker(`import(${JSON.stringify(import.meta.resolve('tsx/esm/api'))}).then(m => { m.register(); return import(${JSON.stringify(self)}); })`,
          { eval: true, workerData: data })
      : new Worker(new URL(self), { workerData: data });
    const timer = setTimeout(() => { void w.terminate(); reject(new Error(`Drawing the sheet exceeded ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    w.once('message', (m: Answer) => {
      clearTimeout(timer); void w.terminate();
      if (m.ok) resolve(m.r);
      else reject(m.code ? new DrawingReadError(m.code, m.error) : new Error(m.error));
    });
    w.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

if (!isMainThread && parentPort && workerData && (workerData as { task?: unknown }).task === TASK) {
  const { buffer, sheet, maxPx } = workerData as { buffer: Uint8Array; sheet: number; maxPx?: number };
  const port = parentPort;
  renderSheetImage(buffer, sheet, maxPx).then(
    r => port.postMessage({ ok: true, r } satisfies Answer),
    e => port.postMessage({ ok: false, error: String((e as Error)?.message ?? e), ...(e instanceof DrawingReadError ? { code: e.code } : {}) } satisfies Answer),
  );
}
