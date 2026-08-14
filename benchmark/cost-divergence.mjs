// ─────────────────────────────────────────────────────────────────────────────
// Over-fit detector: how much worse is the engine on parts it has never seen?
//
//   node benchmark/cost-divergence.mjs                 → print the comparison
//   node benchmark/cost-divergence.mjs --max-ratio 2.8 → exit 1 if it worsens
//
// The calibrated fixture set and the held-out set are both already scored by
// cost-run.mjs. Neither number alone catches the failure this script exists for:
// an engine can improve on its own fixtures while getting worse on real parts,
// and both individual gates would stay green throughout.
//
// The August 2026 audit found exactly that gap — calibrated 8.3% MAPE against
// held-out 20.9%, a 2.5x divergence sitting in the repo unwatched. This gate
// does not demand the divergence be small; it demands it not grow. Closing it
// is a modelling job (see the titanium / CFRP / high-volume findings), and this
// script is what tells you whether that job is working.
//
// A ratchet, deliberately: lower --max-ratio as the modelling improves.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreCost } from './cost-run.mjs';
import { COST_FIXTURES } from './cost-fixtures.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const holdout = JSON.parse(readFileSync(join(root, 'benchmark', 'cost-fixtures-holdout.json'), 'utf8'));

const cal = scoreCost(COST_FIXTURES);
const held = scoreCost(Array.isArray(holdout) ? holdout : holdout.fixtures);

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const ratio = cal.mape > 0 ? held.mape / cal.mape : Infinity;

console.log('\n  CALIBRATED vs HELD-OUT — over-fit detector\n  ' + '─'.repeat(62));
console.log(`  ${'set'.padEnd(14)} ${'hit-rate'.padStart(10)} ${'MAPE'.padStart(8)} ${'bias'.padStart(8)} ${'band cov'.padStart(10)}`);
console.log('  ' + '─'.repeat(62));
for (const [name, r] of [['calibrated', cal], ['held-out', held]]) {
  console.log(`  ${name.padEnd(14)} ${pct(r.hitRate).padStart(10)} ${pct(r.mape).padStart(8)} ${(r.bias >= 0 ? '+' : '') + pct(r.bias).padStart(7)} ${pct(r.bandCoverage).padStart(10)}`);
}
console.log('  ' + '─'.repeat(62));
console.log(`  Divergence (held-out MAPE / calibrated MAPE):  ${ratio.toFixed(2)}x`);
console.log('  A rising ratio means the engine is learning its fixtures, not the physics.\n');

const i = process.argv.indexOf('--max-ratio');
if (i !== -1) {
  const max = parseFloat(process.argv[i + 1]);
  if (!(ratio <= max)) {
    console.error(`  ✗ FAIL: divergence ${ratio.toFixed(2)}x exceeds the allowed ${max.toFixed(2)}x.`);
    console.error('    The engine got relatively better on its own fixtures than on unseen parts.\n');
    process.exit(1);
  }
  console.log(`  ✓ divergence ${ratio.toFixed(2)}x within the allowed ${max.toFixed(2)}x\n`);
}
