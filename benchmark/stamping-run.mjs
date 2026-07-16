// Feature-based vs mass-based stamping — head-to-head MAPE on held-out stamped
// fixtures. Proves the feature model captures press-tonnage and utilisation cost
// the flat-rate mass model cannot.
//
//   node benchmark/stamping-run.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stampingFeatureCost } from '../stamping-feature-cost.mjs';
import { computeShouldCost } from '../costing-engine.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'benchmark', 'stamping-fixtures.json'), 'utf8'));
const fixtures = data.fixtures || data;

const DENS = { 'Steel (mild)': 7.85, 'Steel (high-strength)': 7.85, 'Aluminium 6061': 2.70 };
function massModelCost(fx) {
  const weightKg = (fx.geometry.partVolumeCm3 * (DENS[fx.material] || 7.85)) / 1000;
  return computeShouldCost({ material: fx.material, process: 'Stamping / Deep Drawing', weightKg, annualVolume: fx.annualVolume, region: fx.region }).totalShouldCost;
}

const rows = [];
for (const fx of fixtures) {
  const ref = fx.refPriceEur;
  const feat = stampingFeatureCost(fx).totalShouldCost;
  const mass = massModelCost(fx);
  rows.push({ id: fx.id, ref, feature: Number(feat.toFixed(3)), featErr: (feat - ref) / ref, mass: Number(mass.toFixed(3)), massErr: (mass - ref) / ref, tol: fx.tol });
}

const mape = (k) => rows.reduce((s, r) => s + Math.abs(r[k]), 0) / rows.length;
const hit = (k) => rows.filter(r => Math.abs(r[k]) <= r.tol).length;

console.log('\n  Stamping accuracy — feature-based vs mass model (held-out)\n  ' + '─'.repeat(74));
console.log('  ' + 'fixture'.padEnd(24) + 'ref'.padStart(8) + 'feature'.padStart(11) + 'err'.padStart(8) + 'mass'.padStart(10) + 'err'.padStart(8));
for (const r of rows) {
  console.log('  ' + r.id.padEnd(24) + `€${r.ref}`.padStart(8) + `€${r.feature}`.padStart(11) + `${(r.featErr * 100).toFixed(0)}%`.padStart(8) + `€${r.mass}`.padStart(10) + `${(r.massErr * 100).toFixed(0)}%`.padStart(8));
}
console.log('  ' + '─'.repeat(74));
console.log(`  Feature-based:  MAPE ${(mape('featErr') * 100).toFixed(1)}%   hit-rate ${hit('featErr')}/${rows.length}`);
console.log(`  Mass model:     MAPE ${(mape('massErr') * 100).toFixed(1)}%   hit-rate ${hit('massErr')}/${rows.length}`);
console.log('  ' + '─'.repeat(74) + '\n');

fs.writeFileSync(path.join(root, 'benchmark', 'stamping-results.json'), JSON.stringify({ rows, featureMape: mape('featErr'), massMape: mape('massErr'), featureHits: hit('featErr'), massHits: hit('massErr'), total: rows.length }, null, 2));

if (mape('featErr') >= mape('massErr')) {
  console.error(`  ✗ FAIL: feature-based MAPE (${(mape('featErr') * 100).toFixed(1)}%) did not beat mass model (${(mape('massErr') * 100).toFixed(1)}%)`);
  process.exit(1);
}
console.log('  ✓ Feature-based model beats the mass model on this held-out set.\n');
