/**
 * OCR of one sheet: clean the image, find which way up it is (a scan), recognise it upright and turned a quarter
 * (vertical dimension text), and hand back words as text runs in page points, plus the line work seen in the pixels.
 * Every run carries the engine's own word confidence — nothing here is ever reported as exact.
 *
 * Which way up (review D09, Nov 2026): a scan can lie on its side or upside down. When the upright read is not clearly
 * text, a small copy of the sheet (~100 dpi) is read in all four quarter turns and the turn with by far the most
 * confident words is the one read at full size. Measured on the reliability set: the right turn scores 6–10× the
 * next one; an upright scan reads clearly at once and costs no probe. When no turn stands out the sheet is read as it
 * lies and the result says its orientation is unknown.
 */
import type { OcrEngine, OcrWord, RawTextItem, Segment } from '../types.js';
import { flattenAndBinarise, despeckle, estimateSkew, rotateGrey, rotate90cw, unrotatePoint, inkMask, turnCw, unturnPoint, shrinkGrey, type Grey } from './preprocess.js';
import { rasterLineWork } from './lines.js';

/** How the sheet was found to lie: read as it is (clearly text), turned to read it, or no turn read clearly. */
export type SheetOrientation = 'upright' | 'turned' | 'unknown' | 'not-checked';

export interface OcrSheetResult {
  items: RawTextItem[];
  h: Segment[]; v: Segment[];
  skewDeg: number;
  words: number;
  /** Quarter turns clockwise the sheet was given before it was read (0–3). */
  turnedCw: 0 | 1 | 2 | 3;
  orientation: SheetOrientation;
  /** The four-turn probe's score per clockwise turn, when it ran (for the record and the tests). */
  orientationScores?: number[];
  timings: { prepMs: number; ocrMs: number };
}

/** A word that counts as text for the orientation test: confident and at least three letters or digits. */
const alnum = (t: string): number => (t.match(/[A-Za-z0-9]/g) ?? []).length;
/** The orientation score of a read: confident words, weighted by length (capped), and the plain words among them. */
export function orientationScore(words: OcrWord[]): { score: number; plainWords: number } {
  let score = 0, plainWords = 0;
  for (const w of words) {
    if (w.confidence < 0.6 || alnum(w.text) < 3) continue;
    score += (w.confidence - 0.5) * Math.min(12, alnum(w.text));
    if (/^[A-Za-z]{4,}[.,:]?$/.test(w.text)) plainWords++;
  }
  return { score, plainWords };
}
/**
 * Thresholds of the orientation test (CostVision engineering heuristic, set on the reliability set's scans — upright
 * reads score 110–170 with 28–46 plain words; a sheet on its side or upside down scores under 35 with under 8):
 * the upright read is accepted at once at 12 plain words and a score of 40; a turn is taken only when it scores at
 * least 20 and twice every other turn.
 */
const CLEARLY_TEXT = { plainWords: 12, score: 40 };
const TURN_MIN_SCORE = 20, TURN_MARGIN = 2;
/** The resolution of the four-turn probe (a small copy: four reads of it cost about one full read). */
const PROBE_DPI = 100, PROBE_MAX_PIXELS = 3_000_000;

export interface OcrSheetOptions {
  clean: boolean; vertical: boolean; languages: string[];
  /** Find which way up the sheet is before reading it. Default: on for a scan (`clean` false), off for a render. */
  orient?: boolean;
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
export async function ocrSheet(engine: OcrEngine, grey: Grey, dpi: number, sheet: number, opts: OcrSheetOptions): Promise<OcrSheetResult> {
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

  // Which way up: the read as it lies first; the four-turn probe only when that read is not clearly text.
  const asItLies = await engine.recognise(work.data, W, H, { dpi, languages: opts.languages });
  let c: 0 | 1 | 2 | 3 = 0;
  let orientation: SheetOrientation = 'not-checked';
  let orientationScores: number[] | undefined;
  if (opts.orient ?? !opts.clean) {
    const first = orientationScore(asItLies);
    if (first.plainWords >= CLEARLY_TEXT.plainWords && first.score >= CLEARLY_TEXT.score) orientation = 'upright';
    else {
      const s = Math.min(1, PROBE_DPI / dpi, Math.sqrt(PROBE_MAX_PIXELS / Math.max(1, W * H)));
      let probe = shrinkGrey(work, s);
      orientationScores = [];
      for (let k = 0; k < 4; k++) {
        orientationScores.push(+orientationScore(await engine.recognise(probe.data, probe.width, probe.height, { dpi: dpi * s, languages: opts.languages })).score.toFixed(1));
        if (k < 3) probe = rotate90cw(probe);
      }
      const best = orientationScores.indexOf(Math.max(...orientationScores)) as 0 | 1 | 2 | 3;
      const others = Math.max(0, ...orientationScores.filter((_, k) => k !== best));
      if (orientationScores[best] >= TURN_MIN_SCORE && orientationScores[best] >= TURN_MARGIN * others) {
        c = best; orientation = best === 0 ? 'upright' : 'turned';
      } else orientation = 'unknown';
    }
  }
  // The sheet as it is read: turned `c` quarters clockwise. Positions are mapped back to the sheet as it lies.
  const img = turnCw(work, c);
  const IW = img.width, IH = img.height;
  const upright = (c === 0 ? asItLies : await engine.recognise(img.data, IW, IH, { dpi, languages: opts.languages })).filter(plausible);
  let turned: OcrWord[] = [];
  if (opts.vertical) {
    const q = rotate90cw(img);
    // a word at (x, y) of the turned image sits at (y, IH − 1 − x) of the upright one
    turned = (await engine.recognise(q.data, q.width, q.height, { dpi, languages: opts.languages })).filter(plausible)
      .filter(w => w.confidence >= 0.55 && /[A-Za-z0-9]/.test(w.text));
  }
  const t2 = Date.now();
  // The same ink is read in both passes: keep the reading the engine is surer of.
  const turnedBoxes = turned.map(w => ({ w, box: { text: w.text, confidence: w.confidence, x0: w.y0, y0: IH - w.x1, x1: w.y1, y1: IH - w.x0 } as OcrWord }));
  const keepUp = upright.filter(u => !turnedBoxes.some(t => overlapShare(u, t.box) > 0.3 && t.box.confidence > u.confidence + 0.1));
  const keepTurned = turnedBoxes.filter(t => !upright.some(u => overlapShare(u, t.box) > 0.3 && u.confidence + 0.1 >= t.box.confidence));

  const k = 72 / dpi;
  /** A point of the image as read (turned) → the straightened sheet as it lies → page points. */
  const toPage = (x: number, y: number): [number, number] => {
    const [ux, uy] = unturnPoint(x, y, c, W, H);
    const [ox, oy] = skew ? unrotatePoint(ux, uy, W, H, skew) : [ux, uy];
    return [ox * k, oy * k];
  };
  /** Line work was found on the sheet as it lies: no turn to undo. */
  const segToPage = (x: number, y: number): [number, number] => {
    const [ox, oy] = skew ? unrotatePoint(x, y, W, H, skew) : [x, y];
    return [ox * k, oy * k];
  };
  const turnDeg = 90 * c;
  const items: RawTextItem[] = [];
  const upM = lineMetrics(upright), turnedM = lineMetrics(turned);
  for (const w of keepUp) {
    const m = upM.get(w) ?? { base: w.y1, cap: w.y1 - w.y0 };
    const [ox, oy] = toPage(w.x0, m.base);
    items.push({ text: w.text, sheet, ox, oy, width: (w.x1 - w.x0) * k, size: Math.max(2, m.cap * k / 0.72), rotation: turnDeg % 360, method: 'ocr', reliability: w.confidence });
  }
  for (const { w, box } of keepTurned) {
    // reading bottom to top: in the upright image the baseline is a vertical line on the right of the word, starting
    // at its bottom. A point (x, y) of the turned image is (y, IH − x) upright.
    const m = turnedM.get(w) ?? { base: w.y1, cap: w.y1 - w.y0 };
    const [ox, oy] = toPage(m.base, box.y1);
    items.push({ text: w.text, sheet, ox, oy, width: (w.x1 - w.x0) * k, size: Math.max(2, m.cap * k / 0.72), rotation: (90 + turnDeg) % 360, method: 'ocr', reliability: w.confidence });
  }
  const seg = (s: Segment): Segment => {
    const [x0, y0] = segToPage(s.x0, s.y0), [x1, y1] = segToPage(s.x1, s.y1);
    return { x0, y0, x1, y1 };
  };
  // After deskew the runs are axis-aligned in the straightened frame; mapped back they keep the sheet's small skew.
  // The layout works in the straightened frame, so keep them axis-aligned there (average the cross coordinate).
  const hSegs = lw.h.map(seg).map(s => ({ x0: Math.min(s.x0, s.x1), y0: (s.y0 + s.y1) / 2, x1: Math.max(s.x0, s.x1), y1: (s.y0 + s.y1) / 2 }));
  const vSegs = lw.v.map(seg).map(s => ({ x0: (s.x0 + s.x1) / 2, y0: Math.min(s.y0, s.y1), x1: (s.x0 + s.x1) / 2, y1: Math.max(s.y0, s.y1) }));
  return { items, h: hSegs, v: vSegs, skewDeg: skew, words: items.length, turnedCw: c, orientation,
    ...(orientationScores ? { orientationScores } : {}), timings: { prepMs: t1 - t0, ocrMs: t2 - t1 } };
}
