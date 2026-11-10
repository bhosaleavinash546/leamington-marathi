/**
 * The offline drawing reader end to end (Layer 2, server/drawing): fixtures against hand-checked truth with the
 * measured precision / recall pinned a little below what was measured (so a regression fails), determinism, the
 * OCR-missing fallback, refusals of unreadable files, the worker thread, DXF and TIFF input, and the content classes.
 *
 * Measured on 10 Nov 2026 with `npx tsx scripts/drawings/accuracy.ts` (full tables in the hand-over report):
 *   public   vector 90 % / 50 %   curves 0 correct of 18   scan 100 % / 19 %     (precision / recall)
 *   generated vector 100 % / 100 %   curves 91 % / 73 %   scan 88 % / 65 %
 * The generated set was written by us — its truth is circular for text reading — so it is pinned apart from the public set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readDrawing, stableJson, extractionFingerprint, DrawingReadError, READER_VERSION } from '../server/drawing/index';
import { readDrawingOffThread } from '../server/drawing/worker';
import { detectFileKind, classifySheet, isMixedSheet } from '../server/drawing/ingest';
import { readDxf, plainText } from '../server/drawing/dxf';
import { flattenAndBinarise, estimateSkew, rotateGrey, otsu, despeckle } from '../server/drawing/raster/preprocess';
import { rasterLineWork } from '../server/drawing/raster/lines';
import { isKnownParameter } from '../src/engine/engineering-data/dictionary';
import type { DrawingExtraction } from '../src/engine/engineering-data/model';
import { GROUPS, scoreExtraction, totals, precision, recall, addScores, type GroupScore, type Group, type TruthFile } from '../scripts/drawings/accuracy-lib';

const require = createRequire(import.meta.url);
const FIX = join(__dirname, 'fixtures', 'drawings');
const file = (n: string): Buffer => readFileSync(join(FIX, n));
const truthOf = (base: string): TruthFile => JSON.parse(readFileSync(join(FIX, `${base}.truth.json`), 'utf8')) as TruthFile;
const cache = new Map<string, Promise<DrawingExtraction>>();
const read = (n: string): Promise<DrawingExtraction> => { if (!cache.has(n)) cache.set(n, readDrawing(file(n), n)); return cache.get(n)!; };
const COMMODITIES = ['casting', 'forging', 'machined', 'sheetmetal', 'moulding', 'rubber', 'gear', 'extrusion', 'composite'];

async function scoreSet(files: Array<[string, string]>): Promise<{ groups: Partial<Record<Group, GroupScore>>; all: GroupScore }> {
  const groups: Partial<Record<Group, GroupScore>> = {};
  for (const [f, base] of files) addScores(groups, scoreExtraction(await read(f), truthOf(base)).groups);
  return { groups, all: totals(groups) };
}

describe('generated drawings — vector PDFs (selectable text)', () => {
  it('reads every commodity sheet: precision and recall ≥ 0.99 overall (measured 1.00 / 1.00), no group below 0.97', async () => {
    const { groups, all } = await scoreSet(COMMODITIES.map(c => [`gen-${c}.pdf`, `gen-${c}`]));
    expect(all.correct + all.missed).toBeGreaterThan(330);
    expect(precision(all)!).toBeGreaterThanOrEqual(0.99);
    expect(recall(all)!).toBeGreaterThanOrEqual(0.99);
    for (const g of GROUPS) {
      const s = groups[g]; if (!s) continue;
      expect(precision(s) ?? 1, `precision ${g}`).toBeGreaterThanOrEqual(0.97);
      expect(recall(s) ?? 1, `recall ${g}`).toBeGreaterThanOrEqual(0.97);
    }
  });

  it('every parameter is named from the dictionary, carries its source, location, method and exact-text reliability', async () => {
    for (const c of COMMODITIES) {
      const ex = await read(`gen-${c}.pdf`);
      expect(ex.schemaVersion).toBe(1); expect(ex.readerVersion).toBe(READER_VERSION); expect(ex.fileKind).toBe('pdf');
      expect(ex.sheets[0].content).toBe('vector-text');
      const ids = new Set<string>();
      for (const p of ex.parameters) {
        expect(isKnownParameter(p.name), p.name).toBe(true);
        expect(ids.has(p.id), p.id).toBe(false); ids.add(p.id);
        expect(p.source).toBe('drawing'); expect(p.sourceFile).toBe(`gen-${c}.pdf`); expect(p.method).toBe('pdf-text'); expect(p.reliability).toBe(1);
        expect(['extracted', 'interpreted']).toContain(p.kind); expect(['extracted', 'needs-validation']).toContain(p.status);
        expect(p.rawText, p.name).toBeTruthy();
        const b = p.location!.bbox;
        expect(p.location!.sheet).toBe(1);
        expect(b[0] >= 0 && b[1] >= 0 && b[2] <= ex.sheets[0].widthPt + 1 && b[3] <= ex.sheets[0].heightPt + 1 && b[2] > b[0] && b[3] > b[1], `${p.name} bbox ${b}`).toBe(true);
      }
      // nothing in the output is money
      expect(JSON.stringify(ex.parameters)).not.toMatch(/£|\bGBP\b|cost/i);
    }
  });

  it('places readings: title block, notes, zone, and the turned sheet in page coordinates', async () => {
    const ex = await read('gen-casting.pdf');
    const mat = ex.parameters.find(p => p.name === 'material.designation')!;
    expect(mat.location).toMatchObject({ region: 'title-block', zone: 'F7' });
    expect(ex.parameters.find(p => p.name === 'quality.leakTestSpec')!.location).toMatchObject({ region: 'notes', zone: 'D2' });
    expect(ex.parameters.find(p => p.name === 'thread')!.location!.region).toBe('view');
    // sheet metal: a landscape drawing turned on a portrait page — read upright, located on the page as supplied
    const sm = await read('gen-sheetmetal.pdf');
    expect(sm.sheets[0].widthPt).toBeLessThan(sm.sheets[0].heightPt);
    expect(sm.warnings.join(' ')).toContain('turned 90°');
    const t = sm.text.find(x => x.text === 'SEAT BRACKET LH')!;
    expect(t.rotation).toBe(90);
    expect(t.bbox[3] - t.bbox[1]).toBeGreaterThan(t.bbox[2] - t.bbox[0]);
    // the title block is bottom-right on the drawing, which is the top-right of the page as supplied
    const nb = sm.parameters.find(p => p.name === 'title.partName')!.location!.bbox;
    expect(nb[0]).toBeGreaterThan(0.6 * sm.sheets[0].widthPt);
    expect(nb[3]).toBeLessThan(0.5 * sm.sheets[0].heightPt);
    expect(sm.parameters.find(p => p.name === 'title.partName')!.location!.region).toBe('title-block');
  });

  it('German title block and notes are read like the English ones', async () => {
    const ex = await read('gen-forging.pdf');
    const v = (n: string) => ex.parameters.find(p => p.name === n)?.value;
    expect(v('title.partName')).toBe('ACHSSCHENKEL'); expect(v('title.drawingNumber')).toBe('Z-4471-08'); expect(v('title.scale')).toBe('1:1');
    expect(v('material.designation')).toBe('42CrMo4+QT'); expect(v('tolerance.generalClass')).toBe('medium'); expect(v('part.mass')).toBe(3.2);
    expect(ex.parameters.filter(p => p.name === 'heatTreat.process').map(p => p.value).sort()).toEqual(['induction-harden', 'quench-and-temper']);
  });
});

describe('public drawings (NIST) — truth read off the rendered sheets by hand', () => {
  it('FTC-07, selectable text: precision ≥ 0.85, recall ≥ 0.45 (measured 0.90 / 0.50); notes and dimensions hold', async () => {
    const { groups, all } = await scoreSet([['nist-ftc-07.pdf', 'nist-ftc-07']]);
    expect(precision(all)!).toBeGreaterThanOrEqual(0.85);
    expect(recall(all)!).toBeGreaterThanOrEqual(0.45);
    expect(groups.notes).toMatchObject({ correct: 6, wrong: 0, missed: 0 });
    expect(precision(groups.dimensions!)!).toBeGreaterThanOrEqual(0.9);
    expect(recall(groups.dimensions!)!).toBeGreaterThanOrEqual(0.9);
    // the frames: found, tolerance and datums read, the symbol (drawn as geometry in this file) flagged — never guessed
    expect(groups['GD&T']!.partial).toBeGreaterThanOrEqual(16);
    expect(groups['GD&T']!.wrong).toBeLessThanOrEqual(3);
  });

  it('FTC-07: units, symbol font, stacked tolerances and frames on turned annotation planes', async () => {
    const ex = await read('nist-ftc-07.pdf');
    expect(ex.sheets.map(s => s.content)).toEqual(['vector-text', 'vector-text', 'vector-text', 'vector-text']);
    expect(ex.parameters.find(p => p.name === 'title.units')?.value).toBe('in');
    const holes = ex.parameters.filter(p => p.name === 'hole.diameter' && p.location!.sheet === 1).map(p => p.value);
    expect(holes).toContainEqual({ diameter: 0.25, count: 4, upper: 0.003, lower: -0.001, depth: 0.3 });   // "4X Ø.250 +.003/-.001" with AIGDT "x" = depth .30
    expect(holes.every(h => (h as { depth?: number }).depth === 0.3)).toBe(true);
    const f = ex.parameters.find(p => p.name === 'gdt.frame' && (p.value as { tolerance?: number }).tolerance === 0.023 && p.location!.sheet === 1)!;
    expect(f).toMatchObject({ status: 'needs-validation', value: { characteristic: null, modifiers: ['P'], projected: 0.425, datums: ['A', 'B', 'C'] } });
    expect(f.note).toContain('drawn as geometry');
    expect(ex.text.some(t => t.rotation === 30 && t.text.includes('Ø.250'))).toBe(true);
  });

  it('CTC-01, every annotation drawn as curves on an isometric view: it is OCRed, says so, and reports next to nothing rather than guessing', async () => {
    const ex = await read('nist-ctc-01.pdf');
    expect(ex.sheets[0].content).toBe('text-as-curves');
    expect(ex.warnings.join(' ')).toMatch(/drawn as curves/);
    expect(ex.warnings.join(' ')).toMatch(/read by OCR/);
    const s = scoreExtraction(ex, truthOf('nist-ctc-01'));
    expect(totals(s.groups).wrong).toBeLessThanOrEqual(2);             // measured 1
    expect(ex.parameters.every(p => p.status === 'needs-validation' || p.method === 'pdf-text')).toBe(true);
  }, 120_000);

  it('AM test artifact, a raster drawing in a PDF: precision ≥ 0.7 on what it reports (measured 1.00), recall is low and pinned as such', async () => {
    const ex = await read('nist-am-artifact.pdf');
    expect(ex.sheets.map(s => s.content)).toEqual(['scanned', 'scanned']);
    const t = totals(scoreExtraction(ex, truthOf('nist-am-artifact')).groups);
    expect(t.correct).toBeGreaterThanOrEqual(4);                        // measured 6 of 32
    expect(precision(t)!).toBeGreaterThanOrEqual(0.7);
    expect(recall(t)!).toBeLessThan(0.5);                               // honest: most of this sheet is not read
    expect(ex.parameters.every(p => p.method === 'ocr' && p.status === 'needs-validation' && (p.reliability ?? 1) < 1)).toBe(true);
  }, 120_000);

  it('content classes: text, curves, mixed, scanned', async () => {
    const ctc2 = await readDrawing(file('nist-ctc-02.pdf'), 'nist-ctc-02.pdf', { ocr: 'off' });
    expect(ctc2.sheets).toHaveLength(3);
    expect(ctc2.warnings.filter(w => /part of its annotation is drawn as curves/.test(w))).toHaveLength(3);
    expect(ctc2.warnings.some(w => /OCR was switched off/.test(w))).toBe(true);
    expect(classifySheet({ pathOps: 600, glyphLikePaths: 0, imageCoverage: 0, textChars: 1000, textItems: 99 })).toBe('vector-text');
    expect(classifySheet({ pathOps: 1776, glyphLikePaths: 182, imageCoverage: 0, textChars: 122, textItems: 6 })).toBe('text-as-curves');
    expect(classifySheet({ pathOps: 900, glyphLikePaths: 300, imageCoverage: 0, textChars: 0, textItems: 0 })).toBe('text-as-curves');
    expect(classifySheet({ pathOps: 0, glyphLikePaths: 0, imageCoverage: 1, textChars: 0, textItems: 0 })).toBe('scanned');
    expect(classifySheet({ pathOps: 2, glyphLikePaths: 0, imageCoverage: 1, textChars: 2400, textItems: 300 })).toBe('scanned');   // a scanner's own text layer
    expect(classifySheet({ pathOps: 0, glyphLikePaths: 0, imageCoverage: 0, textChars: 0, textItems: 0 })).toBe('empty');
    expect(isMixedSheet({ pathOps: 1244, glyphLikePaths: 74, imageCoverage: 0, textChars: 597, textItems: 30 })).toBe(true);
    expect(isMixedSheet({ pathOps: 613, glyphLikePaths: 0, imageCoverage: 0, textChars: 1051, textItems: 99 })).toBe(false);
  });
});

describe('generated drawings — OCR (text as curves, and scans with skew and noise)', () => {
  // A subset keeps the suite quick; the full tables come from scripts/drawings/accuracy.ts.
  it('text as curves, three sheets: precision ≥ 0.92, recall ≥ 0.72 (measured 0.97 / 0.78); title block and material read in full', async () => {
    const { all, groups } = await scoreSet([['gen-casting.curves.pdf', 'gen-casting'], ['gen-gear.curves.pdf', 'gen-gear'], ['gen-rubber.curves.pdf', 'gen-rubber']]);
    expect(precision(all)!).toBeGreaterThanOrEqual(0.92);
    expect(recall(all)!).toBeGreaterThanOrEqual(0.72);
    expect(recall(groups['title block']!)!).toBeGreaterThanOrEqual(0.9);          // measured 1.00
    expect(recall(groups.material!)!).toBeGreaterThanOrEqual(0.85);               // measured 1.00
    expect(groups['GD&T']?.correct ?? 0).toBe(0);                                 // frames are not read from pixels: stated, not hidden
  }, 240_000);

  it('scans, three sheets (200 dpi, 300 dpi, a bare JPEG): precision ≥ 0.88, recall ≥ 0.62 (measured 0.94 / 0.70)', async () => {
    const { all, groups } = await scoreSet([['gen-casting.scan200.pdf', 'gen-casting'], ['gen-gear.scan300.pdf', 'gen-gear'], ['gen-moulding.scan200.jpg', 'gen-moulding']]);
    expect(precision(all)!).toBeGreaterThanOrEqual(0.88);
    expect(recall(all)!).toBeGreaterThanOrEqual(0.62);
    expect(recall(groups.material!)!).toBeGreaterThanOrEqual(0.85);               // measured 1.00
    expect(recall(groups['title block']!)!).toBeGreaterThanOrEqual(0.7);          // measured 0.80
  }, 240_000);

  it('everything read by OCR is flagged: needs-validation, the engine\'s confidence as reliability, a warning per sheet', async () => {
    const ex = await read('gen-casting.scan200.pdf');
    expect(ex.sheets[0].content).toBe('scanned');
    expect(ex.parameters.length).toBeGreaterThan(25);
    for (const p of ex.parameters) {
      expect(p.method).toBe('ocr'); expect(p.status).toBe('needs-validation');
      expect(p.reliability).toBeGreaterThan(0.3); expect(p.reliability).toBeLessThan(1);
      expect(p.note).toMatch(/Read by OCR/);
    }
    expect(ex.warnings.join(' ')).toMatch(/Sheet 1 \(a scanned image\) was read by OCR at \d+ dpi: \d+ words, mean engine confidence \d+ %, straightened by 0\.\d+°/);
    expect(ex.parameters.some(p => p.name === 'gdt.frame')).toBe(false);          // frames are not read from pixels
  }, 120_000);
});

describe('determinism', () => {
  it('the same vector file gives byte-identical JSON; timings are not part of it', async () => {
    const a = await readDrawing(file('gen-machined.pdf'), 'gen-machined.pdf'), b = await readDrawing(file('gen-machined.pdf'), 'gen-machined.pdf');
    expect(stableJson(a)).toBe(stableJson(b));
    expect(extractionFingerprint(a)).toBe(extractionFingerprint(b));
    expect(stableJson(a)).not.toContain('timingsMs');
    expect(a.timingsMs?.total).toBeGreaterThanOrEqual(0);
    expect(extractionFingerprint(await readDrawing(file('nist-ftc-07.pdf'), 'nist-ftc-07.pdf'))).toBe(extractionFingerprint(await read('nist-ftc-07.pdf')));
  });
  it('the same scan gives byte-identical JSON through OCR', async () => {
    const a = await read('gen-moulding.scan200.jpg'), b = await readDrawing(file('gen-moulding.scan200.jpg'), 'gen-moulding.scan200.jpg');
    expect(stableJson(a)).toBe(stableJson(b));
  }, 120_000);
  it('the worker thread returns the same extraction as the in-thread call', async () => {
    const off = await readDrawingOffThread(new Uint8Array(file('gen-gear.pdf')), 'gen-gear.pdf');
    expect(extractionFingerprint(off)).toBe(extractionFingerprint(await read('gen-gear.pdf')));
    await expect(readDrawingOffThread(new Uint8Array(Buffer.from('%PDF-1.4\nnot a pdf at all')), 'bad.pdf')).rejects.toMatchObject({ name: 'DrawingReadError', code: 'corrupt' });
  }, 60_000);
});

describe('OCR engine missing', () => {
  it('a vector PDF is read exactly as before, with no warning', async () => {
    const without = await readDrawing(file('gen-casting.pdf'), 'gen-casting.pdf', { ocrEngine: null });
    expect(stableJson(without)).toBe(stableJson(await read('gen-casting.pdf')));
    expect(without.warnings).toEqual([]);
  });
  it('a curves sheet and a scan come back with a plain-word warning — no throw, no silent empty result', async () => {
    const curves = await readDrawing(file('gen-casting.curves.pdf'), 'x.pdf', { ocrEngine: null });
    expect(curves.parameters).toEqual([]);
    expect(curves.warnings.join(' ')).toMatch(/Sheet 1 is text drawn as curves and OCR is not available \(no OCR engine is installed\): nothing was read from it\./);
    const scan = await readDrawing(file('gen-moulding.scan200.jpg'), 'x.jpg', { ocrEngine: null });
    expect(scan.sheets[0].content).toBe('scanned');
    expect(scan.warnings.join(' ')).toMatch(/a scanned image and OCR is not available/);
    // a sheet with real text and curved annotation keeps its text
    const mixed = await readDrawing(file('nist-ctc-02.pdf'), 'nist-ctc-02.pdf', { ocrEngine: null });
    expect(mixed.text.length).toBeGreaterThan(40);
    expect(mixed.warnings.join(' ')).toMatch(/only its selectable text was read/);
  });
  it('a missing language file is said, and the engine reports why it cannot start', async () => {
    const { createTesseractEngine } = await import('../server/drawing/raster/ocr');
    const none = await createTesseractEngine(['xxx']);
    expect(none.engine).toBeNull();
    expect(none.reason).toMatch(/no OCR language data found/);
  });
});

describe('files that cannot be read are refused with a clear message', () => {
  const refuse = async (buf: Buffer, name: string, opts = {}) => { try { await readDrawing(buf, name, opts); } catch (e) { return e as DrawingReadError; } throw new Error('was not refused'); };
  it('corrupt, empty, unknown, DWG, binary DXF', async () => {
    expect(await refuse(Buffer.from('%PDF-1.7\n1 0 obj\n<< garbage'), 'bad.pdf')).toMatchObject({ name: 'DrawingReadError', code: 'corrupt' });
    expect(await refuse(Buffer.alloc(0), 'empty.pdf')).toMatchObject({ code: 'empty' });
    expect(await refuse(Buffer.from('just some text, long enough to test'), 'x.txt')).toMatchObject({ code: 'unsupported-type' });
    const dwg = await refuse(Buffer.from('AC1027\0\0\0\0\0binary'), 'x.dwg');
    expect(dwg.code).toBe('unsupported-type'); expect(dwg.message).toMatch(/DWG/); expect(dwg.message).toMatch(/PDF or DXF/);
    expect((await refuse(Buffer.from('AutoCAD Binary DXF\r\n\x1a\0'), 'x.dxf')).message).toMatch(/binary DXF/);
    expect(await refuse(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]), 'x.png')).toMatchObject({ code: 'corrupt' });
  });
  it('password-protected PDF', async () => {
    const { jsPDF } = require('jspdf');
    const doc = new jsPDF({ encryption: { userPassword: 'secret', ownerPassword: 'owner', userPermissions: ['print'] } });
    doc.text('MATERIAL: EN-GJS-500-7', 20, 20);
    const e = await refuse(Buffer.from(doc.output('arraybuffer')), 'locked.pdf');
    expect(e).toMatchObject({ code: 'encrypted' });
    expect(e.message).toMatch(/password-protected/);
  });
  it('too large, and too many pages', async () => {
    const e = await refuse(file('gen-casting.pdf'), 'big.pdf', { maxBytes: 50_000 });
    expect(e).toMatchObject({ code: 'too-large' }); expect(e.message).toMatch(/MB/);
    const ex = await readDrawing(file('nist-ftc-07.pdf'), 'nist-ftc-07.pdf', { maxPages: 2 });
    expect(ex.sheets).toHaveLength(2);
    expect(ex.warnings.join(' ')).toMatch(/has 4 pages; only the first 2 were read/);
  });
  it('the type is read from the bytes, not from the name', () => {
    expect(detectFileKind(file('gen-casting.pdf'))).toBe('pdf');
    expect(detectFileKind(file('gen-moulding.scan200.jpg'))).toBe('jpeg');
    expect(detectFileKind(Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0, 0]))).toBe('tiff');
    expect(detectFileKind(Buffer.from('  0\nSECTION\n  2\nHEADER\n'))).toBe('dxf');
  });
});

describe('DXF and TIFF input', () => {
  const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '420', '21', '0',
    '0', 'TEXT', '8', '0', '10', '10', '20', '250', '40', '3.5', '1', 'MATERIAL: EN AW-6082-T6',
    '0', 'TEXT', '8', '0', '10', '10', '20', '240', '40', '3.5', '1', 'GENERAL TOLERANCE ISO 2768-mK',
    '0', 'MTEXT', '8', '0', '10', '10', '20', '200', '40', '3.5', '71', '1', '1', 'NOTES\\P1. ANODISE 10-15 %%c... \\U+00B5m\\P2. DEBURR ALL EDGES',
    '0', 'TEXT', '8', '0', '10', '200', '20', '120', '40', '3.5', '1', '4x M6-6H',
    '0', 'TEXT', '8', '0', '10', '200', '20', '100', '40', '3.5', '1', '%%c25 H7',
    '0', 'DIMENSION', '8', '0', '2', '*D1', '10', '0', '20', '50', '11', '100', '21', '55', '70', '0', '1', '<> %%p0.1', '42', '125.0',
    '0', 'ENDSEC', '0', 'EOF'].join('\n');
  it('TEXT / MTEXT / DIMENSION entities become text items and parameters', async () => {
    expect(plainText('%%c25 %%p0.1 45%%d {\\fArial|b0;A}\\PB')).toEqual(['Ø25 ±0.1 45° A', 'B']);
    const r = readDxf(dxf);
    expect(r.units).toBe('mm'); expect(r.sheets).toHaveLength(1);
    expect(r.entityCounts).toMatchObject({ TEXT: 4, MTEXT: 1, DIMENSION: 1 });
    const ex = await readDrawing(Buffer.from(dxf), 'part.dxf');
    expect(ex.fileKind).toBe('dxf');
    const v = (n: string) => ex.parameters.find(p => p.name === n)?.value;
    expect(v('material.designation')).toBe('EN AW-6082-T6'); expect(v('tolerance.generalClass')).toBe('medium');
    expect(v('thread')).toMatchObject({ designation: 'M6-6H', count: 4 });
    expect(v('hole.diameter')).toMatchObject({ diameter: 25, fit: 'H7', upper: 0.021, lower: 0 });
    expect(ex.parameters.find(p => p.name === 'dimension')?.value).toMatchObject({ nominal: 125, upper: 0.1, lower: -0.1 });
    expect(ex.parameters.filter(p => p.name.startsWith('note.'))).toHaveLength(2);
    expect(ex.parameters.every(p => p.method === 'dxf-entity')).toBe(true);
  });
  it('a TIFF is decoded and read as a scan', async () => {
    const UTIF = require('utif2');
    const { loadImage, createCanvas } = require('@napi-rs/canvas');
    const img = await loadImage(file('gen-moulding.scan200.jpg'));
    // the title block corner of the sheet, as a small uncompressed TIFF
    const w = 1500, h = 420, c = createCanvas(w, h), ctx = c.getContext('2d');
    ctx.drawImage(img, img.width - w - 60, img.height - h - 60, w, h, 0, 0, w, h);
    const tiff = Buffer.from(UTIF.encodeImage(new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer), w, h));
    expect(detectFileKind(tiff)).toBe('tiff');
    const ex = await readDrawing(tiff, 'corner.tif');
    expect(ex.fileKind).toBe('image'); expect(ex.sheets[0].content).toBe('scanned');
    expect(ex.text.map(t => t.text).join(' ')).toMatch(/CONNECTOR HOUSING/);
    expect(ex.warnings.join(' ')).toMatch(/does not state its resolution; 300 dpi assumed/);
  }, 120_000);
});

describe('image clean-up', () => {
  it('finds the skew of a sheet and straightens it; finds its frame lines', () => {
    const w = 900, h = 600; const g = { data: new Uint8Array(w * h).fill(235), width: w, height: h };
    for (const y of [60, 300, 540]) for (let x = 60; x < 840; x++) { g.data[y * w + x] = 20; g.data[(y + 1) * w + x] = 20; }
    for (const x of [60, 840]) for (let y = 60; y < 540; y++) { g.data[y * w + x] = 20; g.data[y * w + x + 1] = 20; }
    const turned = rotateGrey(g, 1.2);                                   // clockwise by 1.2°
    const first = flattenAndBinarise(turned);
    const skew = estimateSkew(first.ink, w, h);
    expect(skew).toBeCloseTo(-1.2, 1);                                   // the correction to apply
    const straight = flattenAndBinarise(rotateGrey(turned, skew));
    expect(Math.abs(estimateSkew(straight.ink, w, h))).toBeLessThanOrEqual(0.1);
    const lw = rasterLineWork(straight.ink, w, h, 200);
    expect(lw.h.length).toBe(3); expect(lw.v.length).toBe(2);
    expect(Math.abs(lw.h[0].y0 - 60)).toBeLessThan(4);
  });
  it('Otsu separates ink from paper; specks are removed, strokes are kept', () => {
    const hist = new Uint32Array(256); hist[20] = 500; hist[30] = 300; hist[220] = 9000; hist[235] = 4000;
    const t = otsu(hist, 13800); expect(t).toBeGreaterThanOrEqual(30); expect(t).toBeLessThan(220);
    const w = 50, h = 50, grey = { data: new Uint8Array(w * h).fill(255), width: w, height: h }, ink = new Uint8Array(w * h);
    ink[10 * w + 10] = 1; grey.data[10 * w + 10] = 0;                    // a speck
    for (let x = 20; x < 30; x++) for (const y of [25, 26]) { ink[y * w + x] = 1; grey.data[y * w + x] = 0; }   // a stroke two pixels thick
    expect(despeckle(ink, grey)).toBe(1);
    expect(ink[10 * w + 10]).toBe(0); expect(grey.data[10 * w + 10]).toBe(255); expect(ink[25 * w + 24]).toBe(1);
  });
});

describe('fixtures', () => {
  it('every drawing with a truth file has its files, and the folder stays under 15 MB', () => {
    const all = readdirSync(FIX);
    const truths = all.filter(f => f.endsWith('.truth.json'));
    expect(truths).toHaveLength(12);
    for (const t of truths) {
      const tr = JSON.parse(readFileSync(join(FIX, t), 'utf8')) as TruthFile;
      expect(['public', 'generated']).toContain(tr.origin); expect(tr.checked, t).toBeTruthy(); expect(tr.source, t).toBeTruthy();
      expect(tr.expect.length, t).toBeGreaterThan(10);
      expect(all, t).toContain(`${t.replace('.truth.json', '')}.pdf`);
    }
    const bytes = all.reduce((s, f) => s + readFileSync(join(FIX, f)).length, 0);
    expect(bytes).toBeLessThan(15 * 1024 * 1024);
    expect(readFileSync(join(FIX, 'README.md'), 'utf8')).toMatch(/17 U\.S\.C\. § 105/);
  });
});
