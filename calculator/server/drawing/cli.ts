/**
 * Command line for the offline drawing reader — for the customer's own accuracy run inside their network.
 *
 *   npx tsx server/drawing/cli.ts <file> [--json] [--ocr auto|off|force] [--lang eng+deu] [--dpi 300] [--text]
 *
 * Prints what was read: sheets, parameters with their place on the sheet and status, and the warnings. `--json`
 * prints the whole extraction. Nothing leaves the machine: there is no network code in this path.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readDrawing, DrawingReadError } from './index.js';
import type { ReadOptions } from './types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--ocr', '--lang', '--dpi'].includes(args[i - 1] ?? ''));
  if (!file || args.includes('--help')) {
    console.log('usage: npx tsx server/drawing/cli.ts <file> [--json] [--ocr auto|off|force] [--lang eng+deu] [--dpi 300] [--text]');
    process.exit(args.includes('--help') ? 0 : 2);
  }
  if (!existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
  // piping into `head` closes the pipe early: that is not an error
  process.stdout.on('error', e => { if ((e as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0); });
  const opts: ReadOptions = {};
  const ocr = flag('ocr'); if (ocr === 'auto' || ocr === 'off' || ocr === 'force') opts.ocr = ocr;
  const lang = flag('lang'); if (lang) opts.ocrLanguages = lang.split(/[+,]/).filter(Boolean);
  const dpi = Number(flag('dpi')); if (dpi >= 72 && dpi <= 600) opts.ocrDpi = dpi;
  let ex;
  try { ex = await readDrawing(readFileSync(file), basename(file), opts); }
  catch (e) {
    if (e instanceof DrawingReadError) { console.error(`Cannot read ${basename(file)}: ${e.message}`); process.exit(1); }
    throw e;
  }
  if (args.includes('--json')) { console.log(JSON.stringify(ex, null, 2)); return; }
  console.log(`${ex.sourceFile} — ${ex.fileKind}, reader ${ex.readerVersion}`);
  for (const s of ex.sheets) console.log(`  sheet ${s.sheet}: ${s.widthPt} × ${s.heightPt} pt, ${s.content}, ${s.textItemCount} text runs`);
  console.log(`\n${ex.parameters.length} parameters`);
  for (const p of ex.parameters) {
    const v = typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value);
    const where = p.location ? `s${p.location.sheet}${p.location.zone ? ` ${p.location.zone}` : ''} ${p.location.region ?? ''}` : '';
    console.log(`  ${p.status === 'needs-validation' ? '?' : ' '} ${p.name.padEnd(26)} ${(v.length > 70 ? v.slice(0, 67) + '…' : v).padEnd(70)} ${p.unit ?? ''}\t[${p.method}${p.reliability !== undefined && p.reliability < 1 ? ` ${Math.round(p.reliability * 100)}%` : ''}, ${p.kind}] ${where}`);
  }
  if (args.includes('--text')) { console.log(`\n${ex.text.length} text lines`); for (const t of ex.text) console.log(`  s${t.sheet} ${String(t.rotation).padStart(3)}° ${JSON.stringify(t.text)}`); }
  if (ex.warnings.length) { console.log('\nWarnings'); for (const w of ex.warnings) console.log(`  - ${w}`); }
  console.log(`\nTimings (ms): ${JSON.stringify(ex.timingsMs)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
