// PCBA engine v2 (per-class volume curves + regions) vs the v1 flat-tier model —
// head-to-head error on held-out fixtures with engineering-estimate anchors.
//
//   node benchmark/pcb-run.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { costBom } from '../pcb-cost.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'benchmark', 'pcb-fixtures.json'), 'utf8'));

// ── Compact replica of the RETIRED v1 model (flat 6-step tiers, one blended
// region, 0.22 overhead on all COGS) — constants verbatim from the old file,
// so the comparison is against real prior behaviour, not a strawman.
const V1_UNITS = { resistor: 0.004, capacitor_mlcc: 0.010, capacitor_elec: 0.09, capacitor_tant: 0.14, inductor: 0.06, ferrite_bead: 0.02, diode: 0.04, led: 0.06, transistor: 0.06, mosfet: 0.18, ic_logic: 0.25, ic_analog: 0.55, ic_power: 0.80, mcu: 2.50, soc: 15.0, memory: 1.20, connector: 0.55, header: 0.15, crystal: 0.25, oscillator: 0.55, switch: 0.22, relay: 0.65, transformer: 1.10, fuse: 0.10, module: 3.50, test_point: 0.01, other: 0.20 };
const V1_TH = new Set(['connector', 'header', 'relay', 'transformer', 'test_point']);
const V1_ACTIVE = new Set(['ic_logic', 'ic_analog', 'ic_power', 'mcu', 'soc', 'memory', 'module']);
const V1_PINS = { mcu: 48, soc: 256, memory: 48, ic_logic: 14, connector: 8, module: 20 };
function v1Cost(fx) {
  const G = 0.85, v = fx.opts.volume;
  const tier = v <= 10 ? { mat: 2.2, conv: 1.8, fab: 2.0 } : v <= 100 ? { mat: 1.4, conv: 1.3, fab: 1.35 }
    : v <= 1000 ? { mat: 1, conv: 1, fab: 1 } : v <= 10000 ? { mat: 0.78, conv: 0.82, fab: 0.75 }
    : v <= 100000 ? { mat: 0.62, conv: 0.6, fab: 0.55 } : { mat: 0.52, conv: 0.5, fab: 0.45 };
  const layerRate = ({ 1: 0.016, 2: 0.024, 4: 0.060, 6: 0.105, 8: 0.170, 10: 0.24 })[fx.board.layers] * G;
  const finishMult = ({ hasl: 1, leadfree_hasl: 1.05, enig: 1.25, osp: 0.98, immersion_silver: 1.15 })[fx.board.finish] || 1;
  const y = 1 / 0.985;
  let comp = 0, placements = 0, bga = 0, th = 0, active = 0, uniq = new Set();
  for (const c of fx.components) {
    const qty = c.qty || 1, unit = (V1_UNITS[c.type] ?? 0.2) * G;
    comp += unit * tier.mat * qty;
    uniq.add(c.type + '|' + (c.package || ''));
    const pins = c.pins || V1_PINS[c.type] || 4;
    const isTh = c.mount === 'TH' || (V1_TH.has(c.type) && c.mount !== 'SMT');
    if (V1_ACTIVE.has(c.type)) active += qty;
    if (isTh) th += pins * qty; else { placements += qty; if (pins >= 48) bga += qty; }
  }
  comp *= 1.02 * y;
  const area = (fx.board.widthMm * fx.board.heightMm) / 100;
  const fab = (area * layerRate * tier.fab * finishMult + (220 * G) / v) * y;
  const assy = (placements * 0.02 * G * tier.conv + bga * 0.15 * G + th * 0.035 * G * tier.conv
    + 0.08 * G + (bga > 0 ? 0.2 * G : 0) + (active > 0 ? 0.3 * G + 0.08 * G * active : 0)
    + (180 * G + uniq.size * 1.6 * G) / v) * y;
  const logistics = (comp + fab) * 0.06;
  const cogs = comp + fab + assy + logistics;
  return cogs * 1.22;
}

const rows = [];
for (const fx of data.fixtures) {
  const ref = fx.refPriceGbp;
  const v2 = costBom({ board: fx.board, components: fx.components }, fx.opts).total;
  const v1 = v1Cost(fx);
  rows.push({ id: fx.id, ref, v2: +v2.toFixed(2), v2Err: (v2 - ref) / ref, v1: +v1.toFixed(2), v1Err: (v1 - ref) / ref, tol: fx.tol });
}

const mape = (k) => rows.reduce((s, r) => s + Math.abs(r[k]), 0) / rows.length;
const hit = (k) => rows.filter(r => Math.abs(r[k]) <= r.tol).length;

console.log('\n  PCBA accuracy — engine v2 (curves+regions) vs v1 (flat tiers)\n  ' + '─'.repeat(76));
console.log('  ' + 'fixture'.padEnd(26) + 'ref'.padStart(8) + 'v2'.padStart(9) + 'err'.padStart(8) + 'v1'.padStart(9) + 'err'.padStart(8));
for (const r of rows) {
  console.log('  ' + r.id.padEnd(26) + `£${r.ref}`.padStart(8) + `£${r.v2}`.padStart(9) + `${(r.v2Err * 100).toFixed(0)}%`.padStart(8) + `£${r.v1}`.padStart(9) + `${(r.v1Err * 100).toFixed(0)}%`.padStart(8));
}
console.log('  ' + '─'.repeat(76));
console.log(`  Engine v2:  MAPE ${(mape('v2Err') * 100).toFixed(1)}%   hit-rate ${hit('v2Err')}/${rows.length}`);
console.log(`  Engine v1:  MAPE ${(mape('v1Err') * 100).toFixed(1)}%   hit-rate ${hit('v1Err')}/${rows.length}`);
console.log('  ' + '─'.repeat(76) + '\n');

fs.writeFileSync(path.join(root, 'benchmark', 'pcb-results.json'), JSON.stringify({ rows, v2Mape: mape('v2Err'), v1Mape: mape('v1Err'), v2Hits: hit('v2Err'), v1Hits: hit('v1Err'), total: rows.length }, null, 2));

if (mape('v2Err') >= mape('v1Err')) {
  console.error(`  ✗ FAIL: v2 MAPE (${(mape('v2Err') * 100).toFixed(1)}%) did not beat v1 (${(mape('v1Err') * 100).toFixed(1)}%)`);
  process.exit(1);
}
console.log('  ✓ Engine v2 beats v1 on this held-out set.\n');
