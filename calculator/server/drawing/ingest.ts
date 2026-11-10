/**
 * Ingestion: what kind of file this is (by its first bytes, never by its name), whether it can be opened, how many
 * sheets it has, and what each sheet is made of — selectable text, text drawn as curves, a scanned image, or nothing.
 */
import { DrawingReadError } from './types.js';
import type { DrawingSheetInfo } from '../../src/engine/engineering-data/model.js';
import { loadPdfJs, documentOptions, type PdfDocument } from './pdfjs.js';

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'tiff' | 'dxf';

export const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
export const DEFAULT_MAX_PAGES = 40;

/** File type by magic bytes. Throws a `DrawingReadError` with a message an engineer can act on. */
export function detectFileKind(buf: Uint8Array): FileKind {
  if (!buf || buf.length < 8) throw new DrawingReadError('empty', 'The file is empty.');
  const head = Buffer.from(buf.buffer, buf.byteOffset, Math.min(buf.length, 2048));
  const ascii = head.toString('latin1');
  if (ascii.slice(0, 1024).includes('%PDF-')) return 'pdf';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if ((ascii.startsWith('II') && head[2] === 42 && head[3] === 0) || (ascii.startsWith('MM') && head[2] === 0 && head[3] === 42)) return 'tiff';
  if (ascii.startsWith('AutoCAD Binary DXF')) {
    throw new DrawingReadError('unsupported-type', 'This is a binary DXF. Save the drawing as ASCII DXF or export it as PDF.');
  }
  if (/^AC10\d\d/.test(ascii)) {
    throw new DrawingReadError('unsupported-type', 'This is a DWG file. DWG cannot be read offline: export the drawing as PDF or DXF.');
  }
  // ASCII DXF: group code 0 then SECTION (comments with code 999 may come first).
  if (/^\s*(999\s*\r?\n[^\n]*\r?\n\s*)*0\s*\r?\n\s*SECTION/i.test(ascii)) return 'dxf';
  throw new DrawingReadError('unsupported-type',
    'File type not recognised. The drawing reader accepts PDF, PNG, JPEG, TIFF and ASCII DXF.');
}

export function checkSize(buf: Uint8Array, maxBytes = DEFAULT_MAX_BYTES): void {
  if (buf.length > maxBytes) {
    throw new DrawingReadError('too-large',
      `The file is ${(buf.length / 1048576).toFixed(1)} MB; the drawing reader accepts up to ${(maxBytes / 1048576).toFixed(0)} MB.`);
  }
}

/** Close a document opened by `openPdf` (pdfjs closes through the loading task). */
export async function closePdf(doc: PdfDocument): Promise<void> {
  try { await (doc.loadingTask ?? doc).destroy(); } catch { /* already closed */ }
}

/** Open a PDF, turning pdfjs's failures into clear refusals. */
export async function openPdf(buf: Uint8Array): Promise<{ doc: PdfDocument; encrypted: boolean }> {
  const { pdfjs, root } = await loadPdfJs();
  // pdfjs takes ownership of the array it is given: hand it a copy.
  const task = pdfjs.getDocument(documentOptions(root, new Uint8Array(buf)));
  let doc: PdfDocument;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    const msg = String((e as Error)?.message ?? e);
    try { await task.destroy(); } catch { /* already gone */ }
    if (name === 'PasswordException' || /password/i.test(msg)) {
      throw new DrawingReadError('encrypted', 'This PDF is password-protected and cannot be read. Export the drawing without a password.');
    }
    throw new DrawingReadError('corrupt', `This PDF cannot be opened (${msg.replace(/\s+/g, ' ').slice(0, 160)}). Export the drawing again.`);
  }
  if (!doc.numPages) {
    await closePdf(doc);
    throw new DrawingReadError('corrupt', 'This PDF has no pages.');
  }
  let encrypted = false;
  try { encrypted = !!(await doc.getMetadata())?.info?.EncryptFilterName; } catch { /* no metadata */ }
  return { doc, encrypted };
}

export interface SheetStats { pathOps: number; glyphLikePaths: number; imageCoverage: number; textChars: number; textItems: number }

/**
 * What a sheet is made of.
 * - `scanned`: an image covers most of the page. A text layer under a full-page image is the scanner's own OCR, not
 *   exact text, and is not trusted (see `hasScannerTextLayer`).
 * - `vector-text`: selectable text, and few glyph-sized outlines away from it.
 * - `text-as-curves`: line work whose annotation is drawn as outlines (runs of glyph-sized filled contours with no
 *   text beside them), or line work with no text at all.
 * - `empty`: nothing to read.
 * `glyphLikePaths` counts glyph-sized contours in runs AWAY from selectable text (pdf-vector.ts). On the public
 * fixtures it is 0 on every sheet whose annotation is real text and 25–377 on every sheet whose annotation is curves.
 */
export function classifySheet(s: SheetStats): DrawingSheetInfo['content'] {
  if (s.imageCoverage >= 0.5 && (s.textChars < 60 || hasScannerTextLayer(s))) return 'scanned';
  if (s.textChars >= 25) return s.glyphLikePaths >= 20 && s.glyphLikePaths >= 0.5 * s.textChars ? 'text-as-curves' : 'vector-text';
  if (s.glyphLikePaths >= 20 || s.pathOps >= 150) return 'text-as-curves';
  if (s.imageCoverage >= 0.15) return 'scanned';
  if (s.textChars > 0) return 'vector-text';
  return s.pathOps > 0 ? 'text-as-curves' : 'empty';
}

/** A full-page image with text and next to no line work: a scan that a scanner made "searchable". */
export function hasScannerTextLayer(s: SheetStats): boolean {
  return s.imageCoverage >= 0.8 && s.textChars >= 60 && s.pathOps < 20;
}

/**
 * A `vector-text` sheet where part of the annotation is still drawn as outlines (title and notes are text, the
 * dimensions are curves). Such a sheet is read as text and OCR fills in what the text layer does not cover.
 */
export function isMixedSheet(s: SheetStats): boolean {
  return s.textChars >= 25 && s.glyphLikePaths >= 20;
}
