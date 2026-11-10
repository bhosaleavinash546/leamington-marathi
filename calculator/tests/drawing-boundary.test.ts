/**
 * Layer 2 is independent and offline by construction (offline 2D drawing intelligence, Nov 2026):
 *  - server/drawing imports nothing from the cost engine except the TYPES of engineering-data/model and the
 *    parameter dictionary;
 *  - it imports no AI client, no HTTP client and no network module, and calls no fetch.
 * Read off the source files, so a new import fails here before it ships.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = resolve(__dirname, '..');
const DIR = join(ROOT, 'server', 'drawing');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
}
interface Imp { file: string; spec: string; typeOnly: boolean; statement: string }
function importsOf(file: string): Imp[] {
  const src = readFileSync(file, 'utf8');
  const out: Imp[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"`]([^'"`]+)['"`]\s*\)|require\.resolve\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ file: relative(ROOT, file), spec: m[4] ?? m[5] ?? m[6], typeOnly: !!m[2], statement: m[0].trim().slice(0, 160) });
  return out;
}

describe('server/drawing — import boundary', () => {
  const all = files(DIR);
  const imports = all.flatMap(importsOf);

  it('has the files of the brief', () => {
    const names = all.map(f => relative(DIR, f));
    for (const n of ['ingest.ts', 'pdf-vector.ts', 'layout.ts', 'dxf.ts', 'index.ts', 'cli.ts', 'worker.ts', 'raster/index.ts', 'raster/ocr.ts', 'raster/render.ts', 'raster/preprocess.ts',
      'extract/title-block.ts', 'extract/material.ts', 'extract/general-tolerance.ts', 'extract/roughness.ts', 'extract/coating.ts', 'extract/heat-treatment.ts', 'extract/threads.ts',
      'extract/dimensions.ts', 'extract/gdt.ts', 'extract/welds.ts', 'extract/quality.ts', 'extract/gear.ts', 'extract/notes.ts', 'data/iso286.ts'])
      expect(names, n).toContain(n);
    expect(imports.length).toBeGreaterThan(60);
  });

  it('reaches into src/ only for engineering-data/model (types) and engineering-data/dictionary', () => {
    const intoSrc = imports.filter(i => i.spec.startsWith('.') && resolve(dirname(join(ROOT, i.file)), i.spec).startsWith(join(ROOT, 'src')));
    expect(intoSrc.length).toBeGreaterThan(5);
    for (const i of intoSrc) {
      const target = relative(ROOT, resolve(dirname(join(ROOT, i.file)), i.spec)).replace(/\\/g, '/').replace(/\.js$/, '');
      expect(['src/engine/engineering-data/model', 'src/engine/engineering-data/dictionary'], `${i.file}: ${i.statement}`).toContain(target);
      if (target.endsWith('/model')) expect(i.typeOnly, `${i.file} must import model.ts as types only: ${i.statement}`).toBe(true);
    }
  });

  it('reaches outside its own folder only for the DXF group-code reader', () => {
    const outside = imports.filter(i => i.spec.startsWith('.')).map(i => ({ i, target: relative(ROOT, resolve(dirname(join(ROOT, i.file)), i.spec)).replace(/\\/g, '/').replace(/\.js$/, '') }))
      .filter(x => !x.target.startsWith('server/drawing/') && !x.target.startsWith('src/engine/engineering-data/'));
    expect(outside.map(x => x.target)).toEqual(['server/utils/dxf-blank']);
  });

  it('imports no AI client, no HTTP client, no network module — and only the packages it declares', () => {
    const packages = [...new Set(imports.filter(i => !i.spec.startsWith('.') && !i.spec.startsWith('$')).map(i => i.spec))].sort();
    const allowed = /^(node:(fs|path|module|zlib|crypto|worker_threads)|pdfjs-dist\/legacy\/build\/pdf\.mjs|@napi-rs\/canvas|utif2|tesseract\.js-core\/tesseract-core(-simd)?-lstm|@tesseract\.js-data\/\$\{lang\}\/package\.json|tsx\/esm\/api)$/;
    for (const p of packages) expect(allowed.test(p), `unexpected import "${p}"`).toBe(true);
    const src = all.map(f => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/@anthropic-ai|ai-client|createAnthropic|openai/i);
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|node:(http|https|net|tls|dgram|dns)\b|from ['"](http|https|net|tls)['"]/);
    expect(src).not.toMatch(/https?:\/\/(?!www\.nist\.gov)[a-z0-9.-]+\.[a-z]{2,}/i);      // no URL the code could call
    // tesseract.js (whose default language source is a CDN) is not used: the WebAssembly core is driven directly
    expect(packages).not.toContain('tesseract.js');
    expect(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies['tesseract.js']).toBeUndefined();
  });

  it('never names a cost: no £, no rate, no cost-engine word in what it emits', () => {
    const src = all.map(f => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/computeUniversalStack|rate-library|RateLibrary|toCostParams|costMeasuredPart/);
  });
});
