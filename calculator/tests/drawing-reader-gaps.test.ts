/**
 * Gaps found by the independent measurement of the drawing reader (10 Nov 2026, 44 public drawings with hand-written
 * truth): D01 stroke-font sheets classed as text, D02 a scanner's invisible OCR layer taken as exact text, D03 the
 * material grammar missing the forms real drawings use, D12 a flag-note number glued to the callout beside it.
 *
 * Every input here is synthetic (built in the test) or a committed fixture: the downloaded public set is not committed.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readDrawing, ocrWouldRead } from '../server/drawing/index';
import { openPdf, closePdf, classifySheet, hasScannerTextLayer, textLayerIsThin } from '../server/drawing/ingest';
import { readPdfPage } from '../server/drawing/pdf-vector';
import { assembleLines } from '../server/drawing/text-lines';
import { findDesignations, conditionOf, extractMaterial } from '../server/drawing/extract/material';
import { findGeneralTolerances } from '../server/drawing/extract/general-tolerance';
import { extractDimensions } from '../server/drawing/extract/dimensions';
import type { OcrEngine, RawTextItem } from '../server/drawing/types';
import { ctxOf, box } from './drawing-helpers';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { jsPDF } = require('jspdf');

/** An OCR engine that reads nothing: the reader's own handling is what is under test, not Tesseract. */
const blindOcr: OcrEngine = { name: 'blind', recognise: async () => [], close: async () => {} };

async function pageOf(bytes: ArrayBuffer) {
  const { doc } = await openPdf(new Uint8Array(bytes));
  try { return await readPdfPage(doc, 1, 0); } finally { await closePdf(doc); }
}

/**
 * A sheet whose annotation is a STROKE font (Siemens NX style): every letter a short stroked polyline, in rows, and the
 * only selectable text a plot stamp — as on the NIST D2MI sheets. The letters are zig-zags and hooks of letter size.
 */
function strokeFontSheet(): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  doc.setLineWidth(0.5);
  doc.rect(20, 20, 802, 555);                                   // border
  for (let i = 0; i < 60; i++) doc.line(100 + 10 * i, 120, 100 + 10 * i, 300);   // the views' line work
  const shapes: number[][][] = [
    [[5, 0], [-5, 7], [5, 0]],                                   // Z
    [[0, 7], [4, -3.5], [0, -3.5]],                              // a hook
    [[2.5, 7], [2.5, -7]],                                       // Λ
    [[4, 0], [0, 3.5], [-4, 0], [0, 3.5], [4, 0]],               // S / 5 like
  ];
  for (let row = 0; row < 6; row++) {
    for (let k = 0; k < 18; k++) {
      doc.lines(shapes[(row + k) % shapes.length], 120 + 6.5 * k + (k >= 9 ? 8 : 0), 360 + 22 * row, [1, 1], 'S', false);
    }
  }
  doc.setFontSize(6);
  doc.text('20150310.1524 [NX8] File: 827-9999-903 plot stamp', 30, 570);
  return doc.output('arraybuffer');
}

/** A tiny opaque PNG (napi-rs canvas) to scale over the page as the "scan". */
function scanPng(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('@napi-rs/canvas');
  const c = createCanvas(16, 12);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 16, 12);
  g.fillStyle = '#202020'; g.fillRect(3, 3, 10, 1);
  return 'data:image/png;base64,' + c.toBuffer('image/png').toString('base64');
}

/**
 * A scanned page made "searchable": a full-page image, an INVISIBLE text layer (render mode 3) holding a scanner's
 * OCR, and some line work added on top (a stamp, a frame) — more than the 20 path operators the old test allowed.
 */
function searchableScan(opts: { invisible: boolean; textUnderImage?: boolean }): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const words = ['MATERIAL: EN-GJS-500-7', 'GENERAL TOLERANCES ISO 2768-mK', 'M10x1.5-6H THRU', 'Ø12 H7', 'NOTE 1. BREAK ALL SHARP EDGES'];
  const writeText = (): void => {
    doc.setFontSize(9);
    words.forEach((w, i) => doc.text(w, 60, 80 + 18 * i, opts.invisible ? { renderingMode: 'invisible' } : undefined));
  };
  if (opts.textUnderImage) writeText();
  doc.addImage(scanPng(), 'PNG', 0, 0, 842, 595);
  if (!opts.textUnderImage) writeText();
  doc.setLineWidth(0.4);
  for (let i = 0; i < 30; i++) doc.line(400 + 8 * i, 400, 400 + 8 * i, 440);   // a stamp's hatching: 30 path operators
  return doc.output('arraybuffer');
}

describe('D01 — a sheet whose text layer does not carry the drawing\'s words goes to OCR', () => {
  it('the NIST D2MI page statistics (sheet-stats of the validation run) are text drawn as strokes, not vector text', () => {
    // measured: 3,371 path operators, 0 filled glyph outlines, 67 characters in 3 runs (the NX plot stamp), 319 stroke letters
    const d2mi = { pathOps: 3371, glyphLikePaths: 0, imageCoverage: 0, textChars: 67, textItems: 3, strokeGlyphPaths: 319 };
    expect(classifySheet(d2mi)).toBe('text-as-curves');
    // the same sheet with no stroke count at all: heavy line work beside a plot stamp is still not "vector text"
    expect(classifySheet({ ...d2mi, strokeGlyphPaths: undefined })).toBe('text-as-curves');
  });
  it('a vector sheet with some small stroked shapes (logo, isometric detail) stays vector text', () => {
    // SeedMint faceplate: 103 stroke runs beside 216 characters in 53 runs; NIST FTC-07 sheet 4: 93 beside 212
    expect(classifySheet({ pathOps: 380, glyphLikePaths: 0, imageCoverage: 0.04, textChars: 216, textItems: 53, strokeGlyphPaths: 103 })).toBe('vector-text');
    expect(classifySheet({ pathOps: 394, glyphLikePaths: 0, imageCoverage: 0, textChars: 212, textItems: 20, strokeGlyphPaths: 93 })).toBe('vector-text');
    // NIST FTC-11 sheet 2: few runs, but modest line work
    expect(textLayerIsThin({ pathOps: 821, glyphLikePaths: 51, imageCoverage: 0, textChars: 108, textItems: 5, strokeGlyphPaths: 0 })).toBe(false);
  });
  it('a synthetic stroke-font sheet: the stroke letters are counted and the sheet is classed text-as-curves', async () => {
    const s = await pageOf(strokeFontSheet());
    expect(s.stats.textChars).toBeGreaterThanOrEqual(25);
    expect(s.stats.glyphLikePaths).toBe(0);                     // no FILLED glyph outlines: the old evidence is absent
    expect(s.stats.strokeGlyphPaths ?? 0).toBeGreaterThanOrEqual(80);
    expect(s.info.content).toBe('text-as-curves');
  });
  it('read with OCR off, the server is told OCR would read it, and the warning says why', async () => {
    const ex = await readDrawing(Buffer.from(strokeFontSheet()), 'stroke.pdf', { ocr: 'off' });
    expect(ex.sheets[0].content).toBe('text-as-curves');
    expect(ocrWouldRead(ex)).toBe(true);
    expect(ex.warnings.join(' ')).toMatch(/only \d+ characters of selectable text .* not the drawing's annotation/);
  });
  it('when OCR still reads (almost) nothing, the sheet says so — never an empty panel with no reason', async () => {
    const ex = await readDrawing(Buffer.from(strokeFontSheet()), 'stroke.pdf', { ocrEngine: blindOcr });
    expect(ex.warnings.join(' ')).toMatch(/almost no text was read from it \(\d+ characters, OCR included\)/);
  });
});

describe('D02 — a scanner\'s invisible OCR layer is not exact text', () => {
  it('statistics: a full-page image with an invisible text layer is a scan whatever its path count', () => {
    const st = { pathOps: 28, glyphLikePaths: 0, imageCoverage: 1, textChars: 189, textItems: 40, hiddenTextShare: 1 };
    expect(hasScannerTextLayer(st)).toBe(true);
    expect(classifySheet(st)).toBe('scanned');
    // a vector sheet that carries an invisible copy of its text (NIST FTC-07 / FTC-10 do) and no image is still vector text
    expect(classifySheet({ pathOps: 747, glyphLikePaths: 0, imageCoverage: 0, textChars: 322, textItems: 63, hiddenTextShare: 0.63 })).toBe('vector-text');
  });
  it('a synthetic searchable scan (image + render-mode-3 text + 30 path operators): classed scanned, the layer ignored', async () => {
    const pdf = searchableScan({ invisible: true });
    const s = await pageOf(pdf);
    expect(s.stats.pathOps).toBeGreaterThanOrEqual(20);
    expect(s.stats.hiddenTextShare).toBeGreaterThanOrEqual(0.99);
    expect(s.info.content).toBe('scanned');
    const ex = await readDrawing(Buffer.from(pdf), 'scan.pdf', { ocr: 'off' });
    expect(ex.parameters.filter(p => p.method === 'pdf-text')).toEqual([]);
    expect(ex.warnings.join(' ')).toMatch(/text layer added by a scanner \(its text is invisible or lies under the scanned image\)/);
    expect(ocrWouldRead(ex)).toBe(true);
  });
  it('text painted UNDER an opaque full-page image is hidden too', async () => {
    const s = await pageOf(searchableScan({ invisible: false, textUnderImage: true }));
    expect(s.stats.hiddenTextShare).toBeGreaterThanOrEqual(0.99);
    expect(s.info.content).toBe('scanned');
  });
  it('visible text written OVER a scanned image is the author\'s own text and is kept', async () => {
    const s = await pageOf(searchableScan({ invisible: false }));
    expect(s.stats.hiddenTextShare).toBe(0);
    expect(s.info.content).toBe('vector-text');
  });
});

const des = (t: string, weak = false) => findDesignations(t, weak).map(h => `${h.designation}|${h.family}`);

describe('D03 — the material forms real drawings use', () => {
  it('aluminium: temper written "H-32", the metal named after it, the AL prefix', () => {
    expect(des('5052 H-32 Aluminum')).toEqual(['5052 H-32 Aluminum|aluminium (wrought)']);
    expect(des('5052 H32 AL, 2.03 MM THICK')).toEqual(['5052 H32 AL|aluminium (wrought)']);
    expect(des('AL 5052-H32')).toEqual(['AL 5052-H32|aluminium (wrought)']);
    expect(des('5052-H32')).toEqual(['5052-H32|aluminium (wrought)']);
    expect(conditionOf('5052 H-32 Aluminum')).toBe('H32');
    expect(conditionOf('AL 5052-H32')).toBe('H32');
  });
  it('stainless by number and word, either order; GB forms', () => {
    expect(des('304 Stainless Steel')).toEqual(['304 Stainless Steel|steel']);
    expect(des('303 SST')).toEqual(['303 SST|steel']);
    expect(des('STAINLESS STEEL 304')).toEqual(['STAINLESS STEEL 304|steel']);
    expect(des('(.1195 THICK) 11 GA 304 SST SHT, ASTM A240.')).toEqual(['304 SST|steel']);
    expect(des('6061铝')).toEqual(['6061铝|aluminium (wrought)']);
    expect(des('45钢')).toEqual(['45钢|steel']);
    expect(des('Q235B', true)).toEqual(['Q235B|steel']);
  });
  it('a bare alloy number or a family word is a material ONLY where the drawing says it is the material', () => {
    for (const t of ['6061', '6061-T6 X', '2X 6061 HOLES', 'Brass', 'Steel', 'Q235', '304']) {
      expect(findDesignations(t, false).filter(h => h.generic || h.check), t).toEqual([]);
    }
    expect(des('6061', true)).toEqual(['6061|aluminium (wrought)']);
    expect(des('Brass', true)).toEqual(['Brass|copper alloy']);
    expect(des('Steel', true)).toEqual(['Steel|steel']);
    expect(des('4140', true)).toEqual(['4140|steel']);              // an SAE steel number keeps its steel reading
  });
  it('"Mat: Brass", "Mat.: Steel", "MATERIAL: 6061" are read; the family word gives a family, never a grade', () => {
    const run = (text: string) => extractMaterial(ctxOf([{ text, x: 60, y: 700, region: 'other' }]));
    const brass = run('Mat: Brass');
    expect(brass.find(p => p.name === 'material.designation')).toMatchObject({ value: 'Brass', status: 'extracted' });
    expect(brass.find(p => p.name === 'material.family')).toMatchObject({ value: 'copper alloy', kind: 'interpreted' });
    expect(brass.some(p => p.name === 'material.condition' || p.name === 'material.grade')).toBe(false);
    expect(run('Mat.: Steel').find(p => p.name === 'material.family')?.value).toBe('steel');
    expect(run('Mat: 1.2510').find(p => p.name === 'material.designation')?.value).toBe('1.2510');
    const bare = run('MATERIAL: 6061');
    expect(bare.find(p => p.name === 'material.designation')).toMatchObject({ value: '6061', status: 'needs-validation' });
    expect(bare.find(p => p.name === 'material.designation')?.note).toMatch(/bare four-digit number/);
    const t6 = run('MATERIAL: 6061-T6');
    expect(t6.find(p => p.name === 'material.designation')).toMatchObject({ value: '6061-T6', status: 'extracted' });
    expect(t6.find(p => p.name === 'material.condition')?.value).toBe('T6');
  });
  it('a note that merely mentions a material word, or a number away from a material label, gives nothing', () => {
    const out = extractMaterial(ctxOf([
      { text: 'MATERIAL TO BE FREE OF STEEL CHIPS AND BURRS', x: 60, y: 600, region: 'other' },
      { text: '6061', x: 300, y: 300 }, { text: 'BRASS INSERT SUPPLIED BY CUSTOMER', x: 300, y: 340 },
    ]));
    expect(out.filter(p => p.name === 'material.designation')).toEqual([]);
  });
  it('a GB title block: 材料 cell holding a bare "6061"', () => {
    const out = extractMaterial(ctxOf([
      { text: '材料', x: 603, y: 708, size: 5 }, { text: '6061', x: 604, y: 724 },
      { text: 'SCALE', x: 603, y: 740, size: 5 }, { text: 'DATE', x: 660, y: 740, size: 5 },
    ], { layout: true }));
    expect(out.find(p => p.name === 'material.designation')?.value).toBe('6061');
    expect(out.find(p => p.name === 'material.family')?.value).toBe('aluminium (wrought)');
  });
  it('a material cell that only says "See Notes." reads the material from the note, not "See Notes."', () => {
    const out = extractMaterial(ctxOf([
      { text: 'MATERIAL', x: 603, y: 708, size: 5 }, { text: 'See Notes.', x: 604, y: 724 },
      { text: 'SCALE', x: 603, y: 740, size: 5 }, { text: 'DATE', x: 660, y: 740, size: 5 },
      { text: '2. Material: 304 Stainless Steel', x: 40, y: 420 },
    ], { layout: true }));
    const d = out.filter(p => p.name === 'material.designation');
    expect(d.map(p => p.value)).toEqual(['304 Stainless Steel']);
  });
  it('stock thickness: "2.03 MM THICK" in the material statement, "3.175 STK" on a view, "(.1195 THICK)" on an inch drawing', () => {
    const t1 = extractMaterial(ctxOf([{ text: '3. MATERIAL: 5052 H32 AL, 2.03 MM THICK', x: 40, y: 420, region: 'other' }]));
    expect(t1.find(p => p.name === 'material.stockThickness')).toMatchObject({ value: 2.03, unit: 'mm' });
    const t2 = extractMaterial(ctxOf([{ text: '2 Material: 5052 H-32 Aluminum', x: 40, y: 420, region: 'other' }, { text: '3.175 STK', x: 500, y: 300 }]));
    expect(t2.find(p => p.name === 'material.stockThickness')).toMatchObject({ value: 3.175, unit: 'mm', status: 'needs-validation' });
    const t3 = extractMaterial(ctxOf([
      { text: '5. MATERIAL: (.1195 THICK) 11 GA 304 SST SHT, ASTM A240.', x: 40, y: 420, region: 'other' },
      { text: '6. UNITS: INCHES', x: 40, y: 440, region: 'other' },
    ]));
    expect(t3.find(p => p.name === 'material.stockThickness')).toMatchObject({ value: 0.1195, unit: 'in' });
    expect(t3.find(p => p.name === 'material.standard')?.value).toBe('ASTM A240');
    // a coating thickness beside the material is not the stock
    const t4 = extractMaterial(ctxOf([{ text: 'MATERIAL: 6061-T6. ANODISE 25 µm THICK', x: 40, y: 420, region: 'other' }]));
    expect(t4.find(p => p.name === 'material.stockThickness')).toBeUndefined();
  });
});

describe('D12 — a flag-note number is not a digit of the callout beside it', () => {
  const run = (text: string, ox: number, width: number): RawTextItem => ({ text, sheet: 1, ox, oy: 200, width, size: 10, rotation: 0, method: 'pdf-text', reliability: 1 });
  // "8X Ø2.5 ±0.15" then flag note 4 in a triangle whose left side starts just under the end of the callout
  const items = [run('8X Ø2.5 ±0.15', 100, 66), run('4', 165, 5.6)];
  const triangle = { h: [{ x0: 160, y0: 202, x1: 176, y1: 202 }], v: [], o: [{ x0: 160, y0: 202, x1: 168, y1: 189 }, { x0: 168, y0: 189, x1: 176, y1: 202 }] };
  it('the callout and the flag are two lines, the flag marked as such', () => {
    const lines = assembleLines(items, triangle);
    expect(lines.map(l => l.text)).toEqual(['8X Ø2.5 ±0.15', '4']);
    expect(lines[1].flagNote).toBe(true);
    // with no outline around it the "4" is still the callout's (nothing to say otherwise)
    expect(assembleLines(items, { h: [], v: [], o: [] }).map(l => l.text)).toEqual(['8X Ø2.5 ±0.154']);
  });
  it('the hole reads ±0.15, and the flag number is not a dimension', () => {
    const lines = assembleLines(items, triangle);
    for (const l of lines) l.region = 'view';
    const ctx = ctxOf([]);
    ctx.lines = lines; ctx.sheets[0].lines = lines; ctx.sheets[0].oSegs = triangle.o; ctx.sheets[0].hSegs = triangle.h;
    const out = extractDimensions(ctx);
    const hole = out.find(p => p.name === 'hole.diameter');
    expect(hole?.value).toMatchObject({ diameter: 2.5, count: 8, upper: 0.15, lower: -0.15 });
    expect(out.filter(p => p.name === 'dimension' && (p.value as { nominal?: number }).nominal === 4)).toEqual([]);
  });
  it('a box made of the line work around a whole value does not split it', () => {
    // a basic dimension "25" in its frame: the walls are a letter and a half from each glyph centre
    const lines = assembleLines([run('2', 100, 5.6), run('5', 105.6, 5.6)], { ...box(94, 189, 117, 203), o: [] });
    expect(lines.map(l => l.text)).toEqual(['25']);
  });
  it('a profile tolerance that applies to all untoleranced surfaces keeps its whole value', () => {
    expect(findGeneralTolerances('1.5 A B C APPLIES TO ALL UNTOLERANCED SURFACES')[0].written).toBe('1.5 A B C APPLIES TO ALL UNTOLERANCED SURFACES');
    expect(findGeneralTolerances('.5 A B C APPLIES TO ALL UNTOLERANCED SURFACES')[0].written).toBe('.5 A B C APPLIES TO ALL UNTOLERANCED SURFACES');
  });
});
