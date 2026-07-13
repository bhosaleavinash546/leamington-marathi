/**
 * Accuracy report CLI — grade the tool's should-cost against real actuals.
 *
 *   npm run accuracy                       # uses scripts/accuracy-samples.csv (template)
 *   npm run accuracy path/to/quotes.csv    # your real data
 *
 * CSV columns (header row, any order): commodity, part, estimate, actual, source
 * Every figure is graded honestly — small samples are reported as "insufficient",
 * never dressed up as a headline accuracy number.
 */
import { readFileSync } from 'node:fs';
import { computeAccuracyReport, accuracyHeadline, type AccuracyPoint } from '../src/engine/accuracy.js';

/** Minimal CSV parser: header row → records; tolerant of quotes and blank lines. */
function parseCsv(text: string): Record<string, string>[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  if (!rows.length) return [];
  const splitLine = (l: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const header = splitLine(rows[0]).map(h => h.toLowerCase());
  return rows.slice(1).map(l => {
    const cells = splitLine(l); const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
}

const col = (r: Record<string, string>, ...names: string[]) => { for (const n of names) if (r[n] != null && r[n] !== '') return r[n]; return ''; };
const num = (s: string) => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));

const path = process.argv[2] ?? 'scripts/accuracy-samples.csv';
let raw: string;
try { raw = readFileSync(path, 'utf8'); }
catch { console.error(`Could not read "${path}". Pass a CSV of commodity,part,estimate,actual,source.`); process.exit(1); }

const points: AccuracyPoint[] = parseCsv(raw)
  .map(r => ({ commodity: col(r, 'commodity').toLowerCase() || 'unknown', partName: col(r, 'part', 'partname'), estimateGBP: num(col(r, 'estimate', 'estimategbp', 'should')), actualGBP: num(col(r, 'actual', 'actualgbp', 'quote')), source: col(r, 'source') }))
  .filter(p => Number.isFinite(p.estimateGBP) && Number.isFinite(p.actualGBP));

const rep = computeAccuracyReport(points);

const pad = (s: string, w: number) => (s + ' '.repeat(w)).slice(0, w);
const pct = (n: number) => `${n}%`;
console.log('\n  CostVision — Should-Cost Accuracy Report');
console.log('  ' + '─'.repeat(78));
console.log('  ' + pad('Commodity', 20) + pad('n', 5) + pad('MAPE', 8) + pad('median', 8) + pad('bias', 12) + pad('±10%', 7) + pad('±20%', 7) + 'confidence');
console.log('  ' + '─'.repeat(78));
const row = (a: ReturnType<typeof computeAccuracyReport>['overall']) => {
  const bias = a.confidence === 'insufficient' ? '—' : `${a.biasPct > 0 ? '+' : ''}${a.biasPct}% ${a.biasDir}`;
  const cell = (v: string) => (a.confidence === 'insufficient' ? '·' : v);
  console.log('  ' + pad(a.commodity, 20) + pad(String(a.n), 5) + pad(cell(pct(a.mapePct)), 8) + pad(cell(pct(a.medianApePct)), 8) + pad(cell(bias), 12) + pad(cell(Math.round(a.within10Pct * 100) + '%'), 7) + pad(cell(Math.round(a.within20Pct * 100) + '%'), 7) + a.confidence);
};
rep.byCommodity.forEach(row);
console.log('  ' + '─'.repeat(78));
row(rep.overall);
console.log('  ' + '─'.repeat(78));
console.log('  ' + rep.generatedNote + (rep.skipped ? `  (${rep.skipped} invalid row(s) skipped)` : ''));
console.log('  Honest reporting: commodities with fewer than 5 actuals show "insufficient" — collect more before quoting a number.\n');
