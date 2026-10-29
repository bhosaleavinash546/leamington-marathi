/** Round 2 comparison on named parts: npx tsx scripts/route-compare-review/survey3.mts [part ...] */
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
  console.log(`\n== ${p.part} (${current}) ${Date.now() - t0} ms  programme ${JSON.stringify(c.programme)}`);
  for (const r of c.rows) {
    console.log(`  ${r.route === current && !r.process ? '*' : r.route === current ? '*' : ' '} ${r.label.padEnd(40)} ${r.status.padEnd(12)} ${r.total != null ? '£' + r.total.toFixed(4) : '—'}  rec=${r.reconciles} audit=${r.audit ? (r.audit.closes ? 'closes' : 'OPEN') : '—'}`
      + (r.band ? `  band P10 ${r.band.p10} P90 ${r.band.p90} ±${r.band.plusMinusPct}% ${r.band.confidence}` : '')
      + (r.programme ? `  prog £${r.programme.total.toLocaleString('en-GB')}` : ''));
    if (r.audit && !r.audit.closes) for (const l of r.audit.lines.filter(x => !x.closes)) console.log(`      AUDIT ${l.line}: recomputed ${l.recomputed} v reported ${l.reported} — ${l.how}`);
    console.log(`      spec: ${r.spec.map(s => `${s.label}=${s.value} [${s.source}]`).join('; ')}`);
    if (r.byVolume.length) console.log(`      ladder: ${r.byVolume.map(v => `${v.volume / 1000}k £${v.total ?? '—'}${v.p10 != null ? ` (${v.p10}–${v.p90})` : ''}`).join('  ')}`);
    if (r.assumed.length) console.log(`      assumed: ${r.assumed.join(' | ')}`);
    if (r.openQuestions.length) console.log(`      OPEN: ${r.openQuestions.join(' | ')}`);
    if (r.refusal) console.log(`      REFUSED: ${r.refusal}`);
    if (r.notes.length) console.log(`      notes: ${r.notes.join(' | ')}`);
  }
  for (const x of c.crossovers) console.log(`  ↔ ${x.label}: ${x.text}`);
  for (const e of c.excluded.filter(e => e.process)) console.log(`  ✗ ${e.label}: ${e.reasons.map(r => r.measured).join(' | ')}`);
}
