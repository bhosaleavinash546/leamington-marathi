/**
 * Sheet → pixels. PDF pages are drawn by pdfjs onto an @napi-rs/canvas surface (prebuilt Skia, no system libraries);
 * PNG / JPEG are decoded by the same canvas package and TIFF by utif2. All local, all in-process.
 *
 * Memory (review F08 / D12, Nov 2026): an image's size is read from its HEADER (PNG IHDR, JPEG SOF, TIFF IFD tags
 * 256 / 257) before a byte of it is decoded, and an image above `MAX_DECODE_PIXELS` is refused — a highly compressed
 * file of enormous dimensions fits in the 30 MB upload and would otherwise expand to gigabytes. What is decoded is
 * brought down to the OCR's working resolution (`OCR_WORKING_DPI`) as it is decoded: a large PNG is inflated a row at a
 * time and averaged straight into the smaller image (the full image never exists in memory), a TIFF one page at a time.
 */
import { createRequire } from 'node:module';
import { createInflate } from 'node:zlib';
import type { PdfDocument } from '../pdfjs.js';
import { DrawingReadError } from '../types.js';
import { rgbaToGrey, type Grey } from './preprocess.js';

const require = createRequire(import.meta.url);

/** The largest image handed to OCR. An A0 sheet at 300 dpi is 139 MP; it is rendered at the dpi that fits this. */
export const MAX_PIXELS = 40_000_000;

/**
 * The most pixels one sheet of an image file may have before it is decoded. The largest real drawing scan is an A0
 * sheet at 300 dpi (9,933 × 14,043 = 139 MP); 150 MP is that with a margin. Why a cap at all: a decoder holds the whole
 * picture (4 bytes a pixel — 600 MB at this cap) and the server's VM has 2 GB (calculator/fly.toml), so a file that
 * states more pixels is refused from its header, before anything is decoded.
 */
export const MAX_DECODE_PIXELS = 150_000_000;

/** The resolution OCR works at (the reader's default `ocrDpi`): an image scanned finer is brought down to it as it is decoded. */
export const OCR_WORKING_DPI = 300;

/** Width × height of every sheet of a PNG, JPEG or TIFF, read from the header only. null when the header cannot be read. */
export function imageDimensions(buf: Uint8Array, kind: 'png' | 'jpeg' | 'tiff'): Array<{ width: number; height: number }> | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  try {
    if (kind === 'png') {
      if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
      return [{ width: b.readUInt32BE(16), height: b.readUInt32BE(20) }];
    }
    if (kind === 'jpeg') {
      let off = 2;
      while (off + 4 <= b.length) {
        if (b[off] !== 0xff) { off++; continue; }
        const m = b[off + 1];
        if (m === 0xff) { off++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { off += 2; continue; }
        if (m === 0xd9 || m === 0xda) return null;                    // end of image / start of scan before any frame header
        const len = b.readUInt16BE(off + 2);
        // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC): precision, height, width
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          if (off + 9 > b.length) return null;
          return [{ width: b.readUInt16BE(off + 7), height: b.readUInt16BE(off + 5) }];
        }
        off += 2 + len;
      }
      return null;
    }
    // TIFF: the IFDs are parsed (tags only — nothing is decompressed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const UTIF: any = require('utif2');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ifds: any[] = UTIF.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    return ifds.filter(i => !(i.t254 && (i.t254[0] & 1)))
      .map(i => ({ width: Number(i.t256?.[0] ?? i.width ?? 0), height: Number(i.t257?.[0] ?? i.height ?? 0) }));
  } catch { return null; }
}

/**
 * Refuse an image whose header states more pixels than the reader decodes (`DrawingReadError('too-large')` → 413),
 * before it is decoded. Returns the sheets' sizes when the header was read.
 */
export function checkImagePixels(buf: Uint8Array, kind: 'png' | 'jpeg' | 'tiff'): Array<{ width: number; height: number }> | null {
  const dims = imageDimensions(buf, kind);
  for (const [i, d] of (dims ?? []).entries()) {
    const px = d.width * d.height;
    if (px > MAX_DECODE_PIXELS) {
      throw new DrawingReadError('too-large', `The image${dims!.length > 1 ? `'s page ${i + 1}` : ''} is ${d.width.toLocaleString('en-GB')} × ${d.height.toLocaleString('en-GB')} pixels `
        + `(${Math.round(px / 1e6).toLocaleString('en-GB')} megapixels); the reader decodes at most ${MAX_DECODE_PIXELS / 1e6} megapixels a sheet `
        + '(an A0 sheet scanned at 300 dpi is 139). Scan it at a lower resolution, or export the drawing as a PDF.');
    }
  }
  return dims;
}

/** How much to shrink a sheet of w × h pixels at `dpi` (undefined: not stated): to the OCR's resolution and the OCR image limit. */
export function decodeScale(w: number, h: number, dpi: number | undefined, targetDpi = OCR_WORKING_DPI): number {
  return Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)), dpi && dpi > targetDpi ? targetDpi / dpi : 1);
}

/**
 * Average a stream of source rows into a smaller greyscale image (a box filter: every source pixel lands in exactly
 * one output pixel). Only one output row of sums is held.
 */
class BoxShrink {
  readonly out: Grey;
  private readonly col: Int32Array;
  private readonly sum: Float64Array;
  private readonly cnt: Uint32Array;
  private row = -1;
  constructor(private readonly w: number, h: number, private readonly s: number) {
    const ow = Math.floor((w - 1) * s) + 1, oh = Math.floor((h - 1) * s) + 1;
    this.out = { data: new Uint8Array(ow * oh).fill(255), width: ow, height: oh };
    this.col = new Int32Array(w);
    for (let x = 0; x < w; x++) this.col[x] = Math.floor(x * s);
    this.sum = new Float64Array(ow); this.cnt = new Uint32Array(ow);
  }
  /** Add source row `y` (its grey values, length w). */
  add(y: number, grey: ArrayLike<number>): void {
    const oy = Math.floor(y * this.s);
    if (oy !== this.row) { this.flush(); this.row = oy; }
    const { col, sum, cnt } = this;
    for (let x = 0; x < this.w; x++) { const o = col[x]; sum[o] += grey[x]; cnt[o]++; }
  }
  flush(): void {
    if (this.row < 0) return;
    const ow = this.out.width, base = this.row * ow, d = this.out.data;
    for (let o = 0; o < ow; o++) if (this.cnt[o]) d[base + o] = this.sum[o] / this.cnt[o];
    this.sum.fill(0); this.cnt.fill(0);
  }
}

/** RGBA (composited on white, BT.601 luma — exactly `rgbaToGrey`) averaged straight into a smaller image. */
function rgbaToGreyScaled(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, s: number): Grey {
  if (s >= 1) return rgbaToGrey(rgba, w, h);
  const box = new BoxShrink(w, h, s);
  const line = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0, j = y * w * 4; x < w; x++, j += 4) {
      const a = rgba[j + 3], l = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
      line[x] = a === 255 ? l : (l * a + 255 * (255 - a)) / 255;
    }
    box.add(y, line);
  }
  box.flush();
  return box.out;
}

/**
 * A non-interlaced PNG decoded a row at a time and averaged into a `s`-scaled greyscale image: inflate → unfilter →
 * grey (composited on white) → box filter. The full-size image is never held. null for what this decoder does not
 * take (interlaced, a broken stream) — the caller falls back to the canvas decoder, under the same pixel cap.
 */
export async function decodePngScaled(buf: Uint8Array, s: number): Promise<Grey | null> {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  if (b.length < 33 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], ctype = b[25], interlace = b[28];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
  if (!channels || interlace !== 0 || ![1, 2, 4, 8, 16].includes(depth) || !w || !h) return null;
  const bitsPx = channels * depth, rowBytes = Math.ceil(w * bitsPx / 8), fbpp = Math.max(1, bitsPx >> 3);
  let palette: Uint8Array | null = null, palAlpha: Uint8Array | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  for (let off = 8; off + 12 <= b.length;) {
    const len = b.readUInt32BE(off), type = b.toString('latin1', off + 4, off + 8), data = b.subarray(off + 8, off + 8 + len);
    if (type === 'PLTE') palette = new Uint8Array(data);
    else if (type === 'tRNS') { trns = data; if (ctype === 3) palAlpha = new Uint8Array(data); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!idat.length || (ctype === 3 && !palette)) return null;
  const maxV = (1 << Math.min(depth, 8)) - 1;
  // A palette as grey + alpha once (composited on white).
  let palGrey: Float32Array | null = null;
  if (ctype === 3 && palette) {
    palGrey = new Float32Array(256).fill(255);
    for (let i = 0; i * 3 + 2 < palette.length && i < 256; i++) {
      const l = (palette[i * 3] * 299 + palette[i * 3 + 1] * 587 + palette[i * 3 + 2] * 114) / 1000, a = palAlpha && i < palAlpha.length ? palAlpha[i] : 255;
      palGrey[i] = a === 255 ? l : (l * a + 255 * (255 - a)) / 255;
    }
  }
  // tRNS on grey / RGB: one colour (as 16-bit samples) is transparent → white.
  const tGrey = ctype === 0 && trns && trns.length >= 2 ? trns.readUInt16BE(0) : -1;
  const tRgb = ctype === 2 && trns && trns.length >= 6 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;

  const box = new BoxShrink(w, h, s);
  const line = new Float32Array(w);
  let prev = new Uint8Array(rowBytes), cur = new Uint8Array(rowBytes);
  let y = 0;
  const sample = (r: Uint8Array, i: number): number => (depth === 16 ? (r[i * 2] << 8) | r[i * 2 + 1] : r[i]);
  const toGrey = (r: Uint8Array): void => {
    if (depth < 8) {
      for (let x = 0; x < w; x++) {
        const bit = x * depth, v = (r[bit >> 3] >> (8 - depth - (bit & 7))) & maxV;
        line[x] = ctype === 3 ? palGrey![v] : (ctype === 0 && v === tGrey ? 255 : v * 255 / maxV);
      }
      return;
    }
    const hi = depth === 16 ? 257 : 1;   // 16-bit sample → 8-bit
    for (let x = 0; x < w; x++) {
      const i = x * channels;
      switch (ctype) {
        case 0: { const v = sample(r, i); line[x] = v === tGrey ? 255 : v / hi; break; }
        case 3: line[x] = palGrey![r[x]]; break;
        case 2: case 6: {
          const R = sample(r, i), G = sample(r, i + 1), B = sample(r, i + 2);
          const l = (R * 299 + G * 587 + B * 114) / 1000 / hi;
          const a = ctype === 6 ? sample(r, i + 3) / hi : (tRgb && R === tRgb[0] && G === tRgb[1] && B === tRgb[2] ? 0 : 255);
          line[x] = a >= 255 ? l : (l * a + 255 * (255 - a)) / 255;
          break;
        }
        case 4: { const l = sample(r, i) / hi, a = sample(r, i + 1) / hi; line[x] = a >= 255 ? l : (l * a + 255 * (255 - a)) / 255; break; }
      }
    }
  };
  const unfilter = (ft: number): boolean => {
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= fbpp ? cur[i - fbpp] : 0, up = prev[i], c = i >= fbpp ? prev[i - fbpp] : 0;
      switch (ft) {
        case 0: break;
        case 1: cur[i] = (cur[i] + a) & 255; break;
        case 2: cur[i] = (cur[i] + up) & 255; break;
        case 3: cur[i] = (cur[i] + ((a + up) >> 1)) & 255; break;
        case 4: { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
          cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; break; }
        default: return false;
      }
    }
    return true;
  };
  // Inflate as a stream: a filter byte + one row at a time.
  const stride = rowBytes + 1;
  let pending: Buffer = Buffer.alloc(0);
  let bad = false;
  const take = (chunk: Buffer): void => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let off = 0;
    while (!bad && y < h && pending.length - off >= stride) {
      const ft = pending[off];
      cur.set(pending.subarray(off + 1, off + stride));
      if (!unfilter(ft)) { bad = true; break; }
      toGrey(cur);
      box.add(y, line);
      const t = prev; prev = cur; cur = t;
      y++; off += stride;
    }
    pending = pending.subarray(off);
  };
  const ok = await new Promise<boolean>(resolve => {
    const z = createInflate();
    z.on('data', (c: Buffer) => take(c));
    z.on('error', () => resolve(false));
    z.on('end', () => resolve(true));
    for (const d of idat) z.write(d);
    z.end();
  });
  if (!ok || bad || y < h) return null;
  box.flush();
  return box.out;
}

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

/**
 * Decode a PNG or JPEG to greyscale, at no more than the OCR's working resolution (`targetDpi`) and the OCR image limit.
 * The header is read first: an image above `MAX_DECODE_PIXELS` is refused before it is decoded. A PNG that has to be
 * shrunk is decoded a row at a time into the smaller image (`decodePngScaled`).
 */
export async function decodeBitmap(buf: Uint8Array, kind: 'png' | 'jpeg', targetDpi = OCR_WORKING_DPI): Promise<DecodedImage> {
  const lib = canvasLib();
  if (!lib) throw new Error('@napi-rs/canvas is not installed');
  const dims = checkImagePixels(buf, kind)?.[0];
  const dpi0 = kind === 'png' ? pngDpi(buf) : jpegDpi(buf);
  if (kind === 'png' && dims) {
    const s = decodeScale(dims.width, dims.height, dpi0, targetDpi);
    if (s < 1) {
      const grey = await decodePngScaled(buf, s);
      if (grey) return { grey, ...(dpi0 ? { dpi: Math.round(dpi0 * grey.width / dims.width) } : {}) };
    }
  }
  const img = await lib.loadImage(Buffer.from(buf.buffer, buf.byteOffset, buf.length));
  let w = img.width as number, h = img.height as number;
  if (w * h > MAX_DECODE_PIXELS) throw new DrawingReadError('too-large', `The image is ${w} × ${h} pixels; the reader decodes at most ${MAX_DECODE_PIXELS / 1e6} megapixels a sheet.`);
  const shrink = decodeScale(w, h, dpi0, targetDpi);
  w = Math.max(1, Math.round(w * shrink)); h = Math.max(1, Math.round(h * shrink));
  const canvas = lib.createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray;
  return { grey: rgbaToGrey(rgba, w, h), ...(dpi0 ? { dpi: Math.round(dpi0 * shrink) } : {}) };
}

/**
 * Decode every page of a TIFF (uncompressed, PackBits, LZW, CCITT G3 / G4, JPEG — what utif2 reads), one page at a time:
 * each page's size is checked from its tags before it is decoded, it is brought down to the OCR's working resolution at
 * once, and its decoded data is dropped before the next page is decoded.
 */
export function decodeTiff(buf: Uint8Array, targetDpi = OCR_WORKING_DPI): DecodedImage[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const UTIF: any = require('utif2');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ifds: any[] = UTIF.decode(ab);
  const out: DecodedImage[] = [];
  for (const ifd of ifds) {
    // reduced-resolution previews (NewSubfileType bit 0) are not sheets
    if (ifd.t254 && (ifd.t254[0] & 1)) continue;
    const tw = Number(ifd.t256?.[0] ?? 0), th = Number(ifd.t257?.[0] ?? 0);
    if (tw * th > MAX_DECODE_PIXELS) checkImagePixels(buf, 'tiff');      // throws, naming the page
    UTIF.decodeImage(ab, ifd);
    if (!ifd.width || !ifd.height || !ifd.data) continue;
    if (ifd.width * ifd.height > MAX_DECODE_PIXELS) throw new DrawingReadError('too-large', `A page of the image is ${ifd.width} × ${ifd.height} pixels; the reader decodes at most ${MAX_DECODE_PIXELS / 1e6} megapixels a sheet.`);
    let dpi: number | undefined;
    const xr = ifd.t282?.[0], unit = ifd.t296?.[0] ?? 2;
    if (typeof xr === 'number' && xr > 1) dpi = Math.round(unit === 3 ? xr * 2.54 : xr);
    const s = decodeScale(ifd.width, ifd.height, dpi, targetDpi);
    let rgba: Uint8Array | null = UTIF.toRGBA8(ifd);
    ifd.data = null;                                                     // the page's decoded samples: not needed past here
    const grey = rgbaToGreyScaled(rgba!, ifd.width, ifd.height, s);
    rgba = null;
    out.push({ grey, ...(dpi ? { dpi: s < 1 ? Math.round(dpi * grey.width / ifd.width) : dpi } : {}) });
  }
  return out;
}
