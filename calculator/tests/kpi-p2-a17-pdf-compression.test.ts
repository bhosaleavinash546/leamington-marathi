/**
 * Phase 2 · A-17 (P2): the dashboard PDF stores its chart images losslessly COMPRESSED. jsPDF wrote the
 * decoded PNG pixels as raw RGB (Phase 1: 99.1 % of a 10.9 MB file). The export now creates the document
 * with `compress: true` and adds each chart with image compression 'FAST' (Flate — lossless). No new
 * package. The live size / pixel comparison is in phase2-evidence/A-17.
 */
import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { jsPDF } from 'jspdf';
import { PDF_DOC_OPTIONS, PDF_IMAGE_COMPRESSION } from '../src/ui/kpi-dashboard/kpi-export';

/** A chart-like PNG (flat colours, an anti-aliased edge) as a data URL — what canvas.toDataURL gives. */
function chartPng(w: number, h: number): string {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bar = x % 100 < 60 && y > h - x / 3;
      const edge = x % 100 === 60 ? 160 : null;
      const px = bar ? [34, 197, 94, 255] : edge !== null ? [edge, edge, edge, 255] : [255, 255, 255, 255];
      raw.set(px, y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
/** The first image XObject of a PDF: its dictionary and its stored bytes. */
function imageStream(pdf: Buffer): { dict: string; data: Buffer } {
  const s = pdf.toString('latin1');
  const re = /\d+ 0 obj\s*<</g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const st = s.indexOf('stream', m.index); const end = s.indexOf('endobj', m.index);
    if (st < 0 || st > end) continue;
    const dict = s.slice(m.index, st);
    if (!dict.includes('/Subtype /Image')) continue;
    const start = st + 6 + (s[st + 6] === '\r' ? 2 : 1);
    return { dict, data: pdf.subarray(start, start + Number(/\/Length (\d+)/.exec(dict)![1])) };
  }
  throw new Error('no image in the PDF');
}
const build = (opts: object, compression?: 'FAST') => {
  const doc = new jsPDF(opts as never);
  doc.addImage(chartPng(1000, 418), 'PNG', 10, 10, 120, 50, undefined, compression);
  return Buffer.from(doc.output('arraybuffer'));
};

describe('A-17 lossless PDF image compression', () => {
  it('the export asks jsPDF for a compressed document and Flate-compressed chart images', () => {
    expect(PDF_DOC_OPTIONS).toEqual({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    expect(PDF_IMAGE_COMPRESSION).toBe('FAST');
  });

  it('with those settings a 1000 × 418 chart is stored Flate-compressed, not as 1.25 MB of raw RGB', () => {
    const before = build({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const after = build(PDF_DOC_OPTIONS, PDF_IMAGE_COMPRESSION);
    expect(before.length).toBeGreaterThan(1_250_000);                 // 1000 × 418 × 3 bytes, uncompressed
    expect(after.length).toBeLessThan(before.length / 20);
    expect(imageStream(after).dict).toMatch(/\/Filter \/FlateDecode/);
    expect(imageStream(before).dict).not.toMatch(/\/Filter/);
  });

  it('the stored pixels decode to exactly the uncompressed ones (lossless)', () => {
    const rawOf = (pdf: Buffer, compressed: boolean) => {
      const { dict, data } = imageStream(pdf);
      const inflated = compressed ? inflateSync(data) : data;
      const pred = /\/Predictor (\d+)/.exec(dict);
      if (!pred) return inflated;
      // PNG predictors (one filter byte per row): undo them to get RGB
      const w = Number(/\/Columns (\d+)/.exec(dict)![1]); const bpp = Number(/\/Colors (\d+)/.exec(dict)![1]); const stride = w * bpp;
      const h = inflated.length / (stride + 1); const out = Buffer.alloc(stride * h); let prev = Buffer.alloc(stride);
      for (let y = 0; y < h; y++) {
        const ft = inflated[y * (stride + 1)]; const cur = Buffer.from(inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[i] = (cur[i] + (ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : ft === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
        }
        cur.copy(out, y * stride); prev = cur;
      }
      return out;
    };
    const before = rawOf(build({ orientation: 'landscape', unit: 'mm', format: 'a4' }), false);
    const after = rawOf(build(PDF_DOC_OPTIONS, PDF_IMAGE_COMPRESSION), true);
    expect(after.length).toBe(1000 * 418 * 3);
    expect(after.equals(before)).toBe(true);
  });
});
