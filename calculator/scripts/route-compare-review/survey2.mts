/** The rebuilt comparison on named parts: npx tsx scripts/route-compare-review/survey2.mts [part ...] */
import { readFileSync } from 'node:fs';
import { compareRoutes } from '../../server/services/route-compare.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string; total?: number };
}>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const want = process.argv.slice(2);
for (const p of parts) {
  if (want.length && !want.some(w => p.part.includes(w))) continue;
  const current = p.outcome.commodity ?? 'machining';
  const t0 = Date.now();
  const c = await compareRoutes({ geo: p.geometry as never, filename: p.part, current, answers: p.answers, region: 'UK', annualVolume: 100_000, programmeYears: 5, baseBook: book });
  console.log(`\n== ${p.part} (${current}) ${Date.now() - t0} ms  excluded: ${c.excluded.map(e => e.route).join(', ')}`);
  for (const r of c.rows) {
    const b = r.breakdown ?? {};
    console.log(`  ${r.route === current ? '*' : ' '} ${r.route.padEnd(20)} ${r.status.padEnd(12)} ${r.total != null ? '£' + r.total.toFixed(4) : '—'}  rec=${r.reconciles}`
      + (r.material ? `  mat ${r.material.label.slice(0, 28)} net ${r.material.netKg} bought ${r.material.boughtKg} util ${r.material.utilisation}` : '')
      + (r.tooling ? `  tool £${r.tooling.investment} / ${r.tooling.amortisedOver}` : ''));
    if (r.breakdown) console.log(`      buckets: ${Object.entries(b).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
    if (r.operations) console.log(`      ops: ${r.operations.map(o => `${o.name} [${o.machine}] ${o.cycleMin} min £${o.processCost}+£${o.labourCost}`).join(' | ')}`.slice(0, 400));
    if (r.byVolume.length) console.log(`      ladder: ${r.byVolume.map(v => `${v.volume / 1000}k £${v.total ?? '—'}`).join('  ')}`);
    if (r.assumed.length) console.log(`      assumed: ${r.assumed.join(' | ')}`);
    if (r.openQuestions.length) console.log(`      OPEN: ${r.openQuestions.join(' | ')}`);
    if (r.refusal) console.log(`      REFUSED: ${r.refusal}`);
    if (r.caveats.length) console.log(`      caveats: ${r.caveats.join(' | ')}`);
    if (r.notes.length) console.log(`      notes: ${r.notes.join(' | ')}`);
  }
  for (const x of c.crossovers) console.log(`  ↔ ${x.route}: ${x.text}`);
  for (const e of c.excluded) console.log(`  ✗ ${e.route}: ${e.reasons.map(r => `${r.label} — ${r.measured} v ${r.limit}`).join(' | ')}`.slice(0, 260));
}
