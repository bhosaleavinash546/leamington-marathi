/**
 * Generates the CONTROLLED fixture drawings for the offline drawing reader (tests/fixtures/drawings/gen-*).
 *
 *   npx tsx scripts/drawings/make-fixture-drawings.ts [outDir]
 *
 * One sheet per commodity family, drawn as a CAD export would be: frame, zone grid, title block (three layouts,
 * English and German), numbered notes, revision table, dimensioned views with real line work, feature-control
 * frames. From each it writes
 *   gen-<name>.pdf            vector PDF, selectable text
 *   gen-<name>.curves.pdf     the same sheet with every string drawn as glyph outlines (no text layer)
 *   gen-<name>.scan200.pdf    the sheet rendered at 200 dpi, turned by a small skew, with scanner noise, as a JPEG in a PDF
 *   gen-<name>.truth.json     what is written on the sheet — typed here by hand, beside the drawing content
 * plus two 300 dpi scans and one bare PNG. Output is deterministic (fixed dates, fixed noise seed).
 *
 * The truth for these sheets is circular for TEXT READING (we wrote the text), so the accuracy report prints them
 * apart from the public drawings. What they do prove is layout, grammar and re-assembly on controlled content.
 *
 * Fonts (embedded as subsets by jsPDF; nothing is added to the product):
 *   DejaVu Sans (Bitstream Vera licence, read from the system) for text, and scripts/drawings/fonts/cv-drawing-symbols.ttf
 *   for the three ISO 1101 symbols DejaVu Sans lacks — position ⌖, the maximum-material modifier Ⓜ and perpendicularity
 *   ⟂. That font is drawn by scripts/drawings/make-symbol-font.py (our own outlines, CC0): no GPL-licensed font is read
 *   or embedded. Override with CV_FIXTURE_FONT / CV_FIXTURE_SYMBOL_FONT.
 *
 * The `real-*` sheets are drawings written for real parts of cad-audit/parts (the same envelope, holes and gauge the
 * kernel measures), with a material, tolerance, heat treatment and finish that differ from the costing's defaults —
 * the combined-flow tests cost those parts with them. Vector PDF only.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPdf, closePdf } from '../../server/drawing/ingest.js';
import { renderPdfPage } from '../../server/drawing/raster/render.js';
import { rotateGrey, type Grey } from '../../server/drawing/raster/preprocess.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { jsPDF }: any = require('jspdf');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opentype: any = require('opentype.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const canvasLib: any = require('@napi-rs/canvas');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(HERE, '..', '..', 'tests', 'fixtures', 'drawings');
const TEXT_FONT = process.env.CV_FIXTURE_FONT ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const SYM_FONT = process.env.CV_FIXTURE_SYMBOL_FONT ?? join(HERE, 'fonts', 'cv-drawing-symbols.ttf');

const MM = 72 / 25.4;

// ── Pen: one drawing API, two ways of putting text on the page ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Font = any;
interface TextOpts { angle?: number; align?: 'left' | 'center' | 'right' }

/** Advance of a string, glyph by glyph (no shaping, no kerning — what a CAD plot does, and what jsPDF writes). */
function advance(f: Font, s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += (f.charToGlyph(ch).advanceWidth ?? 0) * size / f.unitsPerEm;
  return w;
}

class Pen {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  private pageH: number;
  constructor(public W: number, public H: number, private mode: 'text' | 'curves', private turned: boolean,
    private tf: Font, private sf: Font, textB64: string, symB64: string) {
    const pw = turned ? H : W, ph = turned ? W : H;
    this.pageH = ph;
    this.doc = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait', compress: true });
    this.doc.setCreationDate(new Date(Date.UTC(2026, 10, 9, 12, 0, 0)));
    this.doc.setFileId('C0577151000000000000000000000001');
    this.doc.setProperties({ title: 'CostVision fixture drawing', creator: 'scripts/drawings/make-fixture-drawings.ts' });
    if (mode === 'text') {
      this.doc.addFileToVFS('text.ttf', textB64); this.doc.addFont('text.ttf', 'FixText', 'normal');
      this.doc.addFileToVFS('sym.ttf', symB64); this.doc.addFont('sym.ttf', 'FixSym', 'normal');
    }
    this.doc.setLineCap(0);
  }
  /** Sheet coordinates (landscape, top-left origin) → page coordinates. */
  p(x: number, y: number): [number, number] { return this.turned ? [y, this.W - x] : [x, y]; }
  line(x0: number, y0: number, x1: number, y1: number, w = 0.5): void {
    this.doc.setLineWidth(w);
    const [a, b] = this.p(x0, y0), [c, d] = this.p(x1, y1);
    this.doc.line(a, b, c, d);
  }
  rect(x: number, y: number, w: number, h: number, lw = 0.5): void {
    this.line(x, y, x + w, y, lw); this.line(x + w, y, x + w, y + h, lw); this.line(x + w, y + h, x, y + h, lw); this.line(x, y + h, x, y, lw);
  }
  circle(cx: number, cy: number, r: number, lw = 0.7): void { this.doc.setLineWidth(lw); const [a, b] = this.p(cx, cy); this.doc.circle(a, b, r, 'S'); }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    const [a, b] = this.p(x0, y0), [c, d] = this.p(x1, y1), [e, f] = this.p(x2, y2);
    this.doc.setFillColor(0, 0, 0); this.doc.triangle(a, b, c, d, e, f, 'F');
  }
  private runs(s: string): Array<{ t: string; sym: boolean }> {
    const out: Array<{ t: string; sym: boolean }> = [];
    for (const ch of s) {
      const sym = ch !== ' ' && this.tf.charToGlyphIndex(ch) <= 0;
      const last = out[out.length - 1];
      if (last && last.sym === sym) last.t += ch; else out.push({ t: ch, sym });
    }
    return out;
  }
  width(s: string, size: number): number {
    return this.runs(s).reduce((w, r) => w + advance(r.sym ? this.sf : this.tf, r.t, size), 0);
  }
  /** Text with its baseline starting at (x, y) in sheet coordinates. `angle` is counter-clockwise on the sheet. */
  text(s: string, x: number, y: number, size: number, o: TextOpts = {}): void {
    const ang = o.angle ?? 0;
    const w = this.width(s, size);
    const rad = ang * Math.PI / 180, dx = Math.cos(rad), dy = -Math.sin(rad);
    let sx = x, sy = y;
    if (o.align === 'center') { sx -= dx * w / 2; sy -= dy * w / 2; }
    else if (o.align === 'right') { sx -= dx * w; sy -= dy * w; }
    let adv = 0;
    for (const r of this.runs(s)) {
      const f = r.sym ? this.sf : this.tf;
      const bx = sx + dx * adv, by = sy + dy * adv;
      const [px, py] = this.p(bx, by);
      const pageAngle = ang + (this.turned ? 90 : 0);
      if (this.mode === 'text') {
        this.doc.setFont(r.sym ? 'FixSym' : 'FixText', 'normal'); this.doc.setFontSize(size); this.doc.setTextColor(0, 0, 0);
        this.doc.text(r.t, px, py, { angle: pageAngle });
      } else this.outline(f, r.t, px, py, size, pageAngle);
      adv += advance(f, r.t, size);
    }
  }
  /** Glyph outlines as one filled path (so counters stay open), written straight into the content stream. */
  private outline(f: Font, s: string, px: number, py: number, size: number, pageAngle: number): void {
    const rad = pageAngle * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    const H = this.pageH;
    const T = (x: number, y: number): string => {
      // glyph space is y-down from the baseline; rotate counter-clockwise on the page, then flip to PDF space
      const X = px + x * c + y * sn, Y = py - x * sn + y * c;
      return `${X.toFixed(2)} ${(H - Y).toFixed(2)}`;
    };
    const w = (line: string): void => this.doc.internal.write(line);
    w('q 0 g');
    let gx = 0;
    for (const ch of s) {
      const glyph = f.charToGlyph(ch);
      const path = glyph.getPath(gx, 0, size);
      let cx = 0, cy = 0;
      for (const cmd of path.commands) {
        if (cmd.type === 'M') { w(`${T(cmd.x, cmd.y)} m`); cx = cmd.x; cy = cmd.y; }
        else if (cmd.type === 'L') { w(`${T(cmd.x, cmd.y)} l`); cx = cmd.x; cy = cmd.y; }
        else if (cmd.type === 'C') { w(`${T(cmd.x1, cmd.y1)} ${T(cmd.x2, cmd.y2)} ${T(cmd.x, cmd.y)} c`); cx = cmd.x; cy = cmd.y; }
        else if (cmd.type === 'Q') {
          const x1 = cx + 2 / 3 * (cmd.x1 - cx), y1 = cy + 2 / 3 * (cmd.y1 - cy), x2 = cmd.x + 2 / 3 * (cmd.x1 - cmd.x), y2 = cmd.y + 2 / 3 * (cmd.y1 - cmd.y);
          w(`${T(x1, y1)} ${T(x2, y2)} ${T(cmd.x, cmd.y)} c`); cx = cmd.x; cy = cmd.y;
        } else if (cmd.type === 'Z') w('h');
      }
      gx += (glyph.advanceWidth ?? 0) * size / f.unitsPerEm;
    }
    w('f Q');
  }
  bytes(): Buffer { return Buffer.from(this.doc.output('arraybuffer')); }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────────────────────────────────────

const DIM = 9.9;       // 3.5 mm dimension and note text
const SMALL = 7.1;     // 2.5 mm labels and tolerance text

function arrow(p: Pen, x: number, y: number, dir: 'l' | 'r' | 'u' | 'd'): void {
  const a = 6, b = 1.6;
  if (dir === 'r') p.tri(x, y, x - a, y - b, x - a, y + b);
  else if (dir === 'l') p.tri(x, y, x + a, y - b, x + a, y + b);
  else if (dir === 'u') p.tri(x, y, x - b, y + a, x + b, y + a);
  else p.tri(x, y, x - b, y - a, x + b, y - a);
}

interface Tol { upper: string; lower: string }
/** Horizontal dimension between x0 and x1, drawn at yDim, measured from the object edge at yObj. */
function hdim(p: Pen, x0: number, x1: number, yObj: number, yDim: number, text: string, tol?: Tol): void {
  const s = yDim < yObj ? -1 : 1;
  p.line(x0, yObj + 3 * s, x0, yDim + 5 * s, 0.3); p.line(x1, yObj + 3 * s, x1, yDim + 5 * s, 0.3);
  p.line(x0, yDim, x1, yDim, 0.3); arrow(p, x0, yDim, 'l'); arrow(p, x1, yDim, 'r');
  const w = p.width(text, DIM) + (tol ? Math.max(p.width(tol.upper, SMALL), p.width(tol.lower, SMALL)) + 3 : 0);
  const tx = (x0 + x1) / 2 - w / 2;
  p.text(text, tx, yDim - 3, DIM);
  if (tol) { const ux = tx + p.width(text, DIM) + 3; p.text(tol.upper, ux, yDim - 3 - 5.2, SMALL); p.text(tol.lower, ux, yDim - 3 + 2.2, SMALL); }
}
/** Vertical dimension between y0 and y1, drawn at xDim; the text reads bottom to top. */
function vdim(p: Pen, y0: number, y1: number, xObj: number, xDim: number, text: string, tol?: Tol): void {
  const s = xDim < xObj ? -1 : 1;
  p.line(xObj + 3 * s, y0, xDim + 5 * s, y0, 0.3); p.line(xObj + 3 * s, y1, xDim + 5 * s, y1, 0.3);
  p.line(xDim, y0, xDim, y1, 0.3); arrow(p, xDim, y0, 'u'); arrow(p, xDim, y1, 'd');
  const w = p.width(text, DIM) + (tol ? Math.max(p.width(tol.upper, SMALL), p.width(tol.lower, SMALL)) + 3 : 0);
  const ty = (y0 + y1) / 2 + w / 2;
  p.text(text, xDim - 3, ty, DIM, { angle: 90 });
  if (tol) { const uy = ty - p.width(text, DIM) - 3; p.text(tol.upper, xDim - 3 - 5.2, uy, SMALL, { angle: 90 }); p.text(tol.lower, xDim - 3 + 2.2, uy, SMALL, { angle: 90 }); }
}
/** Leader from a point on the part to a callout of one or more lines. */
function leader(p: Pen, xTip: number, yTip: number, xText: number, yText: number, lines: string[], size = DIM): void {
  const w = Math.max(...lines.map(l => p.width(l, size)));
  const right = xText > xTip;
  const sx = right ? xText - 4 : xText + w + 4;
  p.line(xTip, yTip, sx, yText + 2, 0.3);
  p.line(sx, yText + 2, right ? xText + w : xText, yText + 2, 0.3);
  const ang = Math.atan2(yText + 2 - yTip, sx - xTip);
  p.tri(xTip, yTip, xTip + 6 * Math.cos(ang - 0.26), yTip + 6 * Math.sin(ang - 0.26), xTip + 6 * Math.cos(ang + 0.26), yTip + 6 * Math.sin(ang + 0.26));
  lines.forEach((l, i) => p.text(l, xText, yText - 1 + i * (size * 1.5 + (i === 0 ? 0 : 3)), size));
}
/** Feature-control frame: boxed cells in a row. */
function fcf(p: Pen, x: number, y: number, cells: string[], size = DIM): number {
  const h = size * 1.9;
  let cx = x;
  for (const c of cells) {
    const w = p.width(c, size) + size * 0.9;
    p.rect(cx, y, w, h, 0.5);
    p.text(c, cx + w / 2, y + h * 0.72, size, { align: 'center' });
    cx += w;
  }
  return cx - x;
}
function datum(p: Pen, x: number, y: number, letter: string): void {
  const s = DIM * 1.9;
  p.rect(x, y, s, s, 0.5); p.text(letter, x + s / 2, y + s * 0.72, DIM, { align: 'center' });
  p.line(x + s / 2, y + s, x + s / 2, y + s + 10, 0.4); p.tri(x + s / 2 - 4, y + s + 10, x + s / 2 + 4, y + s + 10, x + s / 2, y + s + 17);
}
function hole(p: Pen, cx: number, cy: number, r: number): void {
  p.circle(cx, cy, r); p.line(cx - r - 4, cy, cx + r + 4, cy, 0.25); p.line(cx, cy - r - 4, cx, cy + r + 4, 0.25);
}
function hatch(p: Pen, x: number, y: number, w: number, h: number, step = 7): void {
  for (let d = step; d < w + h; d += step) {
    const x0 = x + Math.max(0, d - h), y0 = y + Math.min(h, d), x1 = x + Math.min(w, d), y1 = y + Math.max(0, d - w);
    p.line(x0, y0, x1, y1, 0.2);
  }
}
function roughness(p: Pen, x: number, y: number, text: string): void {
  // ISO 21920 graphical symbol: a tick with the requirement written under its long leg
  p.line(x, y, x + 4, y + 7, 0.4); p.line(x + 4, y + 7, x + 12, y - 8, 0.4); p.line(x + 12, y - 8, x + 12 + p.width(text, SMALL) + 4, y - 8, 0.4);
  p.text(text, x + 15, y - 1, SMALL);
}
function wrap(p: Pen, s: string, size: number, maxW: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of s.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (p.width(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

// ── Sheet furniture ─────────────────────────────────────────────────────────────────────────────────────────────

function frame(p: Pen, zones: boolean): { x0: number; y0: number; x1: number; y1: number } {
  const o = 5 * MM, i = 10 * MM;
  p.rect(o, o, p.W - 2 * o, p.H - 2 * o, 0.35);
  p.rect(i, i, p.W - 2 * i, p.H - 2 * i, 1.0);
  if (zones) {
    const cols = Math.round((p.W - 2 * i) / (50 * MM)), rows = Math.round((p.H - 2 * i) / (50 * MM));
    const cw = (p.W - 2 * i) / cols, rh = (p.H - 2 * i) / rows;
    for (let c = 0; c < cols; c++) {
      const cx = i + cw * (c + 0.5);
      p.text(String(c + 1), cx, o + 11, SMALL, { align: 'center' }); p.text(String(c + 1), cx, p.H - o - 4, SMALL, { align: 'center' });
      if (c > 0) { p.line(i + cw * c, o, i + cw * c, i, 0.35); p.line(i + cw * c, p.H - i, i + cw * c, p.H - o, 0.35); }
    }
    for (let r = 0; r < rows; r++) {
      const cy = i + rh * (r + 0.5) + 2.5;
      const L = String.fromCharCode(65 + r);
      p.text(L, o + 7, cy, SMALL, { align: 'center' }); p.text(L, p.W - o - 7, cy, SMALL, { align: 'center' });
      if (r > 0) { p.line(o, i + rh * r, i, i + rh * r, 0.35); p.line(p.W - i, i + rh * r, p.W - o, i + rh * r, 0.35); }
    }
  }
  return { x0: i, y0: i, x1: p.W - i, y1: p.H - i };
}

type Field = [label: string, value: string];
/**
 * Title block, bottom-right. Three layouts:
 *  'cell'   ISO 7200 style — a small label in the top-left corner of each cell, the value below it in the same cell
 *  'table'  two columns — a label cell and a value cell on each row
 *  'header' a row of label cells with the row of value cells under it
 */
function titleBlock(p: Pen, f: { x0: number; y0: number; x1: number; y1: number }, style: 'cell' | 'table' | 'header', rows: Field[][], width = 180 * MM): { x: number; y: number } {
  const x = f.x1 - width;
  if (style === 'table') {
    const flat = rows.flat(); const rh = 6.5 * MM;
    const y = f.y1 - rh * flat.length; const lw = 48 * MM;
    p.rect(x, y, width, rh * flat.length, 1.0); p.line(x + lw, y, x + lw, f.y1, 0.5);
    flat.forEach(([label, value], i) => {
      const ry = y + rh * i;
      if (i > 0) p.line(x, ry, f.x1, ry, 0.5);
      p.text(label, x + 3, ry + rh * 0.68, SMALL); p.text(value, x + lw + 4, ry + rh * 0.7, DIM);
    });
    return { x, y };
  }
  if (style === 'header') {
    const rh = 5.5 * MM, vh = 8.5 * MM; const total = rows.length * (rh + vh);
    const y = f.y1 - total; p.rect(x, y, width, total, 1.0);
    rows.forEach((row, r) => {
      const ry = y + r * (rh + vh);
      if (r > 0) p.line(x, ry, f.x1, ry, 0.5);
      p.line(x, ry + rh, f.x1, ry + rh, 0.35);
      const cw = width / row.length;
      row.forEach(([label, value], c) => {
        const cx = x + cw * c;
        if (c > 0) p.line(cx, ry, cx, ry + rh + vh, 0.5);
        p.text(label, cx + 3, ry + rh * 0.7, SMALL); p.text(value, cx + 3, ry + rh + vh * 0.68, DIM);
      });
    });
    return { x, y };
  }
  const rh = 12 * MM; const y = f.y1 - rh * rows.length;
  p.rect(x, y, width, rh * rows.length, 1.0);
  rows.forEach((row, r) => {
    const ry = y + rh * r;
    if (r > 0) p.line(x, ry, f.x1, ry, 0.5);
    const cw = width / row.length;
    row.forEach(([label, value], c) => {
      const cx = x + cw * c;
      if (c > 0) p.line(cx, ry, cx, ry + rh, 0.5);
      p.text(label, cx + 2.5, ry + 8, SMALL - 1); p.text(value, cx + 4, ry + rh - 8, DIM);
    });
  });
  return { x, y };
}

function notesBlock(p: Pen, x: number, y: number, heading: string | null, notes: string[], maxW: number, numbering: 'dot' | 'paren' = 'dot'): number {
  let cy = y;
  if (heading) { p.text(heading, x, cy, DIM); cy += DIM * 1.9; }
  notes.forEach((n, i) => {
    const num = numbering === 'dot' ? `${i + 1}.` : `${i + 1})`;
    const lines = wrap(p, n, DIM, maxW - 22);
    p.text(num, x, cy, DIM);
    lines.forEach((l, k) => p.text(l, x + 22, cy + k * DIM * 1.35, DIM));
    cy += lines.length * DIM * 1.35 + DIM * 0.55;
  });
  return cy;
}

function revTable(p: Pen, f: { x1: number; y0: number }, heads: string[], rows: string[][]): void {
  const widths = [14 * MM, 70 * MM, 24 * MM, 18 * MM]; const W = widths.reduce((a, b) => a + b, 0); const rh = 6 * MM;
  const x = f.x1 - W, y = f.y0;
  p.rect(x, y, W, rh * (rows.length + 1), 0.7);
  let cx = x;
  widths.forEach((w, i) => { if (i > 0) p.line(cx, y, cx, y + rh * (rows.length + 1), 0.4); p.text(heads[i], cx + 3, y + rh * 0.7, SMALL); cx += w; });
  rows.forEach((row, r) => {
    const ry = y + rh * (r + 1); p.line(x, ry, x + W, ry, 0.4);
    let c2 = x; row.forEach((v, i) => { p.text(v, c2 + 3, ry + rh * 0.7, SMALL); c2 += widths[i]; });
  });
}

// ── The drawings ────────────────────────────────────────────────────────────────────────────────────────────────

interface TruthRow { name: string; value?: unknown; match?: Record<string, unknown>; contains?: string }
interface Spec {
  name: string; commodity: string; size: 'A3' | 'A2'; turned?: boolean;
  /** File prefix: 'gen' (a controlled sheet per commodity family) or 'real' (a drawing written for a real part). */
  prefix?: 'gen' | 'real';
  /** The cad-audit part a 'real' drawing is for. */
  forPart?: string;
  draw: (p: Pen) => void;
  /** Groups whose truth rows below are the complete list of what the sheet states for that group. */
  complete: string[];
  truth: TruthRow[];
}

/** A plate-like front view with holes, and a section beside it. Returns key coordinates for dimensioning. */
function plateViews(p: Pen, x: number, y: number, w: number, h: number, holes: Array<[number, number, number]>, secW = 70): { sx: number } {
  p.rect(x, y, w, h, 1.0);
  for (const [hx, hy, r] of holes) hole(p, x + hx, y + hy, r);
  const sx = x + w + 110;
  p.rect(sx, y, secW, h, 1.0); hatch(p, sx, y, secW, h * 0.32); hatch(p, sx, y + h * 0.68, secW, h * 0.32);
  p.line(sx, y + h * 0.32, sx + secW, y + h * 0.32, 0.7); p.line(sx, y + h * 0.68, sx + secW, y + h * 0.68, 0.7);
  p.text('A-A', sx + secW / 2, y + h + 16, DIM, { align: 'center' });
  return { sx };
}

// ── Drawings for REAL parts (cad-audit/parts) ────────────────────────────────────────────────────────────────────

/**
 * Casting_Braket.stp — 132 × 120 × 125 mm, 320 cm³, four Ø13 through holes. Drawn as an aluminium gravity casting,
 * T6, leak-tested, safety-critical, e-coated with three masked bores: every one of those differs from what the
 * costing assumes with no drawing. `withMaterial: false` is the same sheet with the material left off (test E).
 */
function castingBracket(withMaterial: boolean): Spec {
  return {
    name: withMaterial ? 'casting-bracket' : 'casting-bracket-nomaterial', prefix: 'real', forPart: 'Casting_Braket.stp', commodity: 'cast and machine', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'cell', [
        [['TITLE', 'CASTING BRACKET'], ['MATERIAL', withMaterial ? 'A356-T6  ASTM B108' : '']],
        [['PART NO.', 'CB-2207-11'], ['DRAWING NO.', 'D-2207-11'], ['REV', 'B']],
        [['GENERAL TOLERANCE', 'ISO 8062-3 DCTG 6'], ['SURFACE ROUGHNESS', 'Ra 6.3'], ['MASS', withMaterial ? '0.86 kg' : '']],
        [['SCALE', '1:1'], ['DATE', '2026-09-18'], ['SHEET', '1 OF 1'], ['DRAWN', 'R. PATIL']],
      ]);
      const x = 130, y = 130, w = 264, h = 240;
      const v = plateViews(p, x, y, w, h, [[56, 60, 13], [208, 60, 13], [56, 180, 13], [208, 180, 13]]);
      hdim(p, x, x + w, y, y - 40, '132');
      vdim(p, y, y + h, x, x - 42, '120');
      hdim(p, v.sx, v.sx + 70, y, y - 40, '125');
      leader(p, x + 56 + 9, y + 60 - 9, x + 96, y - 8, ['4x Ø13 THRU']);
      leader(p, x + 132, y + 120, x + 150, y + 290, ['M6x1-6H ↧ 12']);
      roughness(p, v.sx + 8, y - 12, 'Ra 3.2');
      datum(p, x + 20, y + h, 'A');
      notesBlock(p, f.x0 + 14, 470, 'NOTES', [
        'CASTING TOLERANCES TO ISO 8062-3 DCTG 6.',
        'MACHINED DIMENSIONS WITHOUT TOLERANCE: ISO 2768-mK.',
        ...(withMaterial ? ['HEAT TREATMENT T6: SOLUTION TREATED AND ARTIFICIALLY AGED.'] : []),
        'PRESSURE TEST AT 3 bar AIR FOR 20 s, NO LEAKAGE ALLOWED.',
        'SAFETY CRITICAL PART.',
        'CATHODIC E-COAT 20-35 µm, BLACK. MASK 3x Ø13 BORES.',
        'BREAK ALL SHARP EDGES ISO 13715 -0.3.',
      ], 520);
    },
    complete: [],
    truth: [
      { name: 'title.partName', value: 'CASTING BRACKET' }, { name: 'title.partNumber', value: 'CB-2207-11' }, { name: 'title.revision', value: 'B' },
      ...(withMaterial ? [{ name: 'material.designation', value: 'A356-T6' }, { name: 'part.mass', value: 0.86 }] : []),
      { name: 'tolerance.castingGrade', value: 'DCTG 6' },
      { name: 'finish.coatingRoute', value: 'e-coat' }, { name: 'finish.maskedFeatures', value: 3 },
      { name: 'quality.pressureTight', value: true }, { name: 'quality.safetyCritical', value: true },
      { name: 'hole.diameter', match: { diameter: 13, count: 4, through: true } },
      { name: 'thread', match: { designation: 'M6x1-6H', depth: 12 } },
    ],
  };
}

/**
 * Seat_Locking_Bracket.stp — a 1.6 mm pressing, 255.8 × 226.1 mm. Drawn in HSLA S420MC, zinc plated 12 µm, safety
 * critical: the grade, the finish and its deposit thickness all differ from the costing's defaults.
 */
const SEAT_BRACKET: Spec = {
  name: 'seat-bracket', prefix: 'real', forPart: 'Seat_Locking_Bracket.stp', commodity: 'sheet metal', size: 'A3',
  draw: p => {
    const f = frame(p, true);
    titleBlock(p, f, 'header', [
      [['TITLE', 'SEAT BASE MOUNT'], ['PART NO.', 'SLB-3310'], ['DWG NO.', 'SLB-3310-01'], ['REV', 'A']],
      [['MATERIAL', 'S420MC  EN 10149-2'], ['THICKNESS', '1.6 mm'], ['GENERAL TOLERANCE', 'ISO 2768-mK']],
      [['SCALE', '1:2'], ['DATE', '2026-10-02'], ['SHEET', '1 OF 1'], ['MASS', '0.56 kg']],
    ], 190 * MM);
    const x = 130, y = 150;
    const pts: Array<[number, number]> = [[0, 0], [340, 0], [340, 80], [280, 80], [280, 150], [340, 150], [340, 230], [0, 230]];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; p.line(x + a[0], y + a[1], x + b[0], y + b[1], 1.0); }
    p.line(x + 110, y, x + 110, y + 230, 0.3); p.line(x + 225, y, x + 225, y + 230, 0.3);
    hdim(p, x, x + 340, y, y - 44, '255.8');
    vdim(p, y, y + 230, x, x - 40, '226.1');
    leader(p, x + 110, y + 200, x + 60, y + 270, ['R2']);
    notesBlock(p, 640, 120, 'NOTES', [
      'ZINC PLATE 12 µm, Fe//Zn12//A PER ISO 2081.',
      'INSIDE BEND RADII R2 UNLESS STATED. BURR SIDE AS SHOWN.',
      'SAFETY CRITICAL PART.',
      'BREAK ALL SHARP EDGES.',
    ], 430);
  },
  complete: [],
  truth: [
    { name: 'title.partName', value: 'SEAT BASE MOUNT' }, { name: 'title.partNumber', value: 'SLB-3310' },
    { name: 'material.designation', value: 'S420MC' }, { name: 'material.standard', value: 'EN 10149-2' }, { name: 'material.stockThickness', value: 1.6 },
    { name: 'tolerance.general', contains: 'ISO 2768-mK' },
    { name: 'finish.coatingRoute', value: 'zinc-plate' }, { name: 'finish.coatingThickness', match: { nominal: 12 } },
    { name: 'quality.safetyCritical', value: true },
  ],
};

const REAL_SPECS: Spec[] = [castingBracket(true), castingBracket(false), SEAT_BRACKET];

const SPECS: Spec[] = [
  {
    name: 'casting', commodity: 'casting', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'cell', [
        [['TITLE', 'PUMP HOUSING'], ['MATERIAL', 'EN-GJS-500-7  EN 1563']],
        [['PART NO.', 'CV-100-2231'], ['DRAWING NO.', 'D-100-2231'], ['REV', 'C']],
        [['GENERAL TOLERANCE', 'ISO 8062-3 DCTG 9'], ['SURFACE ROUGHNESS', 'Ra 12.5'], ['MASS', '4.85 kg']],
        [['SCALE', '1:2'], ['DATE', '2026-03-14'], ['SHEET', '1 OF 1'], ['DRAWN', 'A. KOVAC']],
      ]);
      revTable(p, f, ['REV', 'DESCRIPTION', 'DATE', 'BY'], [['A', 'FIRST ISSUE', '2025-11-02', 'AK'], ['B', 'BORE TOLERANCE CHANGED', '2026-01-20', 'AK'], ['C', 'LEAK TEST ADDED', '2026-03-14', 'MR']]);
      const x = 120, y = 130, w = 300, h = 210;
      const v = plateViews(p, x, y, w, h, [[60, 55, 12], [240, 55, 12], [60, 155, 12], [240, 155, 12], [150, 105, 44]]);
      hdim(p, x, x + w, y, y - 40, '150 ±0.2');
      hdim(p, x + 60, x + 240, y, y - 18, '90');
      vdim(p, y, y + h, x, x - 42, '105');
      vdim(p, y + 55, y + 155, x + w, x + w + 30, '50', { upper: '+0.10', lower: '-0.05' });
      leader(p, x + 150 + 31, y + 105 + 31, x + 190, y + 262, ['Ø62 H7']);
      leader(p, x + 60 + 9, y + 155 + 8, x + 40, y + 262, ['4x M10x1.5-6H ↧ 20']);
      leader(p, v.sx + 35, y + 105, v.sx + 110, y + 60, ['2x Ø8.5 THRU']);
      leader(p, x + w, y + h - 6, x + w + 40, y + h + 30, ['R12']);
      roughness(p, v.sx + 8, y - 12, 'Ra 3.2');
      const fx = v.sx + 110, fy = y + 120;
      fcf(p, fx, fy, ['⌖', 'Ø0.2 Ⓜ', 'A', 'B']);
      fcf(p, fx, fy + 40, ['⏥', '0.05']);
      datum(p, x + 20, y + h, 'A'); datum(p, v.sx + 46, y + h, 'B');
      notesBlock(p, f.x0 + 14, 460, 'NOTES', [
        'CASTING TOLERANCES TO ISO 8062-3 DCTG 9.',
        'MACHINED DIMENSIONS WITHOUT TOLERANCE: ISO 2768-mK.',
        'UNSPECIFIED RADII R3. DRAFT ANGLE 2° MAX.',
        'PRESSURE TEST AT 6 bar AIR FOR 30 s, NO LEAKAGE ALLOWED.',
        '100% X-RAY TO ASTM E446 LEVEL 2.',
        'SAFETY CRITICAL PART. CHARACTERISTICS MARKED <S> TO BE DOCUMENTED.',
        'CATHODIC E-COAT 20-35 µm, BLACK. MASK 4x M10 THREADS.',
        'HARDNESS 170-230 HBW.',
        'BREAK ALL SHARP EDGES ISO 13715 -0.3.',
      ], 520);
    },
    complete: ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes', 'quality'],
    truth: [
      { name: 'title.partName', value: 'PUMP HOUSING' }, { name: 'title.partNumber', value: 'CV-100-2231' }, { name: 'title.drawingNumber', value: 'D-100-2231' },
      { name: 'title.revision', value: 'C' }, { name: 'title.scale', value: '1:2' }, { name: 'title.date', value: '2026-03-14' }, { name: 'title.sheet', value: '1/1' },
      { name: 'part.mass', value: 4.85 },
      { name: 'material.designation', value: 'EN-GJS-500-7' }, { name: 'material.standard', value: 'EN 1563' }, { name: 'material.family', value: 'ductile iron' },
      { name: 'tolerance.general', contains: 'ISO 8062-3 DCTG 9' }, { name: 'tolerance.castingGrade', value: 'DCTG 9' },
      { name: 'finish.roughnessGeneral', match: { parameter: 'Ra', value: 12.5 } }, { name: 'finish.roughness', match: { parameter: 'Ra', value: 3.2 } },
      { name: 'finish.coating', contains: 'CATHODIC E-COAT 20-35 µm' }, { name: 'finish.coatingRoute', value: 'e-coat' }, { name: 'finish.coatingThickness', match: { min: 20, max: 35 } },
      { name: 'finish.masking', contains: 'MASK 4x M10 THREADS' }, { name: 'finish.maskedFeatures', value: 4 },
      { name: 'heatTreat.hardness', match: { min: 170, max: 230, scale: 'HBW' } },
      { name: 'thread', match: { designation: 'M10x1.5-6H', count: 4, depth: 20, pitch: 1.5 } }, { name: 'feature.count.threads', value: 4 },
      { name: 'dimension', match: { type: 'linear', nominal: 150, upper: 0.2, lower: -0.2 } }, { name: 'dimension', match: { type: 'linear', nominal: 90 } },
      { name: 'dimension', match: { type: 'linear', nominal: 105 } }, { name: 'dimension', match: { type: 'linear', nominal: 50, upper: 0.1, lower: -0.05 } },
      { name: 'dimension', match: { type: 'radius', nominal: 12 } }, { name: 'hole.diameter', match: { diameter: 8.5, count: 2, through: true } },
      { name: 'hole.diameter', match: { diameter: 62, fit: 'H7', upper: 0.03, lower: 0 } },
      { name: 'tolerance.tightest', match: { band: 0.03, nominal: 62 } }, { name: 'feature.count.holes', value: 3 },
      { name: 'gdt.frame', match: { characteristic: 'position', tolerance: 0.2, diameterZone: true, datums: ['A', 'B'] } },
      { name: 'gdt.frame', match: { characteristic: 'flatness', tolerance: 0.05 } }, { name: 'gdt.datum', value: 'A' }, { name: 'gdt.datum', value: 'B' },
      { name: 'note.manufacturing', contains: 'CASTING TOLERANCES TO ISO 8062-3 DCTG 9' }, { name: 'note.manufacturing', contains: 'ISO 2768-mK' },
      { name: 'note.manufacturing', contains: 'UNSPECIFIED RADII R3' }, { name: 'note.manufacturing', contains: 'PRESSURE TEST AT 6 bar' },
      { name: 'note.manufacturing', contains: '100% X-RAY TO ASTM E446' }, { name: 'note.general', contains: 'SAFETY CRITICAL PART' },
      { name: 'note.manufacturing', contains: 'CATHODIC E-COAT' }, { name: 'note.manufacturing', contains: 'HARDNESS 170-230 HBW' }, { name: 'note.manufacturing', contains: 'BREAK ALL SHARP EDGES' },
      { name: 'quality.pressureTight', value: true }, { name: 'quality.leakTestSpec', contains: 'PRESSURE TEST AT 6 bar AIR' }, { name: 'quality.ndt', contains: 'X-RAY TO ASTM E446' },
      { name: 'quality.safetyCritical', value: true }, { name: 'finish.edges', contains: 'ISO 13715' },
    ],
  },
  {
    name: 'forging', commodity: 'forging', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'table', [[
        ['Benennung', 'ACHSSCHENKEL'], ['Zeichnungsnummer', 'Z-4471-08'], ['Teilenummer', '4471 08 221'], ['Änderungsindex', 'B'],
        ['Werkstoff', '42CrMo4+QT  DIN EN ISO 683-2'], ['Allgemeintoleranz', 'ISO 2768-mK'], ['Oberfläche', 'Rz 25'], ['Gewicht', '3,2 kg'],
        ['Maßstab', '1:1'], ['Datum', '12.02.2026'], ['Blatt', '1 / 2'],
      ]], 150 * MM);
      // a stepped shaft, drawn as its outline
      const x = 110, cy = 250;
      const steps: Array<[number, number]> = [[90, 28], [120, 45], [60, 62], [140, 38], [70, 22]];
      let cx = x;
      for (const [len, r] of steps) { p.rect(cx, cy - r, len, 2 * r, 1.0); cx += len; }
      p.line(x - 14, cy, cx + 14, cy, 0.25);
      hdim(p, x, cx, cy - 62, cy - 100, '480 ±0.5');
      hdim(p, x, x + 90, cy + 28, cy + 92, '90');
      hdim(p, x + 90, x + 210, cy + 45, cy + 92, '120', { upper: '0', lower: '-0.2' });
      leader(p, x + 150, cy - 45, x + 130, cy - 70, ['Ø45 k6']);
      leader(p, x + 40, cy - 28, x + 10, cy - 60, ['Ø30 h6']);
      leader(p, x + 340, cy - 38, x + 330, cy - 64, ['Ø38 f7']);
      leader(p, cx - 30, cy + 22, cx - 70, cy + 70, ['M24x1.5-6g']);
      leader(p, x + 270, cy + 62, x + 255, cy + 140, ['R4']);
      roughness(p, x + 130, cy - 47, 'Rz 6.3');
      fcf(p, x + 420, cy - 150, ['↗', '0.03', 'A-B']);
      fcf(p, x + 420, cy - 115, ['◎', 'Ø0.05', 'A']);
      datum(p, x + 20, cy + 28, 'A'); datum(p, cx - 60, cy + 22, 'B');
      notesBlock(p, 700, 90, 'ANMERKUNGEN', [
        'Schmiedeteil nach DIN EN 10243-1, Schmiedegüte F.',
        'Vergütet, Härte 28-34 HRC.',
        'Lagersitz Ø45 induktiv gehärtet 52-58 HRC, Einhärtungstiefe SHD 2,0+1,0 mm.',
        'Rissprüfung 100% Magnetpulverprüfung nach DIN EN ISO 9934-1.',
        'Oberfläche zinkphosphatiert und geölt.',
        'Alle Kanten entgratet, ISO 13715.',
        'Sicherheitsrelevantes Bauteil.',
      ], 420, 'paren');
    },
    complete: ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes', 'quality'],
    truth: [
      { name: 'title.partName', value: 'ACHSSCHENKEL' }, { name: 'title.drawingNumber', value: 'Z-4471-08' }, { name: 'title.partNumber', value: '4471 08 221' },
      { name: 'title.revision', value: 'B' }, { name: 'title.scale', value: '1:1' }, { name: 'title.date', value: '12.02.2026' }, { name: 'title.sheet', value: '1/2' }, { name: 'part.mass', value: 3.2 },
      { name: 'material.designation', value: '42CrMo4+QT' }, { name: 'material.standard', value: 'DIN EN ISO 683-2' }, { name: 'material.family', value: 'steel' }, { name: 'material.condition', value: '+QT' },
      { name: 'tolerance.general', contains: 'ISO 2768-mK' }, { name: 'tolerance.generalClass', value: 'medium' },
      { name: 'finish.roughnessGeneral', match: { parameter: 'Rz', value: 25 } }, { name: 'finish.roughness', match: { parameter: 'Rz', value: 6.3 } },
      { name: 'finish.coating', contains: 'zinkphosphatiert' }, { name: 'finish.coatingRoute', value: 'phosphate' },
      { name: 'heatTreat.process', value: 'quench-and-temper' }, { name: 'heatTreat.process', value: 'induction-harden' },
      { name: 'heatTreat.hardness', match: { min: 28, max: 34, scale: 'HRC' } }, { name: 'heatTreat.hardness', match: { min: 52, max: 58, scale: 'HRC' } },
      { name: 'heatTreat.caseDepth', match: { type: 'SHD', min: 2, max: 3 } },
      { name: 'thread', match: { designation: 'M24x1.5-6g', pitch: 1.5, toleranceClass: '6g' } }, { name: 'feature.count.threads', value: 1 },
      { name: 'dimension', match: { type: 'linear', nominal: 480, upper: 0.5, lower: -0.5 } }, { name: 'dimension', match: { type: 'linear', nominal: 90 } },
      { name: 'dimension', match: { type: 'linear', nominal: 120, upper: 0, lower: -0.2 } }, { name: 'dimension', match: { type: 'radius', nominal: 4 } },
      { name: 'dimension', match: { type: 'diameter', nominal: 45, fit: 'k6', upper: 0.018, lower: 0.002 } },
      { name: 'dimension', match: { type: 'diameter', nominal: 30, fit: 'h6', upper: 0, lower: -0.013 } },
      { name: 'dimension', match: { type: 'diameter', nominal: 38, fit: 'f7', upper: -0.025, lower: -0.05 } },
      { name: 'tolerance.tightest', match: { band: 0.013, nominal: 30 } },
      { name: 'gdt.frame', match: { characteristic: 'circular run-out', tolerance: 0.03, datums: ['A-B'] } },
      { name: 'gdt.frame', match: { characteristic: 'concentricity', tolerance: 0.05, diameterZone: true, datums: ['A'] } }, { name: 'gdt.datum', value: 'A' }, { name: 'gdt.datum', value: 'B' },
      { name: 'note.manufacturing', contains: 'Schmiedeteil nach DIN EN 10243-1' }, { name: 'note.manufacturing', contains: 'Vergütet, Härte 28-34 HRC' },
      { name: 'note.manufacturing', contains: 'induktiv gehärtet 52-58 HRC' }, { name: 'note.manufacturing', contains: 'Magnetpulverprüfung' },
      { name: 'note.manufacturing', contains: 'zinkphosphatiert' }, { name: 'note.manufacturing', contains: 'Alle Kanten entgratet' }, { name: 'note.general', contains: 'Sicherheitsrelevantes Bauteil' },
      { name: 'quality.ndt', contains: 'Magnetpulverprüfung nach DIN EN ISO 9934-1' }, { name: 'quality.safetyCritical', value: true }, { name: 'finish.edges', contains: 'ISO 13715' },
    ],
  },
  {
    name: 'machined', commodity: 'machining', size: 'A2',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'cell', [
        [['TITLE', 'VALVE MANIFOLD BLOCK'], ['MATERIAL', 'EN AW-6082-T6  EN 573-3']],
        [['PART NUMBER', 'MB-2207-114'], ['DRAWING NUMBER', 'MB-2207-114-D'], ['REVISION', '04']],
        [['GENERAL TOLERANCES', 'ISO 2768-fH'], ['FINISH', 'ANODISE 10-15 µm, NATURAL'], ['WEIGHT', '1250 g']],
        [['SCALE', '2:1'], ['DATE', '03-Jun-2026'], ['SHEET', '1 OF 3'], ['UNITS', 'mm']],
      ]);
      const x = 180, y = 190, w = 420, h = 280;
      const v = plateViews(p, x, y, w, h, [[70, 70, 18], [210, 70, 18], [350, 70, 18], [70, 210, 9], [210, 210, 9], [350, 210, 9]], 110);
      hdim(p, x, x + w, y, y - 62, '140');
      hdim(p, x + 70, x + 210, y, y - 36, '46.5 ±0.02');
      hdim(p, x + 210, x + 350, y, y - 36, '46.5 ±0.02');
      vdim(p, y, y + h, x, x - 58, '93.5', { upper: '+0.05', lower: '0' });
      vdim(p, y + 70, y + 210, x, x - 30, '(46.75)');
      leader(p, x + 70 - 13, y + 70 - 13, x - 110, y - 22, ['3x Ø25 H7']);
      leader(p, x + 70 + 7, y + 210 + 6, x + 20, y + h + 60, ['6x M6-6H ↧ 12']);
      leader(p, x + 350 + 6, y + 210 + 7, x + 300, y + h + 60, ['2x G1/4']);
      leader(p, v.sx + 110, y + 40, v.sx + 150, y + 10, ['Ø20 g6']);
      leader(p, v.sx + 110, y + 240, v.sx + 150, y + 290, ['1/4-20 UNC-2B', 'HELICOIL INSERT']);
      leader(p, v.sx, y + h, v.sx - 60, y + h + 40, ['2 x 45°']);
      p.text('25.02', v.sx + 150, y + 120, DIM); p.text('24.98', v.sx + 150, y + 120 + DIM * 1.25, DIM);
      p.line(v.sx + 110, y + 124, v.sx + 148, y + 124, 0.3);
      roughness(p, x + 180, y + h + 4, 'Ra 0.8');
      const bx = v.sx + 150, by = y + 170;
      p.rect(bx - 3, by - 11, p.width('62.5', DIM) + 6, 15, 0.5); p.text('62.5', bx, by, DIM);
      fcf(p, x + 60, y + h + 120, ['⟂', '0.02', 'A']);
      fcf(p, x + 200, y + h + 120, ['∥', '0.05', 'B']);
      fcf(p, x + 340, y + h + 120, ['⌖', 'Ø0.1', 'A', 'B', 'C']);
      datum(p, x + 300, y + h, 'A'); datum(p, v.sx + 20, y + h, 'B'); datum(p, x + w - 30, y + h, 'C');
      notesBlock(p, f.x0 + 20, 700, 'GENERAL NOTES:', [
        'ALL DIMENSIONS IN MILLIMETRES.',
        'SURFACE ROUGHNESS Ra 1.6 ALL OVER UNLESS OTHERWISE STATED.',
        'DEBURR ALL EDGES 0.2 MAX. PORTS FREE OF BURRS.',
        'CLEANLINESS TO ISO 16232, NO PARTICLE LARGER THAN 400 µm.',
        'THREADS TO BE FREE OF ANODISING. MASK 6x M6.',
        'PART MARKING: LASER MARK PART NUMBER AND DATE CODE.',
        'MATERIAL SPECIFICATION STJLR.50.5021 APPLIES.',
      ], 640);
    },
    complete: ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes', 'quality'],
    truth: [
      { name: 'title.partName', value: 'VALVE MANIFOLD BLOCK' }, { name: 'title.partNumber', value: 'MB-2207-114' }, { name: 'title.drawingNumber', value: 'MB-2207-114-D' },
      { name: 'title.revision', value: '04' }, { name: 'title.scale', value: '2:1' }, { name: 'title.date', value: '03-Jun-2026' }, { name: 'title.sheet', value: '1/3' },
      { name: 'title.units', value: 'mm' }, { name: 'part.mass', value: 1.25 },
      { name: 'material.designation', value: 'EN AW-6082-T6' }, { name: 'material.standard', value: 'EN 573-3' }, { name: 'material.family', value: 'aluminium (wrought)' }, { name: 'material.condition', value: 'T6' },
      { name: 'material.specCode', value: 'STJLR.50.5021' },
      { name: 'tolerance.general', contains: 'ISO 2768-fH' }, { name: 'tolerance.generalClass', value: 'fine' },
      { name: 'finish.roughnessGeneral', match: { parameter: 'Ra', value: 1.6 } }, { name: 'finish.roughness', match: { parameter: 'Ra', value: 0.8 } },
      { name: 'finish.coating', contains: 'ANODISE 10-15 µm' }, { name: 'finish.coatingRoute', value: 'anodise' }, { name: 'finish.coatingThickness', match: { min: 10, max: 15 } },
      { name: 'finish.masking', contains: 'FREE OF ANODISING' }, { name: 'finish.masking', contains: 'MASK 6x M6' }, { name: 'finish.maskedFeatures', value: 6 },
      { name: 'thread', match: { designation: 'M6-6H', count: 6, depth: 12, pitch: 1 } }, { name: 'thread', match: { designation: 'G1/4', count: 2, system: 'pipe' } },
      { name: 'thread', match: { designation: '1/4-20UNC-2B', system: 'unified', insert: 'HELICOIL INSERT' } }, { name: 'feature.count.threads', value: 9 },
      { name: 'dimension', match: { type: 'linear', nominal: 140 } }, { name: 'dimension', match: { type: 'linear', nominal: 46.5, upper: 0.02, lower: -0.02 } },
      { name: 'dimension', match: { type: 'linear', nominal: 46.5, upper: 0.02, lower: -0.02 } }, { name: 'dimension', match: { type: 'linear', nominal: 93.5, upper: 0.05, lower: 0 } },
      { name: 'dimension', match: { type: 'linear', nominal: 46.75, reference: true } }, { name: 'dimension', match: { type: 'chamfer', nominal: 2, chamferAngle: 45 } },
      { name: 'dimension', match: { type: 'linear', max: 25.02, min: 24.98 } }, { name: 'dimension', match: { type: 'linear', nominal: 62.5, basic: true } },
      { name: 'hole.diameter', match: { diameter: 25, count: 3, fit: 'H7', upper: 0.021, lower: 0 } },
      { name: 'dimension', match: { type: 'diameter', nominal: 20, fit: 'g6', upper: -0.007, lower: -0.02 } },
      { name: 'tolerance.tightest', match: { band: 0.013, nominal: 20 } }, { name: 'feature.count.holes', value: 3 },
      { name: 'gdt.frame', match: { characteristic: 'perpendicularity', tolerance: 0.02, datums: ['A'] } }, { name: 'gdt.frame', match: { characteristic: 'parallelism', tolerance: 0.05, datums: ['B'] } },
      { name: 'gdt.frame', match: { characteristic: 'position', tolerance: 0.1, diameterZone: true, datums: ['A', 'B', 'C'] } },
      { name: 'gdt.datum', value: 'A' }, { name: 'gdt.datum', value: 'B' }, { name: 'gdt.datum', value: 'C' },
      { name: 'note.general', contains: 'ALL DIMENSIONS IN MILLIMETRES' }, { name: 'note.manufacturing', contains: 'SURFACE ROUGHNESS Ra 1.6 ALL OVER' },
      { name: 'note.manufacturing', contains: 'DEBURR ALL EDGES 0.2 MAX' }, { name: 'note.manufacturing', contains: 'CLEANLINESS TO ISO 16232' },
      { name: 'note.manufacturing', contains: 'THREADS TO BE FREE OF ANODISING' }, { name: 'note.manufacturing', contains: 'LASER MARK PART NUMBER' },
      { name: 'note.general', contains: 'MATERIAL SPECIFICATION STJLR.50.5021' },
      { name: 'quality.cleanliness', contains: 'ISO 16232' }, { name: 'quality.marking', contains: 'LASER MARK PART NUMBER' }, { name: 'finish.edges', contains: 'DEBURR ALL EDGES' },
    ],
  },
  {
    name: 'sheetmetal', commodity: 'sheet metal', size: 'A3', turned: true,
    draw: p => {
      const f = frame(p, false);
      titleBlock(p, f, 'header', [
        [['TITLE', 'SEAT BRACKET LH'], ['PART NO.', 'SB-7781-LH'], ['DWG NO.', 'SB-7781'], ['REV', 'D']],
        [['MATERIAL', 'DC04+ZE25/25  EN 10152'], ['THICKNESS', '1.5 mm'], ['GENERAL TOLERANCE', 'ISO 2768-mK']],
        [['SCALE', '1:1'], ['DATE', '2026-05-21'], ['SHEET', '1 OF 1'], ['MASS', '0.42 kg']],
      ], 190 * MM);
      // flat pattern outline with a notch, and the formed side view
      const x = 120, y = 150;
      const pts: Array<[number, number]> = [[0, 0], [330, 0], [330, 70], [270, 70], [270, 130], [330, 130], [330, 200], [0, 200]];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; p.line(x + a[0], y + a[1], x + b[0], y + b[1], 1.0); }
      p.line(x + 110, y, x + 110, y + 200, 0.3); p.line(x + 220, y, x + 220, y + 200, 0.3);
      for (const [hx, hy] of [[50, 50], [50, 150], [165, 100]] as Array<[number, number]>) hole(p, x + hx, y + hy, 9);
      hdim(p, x, x + 330, y, y - 50, '220');
      hdim(p, x, x + 110, y, y - 24, '73.5 ±0.3');
      vdim(p, y, y + 200, x, x - 40, '133');
      vdim(p, y + 70, y + 130, x + 330, x + 364, '40', { upper: '+0.5', lower: '0' });
      leader(p, x + 50 + 7, y + 50 - 6, x + 130, y + 30, ['3x Ø9 THRU']);
      leader(p, x + 165, y + 100 + 9, x + 150, y + 250, ['2x M6 WELD NUT']);
      leader(p, x + 110, y + 180, x + 60, y + 235, ['R2']);
      leader(p, x + 220, y + 20, x + 240, y - 10, ['90°']);
      p.text('a3', x + 185, y + 80, SMALL);
      notesBlock(p, 600, 120, null, [
        'ZINC-NICKEL PLATE Fe//ZnNi8//Cn//T2 PER ISO 19598.',
        'WELDING TO ISO 5817-C, PROCESS 135.',
        'PROJECTION WELD NUTS TO ISO 14554, 2 POSITIONS.',
        'INSIDE BEND RADII R2 UNLESS STATED. BURR SIDE AS SHOWN.',
        'NO PAINT ON CONTACT SURFACES MARKED X.',
        'GENERAL TOLERANCE FOR WELDED ASSEMBLY ISO 13920-BF.',
      ], 470);
    },
    complete: ['title block', 'material', 'general tolerance', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes'],
    truth: [
      { name: 'title.partName', value: 'SEAT BRACKET LH' }, { name: 'title.partNumber', value: 'SB-7781-LH' }, { name: 'title.drawingNumber', value: 'SB-7781' },
      { name: 'title.revision', value: 'D' }, { name: 'title.scale', value: '1:1' }, { name: 'title.date', value: '2026-05-21' }, { name: 'title.sheet', value: '1/1' }, { name: 'part.mass', value: 0.42 },
      { name: 'material.designation', value: 'DC04+ZE25/25' }, { name: 'material.standard', value: 'EN 10152' }, { name: 'material.family', value: 'steel' },
      { name: 'material.stockThickness', value: 1.5 },
      { name: 'tolerance.general', contains: 'ISO 2768-mK' }, { name: 'tolerance.generalClass', value: 'medium' },
      { name: 'finish.coating', contains: 'ZINC-NICKEL PLATE Fe//ZnNi8//Cn//T2' }, { name: 'finish.coatingRoute', value: 'zinc-nickel' }, { name: 'finish.coatingThickness', match: { min: 8 } },
      { name: 'finish.masking', contains: 'NO PAINT ON CONTACT SURFACES' },
      { name: 'thread', match: { designation: 'M6', count: 2, insert: 'WELD NUT' } }, { name: 'feature.count.threads', value: 2 },
      { name: 'dimension', match: { type: 'linear', nominal: 220 } }, { name: 'dimension', match: { type: 'linear', nominal: 73.5, upper: 0.3, lower: -0.3 } },
      { name: 'dimension', match: { type: 'linear', nominal: 133 } }, { name: 'dimension', match: { type: 'linear', nominal: 40, upper: 0.5, lower: 0 } },
      { name: 'dimension', match: { type: 'radius', nominal: 2 } }, { name: 'dimension', match: { type: 'angle', nominal: 90 } },
      { name: 'hole.diameter', match: { diameter: 9, count: 3, through: true } }, { name: 'tolerance.tightest', match: { band: 0.5, nominal: 40 } }, { name: 'feature.count.holes', value: 3 },
      { name: 'note.manufacturing', contains: 'ZINC-NICKEL PLATE' }, { name: 'note.manufacturing', contains: 'WELDING TO ISO 5817-C' }, { name: 'note.manufacturing', contains: 'PROJECTION WELD NUTS' },
      { name: 'note.manufacturing', contains: 'INSIDE BEND RADII R2' }, { name: 'note.manufacturing', contains: 'NO PAINT ON CONTACT SURFACES' }, { name: 'note.manufacturing', contains: 'ISO 13920-BF' },
      { name: 'weld.standard', value: 'ISO 5817-C' }, { name: 'weld.note', contains: 'WELDING TO ISO 5817-C, PROCESS 135' }, { name: 'weld.note', contains: 'PROJECTION WELD NUTS' },
    ],
  },
  {
    name: 'moulding', commodity: 'injection moulding', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'header', [
        [['DESCRIPTION', 'CONNECTOR HOUSING 12-WAY'], ['PART NUMBER', 'CH-12W-0093'], ['DRAWING NUMBER', 'CH-12W-0093-01'], ['ISSUE', '7']],
        [['MATERIAL', 'PA66-GF30 BLACK'], ['TOLERANCES', 'DIN 16742 TG6'], ['WEIGHT', '18.4 g']],
        [['SCALE', '5:1'], ['DATE', '2026-07-30'], ['SHEET', '2 OF 2'], ['PROJECTION', 'FIRST ANGLE']],
      ], 190 * MM);
      const x = 130, y = 140, w = 280, h = 170;
      p.rect(x, y, w, h, 1.0); p.rect(x + 12, y + 12, w - 24, h - 24, 0.7);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) p.rect(x + 30 + i * 38, y + 40 + j * 55, 26, 30, 0.6);
      hdim(p, x, x + w, y, y - 46, '56.4 ±0.15');
      hdim(p, x + 30, x + 68, y, y - 20, '7.6');
      vdim(p, y, y + h, x, x - 40, '34.2 ±0.1');
      vdim(p, y + 12, y + h - 12, x + w, x + w + 34, '29.4');
      leader(p, x + w - 12, y + 12, x + w + 60, y - 6, ['1.2']);
      leader(p, x + 43, y + 55, x - 10, y + h + 50, ['12x 5.2 ±0.05']);
      leader(p, x + w, y + h, x + w + 40, y + h + 34, ['R0.5']);
      leader(p, x + 150, y + h, x + 180, y + h + 60, ['4x M4 INSERT', 'EINPRESSMUTTER']);
      p.text('>PA66-GF30<', x + 90, y + h + 90, DIM);
      notesBlock(p, f.x0 + 14, 470, 'NOTES', [
        'MATERIAL PA66-GF30 TO ISO 16396, COLOUR BLACK RAL 9005.',
        'TOLERANCES NOT STATED: DIN 16742 TG6. ISO 20457 APPLIES.',
        'DRAFT ANGLE 1° UNLESS STATED. NO FLASH ABOVE 0.1.',
        'GATE AND EJECTOR MARKS ONLY IN AREAS SHOWN, 0.2 MAX PROUD.',
        'PART MARKING PER ISO 11469 AND CAVITY NUMBER IN POSITION SHOWN.',
        'NO SINK MARKS OR WELD LINES ON VISIBLE A-SURFACE.',
        'CC = CRITICAL CHARACTERISTIC, Cpk ≥ 1.67.',
      ], 520);
    },
    complete: ['title block', 'material', 'general tolerance', 'coating', 'heat treatment', 'dimensions', 'fits', 'GD&T', 'notes'],
    truth: [
      { name: 'title.partName', value: 'CONNECTOR HOUSING 12-WAY' }, { name: 'title.partNumber', value: 'CH-12W-0093' }, { name: 'title.drawingNumber', value: 'CH-12W-0093-01' },
      { name: 'title.revision', value: '7' }, { name: 'title.scale', value: '5:1' }, { name: 'title.date', value: '2026-07-30' }, { name: 'title.sheet', value: '2/2' },
      { name: 'title.projection', value: 'first angle' }, { name: 'part.mass', value: 0.018 },
      { name: 'material.designation', value: 'PA66-GF30' }, { name: 'material.family', value: 'thermoplastic' },
      { name: 'tolerance.general', contains: 'DIN 16742 TG6' },
      { name: 'thread', match: { designation: 'M4', count: 4 } }, { name: 'feature.count.threads', value: 4 },
      { name: 'dimension', match: { type: 'linear', nominal: 56.4, upper: 0.15, lower: -0.15 } }, { name: 'dimension', match: { type: 'linear', nominal: 7.6 } },
      { name: 'dimension', match: { type: 'linear', nominal: 34.2, upper: 0.1, lower: -0.1 } }, { name: 'dimension', match: { type: 'linear', nominal: 29.4 } },
      { name: 'dimension', match: { type: 'linear', nominal: 1.2 } }, { name: 'dimension', match: { type: 'linear', nominal: 5.2, count: 12, upper: 0.05, lower: -0.05 } },
      { name: 'dimension', match: { type: 'radius', nominal: 0.5 } }, { name: 'tolerance.tightest', match: { band: 0.1, nominal: 5.2 } },
      { name: 'note.manufacturing', contains: 'MATERIAL PA66-GF30 TO ISO 16396' }, { name: 'note.manufacturing', contains: 'DIN 16742 TG6' }, { name: 'note.manufacturing', contains: 'DRAFT ANGLE 1°' },
      { name: 'note.manufacturing', contains: 'GATE AND EJECTOR MARKS' }, { name: 'note.manufacturing', contains: 'PART MARKING PER ISO 11469' }, { name: 'note.manufacturing', contains: 'NO SINK MARKS OR WELD LINES' },
      { name: 'note.general', contains: 'CC = CRITICAL CHARACTERISTIC' },
      { name: 'quality.marking', contains: 'ISO 11469' }, { name: 'quality.safetyCritical', value: true }, { name: 'quality.inspection', contains: 'Cpk ≥ 1.67' },
    ],
  },
  {
    name: 'rubber', commodity: 'rubber', size: 'A3',
    draw: p => {
      const f = frame(p, false);
      titleBlock(p, f, 'table', [[
        ['Benennung', 'DICHTUNGSPROFIL'], ['Zeichnungs-Nr.', 'DP-3310'], ['Sach-Nr.', 'A 331 098 12'], ['Index', 'A'],
        ['Werkstoff', 'EPDM 70 Shore A'], ['Toleranzen', 'ISO 3302-1 M2'], ['Maßstab', '2:1'], ['Datum', '08.09.2026'], ['Blatt', '1'],
      ]], 140 * MM);
      const cx = 300, cy = 260;
      p.circle(cx, cy, 90, 1.0); p.circle(cx, cy, 62, 1.0); p.line(cx - 104, cy, cx + 104, cy, 0.25); p.line(cx, cy - 104, cx, cy + 104, 0.25);
      p.rect(cx + 190, cy - 90, 40, 180, 1.0); hatch(p, cx + 190, cy - 90, 40, 28); hatch(p, cx + 190, cy + 62, 40, 28);
      leader(p, cx + 64, cy - 64, cx + 80, cy - 130, ['Ø64 ±0.5']);
      leader(p, cx - 44, cy + 44, cx - 150, cy + 150, ['Ø44 ±0.4']);
      hdim(p, cx + 190, cx + 230, cy - 90, cy - 120, '14 ±0.3');
      vdim(p, cy - 90, cy - 62, cx + 230, cx + 262, '10');
      notesBlock(p, 640, 110, 'HINWEISE', [
        'Werkstoff EPDM 70 ±5 Shore A nach DIN ISO 1629, peroxidisch vernetzt.',
        'Maßtoleranzen nach ISO 3302-1 Klasse M2.',
        'Gratfrei im Dichtbereich, Grat max. 0,2 außerhalb.',
        'Teile frei von Trennmittel und silikonfrei.',
        'Kennzeichnung nach VDA 260.',
      ], 440, 'dot');
    },
    complete: ['title block', 'material', 'general tolerance', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes'],
    truth: [
      { name: 'title.partName', value: 'DICHTUNGSPROFIL' }, { name: 'title.drawingNumber', value: 'DP-3310' }, { name: 'title.partNumber', value: 'A 331 098 12' },
      { name: 'title.revision', value: 'A' }, { name: 'title.scale', value: '2:1' }, { name: 'title.date', value: '08.09.2026' }, { name: 'title.sheet', value: '1' },
      { name: 'material.designation', value: 'EPDM 70 Shore A' }, { name: 'material.family', value: 'elastomer' },
      { name: 'tolerance.general', contains: 'ISO 3302-1 M2' },
      { name: 'dimension', match: { type: 'diameter', nominal: 64, upper: 0.5, lower: -0.5 } }, { name: 'dimension', match: { type: 'diameter', nominal: 44, upper: 0.4, lower: -0.4 } },
      { name: 'dimension', match: { type: 'linear', nominal: 14, upper: 0.3, lower: -0.3 } }, { name: 'dimension', match: { type: 'linear', nominal: 10 } },
      { name: 'tolerance.tightest', match: { band: 0.6, nominal: 14 } },
      { name: 'note.manufacturing', contains: 'Werkstoff EPDM 70 ±5 Shore A' }, { name: 'note.manufacturing', contains: 'ISO 3302-1 Klasse M2' },
      { name: 'note.manufacturing', contains: 'Gratfrei im Dichtbereich' }, { name: 'note.general', contains: 'frei von Trennmittel' }, { name: 'note.manufacturing', contains: 'Kennzeichnung nach VDA 260' },
      { name: 'quality.marking', contains: 'VDA 260' },
    ],
  },
  {
    name: 'gear', commodity: 'gear', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'cell', [
        [['TITLE', 'HELICAL GEAR Z23'], ['MATERIAL', '16MnCr5  EN ISO 683-3']],
        [['PART NO.', 'HG-23-0417'], ['DWG NO.', 'HG-23-0417'], ['REV', 'B']],
        [['HEAT TREATMENT', 'CASE HARDEN  58-62 HRC'], ['GENERAL TOLERANCE', 'ISO 2768-mK'], ['MASS', '0.61 kg']],
        [['SCALE', '1:1'], ['DATE', '2026-04-02'], ['SHEET', '1 OF 1'], ['CHECKED', 'T. BAUER']],
      ]);
      const cx = 260, cy = 260;
      p.circle(cx, cy, 96, 1.0); p.circle(cx, cy, 88, 0.3); p.circle(cx, cy, 34, 1.0); p.rect(cx - 8, cy - 42, 16, 12, 0.7);
      p.line(cx - 110, cy, cx + 110, cy, 0.25); p.line(cx, cy - 110, cx, cy + 110, 0.25);
      p.rect(cx + 190, cy - 96, 50, 192, 1.0); hatch(p, cx + 190, cy - 96, 50, 62); hatch(p, cx + 190, cy + 34, 50, 62);
      leader(p, cx + 24, cy - 24, cx + 40, cy - 150, ['Ø25 H7']);
      leader(p, cx + 68, cy + 68, cx + 60, cy + 150, ['Ø64.52 h9']);
      hdim(p, cx - 8, cx + 8, cy - 42, cy - 124, '8 P9');
      hdim(p, cx + 190, cx + 240, cy - 96, cy - 124, '20', { upper: '0', lower: '-0.1' });
      roughness(p, cx + 250, cy - 70, 'Rz 6.3');
      fcf(p, cx + 300, cy + 60, ['↗', '0.02', 'A']);
      datum(p, cx - 60, cy + 96, 'A');
      // gear data table
      const tx = 700, ty = 90, rh = 17; const rows: Array<[string, string, string]> = [
        ['NUMBER OF TEETH', 'z', '23'], ['NORMAL MODULE', 'mn', '2.5'], ['PRESSURE ANGLE', 'α', '20°'], ['HELIX ANGLE', 'β', '15° RH'],
        ['FACE WIDTH', 'b', '20'], ['PROFILE SHIFT COEFFICIENT', 'x', '+0.25'], ['GEAR QUALITY', '', 'ISO 1328 CLASS 6'],
      ];
      p.text('GEAR DATA', tx, ty - 6, DIM);
      p.rect(tx, ty, 330, rh * rows.length, 0.7); p.line(tx + 190, ty, tx + 190, ty + rh * rows.length, 0.4); p.line(tx + 225, ty, tx + 225, ty + rh * rows.length, 0.4);
      rows.forEach(([a, b, c], i) => { if (i > 0) p.line(tx, ty + rh * i, tx + 330, ty + rh * i, 0.4); p.text(a, tx + 4, ty + rh * i + 12, SMALL + 1); p.text(b, tx + 198, ty + rh * i + 12, SMALL + 1); p.text(c, tx + 232, ty + rh * i + 12, SMALL + 1); });
      notesBlock(p, f.x0 + 14, 470, 'NOTES:', [
        'CASE HARDENED AND TEMPERED. CHD 550 HV1 0.6-0.9 mm.',
        'SURFACE HARDNESS 58-62 HRC, CORE HARDNESS 30-42 HRC.',
        'TOOTH FLANKS GROUND AFTER HEAT TREATMENT.',
        '100% CRACK DETECTION AFTER GRINDING.',
        'BREAK SHARP EDGES 0.2-0.5.',
      ], 520);
    },
    complete: ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes', 'gear'],
    truth: [
      { name: 'title.partName', value: 'HELICAL GEAR Z23' }, { name: 'title.partNumber', value: 'HG-23-0417' }, { name: 'title.drawingNumber', value: 'HG-23-0417' },
      { name: 'title.revision', value: 'B' }, { name: 'title.scale', value: '1:1' }, { name: 'title.date', value: '2026-04-02' }, { name: 'title.sheet', value: '1/1' }, { name: 'part.mass', value: 0.61 },
      { name: 'material.designation', value: '16MnCr5' }, { name: 'material.standard', value: 'EN ISO 683-3' }, { name: 'material.family', value: 'steel' },
      { name: 'tolerance.general', contains: 'ISO 2768-mK' }, { name: 'tolerance.generalClass', value: 'medium' },
      { name: 'finish.roughness', match: { parameter: 'Rz', value: 6.3 } },
      { name: 'heatTreat.process', value: 'case-harden' }, { name: 'heatTreat.process', value: 'temper' },
      { name: 'heatTreat.hardness', match: { min: 58, max: 62, scale: 'HRC' } }, { name: 'heatTreat.hardness', match: { min: 30, max: 42, scale: 'HRC' } },
      { name: 'heatTreat.caseDepth', match: { type: 'CHD', min: 0.6, max: 0.9 } },
      { name: 'hole.diameter', match: { diameter: 25, fit: 'H7', upper: 0.021, lower: 0 } },
      { name: 'dimension', match: { type: 'diameter', nominal: 64.52, fit: 'h9', upper: 0, lower: -0.074 } },
      { name: 'dimension', match: { type: 'linear', nominal: 8, fit: 'P9', upper: -0.015, lower: -0.051 } },
      { name: 'dimension', match: { type: 'linear', nominal: 20, upper: 0, lower: -0.1 } },
      { name: 'tolerance.tightest', match: { band: 0.021, nominal: 25 } }, { name: 'feature.count.holes', value: 1 },
      { name: 'gdt.frame', match: { characteristic: 'circular run-out', tolerance: 0.02, datums: ['A'] } }, { name: 'gdt.datum', value: 'A' },
      { name: 'gear.teeth', value: 23 }, { name: 'gear.module', value: 2.5 }, { name: 'gear.pressureAngle', value: 20 }, { name: 'gear.helixAngle', value: 15 }, { name: 'gear.helixHand', value: 'right' },
      { name: 'gear.faceWidth', value: 20 }, { name: 'gear.profileShift', value: 0.25 }, { name: 'gear.qualityClass', contains: 'ISO 1328 CLASS 6' },
      { name: 'note.manufacturing', contains: 'CASE HARDENED AND TEMPERED' }, { name: 'note.manufacturing', contains: 'SURFACE HARDNESS 58-62 HRC' }, { name: 'note.manufacturing', contains: 'TOOTH FLANKS GROUND' },
      { name: 'note.manufacturing', contains: '100% CRACK DETECTION' }, { name: 'note.manufacturing', contains: 'BREAK SHARP EDGES' },
    ],
  },
  {
    name: 'extrusion', commodity: 'aluminium extrusion', size: 'A3',
    draw: p => {
      const f = frame(p, true);
      titleBlock(p, f, 'table', [[
        ['Benennung', 'STRANGPRESSPROFIL LÄNGSTRÄGER'], ['Zeichnungsnummer', 'LT-6063-220'], ['Teilenummer', 'LT 220 771'], ['Änderungsindex', 'C'],
        ['Werkstoff', 'EN AW-6063 T66  DIN EN 755-2'], ['Allgemeintoleranz', 'DIN EN 755-9'], ['Oberfläche', 'eloxiert E6/EV1, 15 µm'], ['Masse', '2,35 kg'],
        ['Maßstab', '1:1'], ['Datum', '2026-08-18'], ['Blatt', '1 / 1'],
      ]], 160 * MM);
      const x = 140, y = 130, w = 220, h = 150, t = 8;
      p.rect(x, y, w, h, 1.0); p.rect(x + t, y + t, w / 2 - 1.5 * t, h - 2 * t, 0.8); p.rect(x + w / 2 + t / 2, y + t, w / 2 - 1.5 * t, h - 2 * t, 0.8);
      hdim(p, x, x + w, y, y - 44, '80 ±0.6');
      vdim(p, y, y + h, x, x - 40, '55 ±0.5');
      hdim(p, x, x + t, y + h, y + h + 34, '3');
      leader(p, x + w / 2, y + 40, x + w + 60, y + 20, ['2.5 ±0.25']);
      leader(p, x + w, y + h, x + w + 50, y + h + 30, ['R1']);
      p.rect(x + 420, y + 30, 330, 60, 1.0);
      hdim(p, x + 420, x + 750, y + 30, y - 6, '1200', { upper: '+2', lower: '0' });
      notesBlock(p, f.x0 + 14, 440, 'ANMERKUNGEN:', [
        'Strangpressprofil EN AW-6063 T66, Maßtoleranzen nach DIN EN 755-9.',
        'Warmausgelagert, Härte min. 75 HBW.',
        'Sichtflächen eloxiert E6/EV1, Schichtdicke 15 µm.',
        'Schnittkanten entgratet.',
        'Geradheit max. 1,5 mm/m.',
      ], 520, 'dot');
    },
    complete: ['title block', 'material', 'general tolerance', 'coating', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes'],
    truth: [
      { name: 'title.partName', value: 'STRANGPRESSPROFIL LÄNGSTRÄGER' }, { name: 'title.drawingNumber', value: 'LT-6063-220' }, { name: 'title.partNumber', value: 'LT 220 771' },
      { name: 'title.revision', value: 'C' }, { name: 'title.scale', value: '1:1' }, { name: 'title.date', value: '2026-08-18' }, { name: 'title.sheet', value: '1/1' }, { name: 'part.mass', value: 2.35 },
      { name: 'material.designation', value: 'EN AW-6063 T66' }, { name: 'material.standard', value: 'DIN EN 755-2' }, { name: 'material.family', value: 'aluminium (wrought)' }, { name: 'material.condition', value: 'T66' },
      { name: 'tolerance.general', contains: 'DIN EN 755-9' },
      { name: 'finish.coating', contains: 'eloxiert E6/EV1, 15 µm' }, { name: 'finish.coating', contains: 'Sichtflächen eloxiert E6/EV1' }, { name: 'finish.coatingRoute', value: 'anodise' }, { name: 'finish.coatingThickness', match: { nominal: 15 } },
      { name: 'heatTreat.process', value: 'age-harden' }, { name: 'heatTreat.hardness', match: { min: 75, scale: 'HBW' } },
      { name: 'dimension', match: { type: 'linear', nominal: 80, upper: 0.6, lower: -0.6 } }, { name: 'dimension', match: { type: 'linear', nominal: 55, upper: 0.5, lower: -0.5 } },
      { name: 'dimension', match: { type: 'linear', nominal: 3 } }, { name: 'dimension', match: { type: 'linear', nominal: 2.5, upper: 0.25, lower: -0.25 } },
      { name: 'dimension', match: { type: 'radius', nominal: 1 } }, { name: 'dimension', match: { type: 'linear', nominal: 1200, upper: 2, lower: 0 } },
      { name: 'tolerance.tightest', match: { band: 0.5, nominal: 2.5 } },
      { name: 'note.manufacturing', contains: 'Strangpressprofil EN AW-6063 T66' }, { name: 'note.manufacturing', contains: 'Warmausgelagert, Härte min. 75 HBW' },
      { name: 'note.manufacturing', contains: 'Sichtflächen eloxiert' }, { name: 'note.manufacturing', contains: 'Schnittkanten entgratet' }, { name: 'note.general', contains: 'Geradheit max. 1,5 mm/m' },
    ],
  },
  {
    name: 'composite', commodity: 'composites', size: 'A3',
    draw: p => {
      const f = frame(p, false);
      titleBlock(p, f, 'cell', [
        [['TITLE', 'ROOF BOW PANEL'], ['MATERIAL', 'CFRP PREPREG, EPOXY, 8 PLIES']],
        [['PART NO.', 'RB-0450-CF'], ['DRAWING NO.', 'RB-0450'], ['REV', 'A']],
        [['GENERAL TOLERANCE', 'ISO 2768-cL'], ['MASS', '0.95 kg'], ['UNITS', 'mm']],
        [['SCALE', '1:5'], ['DATE', '2026-09-11'], ['SHEET', '1 OF 1'], ['APPROVED', 'L. MOREAU']],
      ]);
      const x = 130, y = 150, w = 420, h = 160;
      const pts: Array<[number, number]> = [[0, 20], [w, 0], [w, h], [0, h - 20]];
      for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; p.line(x + a[0], y + a[1], x + b[0], y + b[1], 1.0); }
      hole(p, x + 40, y + 80, 7); hole(p, x + w - 40, y + 80, 7);
      hdim(p, x, x + w, y, y - 40, '1050 ±1.5');
      vdim(p, y, y + h, x + w, x + w + 40, '400 ±1');
      leader(p, x + 40 + 5, y + 80 - 5, x + 90, y + 40, ['2x Ø6.2 THRU']);
      p.text('2.1 ±0.2', x + 200, y + h + 40, DIM); p.line(x + 190, y + h + 44, x + 250, y + h + 44, 0.3);
      notesBlock(p, 660, 110, 'NOTES', [
        'LAMINATE: 8 PLIES CARBON FIBRE EPOXY PREPREG, LAY-UP [0/90/+45/-45]s.',
        'CURE IN AUTOCLAVE AT 180 °C, 7 bar.',
        '100% ULTRASONIC C-SCAN INSPECTION, NO DELAMINATION ALLOWED.',
        'TRIM EDGES BY WATERJET, PROFILE TOLERANCE ±0.5.',
        'A-SURFACE CLEAR COAT 40-60 µm.',
        'DIMENSIONS IN MILLIMETRES.',
      ], 440);
    },
    complete: ['title block', 'material', 'general tolerance', 'heat treatment', 'threads', 'dimensions', 'fits', 'GD&T', 'notes'],
    truth: [
      { name: 'title.partName', value: 'ROOF BOW PANEL' }, { name: 'title.partNumber', value: 'RB-0450-CF' }, { name: 'title.drawingNumber', value: 'RB-0450' },
      { name: 'title.revision', value: 'A' }, { name: 'title.scale', value: '1:5' }, { name: 'title.date', value: '2026-09-11' }, { name: 'title.sheet', value: '1/1' },
      { name: 'title.units', value: 'mm' }, { name: 'part.mass', value: 0.95 },
      { name: 'material.designation', contains: 'CFRP' }, { name: 'material.family', value: 'composite' },
      { name: 'tolerance.general', contains: 'ISO 2768-cL' }, { name: 'tolerance.generalClass', value: 'coarse' },
      { name: 'dimension', match: { type: 'linear', nominal: 1050, upper: 1.5, lower: -1.5 } }, { name: 'dimension', match: { type: 'linear', nominal: 400, upper: 1, lower: -1 } },
      { name: 'dimension', match: { type: 'linear', nominal: 2.1, upper: 0.2, lower: -0.2 } },
      { name: 'hole.diameter', match: { diameter: 6.2, count: 2, through: true } }, { name: 'tolerance.tightest', match: { band: 0.4, nominal: 2.1 } }, { name: 'feature.count.holes', value: 2 },
      { name: 'note.manufacturing', contains: 'LAMINATE: 8 PLIES CARBON FIBRE EPOXY PREPREG' }, { name: 'note.manufacturing', contains: 'CURE IN AUTOCLAVE' },
      { name: 'note.manufacturing', contains: 'ULTRASONIC C-SCAN' }, { name: 'note.manufacturing', contains: 'TRIM EDGES BY WATERJET' },
      { name: 'note.manufacturing', contains: 'CLEAR COAT 40-60 µm' }, { name: 'note.general', contains: 'DIMENSIONS IN MILLIMETRES' },
      { name: 'quality.ndt', contains: 'ULTRASONIC C-SCAN' },
    ],
  },
  ...REAL_SPECS,
];

// ── Scans ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Deterministic noise source (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** What a flatbed scan does to a print: a small skew, soft edges, paper tone, grain and specks. */
function scanify(g: Grey, skewDeg: number, seed: number): Grey {
  const r = rotateGrey(g, skewDeg);
  const { data, width: w, height: h } = r;
  const out = new Uint8Array(data.length);
  const rand = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    // 3×3 box blur (edge pixels kept)
    let v = data[i];
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      v = (data[i - w - 1] + data[i - w] + data[i - w + 1] + data[i - 1] + 2 * data[i] + data[i + 1] + data[i + w - 1] + data[i + w] + data[i + w + 1]) / 10;
    }
    v = 18 + v * (236 / 255);                                 // paper is not white, ink is not black
    v += (rand() - 0.5) * 22;                                 // grain
    const s = rand();
    if (s < 0.00035) v = 30 + rand() * 60;                    // pepper
    else if (s > 0.9997) v = 250;
    out[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return { data: out, width: w, height: h };
}

function encode(g: Grey, type: 'image/jpeg' | 'image/png', quality = 55): Buffer {
  const c = canvasLib.createCanvas(g.width, g.height); const ctx = c.getContext('2d');
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = g.data[i]; img.data[j + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return type === 'image/jpeg' ? c.toBuffer('image/jpeg', quality) : c.toBuffer('image/png');
}

function imagePdf(jpeg: Buffer, wPt: number, hPt: number): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: [wPt, hPt], orientation: wPt > hPt ? 'landscape' : 'portrait', compress: true });
  doc.setCreationDate(new Date(Date.UTC(2026, 10, 9, 12, 0, 0))); doc.setFileId('C0577151000000000000000000000002');
  doc.addImage(new Uint8Array(jpeg), 'JPEG', 0, 0, wPt, hPt, undefined, 'NONE');
  return Buffer.from(doc.output('arraybuffer'));
}

async function main(): Promise<void> {
  if (!existsSync(TEXT_FONT) || !existsSync(SYM_FONT)) {
    console.error(`Fonts not found (${TEXT_FONT}, ${SYM_FONT}). Set CV_FIXTURE_FONT / CV_FIXTURE_SYMBOL_FONT to TrueType files.`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const tb = readFileSync(TEXT_FONT), sb = readFileSync(SYM_FONT);
  const tf = opentype.parse(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.length)), sf = opentype.parse(sb.buffer.slice(sb.byteOffset, sb.byteOffset + sb.length));
  const tB64 = tb.toString('base64'), sB64 = sb.toString('base64');
  const SIZES = { A3: [420 * MM, 297 * MM], A2: [594 * MM, 420 * MM] } as const;
  const scan300 = new Set(['casting', 'gear']);
  let n = 0;
  for (const spec of SPECS) {
    const [W, H] = SIZES[spec.size];
    const files: Record<string, Buffer> = {};
    if (spec.prefix === 'real') {
      // A drawing for a real part: the vector sheet and what it states. No curves / scan variants.
      const pen = new Pen(W, H, 'text', !!spec.turned, tf, sf, tB64, sB64);
      spec.draw(pen);
      files[`real-${spec.name}.pdf`] = pen.bytes();
      files[`real-${spec.name}.truth.json`] = Buffer.from(JSON.stringify({
        drawing: `real-${spec.name}`, commodity: spec.commodity, origin: 'real-part', forPart: spec.forPart,
        source: 'scripts/drawings/make-fixture-drawings.ts',
        checked: 'Typed by hand beside the drawing content in the generator; not produced by the reader.',
        complete: spec.complete, expect: spec.truth,
      }, null, 1) + '\n');
      for (const [name, buf] of Object.entries(files)) { writeFileSync(join(OUT, name), buf); console.log(`${name.padEnd(34)} ${(buf.length / 1024).toFixed(0).padStart(6)} KB`); }
      continue;
    }
    for (const mode of ['text', 'curves'] as const) {
      const pen = new Pen(W, H, mode, !!spec.turned, tf, sf, tB64, sB64);
      spec.draw(pen);
      files[mode === 'text' ? `gen-${spec.name}.pdf` : `gen-${spec.name}.curves.pdf`] = pen.bytes();
    }
    // scans are made from the vector sheet, as a print of it would be
    const { doc } = await openPdf(new Uint8Array(files[`gen-${spec.name}.pdf`]));
    const pw = spec.turned ? H : W, ph = spec.turned ? W : H;
    for (const dpi of scan300.has(spec.name) ? [200, 300] : [200]) {
      const r = await renderPdfPage(doc, 1, dpi);
      const skew = ((n % 5) - 2) * 0.35 + 0.2;                 // −0.5° … +0.9°, different on every sheet
      const g = scanify(r.grey, skew, 1000 + n);
      files[`gen-${spec.name}.scan${dpi}.pdf`] = imagePdf(encode(g, 'image/jpeg', dpi === 300 ? 45 : 55), pw, ph);
      if (spec.name === 'moulding' && dpi === 200) files[`gen-${spec.name}.scan200.jpg`] = encode(g, 'image/jpeg', 55);
      n++;
    }
    await closePdf(doc);
    const truth = {
      drawing: `gen-${spec.name}`, commodity: spec.commodity, origin: 'generated',
      source: 'scripts/drawings/make-fixture-drawings.ts',
      checked: 'Typed by hand beside the drawing content in the generator; not produced by the reader.',
      complete: spec.complete, expect: spec.truth,
    };
    files[`gen-${spec.name}.truth.json`] = Buffer.from(JSON.stringify(truth, null, 1) + '\n');
    for (const [name, buf] of Object.entries(files)) { writeFileSync(join(OUT, name), buf); console.log(`${name.padEnd(34)} ${(buf.length / 1024).toFixed(0).padStart(6)} KB`); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
