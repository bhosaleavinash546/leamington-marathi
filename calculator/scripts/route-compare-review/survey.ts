/**
 * Compare-routes deep dive (Oct 2026): run the comparison on every real part in the baseline and print what it offers.
 *   npx tsx scripts/route-compare-review/survey.ts [json]
 */
import { readFileSync } from 'node:fs';
import { compareRoutes, candidateRoutes } from '../../server/services/route-compare.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';

const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string; total?: number };
}>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const asJson = process.argv.includes('json');
const out: unknown[] = [];
for (const p of parts) {
  const current = p.outcome.commodity ?? 'machining';
  const i = { geo: p.geometry as never, filename: p.part, current, answers: p.answers, region: 'UK' as const, annualVolume: 100_000, programmeYears: 5, baseBook: book };
  const cands = candidateRoutes(i);
  const t0 = Date.now();
  const rows = await compareRoutes(i, cands);
  const ms = Date.now() - t0;
  out.push({ part: p.part, current, baseline: p.outcome.total, candidates: cands, ms, rows });
  if (!asJson) {
    console.log(`\n== ${p.part}  (${current}, baseline £${p.outcome.total})  candidates: ${cands.join(', ')}  ${ms} ms`);
    for (const r of rows) {
      const flag = r.route === current ? '*' : ' ';
      console.log(`  ${flag} ${r.route.padEnd(20)} ${r.status.padEnd(12)} ${r.total != null ? '£' + r.total.toFixed(2) : '—'}`.padEnd(60)
        + (r.toolingPerPart != null ? ` tool/part £${r.toolingPerPart.toFixed(3)}` : '')
        + (r.assumed.length ? `  assumed: ${r.assumed.join(' | ')}` : '')
        + (r.openQuestions.length ? `  OPEN: ${r.openQuestions.join(' | ')}` : '')
        + (r.refusal ? `  REFUSED: ${r.refusal}` : '')
        + (r.notes.length ? `  notes: ${r.notes.join(' | ')}` : ''));
    }
  }
}
if (asJson) console.log(JSON.stringify(out, null, 1));
