/**
 * Sheet → pixels. PDF pages are drawn by pdfjs onto an @napi-rs/canvas surface (prebuilt Skia, no system libraries);
 * PNG / JPEG are decoded by the same canvas package and TIFF by utif2. All local, all in-process.
 */
import { createRequire } from 'node:module';
import type { PdfDocument } from '../pdfjs.js';
import { rgbaToGrey, type Grey } from './preprocess.js';

const require = createRequire(import.meta.url);

/** The largest image handed to OCR. An A0 sheet at 300 dpi is 139 MP; it is rendered at the dpi that fits this. */
export const MAX_PIXELS = 40_000_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canvasLib(): any | null {
  try { return require('@napi-rs/canvas'); } catch { return null; }
}

export function rasterAvailable(): boolean { return canvasLib() !== null; }

export interface Rendered { grey: Grey; dpi: number }

/** Render one PDF page to greyscale at `dpi` (lowered to fit MAX_PIXELS, never below 110). */
export async function renderPdfPage(doc: PdfDocument, pageNumber: number, dpi: number): Promise<Rendered> {
  const lib = canvasLib();
  if (!lib) throw new Error('@napi-rs/canvas is not installed');
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.sqrt(MAX_PIXELS / Math.max(1, (base.width / 72) * (base.height / 72)));
  const used = Math.max(110, Math.min(dpi, Math.floor(fit)));
  const vp = page.getViewport({ scale: used / 72 });
  const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
  const canvas = lib.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  const rgba = ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray;
  page.cleanup();
  return { grey: rgbaToGrey(rgba, w, h), dpi: used };
}

export interface DecodedImage { grey: Grey; dpi?: number }

function pngDpi(buf: Uint8Array): number | undefined {
  // pHYs chunk: pixels per metre
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  let off = 8;
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off); const type = b.toString('latin1', off + 4, off + 8);
    if (type === 'pHYs' && len >= 9 && b[off + 16] === 1) return Math.round(b.readUInt32BE(off + 8) * 0.0254);
    if (type === 'IDAT' || type === 'IEND') break;
    off += 12 + len;
  }
  return undefined;
}

function jpegDpi(buf: Uint8Array): number | undefined {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  if (b.length > 18 && b[2] === 0xff && b[3] === 0xe0 && b.toString('latin1', 6, 10) === 'JFIF') {
    const units = b[13], x = b.readUInt16BE(14);
    if (units === 1 && x > 1) return x;
    if (units === 2 && x > 1) return Math.round(x * 2.54);
  }
  return undefined;
}

/** Decode a PNG or JPEG to greyscale. */
export async function decodeBitmap(buf: Uint8Array, kind: 'png' | 'jpeg'): Promise<DecodedImage> {
  const lib = canvasLib();
  if (!lib) throw new Error('@napi-rs/canvas is not installed');
  const img = await lib.loadImage(Buffer.from(buf.buffer, buf.byteOffset, buf.length));
  let w = img.width as number, h = img.height as number;
  const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));
  const dpi0 = kind === 'png' ? pngDpi(buf) : jpegDpi(buf);
  w = Math.max(1, Math.round(w * shrink)); h = Math.max(1, Math.round(h * shrink));
  const canvas = lib.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray;
  return { grey: rgbaToGrey(rgba, w, h), ...(dpi0 ? { dpi: Math.round(dpi0 * shrink) } : {}) };
}

/** Decode every page of a TIFF (uncompressed, PackBits, LZW, CCITT G3 / G4, JPEG — what utif2 reads). */
export function decodeTiff(buf: Uint8Array): DecodedImage[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const UTIF: any = require('utif2');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ifds: any[] = UTIF.decode(ab);
  const out: DecodedImage[] = [];
  for (const ifd of ifds) {
    // reduced-resolution previews (NewSubfileType bit 0) are not sheets
    if (ifd.t254 && (ifd.t254[0] & 1)) continue;
    UTIF.decodeImage(ab, ifd);
    if (!ifd.width || !ifd.height || !ifd.data) continue;
    const rgba: Uint8Array = UTIF.toRGBA8(ifd);
    let dpi: number | undefined;
    const xr = ifd.t282?.[0], unit = ifd.t296?.[0] ?? 2;
    if (typeof xr === 'number' && xr > 1) dpi = Math.round(unit === 3 ? xr * 2.54 : xr);
    out.push({ grey: rgbaToGrey(rgba, ifd.width, ifd.height), ...(dpi ? { dpi } : {}) });
  }
  return out;
}
