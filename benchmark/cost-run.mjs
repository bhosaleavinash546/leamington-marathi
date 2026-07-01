// ─────────────────────────────────────────────────────────────────────────────
// Should-cost accuracy benchmark.
//
//   node benchmark/cost-run.mjs                     → prints a scored report, writes cost-results.json
//   node benchmark/cost-run.mjs --min-hit 0.70      → exit 1 if hit-rate (within tol) < 70%
//   node benchmark/cost-run.mjs --max-mape 0.25     → exit 1 if mean abs error > 25%
//
// Runs each reference part through the PRODUCTION costing engine and scores the
// deterministic total against a known piece-price, so cost "accuracy" becomes a
// measured number (hit-rate, MAPE, bias, P10–P90 band coverage) instead of an
// opinion. See cost-fixtures.mjs for the (illustrative) reference prices.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeShouldCost, simulateShouldCost } from '../costing-engine.mjs';
import { COST_FIXTURES } from './cost-fixtures.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function scoreCost(fixtures = COST_FIXTURES) {
  const rows = [];
  for (const fx of fixtures) {
    let modelled, band;
    try {
      modelled = computeShouldCost(fx.input).totalShouldCost;
      const s = simulateShouldCost(fx.input);
      band = { p10: s.p10, p90: s.p90 };
    } catch (e) {
      rows.push({ name: fx.name, error: e.message, ok: false });
      continue;
    }
    const err = (modelled - fx.refPriceEur) / fx.refPriceEur;   // signed relative error
    const withinTol = Math.abs(err) <= fx.tol;
    const inBand = fx.refPriceEur >= band.p10 && fx.refPriceEur <= band.p90;
    rows.push({ name: fx.name, ref: fx.refPriceEur, modelled: +modelled.toFixed(2), err, tol: fx.tol, withinTol, inBand, band, source: fx.source });
  }
  const scored = rows.filter(r => typeof r.err === 'number');
  const hits = scored.filter(r => r.withinTol).length;
  const mape = scored.length ? scored.reduce((s, r) => s + Math.abs(r.err), 0) / scored.length : 0;
  const bias = scored.length ? scored.reduce((s, r) => s + r.err, 0) / scored.length : 0;   // signed — reveals systematic over/under
  const bandCoverage = scored.length ? scored.filter(r => r.inBand).length / scored.length : 0;
  return {
    rows,
    hitRate: scored.length ? hits / scored.length : 0,
    mape, bias, bandCoverage,
    hits, total: scored.length, errored: rows.length - scored.length,
  };
}

function main() {
  const r = scoreCost();
  console.log('\n  SHOULD-COST ACCURACY BENCHMARK\n  ' + '─'.repeat(70));
  console.log(`  ${'Part'.padEnd(44)} ${'ref'.padStart(7)} ${'model'.padStart(7)} ${'err'.padStart(7)}  band`);
  console.log('  ' + '─'.repeat(70));
  for (const row of r.rows) {
    if (typeof row.err !== 'number') { console.log(`  ✗ ${row.name.padEnd(42)} ERROR: ${row.error}`); continue; }
    const mark = row.withinTol ? '✓' : '✗';
    const errPct = `${row.err >= 0 ? '+' : ''}${(row.err * 100).toFixed(0)}%`;
    console.log(`  ${mark} ${row.name.slice(0, 42).padEnd(42)} €${row.ref.toFixed(2).padStart(6)} €${row.modelled.toFixed(2).padStart(6)} ${errPct.padStart(6)}  ${row.inBand ? '·in' : 'out'} €${row.band.p10.toFixed(2)}–€${row.band.p90.toFixed(2)}`);
  }
  console.log('  ' + '─'.repeat(70));
  console.log(`  Hit-rate (within tol):   ${(r.hitRate * 100).toFixed(1)}%  (${r.hits}/${r.total})`);
  console.log(`  MAPE (mean abs error):   ${(r.mape * 100).toFixed(1)}%`);
  console.log(`  Bias (signed mean err):  ${r.bias >= 0 ? '+' : ''}${(r.bias * 100).toFixed(1)}%  ${r.bias < -0.05 ? '← engine reads LOW vs market' : r.bias > 0.05 ? '← engine reads HIGH vs market' : ''}`);
  console.log(`  P10–P90 band coverage:   ${(r.bandCoverage * 100).toFixed(1)}%  (Monte-Carlo band rarely spans real price spread — expected low)\n`);

  writeFileSync(join(root, 'benchmark', 'cost-results.json'), JSON.stringify({
    hitRate: +(r.hitRate * 100).toFixed(1), mape: +(r.mape * 100).toFixed(1), bias: +(r.bias * 100).toFixed(1),
    bandCoverage: +(r.bandCoverage * 100).toFixed(1), hits: r.hits, total: r.total,
    rows: r.rows.map(x => ({ name: x.name, ref: x.ref, modelled: x.modelled, errPct: typeof x.err === 'number' ? +(x.err * 100).toFixed(1) : null, withinTol: x.withinTol })),
  }, null, 2));

  let fail = false;
  const minHit = process.argv.indexOf('--min-hit');
  if (minHit !== -1) {
    const m = parseFloat(process.argv[minHit + 1]);
    if (r.hitRate < m) { console.error(`  ✗ FAIL: hit-rate ${(r.hitRate * 100).toFixed(1)}% < required ${(m * 100).toFixed(0)}%`); fail = true; }
  }
  const maxMape = process.argv.indexOf('--max-mape');
  if (maxMape !== -1) {
    const m = parseFloat(process.argv[maxMape + 1]);
    if (r.mape > m) { console.error(`  ✗ FAIL: MAPE ${(r.mape * 100).toFixed(1)}% > allowed ${(m * 100).toFixed(0)}%`); fail = true; }
  }
  if (fail) { console.log(''); process.exit(1); }
  return r;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
