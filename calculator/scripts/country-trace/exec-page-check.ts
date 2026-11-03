/**
 * Does the executive summary fit ONE page on every real part? Renders the PDF headless from an arith-audit dump
 * (`scripts/arith-audit/dump.ts`) with three unanswered questions added (the worst case seen live) and reports, a part,
 * the page the summary is on and whether the next page starts the full report.
 *
 *   npx tsx scripts/country-trace/exec-page-check.ts <dumpDir> [outDir]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { jsPDF } from 'jspdf';
import { printPDF } from '../../src/export/pdf.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, type ManufacturingRegion } from '../../src/engine/regional-rates.js';

const dir = process.argv[2];
const out = process.argv[3] ?? '/tmp/exec-page-check';
mkdirSync(out, { recursive: true });
let bad = 0;
for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!d.trace?.stackInput || !d.trace?.result) continue;
  const region = (d.region ?? 'UK') as ManufacturingRegion;
  const base = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  const book = region === 'UK' ? base : buildRegionalLibrary(base, region);
  const res = d.trace.result, si = d.trace.stackInput;
  let bytes: ArrayBuffer | null = null;
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  api.save = function (this: InstanceType<typeof jsPDF>) { bytes = this.output('arraybuffer'); return this; };
  try {
    printPDF(res, si, book, 'GBP', 1, d.commodity, null, region, [], {
      geometrySource: 'occt', annualVolume: si.annualVolume,
      uncertainty: { p10: res.total * 0.9, p90: res.total * 1.1, plusMinusPct: 10 } as never,
      stamp: `${region} rate book · rules v8 · kernel test`,
      checks: { costable: true, sanity: [], overrides: [], decisions: [
        { id: 'a', question: 'Is the part coated or surface-treated?', severity: 'advisory', answer: null },
        { id: 'b', question: 'Which grade?', severity: 'advisory', answer: null, used: 'the representative grade' },
        { id: 'c', question: 'What tolerance class does the drawing call for?', severity: 'advisory', answer: null },
      ] } as never,
    }, base);
  } finally { api.save = orig; }
  const pdf = join(out, f.replace('.json', '.pdf'));
  writeFileSync(pdf, Buffer.from(bytes!));
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())![1]);
  let at = 0;
  for (let p = 1; p <= pages && !at; p++) if (execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdf, '-']).toString().includes('Executive Summary')) at = p;
  const next = execFileSync('pdftotext', ['-f', String(at + 1), '-l', String(at + 1), pdf, '-']).toString().trim().split('\n')[0] ?? '';
  const ok = at > 0 && /§1/.test(next);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${f.replace('.json', '').padEnd(28)} summary p${at}; next page: ${next.slice(0, 60)}`);
}
console.log(bad ? `${bad} summary page(s) spill over` : 'every summary fits one page');
