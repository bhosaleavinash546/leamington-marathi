/**
 * Accuracy of the offline drawing reader against hand-checked truth files.
 *
 *   npx tsx scripts/drawings/accuracy.ts [dir] [--verbose] [--json] [--only <substring>] [--lang eng+deu]
 *
 * For every `<drawing>.truth.json` in the folder (default tests/fixtures/drawings) it reads each file of that drawing
 * and prints, per field group and per content class (vector / curves / scan): found, correct, wrong, missed,
 * precision and recall — public drawings and generated drawings apart, because the generated ones were written by us.
 * Point it at a folder of your own drawings with truth files in the same format to measure on them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDrawing } from '../../server/drawing/index.js';
import { GROUPS, addScores, classOfFile, precision, recall, scoreExtraction, totals, type Group, type GroupScore, type TruthFile } from './accuracy-lib.js';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = args.find((a, i) => !a.startsWith('--') && !['--only', '--lang'].includes(args[i - 1] ?? '')) ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'drawings');
const verbose = args.includes('--verbose');
const only = flag('only');
const lang = flag('lang');

const pct = (n: number | undefined): string => (n === undefined ? '   –  ' : `${(n * 100).toFixed(0).padStart(4)} %`);

async function main(): Promise<void> {
  const all = readdirSync(dir).sort();
  const truths = all.filter(f => f.endsWith('.truth.json'));
  type Key = string;
  const table = new Map<Key, Partial<Record<Group, GroupScore>>>();
  const perFile: Array<{ file: string; origin: string; cls: string; ms: number; ocrMs: number; t: GroupScore; warnings: number }> = [];
  for (const tf of truths) {
    const truth = JSON.parse(readFileSync(join(dir, tf), 'utf8')) as TruthFile;
    const base = tf.replace(/\.truth\.json$/, '');
    const files = all.filter(f => (f === `${base}.pdf` || f.startsWith(`${base}.`)) && /\.(pdf|png|jpe?g|tiff?|dxf)$/i.test(f));
    for (const file of files) {
      if (only && !file.includes(only)) continue;
      const ex = await readDrawing(readFileSync(join(dir, file)), file, lang ? { ocrLanguages: lang.split('+') } : {});
      const s = scoreExtraction(ex, truth);
      const cls = classOfFile(file, truth);
      const key = `${truth.origin}|${cls}`;
      if (!table.has(key)) table.set(key, {});
      addScores(table.get(key)!, s.groups);
      const t = totals(s.groups);
      perFile.push({ file, origin: truth.origin, cls, ms: ex.timingsMs?.total ?? 0, ocrMs: ex.timingsMs?.ocr ?? 0, t, warnings: ex.warnings.length });
      if (verbose) {
        console.log(`\n── ${file} (${truth.origin}, ${cls}) — correct ${t.correct}, partial ${t.partial}, wrong ${t.wrong}, missed ${t.missed}`);
        for (const w of s.wrongList) console.log(`   WRONG  ${w}`);
        for (const m of s.missedList) console.log(`   MISSED ${m}`);
      }
    }
  }
  if (args.includes('--json')) { console.log(JSON.stringify({ table: Object.fromEntries(table), perFile }, null, 1)); return; }
  for (const origin of ['public', 'generated']) for (const cls of ['vector', 'curves', 'scan']) {
    const g = table.get(`${origin}|${cls}`);
    if (!g) continue;
    const n = perFile.filter(f => f.origin === origin && f.cls === cls).length;
    console.log(`\n${origin.toUpperCase()} drawings — ${cls} (${n} file${n === 1 ? '' : 's'})`);
    console.log('group               found  correct  partial  wrong  missed  precision  recall');
    for (const k of GROUPS) {
      const s = g[k]; if (!s) continue;
      console.log(`${k.padEnd(19)} ${String(s.found).padStart(5)}  ${String(s.correct).padStart(7)}  ${String(s.partial).padStart(7)}  ${String(s.wrong).padStart(5)}  ${String(s.missed).padStart(6)}     ${pct(precision(s))}  ${pct(recall(s))}`);
    }
    const t = totals(g);
    console.log(`${'ALL'.padEnd(19)} ${String(t.found).padStart(5)}  ${String(t.correct).padStart(7)}  ${String(t.partial).padStart(7)}  ${String(t.wrong).padStart(5)}  ${String(t.missed).padStart(6)}     ${pct(precision(t))}  ${pct(recall(t))}`);
  }
  console.log('\nPer file (total ms, of which OCR ms)');
  for (const f of perFile) console.log(`  ${f.file.padEnd(34)} ${f.origin.padEnd(9)} ${f.cls.padEnd(6)} ${String(f.ms).padStart(6)} ms ${String(f.ocrMs).padStart(6)} ms   correct ${String(f.t.correct).padStart(3)}  partial ${String(f.t.partial).padStart(3)}  wrong ${String(f.t.wrong).padStart(3)}  missed ${String(f.t.missed).padStart(3)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
