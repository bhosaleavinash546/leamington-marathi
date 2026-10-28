/**
 * Real prices paid for the real CAD parts → the tool's estimate at THE SAME conditions → the accuracy report's input.
 *
 * Accuracy is unmeasured until someone types a price that was actually paid (CLAUDE.md, 360 review). This makes that a
 * two-minute job and keeps it honest:
 *
 *   1. Fill `actual` (and `source`) in scripts/actuals/cad-actuals-input.csv — £ per part, as invoiced, delivered in the
 *      costing country (the tool's total includes its default packaging and delivery). Set the annual volume, programme
 *      life, country and finish the part was actually bought at.
 *   2. npx tsx scripts/cad-actuals.ts
 *      Each filled row is re-costed through `costMeasuredPart` (the headless chain, = the screen to the penny) on the
 *      part's recorded geometry and the stated engineering answers in real-parts-baseline.ts ANSWERS, at that row's
 *      volume / life / country / finish, and written to scripts/actuals/cad-actuals.csv with the rate book, rules
 *      version and date on every row.
 *   3. npm run accuracy scripts/actuals/cad-actuals.csv
 *
 * Never tune a rate to make one row agree — a row is evidence, not a target. Rows with no `actual` are skipped and
 * listed. Only the real customer parts are offered: the IM_ / BIW_ / FORGE_ … files were modelled for tests and have
 * no purchase price.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANSWERS } from './real-parts-baseline.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { resolveManufacturingRegion } from '../src/engine/regional-rates.js';
import { RULE_ENGINE_VERSION } from '../src/engine/cost-input-rules/types.js';

/** The customer parts in cad-audit/parts (everything else there was modelled for tests). */
export const REAL_PARTS = ['steering_knuckle_RH.stp', 'PRCR002.stp', 'Casting_Braket.stp', 'Seat_Locking_Bracket.stp', 'Part1.stp'];

const DIR = join(import.meta.dirname, 'actuals');
const INPUT = process.argv[2] ?? join(DIR, 'cad-actuals-input.csv');
const OUTPUT = process.env.CV_ACTUALS_OUT ?? join(DIR, 'cad-actuals.csv');

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const split = (l: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const head = split(lines[0] ?? '').map(h => h.toLowerCase());
  return lines.slice(1).map(l => { const c = split(l); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}
const csv = (s: string | number) => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);

async function main(): Promise<void> {
  const baseline = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'fixtures', 'real-parts-baseline.json'), 'utf8')) as
    Array<{ part: string; geometry: unknown }>;
  const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  const today = new Date().toISOString().slice(0, 10);
  const rows = parseCsv(readFileSync(INPUT, 'utf8'));
  const out: string[] = [];
  const waiting: string[] = [];
  for (const r of rows) {
    const part = r.part;
    const actual = parseFloat((r.actual ?? '').replace(/[^0-9.]/g, ''));
    if (!(actual > 0)) { waiting.push(part); continue; }
    if (!REAL_PARTS.includes(part)) throw new Error(`${part}: not one of the real parts (${REAL_PARTS.join(', ')})`);
    const geo = baseline.find(b => b.part === part)?.geometry;
    const spec = ANSWERS[part];
    if (!geo || !spec) throw new Error(`${part}: no recorded geometry / answers in the real-parts baseline`);
    const region = resolveManufacturingRegion(r.country || 'UK');
    if (!region) throw new Error(`${part}: unknown country "${r.country}"`);
    const annualVolume = Number(r.annualvolume) || 100_000;
    const programmeYears = Number(r.programmeyears) || undefined;
    const answers: Record<string, string> = { ...spec.answers, ...(r.finish && r.finish !== 'none' ? { 'service.finish': r.finish } : {}) };
    const c = await costMeasuredPart(geo as never, part, { partNumber: part, file: part, annualVolume, ...(spec.commodity ? { commodity: spec.commodity } : {}) },
      answers, region, { annualVolume, ...(programmeYears ? { programmeYears } : {}) }, book, { partNumber: part, file: part, status: 'error' });
    if (c.status !== 'costed' || c.total == null) throw new Error(`${part}: not costed (${c.status} ${c.code ?? ''} ${c.error ?? ''})`);
    const est = Math.round(c.total * 100) / 100;
    const err = ((est - actual) / actual) * 100;
    console.log(`  ${part.padEnd(26)} ${c.commodity?.padEnd(17)} est £${est.toFixed(2).padStart(8)}  actual £${actual.toFixed(2).padStart(8)}  ${err >= 0 ? '+' : ''}${err.toFixed(1)}%`);
    const basis = `${region} ${annualVolume.toLocaleString('en-GB')}/yr${programmeYears ? ` × ${programmeYears} yr` : ''}${answers['service.finish'] ? `, ${answers['service.finish']}` : ''}; `
      + `tool: rate book ${book.version}, rules v${RULE_ENGINE_VERSION}, ${today}`;
    out.push([c.commodity ?? '', part, est.toFixed(2), actual.toFixed(2), `${r.source || 'price paid (no source given)'} — ${basis}`].map(csv).join(','));
  }
  writeFileSync(OUTPUT, '# Real prices paid for the real CAD parts against the tool estimate at the same conditions (scripts/cad-actuals.ts).\n'
    + '# Written by the script from cad-actuals-input.csv — edit the input, not this file. Never tune a rate to one row.\n'
    + 'commodity,part,estimate,actual,source\n' + out.join('\n') + (out.length ? '\n' : ''));
  console.log(`\n  ${out.length} row(s) written to ${OUTPUT}${waiting.length ? `; waiting for a price: ${waiting.join(', ')}` : ''}`);
  if (out.length) console.log('  Grade them: npm run accuracy scripts/actuals/cad-actuals.csv');
}

if (import.meta.filename === process.argv[1]) main().catch(e => { console.error(`  ${(e as Error).message}`); process.exit(1); });
