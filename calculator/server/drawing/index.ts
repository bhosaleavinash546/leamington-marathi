/**
 * Layer 2 — the offline 2D engineering-drawing reader (Nov 2026).
 *
 * `readDrawing(buffer, filename)` turns a drawing file (PDF, PNG, JPEG, TIFF, ASCII DXF) into a `DrawingExtraction`:
 * parameters named from the dictionary, each with what was written, where on the sheet, how it was read and how sure
 * that reading is; every line of text read; and plain-word warnings for what could not be read.
 *
 * No AI, no network: exact text from the PDF, grammars and tables for the engineering notation, and (only where a
 * sheet has no usable text) the bundled Tesseract OCR engine running in-process. The reader never computes a cost and
 * never decides a cost input. It imports nothing from the cost engine except the TYPES and the parameter dictionary
 * in src/engine/engineering-data/.
 *
 * This function is CPU-bound: call `readDrawingOffThread` (worker.ts) from a server so it cannot block the event loop.
 */
import { createHash } from 'node:crypto';
import type { DrawingExtraction, DrawingSheetInfo, DrawingTextItem, EngineeringParameter } from '../../src/engine/engineering-data/model.js';
import { isKnownParameter } from '../../src/engine/engineering-data/dictionary.js';
import { DrawingReadError, type BBox, type ExtractContext, type OcrEngine, type RawTextItem, type ReadOptions, type Segment, type SheetData, type SheetLayout } from './types.js';
import { detectFileKind, checkSize, openPdf, closePdf, classifySheet, isMixedSheet, hasScannerTextLayer, DEFAULT_MAX_BYTES, DEFAULT_MAX_PAGES } from './ingest.js';
import { readPdfPage } from './pdf-vector.js';
import { assembleLines } from './text-lines.js';
import { analyseLayout } from './layout.js';
import { dominantRotation, itemsToUpright, segsToUpright, boxFromUpright, type Quarter } from './orient.js';
import { runExtractors } from './extract/index.js';
import { readDxf } from './dxf.js';
import { renderPdfPage, decodeBitmap, decodeTiff, rasterAvailable } from './raster/render.js';
import { createTesseractEngine, OCR_ENGINE_NAME } from './raster/ocr.js';
import { ocrSheet } from './raster/index.js';
import type { Grey } from './raster/preprocess.js';
import { containsPoint, roundBox, r2 } from './geom.js';

/** Bumped whenever extraction logic changes a result. Part of every cache key that holds an extraction. */
export const READER_VERSION = '1.0.0';

/** English and German: measured on the fixtures, the pair reads German title blocks and notes without costing English accuracy. */
export const DEFAULT_OCR_LANGUAGES = ['eng', 'deu'];

/** The words of the warning on a sheet that is selectable text with part of its annotation as outlines (see `ocrWouldRead`). */
const PARTLY_CURVES = 'part of its annotation is drawn as curves';

/**
 * Would OCR add anything to this extraction? True for an image, for a sheet that is a scan or text drawn as curves,
 * and for a sheet whose annotation is partly outlines. A server reads with `ocr: 'off'` first (exact text, fast) and
 * only queues the slow OCR pass when this says so. Pure: it looks only at what the extraction itself reports.
 */
export function ocrWouldRead(e: DrawingExtraction): boolean {
  if (e.fileKind === 'image') return true;
  if (e.sheets.some(s => s.content === 'scanned' || s.content === 'text-as-curves')) return true;
  return e.warnings.some(w => w.includes(PARTLY_CURVES));
}

export { DrawingReadError } from './types.js';
export type { ReadOptions } from './types.js';

interface Work {
  info: DrawingSheetInfo;
  items: RawTextItem[];
  h: Segment[]; v: Segment[]; o: Segment[];
  stats: SheetData['stats'];
  ocr: 'none' | 'full' | 'supplement';
  /** The sheet as pixels, when OCR needs them. */
  pixels?: (dpi: number) => Promise<{ grey: Grey; dpi: number }>;
  /** Boxes of the exact text already read, so OCR does not repeat it. */
  textBoxes: BBox[];
  /** A scan's orientation as OCR found it (raster/index.ts): turned to read it, or no turn read clearly. */
  ocrOrientation?: 'turned' | 'unknown';
}

/**
 * How far the drawing is turned on its page, ANTICLOCKWISE — the convention of every text item's `rotation` (90 = text
 * reading bottom to top): the dominant reading direction of its text (`dominantRotation`). One figure per sheet, the
 * same in `rotationDeg` and in the warning (review D10: `rotationDeg` used to be the PDF page's /Rotate — clockwise, the
 * other way round — and 0 for every image, while the warning gave the text's turn).
 */
const turnWords = (q: Quarter): string => (q === 90 ? '90° (its text reads bottom to top)' : q === 270 ? '270° (its text reads top to bottom)' : '180° (upside down)');

function toBytes(buffer: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (buffer instanceof Uint8Array) return buffer;
  return new Uint8Array(buffer);
}

const SHEET_WORD: Record<DrawingSheetInfo['content'], string> = {
  'vector-text': 'selectable text', 'text-as-curves': 'text drawn as curves', scanned: 'a scanned image', empty: 'empty',
};

/** Read a drawing. Throws `DrawingReadError` for a file that cannot be read at all; never throws for a missing OCR engine. */
export async function readDrawing(buffer: Uint8Array | ArrayBuffer | Buffer, filename: string, opts: ReadOptions = {}): Promise<DrawingExtraction> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const warnings: string[] = [];
  const buf = toBytes(buffer);
  const kind = detectFileKind(buf);
  checkSize(buf, opts.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const ocrMode = opts.ocr ?? 'auto';
  const work: Work[] = [];
  let closeDoc: (() => Promise<void>) | undefined;
  let fileKind: DrawingExtraction['fileKind'];

  try {
    if (kind === 'pdf') {
      fileKind = 'pdf';
      const { doc, encrypted } = await openPdf(buf);
      closeDoc = () => closePdf(doc);
      if (encrypted) warnings.push('This PDF is encrypted with owner restrictions but opens without a password: it was read.');
      const n = Math.min(doc.numPages, maxPages);
      if (doc.numPages > maxPages) warnings.push(`The PDF has ${doc.numPages} pages; only the first ${maxPages} were read.`);
      timings.open = Date.now() - t0;
      const tText = Date.now();
      for (let p = 1; p <= n; p++) {
        const s = await readPdfPage(doc, p, 0);
        let items = s.items;
        const st = { ...s.stats, textItems: s.items.length };
        if (s.info.content === 'scanned' && hasScannerTextLayer(st)) {
          warnings.push(`Sheet ${p} is a scan with a text layer added by a scanner. That layer is the scanner's own OCR, not exact text: it was ignored and the sheet read again.`);
          items = [];
        }
        const mixed = s.info.content === 'vector-text' && isMixedSheet(st);
        const ocr: Work['ocr'] = ocrMode === 'off' ? 'none' : ocrMode === 'force' ? (s.info.content === 'vector-text' ? 'supplement' : 'full')
          : s.info.content === 'scanned' ? 'full' : s.info.content === 'text-as-curves' ? (items.length ? 'supplement' : 'full') : mixed ? 'supplement' : 'none';
        if (s.info.content === 'empty') warnings.push(`Sheet ${p} is empty: nothing to read.`);
        if (mixed || (s.info.content === 'text-as-curves' && items.length)) {
          warnings.push(`Sheet ${p} has selectable text (${s.stats.textChars} characters) but ${PARTLY_CURVES} (${s.stats.glyphLikePaths} glyph-sized outlines away from any text).`);
        }
        work.push({
          info: s.info, items, h: s.hSegs, v: s.vSegs, o: s.oSegs, stats: s.stats, ocr,
          pixels: (dpi: number) => renderPdfPage(doc, p, dpi),
          textBoxes: items.length ? s.lines.map(l => l.bbox) : [],
        });
      }
      timings.text = Date.now() - tText;
    } else if (kind === 'dxf') {
      fileKind = 'dxf';
      const dxf = readDxf(Buffer.from(buf.buffer, buf.byteOffset, buf.length).toString('latin1'));
      warnings.push(...dxf.warnings);
      for (const [i, sh] of dxf.sheets.entries()) {
        if (i >= maxPages) break;
        const chars = sh.items.reduce((s, it) => s + it.text.replace(/\s/g, '').length, 0);
        if (dxf.sheets.length > 1) warnings.push(`Sheet ${i + 1} is the DXF's ${sh.space} space.`);
        work.push({
          info: { sheet: i + 1, widthPt: r2(sh.widthPt), heightPt: r2(sh.heightPt), content: 'vector-text', textItemCount: sh.items.length, rotationDeg: 0 },
          items: sh.items, h: sh.h, v: sh.v, o: sh.o, stats: { pathOps: sh.h.length + sh.v.length + sh.o.length, glyphLikePaths: 0, imageCoverage: 0, textChars: chars },
          ocr: 'none', textBoxes: [],
        });
      }
      timings.text = Date.now() - t0;
    } else {
      fileKind = 'image';
      if (!rasterAvailable()) {
        warnings.push('This file is an image and the image library (@napi-rs/canvas) is not installed: it cannot be decoded, so nothing was read.');
      } else {
        let pages: Array<{ grey: Grey; dpi?: number }>;
        try { pages = kind === 'tiff' ? decodeTiff(buf) : [await decodeBitmap(buf, kind)]; }
        catch (e) { throw new DrawingReadError('corrupt', `This ${kind.toUpperCase()} image cannot be decoded (${String((e as Error).message ?? e).slice(0, 120)}).`); }
        if (!pages.length) throw new DrawingReadError('corrupt', 'This image holds no readable page.');
        pages.slice(0, maxPages).forEach((pg, i) => {
          const dpi = pg.dpi && pg.dpi >= 50 && pg.dpi <= 1200 ? pg.dpi : 300;
          if (dpi !== pg.dpi) warnings.push(`Sheet ${i + 1}: the image does not state its resolution; 300 dpi assumed for positions and text size.`);
          work.push({
            info: { sheet: i + 1, widthPt: r2(pg.grey.width * 72 / dpi), heightPt: r2(pg.grey.height * 72 / dpi), content: 'scanned', textItemCount: 0, rotationDeg: 0 },
            items: [], h: [], v: [], o: [], stats: { pathOps: 0, glyphLikePaths: 0, imageCoverage: 1, textChars: 0 },
            ocr: ocrMode === 'off' ? 'none' : 'full', pixels: async () => ({ grey: pg.grey, dpi }), textBoxes: [],
          });
        });
      }
      timings.open = Date.now() - t0;
    }

    // ── OCR, only where a sheet has no usable text ──
    const tOcr = Date.now();
    const needing = work.filter(w => w.ocr !== 'none' && w.pixels);
    let engine: OcrEngine | null = null;
    let ownEngine = false;
    if (needing.length) {
      let reason: string | undefined;
      if (!rasterAvailable()) reason = 'the image library (@napi-rs/canvas) is not installed';
      else if (opts.ocrEngine !== undefined) { engine = opts.ocrEngine; if (!engine) reason = 'no OCR engine is installed'; }
      else {
        const langs = opts.ocrLanguages?.length ? opts.ocrLanguages : DEFAULT_OCR_LANGUAGES;
        const r = await createTesseractEngine(langs);
        engine = r.engine; ownEngine = !!r.engine; reason = r.reason;
        if (r.engine && r.missingLanguages.length) warnings.push(`OCR language data not found for: ${r.missingLanguages.join(', ')}. Read with ${r.languages.join(' + ')} only.`);
      }
      if (!engine) {
        for (const w of needing) {
          warnings.push(w.ocr === 'full'
            ? `Sheet ${w.info.sheet} is ${SHEET_WORD[w.info.content]} and OCR is not available (${reason}): nothing was read from it.`
            : `Sheet ${w.info.sheet}: OCR is not available (${reason}), so only its selectable text was read — annotation drawn as curves was not.`);
        }
      } else {
        for (const w of needing) {
          try {
            const px = await w.pixels!(opts.ocrDpi ?? 300);
            const res = await ocrSheet(engine, px.grey, px.dpi, w.info.sheet, {
              clean: w.info.content !== 'scanned', vertical: opts.ocrVertical ?? true, languages: opts.ocrLanguages?.length ? opts.ocrLanguages : DEFAULT_OCR_LANGUAGES,
            });
            if (res.orientation === 'turned' || res.orientation === 'unknown') w.ocrOrientation = res.orientation;
            const fresh = res.items.filter(it => !w.textBoxes.some(b => containsPoint(b, it.ox + 2, it.oy - 2, 1.5)));
            w.items = [...w.items, ...fresh];
            if (w.info.content === 'scanned') { w.h = res.h; w.v = res.v; w.o = []; }
            w.info = { ...w.info, textItemCount: w.items.length };
            const conf = fresh.length ? fresh.reduce((s, it) => s + (it.reliability ?? 0), 0) / fresh.length : 0;
            warnings.push(`Sheet ${w.info.sheet} (${SHEET_WORD[w.info.content]}) was read by OCR at ${px.dpi} dpi: ${fresh.length} words, mean engine confidence ${Math.round(conf * 100)} %`
              + `${res.skewDeg ? `, straightened by ${Math.abs(res.skewDeg).toFixed(2)}°` : ''}. Every value from OCR needs validation; symbols (Ø, geometric-tolerance, roughness and weld symbols) are not read from pixels.`);
            if (px.dpi < (opts.ocrDpi ?? 300)) warnings.push(`Sheet ${w.info.sheet} is large: it was rendered at ${px.dpi} dpi instead of ${opts.ocrDpi ?? 300} to stay within the image limit; small text may be misread.`);
            timings[`ocrSheet${w.info.sheet}`] = res.timings.prepMs + res.timings.ocrMs;
          } catch (e) {
            warnings.push(`Sheet ${w.info.sheet}: OCR failed (${String((e as Error).message ?? e).slice(0, 140)}): ${w.ocr === 'full' ? 'nothing was read from it' : 'only its selectable text was read'}.`);
          }
        }
        if (ownEngine) await engine.close();
      }
      timings.ocr = Date.now() - tOcr;
    }
    for (const w of work) {
      if (w.ocr === 'none' && ocrMode === 'off' && (w.info.content === 'scanned' || w.info.content === 'text-as-curves')) {
        warnings.push(`Sheet ${w.info.sheet} is ${SHEET_WORD[w.info.content]} and OCR was switched off: ${w.items.length ? 'only its selectable text was read' : 'nothing was read from it'}.`);
      }
    }
  } finally {
    if (closeDoc) await closeDoc();
  }

  // ── Layout and extraction, in each sheet's upright frame ──
  const tLayout = Date.now();
  const sheets: SheetData[] = [];
  const layouts: SheetLayout[] = [];
  const quarter = new Map<number, { q: Quarter; W: number; H: number }>();
  let nextId = 0;
  for (const w of work) {
    const W = w.info.widthPt, H = w.info.heightPt;
    const q = dominantRotation(w.items);
    quarter.set(w.info.sheet, { q, W, H });
    const items = itemsToUpright(w.items, q, W, H);
    const segs = segsToUpright(w.h, w.v, w.o, q, W, H);
    const uw = q === 90 || q === 270 ? H : W, uh = q === 90 || q === 270 ? W : H;
    const lines = assembleLines(items, segs, nextId);
    nextId += lines.length;
    // One rotation figure per sheet (D10): the turn of its text (anticlockwise), in rotationDeg and in the warning.
    w.info = { ...w.info, rotationDeg: q };
    if (q !== 0) {
      warnings.push(`Sheet ${w.info.sheet}: the drawing is turned ${turnWords(q)} on its page`
        + `${w.ocrOrientation === 'turned' ? ' (found by reading the scan in all four quarter turns)' : ''}; it was read upright and every location is given on the page as supplied.`);
    }
    if (w.ocrOrientation === 'unknown') {
      warnings.push(`Sheet ${w.info.sheet}: which way up this scan lies could not be told from its text (no quarter turn read clearly); it was read as it lies — every reading on it needs validation.`);
    }
    const layout = analyseLayout({ sheet: w.info.sheet, width: uw, height: uh, lines, hSegs: segs.h, vSegs: segs.v, oSegs: segs.o });
    sheets.push({ info: { ...w.info, widthPt: uw, heightPt: uh }, items, lines, hSegs: segs.h, vSegs: segs.v, oSegs: segs.o, stats: w.stats });
    layouts.push(layout);
  }
  timings.layout = Date.now() - tLayout;
  const tExtract = Date.now();
  const ctx: ExtractContext = { sourceFile: filename, sheets, layouts, lines: sheets.flatMap(s => s.lines) };
  const drafts = runExtractors(ctx);
  timings.extract = Date.now() - tExtract;

  const back = (sheet: number, b: BBox): BBox => { const o = quarter.get(sheet); return o ? roundBox(boxFromUpright(b, o.q, o.W, o.H)) : roundBox(b); };
  const counters = new Map<string, number>();
  const parameters: EngineeringParameter[] = [];
  for (const d of drafts) {
    if (!isKnownParameter(d.name)) { warnings.push(`Internal: a reading named "${d.name}" is not in the parameter dictionary and was dropped.`); continue; }
    const n = (counters.get(d.name) ?? 0) + 1;
    counters.set(d.name, n);
    const { name, value, ...rest } = d;
    parameters.push({
      id: `drawing:${name}:${n}`, name, value, ...rest, source: 'drawing', sourceFile: filename,
      ...(d.location ? { location: { ...d.location, bbox: back(d.location.sheet, d.location.bbox as BBox) } } : {}),
    });
  }
  const text: DrawingTextItem[] = ctx.lines.map(l => ({
    text: l.text, sheet: l.sheet, bbox: back(l.sheet, l.bbox), size: l.size,
    rotation: (l.rotation + (quarter.get(l.sheet)?.q ?? 0)) % 360, method: l.method,
    ...(l.reliability !== undefined ? { reliability: l.reliability } : {}),
  }));
  if (!text.length && work.length) warnings.push('No text was read from this drawing.');
  if (kind !== 'pdf' && kind !== 'dxf' && work.some(w => w.items.length)) warnings.push(`OCR engine: ${OCR_ENGINE_NAME}.`);
  timings.total = Date.now() - t0;
  return {
    schemaVersion: 1,
    readerVersion: READER_VERSION,
    sourceFile: filename,
    fileKind,
    sheets: work.map(w => w.info),
    parameters,
    text,
    warnings: [...new Set(warnings)],
    timingsMs: timings,
  };
}

/** The extraction as JSON without its timings: the same file gives the same bytes on the same installation. */
export function stableJson(e: DrawingExtraction): string {
  const { timingsMs: _timings, ...rest } = e;
  return JSON.stringify(rest);
}

/** SHA-256 of `stableJson` — a fingerprint for caches and for the determinism check. */
export function extractionFingerprint(e: DrawingExtraction): string {
  return createHash('sha256').update(stableJson(e)).digest('hex');
}

export { classifySheet };
