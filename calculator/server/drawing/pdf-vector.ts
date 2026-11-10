/**
 * The vector-PDF path: exact text with position, size and rotation for every sheet, and the straight line work the
 * layout needs (border, title-block grid, tables, feature-control frames). Nothing here is recognised from pixels.
 */
import type { RawTextItem, Segment, SheetData, BBox } from './types.js';
import { assembleLines } from './text-lines.js';
import { mergeAxisSegments, snapRotation, r2 } from './geom.js';
import { classifySheet } from './ingest.js';
import { loadPdfJs, type PdfDocument, type PdfPage } from './pdfjs.js';
import { GDT_FONT_MAP, GDT_FONT_NAME } from './symbol-fonts.js';

type M6 = [number, number, number, number, number, number];
const mul = (a: M6, b: M6): M6 => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M6, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const MAX_SEGMENTS = 250_000;
const MIN_SEG = 3;

interface Contour { x: number; y: number; s: number }
interface LineWork {
  h: Segment[]; v: Segment[]; o: Segment[]; pathOps: number; contours: Contour[]; strokes: Contour[]; imageCoverage: number;
  /** Characters the page's text operators show, and how many of them no one can see (D02). */
  textShown: number; textHidden: number;
}

/** Walk the page's operator list for straight segments and image placements, in top-left page points. */
async function lineWork(page: PdfPage, OPS: Record<string, number>, vpT: M6, pageW: number, pageH: number): Promise<LineWork> {
  const ops = await page.getOperatorList();
  const h: Segment[] = [], v: Segment[] = [], o: Segment[] = [];
  let ctm: M6 = [1, 0, 0, 1, 0, 0];
  const stack: M6[] = [];
  let pathOps = 0, imgArea = 0, total = 0, annotationDepth = 0;
  // Text that is shown but not seen: render mode 3 / 7 (invisible — what a scanner's "searchable PDF" layer uses), or
  // painted before an image that covers most of the page. Such a layer is the scanner's OCR, not the drawing's text.
  let textMode = 0, textShown = 0, textHidden = 0, visibleUncovered = 0;
  const modeStack: number[] = [];
  const contours: Contour[] = [];
  /** Small STROKED sub-paths with a turn or a curve in them: the letters of a stroke ("single-line") font (D01). */
  const strokes: Contour[] = [];
  const push = (x0: number, y0: number, x1: number, y1: number): void => {
    if (total >= MAX_SEGMENTS) return;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < MIN_SEG) return;
    total++;
    if (Math.abs(dy) <= 0.35 && Math.abs(dy) <= 0.01 * len + 0.2) h.push({ x0: Math.min(x0, x1), y0: (y0 + y1) / 2, x1: Math.max(x0, x1), y1: (y0 + y1) / 2 });
    else if (Math.abs(dx) <= 0.35 && Math.abs(dx) <= 0.01 * len + 0.2) v.push({ x0: (x0 + x1) / 2, y0: Math.min(y0, y1), x1: (x0 + x1) / 2, y1: Math.max(y0, y1) });
    else o.push({ x0: r2(x0), y0: r2(y0), x1: r2(x1), y1: r2(y1) });
  };
  const n = ops.fnArray.length;
  for (let i = 0; i < n; i++) {
    const fn = ops.fnArray[i]; const args = ops.argsArray[i];
    if (fn === OPS.save) { stack.push(ctm); modeStack.push(textMode); }
    else if (fn === OPS.restore) { const t = stack.pop(); if (t) ctm = t; const tm = modeStack.pop(); if (tm !== undefined) textMode = tm; }
    else if (fn === OPS.setTextRenderingMode) textMode = Number(args?.[0]) || 0;
    else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      if (annotationDepth) continue;
      const glyphs = args?.[0] as Array<{ unicode?: string; isSpace?: boolean } | number> | undefined;
      let n = 0;
      if (Array.isArray(glyphs)) for (const g of glyphs) if (g && typeof g === 'object' && !g.isSpace && g.unicode && g.unicode.trim()) n++;
      textShown += n;
      if (textMode === 3 || textMode === 7) textHidden += n; else visibleUncovered += n;
    }
    else if (fn === OPS.transform) ctm = mul(ctm, args as M6);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args?.[0]) ctm = mul(ctm, Array.from(args[0] as number[]) as M6); }
    else if (fn === OPS.paintFormXObjectEnd) { const t = stack.pop(); if (t) ctm = t; }
    else if (fn === OPS.beginAnnotation) { stack.push(ctm); annotationDepth++; }
    else if (fn === OPS.endAnnotation) { const t = stack.pop(); if (t) ctm = t; annotationDepth = Math.max(0, annotationDepth - 1); }
    else if (fn === OPS.constructPath) {
      if (annotationDepth) continue;
      const paint = args[0] as number;
      if (paint === OPS.endPath) continue;                      // a clip path, not drawn
      const data = args[1]?.[0] as Float32Array | undefined;
      if (!data) continue;
      pathOps++;
      const m = mul(vpT, ctm);
      const filled = paint !== OPS.stroke && paint !== OPS.closeStroke;
      let cx = 0, cy = 0, sx = 0, sy = 0, has = false;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, pieces = 0, curved = false;
      const see = (x: number, y: number): void => { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; };
      const endContour = (): void => {
        // A glyph drawn as geometry: a small contour made of several pieces (an arrowhead has three, a dash one).
        const w = bx1 - bx0, hh = by1 - by0, big = Math.max(w, hh);
        if (pieces >= 5 && filled && big <= 30 && big >= 2.5 && contours.length < 60_000) contours.push({ x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, s: big });
        // A stroke-font letter is an open polyline (or arc) of letter size. A lone straight piece (a hatch line, a dash
        // of a hidden line, one arm of a centre mark) is never counted itself: hatching and dashed lines come in runs.
        // A small closed round outline (a hole or a bolt-circle drawn as a polygon or arcs) is not a letter either.
        else if (!filled && (pieces >= 2 || curved) && big <= 16 && big >= 1.2 && strokes.length < 60_000
          && !(Math.hypot(cx - sx, cy - sy) <= 0.05 * big && pieces >= 8 && Math.min(w, hh) >= 0.85 * big)) strokes.push({ x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, s: big });
        bx0 = Infinity; by0 = Infinity; bx1 = -Infinity; by1 = -Infinity; pieces = 0; curved = false;
      };
      for (let k = 0; k < data.length;) {
        const op = data[k++];
        if (op === 0) { if (has) endContour(); [cx, cy] = apply(m, data[k], data[k + 1]); k += 2; sx = cx; sy = cy; has = true; see(cx, cy); }
        else if (op === 1) { const [x, y] = apply(m, data[k], data[k + 1]); k += 2; if (has) push(cx, cy, x, y); cx = x; cy = y; has = true; see(x, y); pieces++; }
        else if (op === 2) { see(...apply(m, data[k], data[k + 1])); see(...apply(m, data[k + 2], data[k + 3])); [cx, cy] = apply(m, data[k + 4], data[k + 5]); k += 6; see(cx, cy); pieces += 2; curved = true; }
        else if (op === 3) { see(...apply(m, data[k], data[k + 1])); [cx, cy] = apply(m, data[k + 2], data[k + 3]); k += 4; see(cx, cy); pieces += 2; curved = true; }
        else if (op === 4) { if (has) push(cx, cy, sx, sy); cx = sx; cy = sy; pieces++; }
        else break;                                             // unknown opcode: stop reading this path
      }
      if (has) endContour();
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      if (annotationDepth) continue;
      const m = mul(vpT, ctm);
      const pts = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
      const x0 = Math.max(0, Math.min(...pts.map(p => p[0]))), x1 = Math.min(pageW, Math.max(...pts.map(p => p[0])));
      const y0 = Math.max(0, Math.min(...pts.map(p => p[1]))), y1 = Math.min(pageH, Math.max(...pts.map(p => p[1])));
      if (x1 > x0 && y1 > y0) {
        imgArea += (x1 - x0) * (y1 - y0);
        // an opaque image over most of the page hides the text painted before it
        if (fn === OPS.paintImageXObject && (x1 - x0) * (y1 - y0) >= 0.8 * pageW * pageH) { textHidden += visibleUncovered; visibleUncovered = 0; }
      }
    }
  }
  return {
    h: mergeAxisSegments(h, true), v: mergeAxisSegments(v, false), o,
    pathOps, contours, strokes, imageCoverage: Math.min(1, imgArea / Math.max(1, pageW * pageH)), textShown, textHidden,
  };
}

/**
 * How many glyph-sized filled contours sit in a run of text AWAY from the sheet's selectable text: each has at least
 * two neighbours of similar size within about a letter and a half, and no text line near it. Arrowheads, hole circles
 * and dashes are small too, but they do not come in runs; symbols drawn beside real text (a geometric-tolerance
 * symbol, a circled modifier) are near a text line and are not counted.
 */
function glyphRuns(contours: Contour[], textBoxes: BBox[]): number {
  if (contours.length < 3) return 0;
  const cell = 24;
  const key = (a: number, b: number): number => a * 100_003 + b;
  const grid = new Map<number, number[]>();
  contours.forEach((c, i) => {
    const k = key(Math.floor(c.x / cell), Math.floor(c.y / cell));
    const g = grid.get(k); if (g) g.push(i); else grid.set(k, [i]);
  });
  const textGrid = new Map<number, BBox[]>();
  for (const b of textBoxes) {
    for (let a = Math.floor((b[0] - 30) / cell); a <= Math.floor((b[2] + 30) / cell); a++) for (let c = Math.floor((b[1] - 30) / cell); c <= Math.floor((b[3] + 30) / cell); c++) {
      const g = textGrid.get(key(a, c)); if (g) g.push(b); else textGrid.set(key(a, c), [b]);
    }
  }
  let count = 0;
  for (let i = 0; i < contours.length; i++) {
    const c = contours[i];
    const gx = Math.floor(c.x / cell), gy = Math.floor(c.y / cell);
    const pad = Math.max(10, 2.5 * c.s);
    if ((textGrid.get(key(gx, gy)) ?? []).some(b => c.x >= b[0] - pad && c.x <= b[2] + pad && c.y >= b[1] - pad && c.y <= b[3] + pad)) continue;
    const reach = Math.ceil((1.6 * c.s) / cell);
    let near = 0;
    for (let a = gx - reach; a <= gx + reach && near < 2; a++) for (let b = gy - reach; b <= gy + reach && near < 2; b++) {
      const g = grid.get(key(a, b)); if (!g) continue;
      for (const j of g) {
        if (j === i) continue;
        const o = contours[j];
        if (o.s < 0.5 * c.s || o.s > 2 * c.s) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d <= 1.6 * c.s && d >= 0.15 * c.s) { near++; if (near >= 2) break; }
      }
    }
    if (near >= 2) count++;
  }
  return count;
}

/** Text runs of a page with their baseline, size and rotation, in top-left page points. */
async function textRuns(page: PdfPage, vpT: M6, sheet: number): Promise<RawTextItem[]> {
  const tc = await page.getTextContent({ includeMarkedContent: false, disableNormalization: true });
  const fontNames = new Map<string, string | undefined>();
  const realFont = (id: string): string | undefined => {
    if (!fontNames.has(id)) {
      let name: string | undefined;
      try { const f = page.commonObjs.has(id) ? page.commonObjs.get(id) : undefined; name = typeof f?.name === 'string' ? f.name : undefined; } catch { name = undefined; }
      fontNames.set(id, name ? name.replace(/^[A-Z]{6}\+/, '') : undefined);
    }
    return fontNames.get(id);
  };
  const out: RawTextItem[] = [];
  for (const it of tc.items as Array<{ str?: string; transform: number[]; width: number; height: number; fontName: string }>) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const m = mul(vpT, it.transform as M6);
    const size = Math.hypot(m[2], m[3]);
    const adv = Math.hypot(m[0], m[1]);
    if (!(size > 0.5) || !(adv > 0)) continue;
    const scale = adv / Math.hypot(it.transform[0], it.transform[1]);
    const rotation = snapRotation(-Math.atan2(m[1], m[0]) * 180 / Math.PI);
    const font = realFont(it.fontName);
    // Symbol fonts that follow the ASME Y14.5 letter convention: their letters ARE symbols (see extract/gdt.ts).
    const symbolFont = !!font && GDT_FONT_NAME.test(font);
    const str = symbolFont ? [...it.str].map(ch => GDT_FONT_MAP[ch] ?? ch).join('') : it.str;
    out.push({
      text: str, sheet, ox: m[4], oy: m[5], width: it.width * scale, size, rotation, method: 'pdf-text', reliability: 1,
      ...(font ? { font } : {}), ...(symbolFont ? { symbol: true } : {}),
    });
  }
  return out;
}

export interface PdfSheet extends SheetData { pageNumber: number }

/** Read one page: text runs, line work, statistics and the content class. */
export async function readPdfPage(doc: PdfDocument, pageNumber: number, startLineId: number): Promise<PdfSheet> {
  const { pdfjs } = await loadPdfJs();
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const vpT = vp.transform as M6;
  // The operator list is read first: it loads the fonts, which gives the text runs their real font names.
  const lw = await lineWork(page, pdfjs.OPS, vpT, vp.width, vp.height);
  const items = await textRuns(page, vpT, pageNumber);
  const textChars = items.reduce((s, it) => s + it.text.replace(/\s/g, '').length, 0);
  const lines = assembleLines(items, lw, startLineId);
  const boxes = lines.map(l => l.bbox);
  const stats = {
    pathOps: lw.pathOps, glyphLikePaths: glyphRuns(lw.contours, boxes), strokeGlyphPaths: glyphRuns(lw.strokes, boxes),
    imageCoverage: r2(lw.imageCoverage), textChars,
    hiddenTextShare: lw.textShown ? r2(lw.textHidden / lw.textShown) : 0,
  };
  page.cleanup();
  return {
    pageNumber,
    info: {
      sheet: pageNumber, widthPt: r2(vp.width), heightPt: r2(vp.height),
      content: classifySheet({ ...stats, textItems: items.length }),
      textItemCount: items.length, rotationDeg: ((page.rotate % 360) + 360) % 360,
    },
    items, lines, hSegs: lw.h, vSegs: lw.v, oSegs: lw.o, stats,
  };
}

export function sheetBox(s: SheetData): BBox { return [0, 0, s.info.widthPt, s.info.heightPt]; }
