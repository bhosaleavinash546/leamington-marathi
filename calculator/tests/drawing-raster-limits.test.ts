/**
 * Raster drawings: size from the header before decoding, decoded at the OCR's working resolution, and read the right
 * way up (offline drawing reader, Nov 2026 — review F08 / D12, D09, D10).
 *
 *  - F08: an image's pixel count is read from its header (PNG IHDR, JPEG SOF, TIFF tags 256 / 257) and an image above
 *    `MAX_DECODE_PIXELS` is refused as 'too-large' (413) BEFORE it is decoded — by the service at upload and by the
 *    decoders themselves. A tiny file stating 60,000 × 60,000 pixels used to go to the decoder.
 *  - D12: a large PNG is inflated a row at a time straight into the smaller image, and every image is brought down to the
 *    OCR's working resolution (300 dpi) as it is decoded — the streamed decode is pixel-for-pixel the canvas decode.
 *  - D09: a scan lying on its side or upside down is turned before it is read (a four-turn probe on a small copy); the
 *    words are placed on the page as it lies. Proven with a stand-in engine (exact) and on a real scan with the bundled
 *    OCR engine (the material is read as on the upright sheet).
 *  - D10: a sheet's `rotationDeg` and its "turned" warning give the same figure.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-raster-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
});

import {
  imageDimensions, checkImagePixels, decodeBitmap, decodeTiff, decodePngScaled, MAX_DECODE_PIXELS, OCR_WORKING_DPI,
} from '../server/drawing/raster/render.js';
import { rgbaToGrey, turnCw, type Grey } from '../server/drawing/raster/preprocess.js';
import { ocrSheet } from '../server/drawing/raster/index.js';
import { readDrawing, DrawingReadError } from '../server/drawing/index.js';
import { startDrawingRead, drawingErrorStatus } from '../server/services/drawing-service.js';
import type { OcrEngine, OcrWord } from '../server/drawing/types.js';

const require = createRequire(import.meta.url);
const FIX = join(__dirname, 'fixtures', 'drawings');

// ─── A small PNG encoder (every colour type and bit depth, the five row filters in turn) ────────────────────────────

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
interface PngSpec { w: number; h: number; depth: number; ctype: number; px: (x: number, y: number) => number[]; plte?: number[][]; trns?: Buffer; dpi?: number; ihdrOnly?: boolean }
function png(s: PngSpec): Buffer {
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[s.ctype];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s.w, 0); ihdr.writeUInt32BE(s.h, 4); ihdr[8] = s.depth; ihdr[9] = s.ctype;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (s.dpi) { const p = Buffer.alloc(9); p.writeUInt32BE(Math.round(s.dpi / 0.0254), 0); p.writeUInt32BE(Math.round(s.dpi / 0.0254), 4); p[8] = 1; parts.push(chunk('pHYs', p)); }
  if (s.plte) parts.push(chunk('PLTE', Buffer.from(s.plte.flat())));
  if (s.trns) parts.push(chunk('tRNS', s.trns));
  if (s.ihdrOnly) { parts.push(chunk('IDAT', deflateSync(Buffer.alloc(16))), chunk('IEND', Buffer.alloc(0))); return Buffer.concat(parts); }
  const rowBytes = Math.ceil(s.w * ch * s.depth / 8), bpp = Math.max(1, (ch * s.depth) >> 3);
  const raw: number[] = [];
  let prev = new Uint8Array(rowBytes);
  for (let y = 0; y < s.h; y++) {
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < s.w; x++) {
      const v = s.px(x, y);
      for (let c = 0; c < ch; c++) {
        if (s.depth === 16) { row[(x * ch + c) * 2] = v[c] >> 8; row[(x * ch + c) * 2 + 1] = v[c] & 255; }
        else if (s.depth === 8) row[x * ch + c] = v[c];
        else { const bit = x * s.depth; row[bit >> 3] |= v[0] << (8 - s.depth - (bit & 7)); }
      }
    }
    const ft = y % 5;
    raw.push(ft);
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][ft];
      raw.push((row[i] - pred) & 255);
    }
    prev = row;
  }
  parts.push(chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** What the canvas decoder (the reader's path for a small image) gives for a PNG, as greyscale. */
async function canvasGrey(buf: Buffer): Promise<Grey> {
  const lib = require('@napi-rs/canvas');
  const img = await lib.loadImage(buf);
  const c = lib.createCanvas(img.width, img.height); const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0);
  return rgbaToGrey(ctx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
}

const W = 97, H = 61;
const shade = (x: number, y: number): number => (x * 7 + y * 13 + ((x * y) % 17) * 9) % 256;
const VARIANTS: Array<[string, PngSpec]> = [
  ['grey 8', { w: W, h: H, depth: 8, ctype: 0, px: (x, y) => [shade(x, y)] }],
  ['grey 1', { w: W, h: H, depth: 1, ctype: 0, px: (x, y) => [(x + y) % 3 === 0 ? 1 : 0] }],
  ['grey 4', { w: W, h: H, depth: 4, ctype: 0, px: (x, y) => [shade(x, y) >> 4] }],
  ['grey 16', { w: W, h: H, depth: 16, ctype: 0, px: (x, y) => [shade(x, y) * 257] }],
  ['RGB 8', { w: W, h: H, depth: 8, ctype: 2, px: (x, y) => [shade(x, y), (x * 3) % 256, (y * 5) % 256] }],
  ['RGBA 8', { w: W, h: H, depth: 8, ctype: 6, px: (x, y) => [shade(x, y), 40, 200, 255] }],
  ['palette 8', { w: W, h: H, depth: 8, ctype: 3, plte: Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 3) % 256]), px: (x, y) => [shade(x, y)] }],
  ['palette 2', { w: W, h: H, depth: 2, ctype: 3, plte: [[0, 0, 0], [90, 90, 90], [180, 180, 180], [255, 255, 255]], px: (x, y) => [(x + 2 * y) % 4] }],
];

describe('F08 — an image is sized from its header and refused above the cap before it is decoded', () => {
  const huge = png({ w: 60_000, h: 60_000, depth: 8, ctype: 0, px: () => [0], ihdrOnly: true });

  it('reads width × height from a PNG, a JPEG and a TIFF header', () => {
    expect(imageDimensions(png(VARIANTS[0][1]), 'png')).toEqual([{ width: W, height: H }]);
    const jpeg = readFileSync(join(FIX, 'gen-moulding.scan200.jpg'));
    expect(imageDimensions(jpeg, 'jpeg')).toEqual([{ width: 3307, height: 2339 }]);
    const UTIF = require('utif2');
    const tif = Buffer.from(UTIF.encodeImage(new Uint8Array(30 * 20 * 4).fill(255), 30, 20));
    expect(imageDimensions(tif, 'tiff')).toEqual([{ width: 30, height: 20 }]);
  });

  it('a tiny file stating 60,000 × 60,000 pixels is refused as too large (413) by the service at upload and by the decoder', async () => {
    expect(huge.length).toBeLessThan(200);
    expect(() => checkImagePixels(huge, 'png')).toThrow(/60,000 × 60,000 pixels \(3,600 megapixels\); the reader decodes at most 150 megapixels/);
    let err: unknown;
    try { startDrawingRead(huge, 'huge.png'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DrawingReadError);
    expect(drawingErrorStatus((err as DrawingReadError).code)).toBe(413);
    await expect(decodeBitmap(huge, 'png')).rejects.toMatchObject({ code: 'too-large' });
    // the reader on its own (CLI) refuses it too, before decoding, in words that give the cap (422 via the reader's wrapper)
    await expect(readDrawing(huge, 'huge.png', { ocrEngine: null })).rejects.toThrow(/the reader decodes at most 150 megapixels/);
  });

  it('a JPEG and a TIFF over the cap are refused from their headers', () => {
    // a JPEG: SOI, then a SOF0 frame header stating 65,000 × 65,000
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0xfd, 0xe8, 0xfd, 0xe8, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
    expect(() => checkImagePixels(sof, 'jpeg')).toThrow(/65,000 × 65,000/);
    // a TIFF: one IFD stating 50,000 × 50,000, 8-bit grey, one strip
    const t = Buffer.alloc(8 + 2 + 9 * 12 + 4 + 8);
    t.write('II', 0, 'latin1'); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4); t.writeUInt16LE(9, 8);
    const tags: Array<[number, number, number]> = [[256, 4, 50_000], [257, 4, 50_000], [258, 3, 8], [259, 3, 1], [262, 3, 1], [273, 4, 8 + 2 + 9 * 12 + 4], [277, 3, 1], [278, 4, 50_000], [279, 4, 8]];
    tags.forEach(([tag, type, v], i) => { const o = 10 + i * 12; t.writeUInt16LE(tag, o); t.writeUInt16LE(type, o + 2); t.writeUInt32LE(1, o + 4); if (type === 3) t.writeUInt16LE(v, o + 8); else t.writeUInt32LE(v, o + 8); });
    expect(() => checkImagePixels(t, 'tiff')).toThrow(/50,000 × 50,000/);
    expect(() => decodeTiff(t)).toThrow(/50,000 × 50,000/);
    expect(MAX_DECODE_PIXELS).toBeGreaterThanOrEqual(9933 * 14043);   // an A0 sheet at 300 dpi is still read
  });
});

describe('D12 — a large image is decoded straight to the OCR\'s working resolution', () => {
  it('the row-at-a-time PNG decoder gives exactly the canvas decoder\'s pixels, for every colour type and bit depth', async () => {
    for (const [name, spec] of VARIANTS) {
      const buf = png(spec);
      const mine = await decodePngScaled(buf, 1);
      expect(mine, name).not.toBeNull();
      const ref = await canvasGrey(buf);
      expect([mine!.width, mine!.height], name).toEqual([ref.width, ref.height]);
      let maxDiff = 0;
      for (let i = 0; i < ref.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(ref.data[i] - mine!.data[i]));
      expect(maxDiff, name).toBeLessThanOrEqual(1);
    }
  });

  it('shrunk, each pixel is the mean of the source pixels it covers (a box filter)', async () => {
    const buf = png(VARIANTS[0][1]);
    const half = (await decodePngScaled(buf, 0.5))!;
    const full = (await decodePngScaled(buf, 1))!;
    expect([half.width, half.height]).toEqual([49, 31]);
    const mean = (x0: number, y0: number): number => {
      let s = 0, n = 0;
      for (let y = y0; y < Math.min(H, y0 + 2); y++) for (let x = x0; x < Math.min(W, x0 + 2); x++) { s += full.data[y * W + x]; n++; }
      return Math.trunc(s / n);
    };
    for (const [x, y] of [[0, 0], [10, 7], [48, 30], [20, 15]]) expect(half.data[y * half.width + x]).toBe(mean(2 * x, 2 * y));
  });

  it('a 600 dpi scan is decoded at 300 dpi (a quarter of the pixels) and says so in its resolution', async () => {
    const buf = png({ w: 1200, h: 800, depth: 8, ctype: 0, px: (x, y) => [shade(x, y)], dpi: 600 });
    const d = await decodeBitmap(buf, 'png');
    expect([d.grey.width, d.grey.height, d.dpi]).toEqual([600, 400, OCR_WORKING_DPI]);
    // a 200 dpi scan is left as it is
    const small = await decodeBitmap(png({ w: 400, h: 300, depth: 8, ctype: 0, px: (x, y) => [shade(x, y)], dpi: 200 }), 'png');
    expect([small.grey.width, small.dpi]).toEqual([400, 200]);
    // a TIFF page too, one page at a time
    const UTIF = require('utif2');
    const tif = Buffer.from(UTIF.encodeImage(new Uint8Array(800 * 600 * 4).fill(200), 800, 600));
    const pages = decodeTiff(tif, 300);
    expect(pages).toHaveLength(1);
  });
});

// ─── Orientation with a stand-in engine: it "reads" only an upright sheet (a block of ink at its top-left corner) ───

function markedSheet(w: number, h: number): Grey {
  const g = new Uint8Array(w * h).fill(255);
  for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) g[y * w + x] = 0;           // the mark: top-left when upright
  for (let x = 0; x < w; x++) { g[(h - 5) * w + x] = 0; }                                      // a frame line
  return { data: g, width: w, height: h };
}
const standIn = (): OcrEngine & { calls: number } => {
  const e = {
    name: 'stand-in', calls: 0,
    async recognise(grey: Uint8Array, width: number, height: number): Promise<OcrWord[]> {
      e.calls++;
      // upright = the mark is in the top-left tenth of the image
      let dark = 0, n = 0;
      for (let y = 0; y < Math.ceil(height / 10); y++) for (let x = 0; x < Math.ceil(width / 10); x++) { n++; if (grey[y * width + x] < 128) dark++; }
      if (dark / n < 0.05) return [{ text: 'xq', x0: 5, y0: 5, x1: 9, y1: 12, confidence: 0.35 }];
      const sx = width / 600;
      return Array.from({ length: 16 }, (_, i) => ({ text: i === 0 ? 'MATERIAL' : `WORD${String.fromCharCode(65 + i)}XY`, x0: 100 * sx, y0: (100 + i * 20) * sx, x1: (100 + 60) * sx, y1: (100 + i * 20 + 12) * sx, confidence: 0.95, line: `1.1.${i}` }));
    },
    async close() { /* nothing */ },
  };
  return e;
};

describe('D09 — a scan lying on its side or upside down is read the right way up', () => {
  it('an upright scan is accepted on its first read (no probe)', async () => {
    const e = standIn();
    const r = await ocrSheet(e, markedSheet(600, 400), 300, 1, { clean: false, vertical: false, languages: ['eng'] });
    expect(r.orientation).toBe('upright');
    expect(r.turnedCw).toBe(0);
    expect(r.orientationScores).toBeUndefined();
    expect(e.calls).toBe(1);
  });

  for (const c of [1, 2, 3] as const) {
    it(`a scan turned ${c * 90}° anticlockwise is turned ${c} quarter${c > 1 ? 's' : ''} clockwise to read, its words placed on the page as it lies`, async () => {
      const upright = markedSheet(600, 400);
      const lying = turnCw(upright, ((4 - c) % 4) as 0 | 1 | 2 | 3);              // the scan as supplied
      const r = await ocrSheet(standIn(), lying, 300, 1, { clean: false, vertical: false, languages: ['eng'] });
      expect(r.orientation).toBe('turned');
      expect(r.turnedCw).toBe(c);
      expect(r.orientationScores!.indexOf(Math.max(...r.orientationScores!))).toBe(c);
      const mat = r.items.find(i => i.text === 'MATERIAL')!;
      expect(mat.rotation).toBe(90 * c);
      // where "MATERIAL" starts on the upright sheet (x 100 px, baseline ~112 px) → on the page as it lies (points)
      const k = 72 / 300, Wl = lying.width, Hl = lying.height;
      const [ux, uy] = [100, 112];
      // turnCw(upright, 4 − c) carries an upright point (x, y) to: c 1 → (y, Hl − x); c 2 → (Wl − x, Hl − y); c 3 → (Wl − y, x)
      const expected = c === 1 ? [uy, Hl - ux] : c === 2 ? [Wl - ux, Hl - uy] : [Wl - uy, ux];
      expect(mat.ox / k).toBeCloseTo(expected[0], -0.5);
      expect(mat.oy / k).toBeCloseTo(expected[1], -0.5);
    });
  }

  it('when no turn reads clearly the sheet is read as it lies and says its orientation is unknown', async () => {
    const blank: OcrEngine = { name: 'blank', async recognise() { return [{ text: 'zz', x0: 1, y0: 1, x1: 5, y1: 9, confidence: 0.4 }]; }, async close() { /* */ } };
    const r = await ocrSheet(blank, markedSheet(600, 400), 300, 1, { clean: false, vertical: false, languages: ['eng'] });
    expect(r.orientation).toBe('unknown');
    expect(r.turnedCw).toBe(0);
  });

  it('a vector render is never probed (its text is placed by the PDF, not guessed)', async () => {
    const e = standIn();
    const r = await ocrSheet(e, turnCw(markedSheet(600, 400), 2), 300, 1, { clean: true, vertical: false, languages: ['eng'] });
    expect(r.orientation).toBe('not-checked');
    expect(e.calls).toBe(1);
  });

  it('with the bundled OCR engine: the moulding scan turned a quarter reads the material it reads upright, and says it was turned', async () => {
    const lib = require('@napi-rs/canvas');
    const src = await decodeBitmap(readFileSync(join(FIX, 'gen-moulding.scan200.jpg')), 'jpeg');
    const toPng = (g: Grey): Buffer => {
      const cv = lib.createCanvas(g.width, g.height); const ctx = cv.getContext('2d');
      const id = ctx.createImageData(g.width, g.height);
      for (let i = 0; i < g.data.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g.data[i]; id.data[i * 4 + 3] = 255; }
      ctx.putImageData(id, 0, 0);
      return cv.toBuffer('image/png');
    };
    const mat = (e: Awaited<ReturnType<typeof readDrawing>>) => e.parameters.filter(p => p.name === 'material.designation').map(p => p.value);
    const upright = await readDrawing(toPng(src.grey), 'upright.png');
    const lying = await readDrawing(toPng(turnCw(src.grey, 1)), 'lying.png');      // turned a quarter clockwise: text reads top to bottom
    expect(mat(upright).length).toBeGreaterThan(0);
    expect(mat(lying)).toEqual(mat(upright));
    expect(lying.parameters.length).toBeGreaterThanOrEqual(upright.parameters.length - 2);
    // D10: one figure — rotationDeg and the warning agree
    expect(lying.sheets[0].rotationDeg).toBe(270);
    expect(lying.warnings.join(' ')).toMatch(/turned 270° \(its text reads top to bottom\) on its page \(found by reading the scan in all four quarter turns\)/);
    expect(upright.sheets[0].rotationDeg).toBe(0);
    expect(lying.parameters.every(p => p.method !== 'ocr' || p.status === 'needs-validation')).toBe(true);
  }, 240_000);
});

describe('D10 — one rotation figure per sheet', () => {
  it('a vector sheet drawn turned on its page: rotationDeg is the turn the warning states', async () => {
    const sm = await readDrawing(readFileSync(join(FIX, 'gen-sheetmetal.pdf')), 'gen-sheetmetal.pdf', { ocr: 'off' });
    const w = sm.warnings.find(x => /is turned/.test(x))!;
    expect(w).toMatch(/turned 90°/);
    expect(sm.sheets[0].rotationDeg).toBe(90);
    expect(sm.text.find(x => x.text === 'SEAT BRACKET LH')!.rotation).toBe(90);   // the same convention as every text item
  });
});
