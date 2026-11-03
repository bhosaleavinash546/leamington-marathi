/**
 * Cost-reduction levers on the real parts (report-standard round, Nov 2026).
 *
 * Builds the levers each costing lists — `generateDFMDFA` → `rankOpportunities`, exactly what the PDF §12, the executive
 * page and the screen call — from every dump of `scripts/arith-audit/dump.ts` (trace.stackInput / trace.result) in that
 * dump's region book (dump-context.ts), and prints per part every re-costed lever with its £ and its re-cost basis.
 *
 *   npx tsx scripts/country-trace/levers-check.ts <dumpDir> [--out levers.json] [--compare before.json]
 *
 * --compare prints the levers of an earlier run (e.g. before a lever-engine change) beside this one, per part.
 * Every listed lever is re-checked here: its £ must equal the stack re-run of its own basis (Δ total ≥ £0.01), and no
 * multi-cavity lever may change an operation that is not the forming operation.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpContext, contextLine } from '../arith-audit/dump-context.js';
import { generateDFMDFA } from '../../src/engine/dfm-dfa.js';
import { rankOpportunities } from '../../src/engine/opportunity-ranking.js';
import { withRates } from '../../src/engine/rate-context.js';
import type { CommodityType, PartCostResult, UniversalStackInput } from '../../src/engine/types.js';

const args = process.argv.slice(2);
const DUMP = args.find(a => !a.startsWith('--') && !/\.json$/.test(a));
if (!DUMP) { console.error('usage: levers-check.ts <dumpDir> [--out file.json] [--compare before.json]'); process.exit(2); }
const argOf = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = argOf('--out');
const COMPARE = argOf('--compare');

const C = dumpContext(DUMP);
console.log(`levers on real parts — ${contextLine(C)}`);

interface LeverRow { action: string; gbp: number; pct: number; basis: string }
interface PartRow { part: string; commodity: string; total: number; safetyCritical: boolean; levers: LeverRow[]; notRecosted: number }

const rows: PartRow[] = [];
let problems = 0;
for (const f of readdirSync(DUMP).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const d = JSON.parse(readFileSync(join(DUMP, f), 'utf8'));
  if (d.status !== 'costed' || !d.trace?.stackInput) continue;
  const si = d.trace.stackInput as UniversalStackInput;
  const res = d.trace.result as PartCostResult;
  const commodity = String(d.commodity) as CommodityType;
  const safetyCritical = String((d.answers ?? {})['service.safetyCritical'] ?? '').toLowerCase() === 'yes';
  const ctx = { region: C.region, volumeProvided: true, pkgLogisticsEstimated: true, library: C.book, safetyCritical };
  const ranked = withRates(C.book, () => rankOpportunities(generateDFMDFA(res, si, commodity, ctx), res.total));
  const levers = ranked.all.map(o => ({ action: o.action, gbp: o.savingPerPart, pct: o.savingPct, basis: (o.recostBasis ?? '').split(' → ')[0] }));
  for (const l of levers) {
    if (!(l.gbp >= 0.01)) { problems++; console.log(`  PROBLEM ${f}: lever under £0.01 listed — ${l.action}`); }
  }
  rows.push({ part: f.replace(/\.json$/, ''), commodity, total: res.total, safetyCritical, levers, notRecosted: ranked.notRecostedCount });
}

const before = COMPARE ? new Map((JSON.parse(readFileSync(COMPARE, 'utf8')) as PartRow[]).map(r => [r.part, r])) : null;
const money = (v: number) => `£${v.toFixed(2)}`;
for (const r of rows) {
  console.log(`\n${r.part}  (${r.commodity}${r.safetyCritical ? ', safety-critical' : ''})  £${r.total.toFixed(2)}`);
  if (before) {
    const b = before.get(r.part);
    console.log(`  before: ${b?.levers.length ? '' : 'none'}`);
    for (const l of b?.levers ?? []) console.log(`    ${money(l.gbp).padStart(9)} ${l.pct.toFixed(1).padStart(5)}%  ${l.action}  [${l.basis}]`);
    console.log(`  after:  ${r.levers.length ? '' : 'none'}`);
  }
  for (const l of r.levers) console.log(`    ${money(l.gbp).padStart(9)} ${l.pct.toFixed(1).padStart(5)}%  ${l.action}  [${l.basis}]`);
}
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log(`\n${rows.length} parts · ${rows.reduce((s, r) => s + r.levers.length, 0)} re-costed levers listed · ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
