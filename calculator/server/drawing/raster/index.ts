/**
 * OCR of one sheet: clean the image, recognise it upright and turned a quarter (vertical dimension text), and hand
 * back words as text runs in page points, plus the line work seen in the pixels. Every run carries the engine's own
 * word confidence — nothing here is ever reported as exact.
 */
import type { OcrEngine, OcrWord, RawTextItem, Segment } from '../types.js';
import { flattenAndBinarise, despeckle, estimateSkew, rotateGrey, rotate90cw, unrotatePoint, inkMask, type Grey } from './preprocess.js';
import { rasterLineWork } from './lines.js';

export interface OcrSheetResult {
  items: RawTextItem[];
  h: Segment[]; v: Segment[];
  skewDeg: number;
  words: number;
  timings: { prepMs: number; ocrMs: number };
}

/** Words below this confidence are noise on a drawing (hatching, arrowheads, geometry read as letters). */
export const MIN_WORD_CONFIDENCE = 0.3;
const JUNK = /^[\W_]+$/u;

function plausible(w: OcrWord): boolean {
  if (w.confidence < MIN_WORD_CONFIDENCE) return false;
  if (JUNK.test(w.text) && !/[±°Ø⌀+\-–]/.test(w.text)) return false;
  const bw = w.x1 - w.x0, bh = w.y1 - w.y0;
  if (bw <= 1 || bh <= 3) return false;
  // a "word" far taller than wide with several characters is a vertical string read sideways
  if (w.text.length >= 3 && bh > 2.2 * bw) return false;
  return true;
}

const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const DESCENDS = /[gjpqy,;()[\]{}|/_]/;

/**
 * One baseline and one letter height per engine text line. A word's own box depends on its letters ("s," hangs
 * below the line, "AIR" does not): words of the same line must share a baseline or they are not re-assembled.
 */
function lineMetrics(words: OcrWord[]): Map<OcrWord, { base: number; cap: number }> {
  const byLine = new Map<string, OcrWord[]>();
  words.forEach((w, i) => { const k = w.line ?? `w${i}`; const g = byLine.get(k); if (g) g.push(w); else byLine.set(k, [w]); });
  const out = new Map<OcrWord, { base: number; cap: number }>();
  for (const g of byLine.values()) {
    const clean = g.filter(w => /[A-Z0-9]/.test(w.text) && !DESCENDS.test(w.text));
    const maxH = Math.max(...g.map(w => w.y1 - w.y0));
    // on a noisy scan the engine's word boxes are often too tall, never too short: take the lower quartile
    const hs = clean.filter(w => w.text.length >= 2).map(w => w.y1 - w.y0).sort((a, b) => a - b);
    const cap = hs.length ? hs[Math.floor((hs.length - 1) * 0.25)] : clean.length ? median(clean.map(w => w.y1 - w.y0)) : maxH * 0.75;
    // the baseline: where the words of ordinary height end (an inflated box hangs lower)
    const sane = clean.filter(w => w.y1 - w.y0 <= 1.25 * cap);
    const base = sane.length ? median(sane.map(w => w.y1)) : clean.length ? median(clean.map(w => w.y1)) : Math.max(...g.map(w => w.y1)) - 0.2 * maxH;
    for (const w of g) {
      // a word whose box does not even touch the line's band belongs to another row (the engine joined two): it keeps its own box
      const own = w.y0 > base || w.y1 < base - cap;
      out.set(w, own ? { base: w.y1, cap: Math.min(w.y1 - w.y0, cap * 1.4) } : { base, cap });
    }
  }
  return out;
}

function overlapShare(a: OcrWord, b: OcrWord): number {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.max(1, Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)));
}

/**
 * @param grey   the sheet as pixels
 * @param dpi    pixels per inch of `grey` (page points = px × 72 / dpi)
 * @param clean  true for a vector render (no deskew, no flattening)
 */
export async function ocrSheet(engine: OcrEngine, grey: Grey, dpi: number, sheet: number,
  opts: { clean: boolean; vertical: boolean; languages: string[] }): Promise<OcrSheetResult> {
  const t0 = Date.now();
  let work = grey, skew = 0, ink: Uint8Array;
  if (opts.clean) ink = inkMask(grey);
  else {
    const first = flattenAndBinarise(grey);
    skew = estimateSkew(first.ink, grey.width, grey.height);
    if (Math.abs(skew) >= 0.08) {
      const again = flattenAndBinarise(rotateGrey(grey, skew));
      work = again.grey; ink = again.ink;
    } else { skew = 0; work = first.grey; ink = first.ink; }
    despeckle(ink, work);
  }
  const { width: W, height: H } = work;
  const lw = rasterLineWork(ink, W, H, Math.round(dpi * 0.3));
  const t1 = Date.now();

  const upright = (await engine.recognise(work.data, W, H, { dpi, languages: opts.languages })).filter(plausible);
  let turned: OcrWord[] = [];
  if (opts.vertical) {
    const q = rotate90cw(work);
    // a word at (x, y) of the turned image sits at (y, H − 1 − x) of the upright one
    turned = (await engine.recognise(q.data, q.width, q.height, { dpi, languages: opts.languages })).filter(plausible)
      .filter(w => w.confidence >= 0.55 && /[A-Za-z0-9]/.test(w.text));
  }
  const t2 = Date.now();
  // The same ink is read in both passes: keep the reading the engine is surer of.
  const turnedBoxes = turned.map(w => ({ w, box: { text: w.text, confidence: w.confidence, x0: w.y0, y0: H - w.x1, x1: w.y1, y1: H - w.x0 } as OcrWord }));
  const keepUp = upright.filter(u => !turnedBoxes.some(t => overlapShare(u, t.box) > 0.3 && t.box.confidence > u.confidence + 0.1));
  const keepTurned = turnedBoxes.filter(t => !upright.some(u => overlapShare(u, t.box) > 0.3 && u.confidence + 0.1 >= t.box.confidence));

  const k = 72 / dpi;
  const toPage = (x: number, y: number): [number, number] => {
    const [ox, oy] = skew ? unrotatePoint(x, y, W, H, skew) : [x, y];
    return [ox * k, oy * k];
  };
  const items: RawTextItem[] = [];
  const upM = lineMetrics(upright), turnedM = lineMetrics(turned);
  for (const w of keepUp) {
    const m = upM.get(w) ?? { base: w.y1, cap: w.y1 - w.y0 };
    const [ox, oy] = toPage(w.x0, m.base);
    items.push({ text: w.text, sheet, ox, oy, width: (w.x1 - w.x0) * k, size: Math.max(2, m.cap * k / 0.72), rotation: 0, method: 'ocr', reliability: w.confidence });
  }
  for (const { w, box } of keepTurned) {
    // reading bottom to top: in the upright image the baseline is a vertical line on the right of the word, starting
    // at its bottom. A point (x, y) of the turned image is (y, H − x) upright.
    const m = turnedM.get(w) ?? { base: w.y1, cap: w.y1 - w.y0 };
    const [ox, oy] = toPage(m.base, box.y1);
    items.push({ text: w.text, sheet, ox, oy, width: (w.x1 - w.x0) * k, size: Math.max(2, m.cap * k / 0.72), rotation: 90, method: 'ocr', reliability: w.confidence });
  }
  const seg = (s: Segment): Segment => {
    const [x0, y0] = toPage(s.x0, s.y0), [x1, y1] = toPage(s.x1, s.y1);
    return { x0, y0, x1, y1 };
  };
  // After deskew the runs are axis-aligned in the straightened frame; mapped back they keep the sheet's small skew.
  // The layout works in the straightened frame, so keep them axis-aligned there (average the cross coordinate).
  const hSegs = lw.h.map(seg).map(s => ({ x0: Math.min(s.x0, s.x1), y0: (s.y0 + s.y1) / 2, x1: Math.max(s.x0, s.x1), y1: (s.y0 + s.y1) / 2 }));
  const vSegs = lw.v.map(seg).map(s => ({ x0: (s.x0 + s.x1) / 2, y0: Math.min(s.y0, s.y1), x1: (s.x0 + s.x1) / 2, y1: Math.max(s.y0, s.y1) }));
  return { items, h: hSegs, v: vSegs, skewDeg: skew, words: items.length, timings: { prepMs: t1 - t0, ocrMs: t2 - t1 } };
}
