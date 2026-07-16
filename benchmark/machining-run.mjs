// Feature-based vs mass-based machining — head-to-head MAPE on the held-out
// machined-part fixtures. Proves the feature model closes the gap the mass model
// showed on CNC-at-volume and titanium.
//
//   node benchmark/machining-run.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { featuredMachiningCost } from '../machining-feature-cost.mjs';
import { computeShouldCost } from '../costing-engine.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'benchmark', 'machining-fixtures.json'), 'utf8'));
const fixtures = data.fixtures || data;

function massModelCost(fx) {
  // The current engine's mass path: derive finished mass from part volume × density.
  const density = { 'Aluminium 6061': 2.70, 'Steel (mild)': 7.85, 'Titanium Ti-6Al-4V': 4.43, 'Stainless Steel 304': 8.00 }[fx.material] || 7.85;
  const weightKg = (fx.geometry.partVolumeCm3 * density) / 1000;
  return computeShouldCost({ material: fx.material, process: 'Machining (CNC)', weightKg, annualVolume: fx.annualVolume, region: fx.region }).totalShouldCost;
}

const rows = [];
for (const fx of fixtures) {
  const ref = fx.refPriceEur;
  const feat = featuredMachiningCost({ ...fx, geometry: fx.geometry, stockAllowanceMm: fx.geometry.stockAllowanceMm ?? 3 }).totalShouldCost;
  const mass = massModelCost(fx);
  rows.push({
    id: fx.id, ref,
    feature: Number(feat.toFixed(2)), featErr: (feat - ref) / ref,
    mass: Number(mass.toFixed(2)), massErr: (mass - ref) / ref,
    tol: fx.tol,
  });
}

const mape = (key) => rows.reduce((s, r) => s + Math.abs(r[key]), 0) / rows.length;
const hit = (key) => rows.filter(r => Math.abs(r[key]) <= r.tol).length;

console.log('\n  Machining accuracy — feature-based vs mass model (held-out)\n  ' + '─'.repeat(72));
console.log('  ' + 'fixture'.padEnd(24) + 'ref'.padStart(8) + 'feature'.padStart(11) + 'err'.padStart(8) + 'mass'.padStart(10) + 'err'.padStart(8));
for (const r of rows) {
  const fe = `${(r.featErr * 100).toFixed(0)}%`, me = `${(r.massErr * 100).toFixed(0)}%`;
  console.log('  ' + r.id.padEnd(24) + `€${r.ref}`.padStart(8) + `€${r.feature}`.padStart(11) + fe.padStart(8) + `€${r.mass}`.padStart(10) + me.padStart(8));
}
console.log('  ' + '─'.repeat(72));
console.log(`  Feature-based:  MAPE ${(mape('featErr') * 100).toFixed(1)}%   hit-rate ${hit('featErr')}/${rows.length}`);
console.log(`  Mass model:     MAPE ${(mape('massErr') * 100).toFixed(1)}%   hit-rate ${hit('massErr')}/${rows.length}`);
console.log('  ' + '─'.repeat(72) + '\n');

fs.writeFileSync(path.join(root, 'benchmark', 'machining-results.json'), JSON.stringify({ rows, featureMape: mape('featErr'), massMape: mape('massErr'), featureHits: hit('featErr'), massHits: hit('massErr'), total: rows.length }, null, 2));

// Gate: the feature model must beat the mass model on MAPE (that's the whole point).
if (mape('featErr') >= mape('massErr')) {
  console.error(`  ✗ FAIL: feature-based MAPE (${(mape('featErr') * 100).toFixed(1)}%) did not beat mass model (${(mape('massErr') * 100).toFixed(1)}%)`);
  process.exit(1);
}
console.log(`  ✓ Feature-based model beats the mass model on this held-out set.\n`);
