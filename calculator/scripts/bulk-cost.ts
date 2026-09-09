/**
 * Cost a basket of parts from a CSV, unattended, with no AI.
 *
 *   npx tsx scripts/bulk-cost.ts parts.csv --out runs/2026-09 \
 *        [--answer material.family=aluminium]... [--volume 50000] [--concurrency 4]
 *
 * The CSV needs a header row. Recognised columns (case-insensitive, any order):
 *
 *   partNumber   required   identity in the report
 *   file         required   path to the CAD file, absolute or relative to the CSV
 *   commodity    optional   casting | forging | machining | sheet_metal | ...
 *                           left blank, the geometry decides — or asks
 *   material     optional   shorthand for the material.family answer
 *   annualVolume optional   defaults to --volume, else the shop default
 *   region       optional   UK only today; anything else is refused, not guessed
 *
 * Any other column whose name contains a dot is treated as a per-part answer to
 * that decision — so `service.pressureTight` is a column, not a code change.
 *
 * Three files land in --out:
 *
 *   results.csv    one row per part, the eight buckets and the total
 *   questions.csv  the distinct questions still open, each naming every part it
 *                  blocks and the exact flag that answers it for all of them
 *   run.json       the durable record — inputs, answers, provenance, and the
 *                  rule-engine and rate-library versions the numbers came from
 *
 * Exit codes: 0 everything costed · 2 some parts still need an answer ·
 * 3 nothing costed · 1 bad usage. So a scheduled run can be checked by a script.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { runBulkCosting, type BulkPartInput, type BulkRunRecord } from '../server/services/bulk-run.js';
import { geometryPool } from '../server/utils/geometry-pool.js';

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const csvPath = argv.find(a => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : argv[argv.indexOf(hit) + 1];
};

/** Index-based: every `--answer` is the same string, so indexOf finds only the first. */
const answers: Record<string, unknown> = {};
argv.forEach((a, i) => {
  if (!a.startsWith('--answer')) return;
  const kv = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1];
  const eq = (kv ?? '').indexOf('=');
  if (eq > 0) answers[kv.slice(0, eq)] = kv.slice(eq + 1);
});

if (!csvPath || !existsSync(csvPath)) {
  console.error('usage: tsx scripts/bulk-cost.ts <parts.csv> --out <dir> [--answer k=v]... [--volume N]');
  process.exit(1);
}
const outDir = flag('out') ?? 'bulk-run';
const volume = flag('volume') ? parseInt(flag('volume')!, 10) : undefined;
const concurrency = flag('concurrency') ? parseInt(flag('concurrency')!, 10) : 4;

// ── CSV ──────────────────────────────────────────────────────────────────────
/** Quote-aware: file paths and descriptions contain commas, and a naive split
 *  on ',' silently shifts every later column — a wrong cost, not an error. */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const KNOWN = new Set(['partnumber', 'file', 'commodity', 'material', 'annualvolume', 'region']);

function parsePartList(text: string, csvDir: string): BulkPartInput[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  // Two views of the header: lower-cased for matching the known column names,
  // raw for the dotted answer columns — decision ids are camelCase, so
  // `service.pressureTight` must not be flattened to `service.pressuretight`.
  const raw = splitCSVLine(lines[0]);
  const header = raw.map(h => h.toLowerCase());
  const idx = (n: string) => header.indexOf(n);
  if (idx('partnumber') < 0 || idx('file') < 0) {
    console.error(`CSV must have 'partNumber' and 'file' columns. Found: ${header.join(', ')}`);
    process.exit(1);
  }
  const parts: BulkPartInput[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCSVLine(line);
    const get = (n: string) => { const i = idx(n); return i >= 0 ? (c[i] ?? '') : ''; };
    const file = get('file');
    if (!get('partnumber') || !file) continue;

    // Any dotted column is an answer to that decision, for this part only.
    const rowAnswers: Record<string, unknown> = {};
    raw.forEach((h, i) => {
      if (KNOWN.has(h.toLowerCase()) || !h.includes('.')) return;
      const v = (c[i] ?? '').trim();
      if (v) rowAnswers[h] = v;
    });

    parts.push({
      partNumber: get('partnumber'),
      file: resolve(csvDir, file),
      ...(get('commodity') ? { commodity: get('commodity') } : {}),
      ...(get('material') ? { material: get('material') } : {}),
      ...(get('annualvolume') ? { annualVolume: parseInt(get('annualvolume'), 10) } : {}),
      ...(get('region') ? { region: get('region') } : {}),
      ...(Object.keys(rowAnswers).length ? { answers: rowAnswers } : {}),
    });
  }
  return parts;
}

// ── Reports ──────────────────────────────────────────────────────────────────
const csvCell = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: unknown[]) => cells.map(csvCell).join(',');

const BUCKETS = ['rawMaterial', 'process', 'labour', 'tooling',
                 'packaging', 'logistics', 'overhead', 'margin'] as const;

function resultsCSV(rec: BulkRunRecord): string {
  const lines = [row(['partNumber', 'file', 'status', 'commodity', 'commoditySource',
                      'volumeCm3', ...BUCKETS, 'totalGBP', 'code', 'note'])];
  for (const p of rec.parts) {
    lines.push(row([
      p.partNumber, p.file, p.status, p.commodity ?? '', p.commoditySource ?? '',
      p.geometry?.volumeCm3 ?? '',
      ...BUCKETS.map(b => (p.breakdown?.[b] !== undefined ? p.breakdown[b].toFixed(4) : '')),
      p.total !== undefined ? p.total.toFixed(2) : '',
      p.code ?? '',
      p.error ?? (p.questions?.length ? `needs: ${p.questions.map(q => q.id).join(' ')}` : ''),
    ]));
  }
  return lines.join('\n') + '\n';
}

function questionsCSV(rec: BulkRunRecord): string {
  const lines = [row(['decisionId', 'question', 'why', 'options', 'blocksCount',
                      'blockedParts', 'answerWithThisFlag'])];
  for (const q of rec.openQuestions) {
    lines.push(row([
      q.id, q.question, q.why,
      q.options.map(o => `${o.value}${o.leaning ? ' (likely)' : ''}`).join(' | '),
      q.blocks.length, q.blocks.join(' '),
      `--answer ${q.id}=<value>`,
    ]));
  }
  return lines.join('\n') + '\n';
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const parts = parsePartList(readFileSync(csvPath!, 'utf-8'), dirname(resolve(csvPath!)));
  if (!parts.length) { console.error('No usable rows in the part list.'); process.exit(1); }

  console.log(`\n  ${parts.length} parts · ${concurrency} at a time · no AI, no network`);
  if (Object.keys(answers).length) {
    console.log(`  basket answers: ${Object.entries(answers).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  console.log('');

  const started = Date.now();
  const rec = await runBulkCosting(parts, {
    answers, annualVolume: volume, concurrency,
    onProgress: (done, total, p) => {
      const tail = p.status === 'costed' ? `£${p.total!.toFixed(2)}`
        : p.status === 'needs_answer' ? `needs ${p.questions!.map(q => q.id).join(', ')}`
        : (p.code ?? p.status);
      process.stdout.write(`  [${String(done).padStart(String(total).length)}/${total}] `
        + `${p.partNumber.padEnd(14)} ${p.status.padEnd(12)} ${tail}\n`);
    },
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.csv'), resultsCSV(rec));
  writeFileSync(join(outDir, 'questions.csv'), questionsCSV(rec));
  writeFileSync(join(outDir, 'run.json'), JSON.stringify(rec, null, 2));

  const s = rec.summary;
  console.log(`\n  ${'─'.repeat(66)}`);
  console.log(`  costed ${s.costed}/${s.parts}   basket £${s.basketTotalGBP.toLocaleString('en-GB')}`
    + `   in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (s.needsAnswer) console.log(`  ${s.needsAnswer} need an answer · ${s.refused} refused · ${s.errored} errored`);
  else if (s.refused || s.errored) console.log(`  ${s.refused} refused · ${s.errored} errored`);

  if (rec.openQuestions.length) {
    console.log(`\n  ${rec.openQuestions.length} question(s) would unblock ` +
      `${new Set(rec.openQuestions.flatMap(q => q.blocks)).size} part(s). Answer once, applies to all:\n`);
    for (const q of rec.openQuestions) {
      console.log(`    ${q.question}`);
      console.log(`      why: ${q.why}`);
      console.log(`      blocks ${q.blocks.length}: ${q.blocks.slice(0, 6).join(', ')}`
        + (q.blocks.length > 6 ? ` +${q.blocks.length - 6} more` : ''));
      for (const o of q.options.slice(0, 6)) {
        console.log(`      --answer ${q.id}=${o.value}${o.leaning ? '   (likely)' : ''}`);
      }
      console.log('');
    }
  }

  console.log(`  written to ${resolve(outDir)}/  ·  run ${rec.runId}`);
  console.log(`  rules v${rec.engine.ruleEngineVersion} · rates ${rec.engine.rateLibraryVersion} `
    + `(${rec.engine.rateLibraryLastModified}) · inputs ${rec.inputHash} · AI not used\n`);

  geometryPool().shutdown();
  process.exit(s.costed === 0 ? 3 : s.needsAnswer ? 2 : 0);
}

void main();
