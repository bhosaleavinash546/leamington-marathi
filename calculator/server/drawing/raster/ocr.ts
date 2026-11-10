/**
 * The OCR engine behind one interface. The bundled engine is Tesseract 5 compiled to WebAssembly
 * (`tesseract.js-core`, LSTM recogniser — the engine the customer approved), driven directly: the image and the
 * language data are handed to it in memory, and the language data is read from the installed npm package (or from
 * CV_TESSDATA_DIR). There is no downloader in this path — `tesseract.js`, whose default is a CDN, is not used.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { OcrEngine, OcrWord } from '../types.js';

const require = createRequire(import.meta.url);

export const OCR_ENGINE_NAME = 'tesseract-5-lstm (tesseract.js-core, WebAssembly)';

function languageData(lang: string): Uint8Array | null {
  const dirs: string[] = [];
  if (process.env.CV_TESSDATA_DIR) dirs.push(process.env.CV_TESSDATA_DIR);
  try { dirs.push(join(dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int')); } catch { /* not installed */ }
  for (const d of dirs) {
    for (const name of [`${lang}.traineddata`, `${lang}.traineddata.gz`]) {
      const p = join(d, name);
      if (!existsSync(p)) continue;
      const raw = readFileSync(p);
      return raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    }
  }
  return null;
}

export interface EngineResult { engine: OcrEngine | null; reason?: string; languages: string[]; missingLanguages: string[] }

/** Start the bundled engine. Never throws: a missing package or language file comes back as `engine: null` + reason. */
export async function createTesseractEngine(languages: string[]): Promise<EngineResult> {
  const wanted = [...new Set(languages.map(l => l.toLowerCase()).filter(l => /^[a-z_]{3,12}$/.test(l)))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let core: any;
  try {
    // Fixed-width SIMD build: present in every Node ≥ 16 on x64 / arm64, and its results do not depend on the CPU
    // (the "relaxed SIMD" build's may). The plain build is the fallback.
    try { core = require('tesseract.js-core/tesseract-core-simd-lstm'); } catch { core = require('tesseract.js-core/tesseract-core-lstm'); }
  } catch (e) {
    return { engine: null, reason: `the OCR engine package (tesseract.js-core) is not installed: ${String((e as Error).message).split('\n')[0]}`, languages: [], missingLanguages: wanted };
  }
  const loaded: string[] = [], missing: string[] = [];
  const data = new Map<string, Uint8Array>();
  for (const l of wanted) { const d = languageData(l); if (d) { data.set(l, d); loaded.push(l); } else missing.push(l); }
  if (!loaded.length) {
    return { engine: null, reason: `no OCR language data found (looked for ${wanted.join(', ')} in @tesseract.js-data and CV_TESSDATA_DIR)`, languages: [], missingLanguages: missing };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let M: any;
    try { M = await core({ print: () => {}, printErr: () => {} }); }
    catch { M = await require('tesseract.js-core/tesseract-core-lstm')({ print: () => {}, printErr: () => {} }); }
    for (const [l, d] of data) M.FS.writeFile(`./${l}.traineddata`, d);
    const api = new M.TessBaseAPI();
    if (api.Init(null, loaded.join('+'), 1 /* OEM_LSTM_ONLY */) !== 0) {
      return { engine: null, reason: 'the OCR engine failed to initialise with its language data', languages: [], missingLanguages: missing };
    }
    const engine: OcrEngine = {
      name: OCR_ENGINE_NAME,
      async recognise(grey, width, height, opts) {
        const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'latin1');
        const pgm = new Uint8Array(header.length + grey.length);
        pgm.set(header, 0); pgm.set(grey, header.length);
        M.FS.writeFile('/input', pgm);
        api.SetVariable('tessedit_pageseg_mode', '11');          // sparse text: a drawing is not a column of prose
        api.SetVariable('user_defined_dpi', String(Math.round(opts.dpi)));
        if (api.SetImageFile(1, 0) === 1) throw new Error('the OCR engine could not read the image');
        api.Recognize(null);
        const tsv: string = api.GetTSVText(0) ?? '';
        try { M.FS.unlink('/input'); } catch { /* nothing to remove */ }
        const words: OcrWord[] = [];
        for (const line of tsv.split('\n')) {
          const c = line.split('\t');
          if (c[0] !== '5' || c.length < 12) continue;
          const text = c.slice(11).join('\t').trim();
          const conf = Number(c[10]);
          if (!text || !(conf >= 0)) continue;
          const x = Number(c[6]), y = Number(c[7]), w = Number(c[8]), h = Number(c[9]);
          words.push({ text, x0: x, y0: y, x1: x + w, y1: y + h, confidence: Math.round(conf) / 100, line: `${c[2]}.${c[3]}.${c[4]}` });
        }
        return words;
      },
      async close() { try { api.End(); } catch { /* already ended */ } },
    };
    return { engine, languages: loaded, missingLanguages: missing };
  } catch (e) {
    return { engine: null, reason: `the OCR engine failed to start: ${String((e as Error).message).split('\n')[0]}`, languages: [], missingLanguages: missing };
  }
}
