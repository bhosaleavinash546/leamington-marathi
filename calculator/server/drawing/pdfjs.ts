/**
 * The one place pdfjs-dist is loaded. Everything it needs (standard fonts, CMaps, image decoders) is read from the
 * installed package on disk — no URL is ever handed to it, so it opens no connection.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PdfJs = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PdfDocument = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PdfPage = any;

let cached: Promise<{ pdfjs: PdfJs; root: string }> | null = null;

export function loadPdfJs(): Promise<{ pdfjs: PdfJs; root: string }> {
  if (!cached) {
    cached = (async () => {
      const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
      const root = join(dirname(entry), '..', '..');
      const pdfjs = await import(entry);
      return { pdfjs, root };
    })();
  }
  return cached;
}

/** Options that keep pdfjs on local files and on its own font renderer (no system fonts, no eval, no fetch). */
export function documentOptions(root: string, data: Uint8Array): Record<string, unknown> {
  return {
    data,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    fontExtraProperties: true,
    stopAtErrors: false,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    cMapUrl: join(root, 'cmaps') + '/',
    cMapPacked: true,
    wasmUrl: join(root, 'wasm') + '/',
    iccUrl: join(root, 'iccs') + '/',
  };
}
