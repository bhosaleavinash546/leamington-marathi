// ─────────────────────────────────────────────────────────────────────────────
// CAD pipeline accuracy benchmark.
//
//   node benchmark/run.mjs            → prints a scored report, writes results.json
//   node benchmark/run.mjs --min 0.9  → exits 1 if overall accuracy < 0.9 (for CI)
//
// Runs each known-truth fixture through the PRODUCTION pipeline (aggregateOcctMeshes
// / analyzeBrep / analyzeFeatures) and scores the output against ground truth, so
// "accuracy" becomes a measured number, not an opinion.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYNTHETIC_FIXTURES, STEP_FIXTURES } from './fixtures.mjs';
import { aggregateOcctMeshes, analyzeBrep } from '../src/services/cad-brep.mjs';
import { analyzeFeatures } from '../src/services/cad-features.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOL_TOL = 0.03;   // 3% — allows mesh tessellation error on curved parts
const BBOX_TOL = 0.015; // 1.5% per dimension

export function scoreFixture(name, meshes, truth) {
  const agg = aggregateOcctMeshes(meshes);
  const brep = analyzeBrep(meshes);
  const feat = agg ? analyzeFeatures(agg) : { processes: [], dfma: [] };
  const checks = [];
  const add = (cat, ok, detail, tier = 'core') => checks.push({ cat, ok, detail, tier });

  if (truth.volumeCm3 != null && agg) {
    const err = Math.abs(agg.volumeCm3 - truth.volumeCm3) / truth.volumeCm3;
    add('volume', err <= VOL_TOL, `${agg.volumeCm3.toFixed(2)} vs ${truth.volumeCm3} (${(err * 100).toFixed(1)}%)`);
  }
  if (truth.bbox && agg) {
    const ok = ['x', 'y', 'z'].every(k => Math.abs(agg.bbox[k] - truth.bbox[k]) / truth.bbox[k] <= BBOX_TOL);
    add('bbox', ok, `${agg.bbox.x}×${agg.bbox.y}×${agg.bbox.z}`);
  }
  if (truth.faces != null) add('faceCount', brep.totalFaces === truth.faces, `${brep.totalFaces} vs ${truth.faces}`);
  if (truth.holes != null) add('holeCount', brep.holes === truth.holes, `${brep.holes} vs ${truth.holes}`);
  if (truth.process) {
    const top = feat.processes[0]?.process || '';
    add('process', truth.process.includes(top), top);
  }
  if (truth.dfma && truth.dfma.length) {
    const ids = new Set(feat.dfma.map(f => f.id));
    add('dfma', truth.dfma.every(id => ids.has(id)), [...ids].join(','));
  }
  // SEMANTIC tier — features the geometric pipeline cannot yet produce (blind-vs-
  // through holes, threads, pockets, slots, draft, GD&T). These are EXPECTED to
  // fail today; they measure the gap to best-in-class and are NOT gated.
  if (truth.semantic) {
    for (const [key, want] of Object.entries(truth.semantic)) {
      const got = brep[key];
      add(key, got === want, got === undefined ? 'not detected' : `${got} vs ${want}`, 'semantic');
    }
  }
  return { name, checks };
}

function tally(results, tier) {
  let pass = 0, total = 0;
  for (const r of results) for (const c of r.checks) if (c.tier === tier) { total++; if (c.ok) pass++; }
  return { pass, total };
}

export async function loadStepMeshes(file) {
  if (!existsSync(join(root, file))) return null;
  const mod = await import('occt-import-js').catch(() => null);
  if (!mod) return null;
  const occt = await mod.default();
  const r = occt.ReadStepFile(new Uint8Array(readFileSync(join(root, file))), null);
  return r?.success ? r.meshes : null;
}

async function main() {
  const results = [];
  for (const fx of SYNTHETIC_FIXTURES) results.push(scoreFixture(fx.name, [fx.mesh()], fx.truth));
  for (const fx of STEP_FIXTURES) {
    const meshes = await loadStepMeshes(fx.file);
    if (!meshes) { results.push({ name: fx.name, checks: [], skipped: true }); continue; }
    results.push(scoreFixture(fx.name, meshes, fx.truth));
  }

  // Aggregate
  const byCat = {};
  console.log('\n  CAD PIPELINE ACCURACY BENCHMARK\n  ' + '─'.repeat(62));
  for (const r of results) {
    if (r.skipped) { console.log(`  ⊘ ${r.name} (skipped — fixture file missing)`); continue; }
    const p = r.checks.filter(c => c.ok).length, t = r.checks.length;
    console.log(`\n  ${p === t ? '✓' : '◐'} ${r.name}  (${p}/${t})`);
    for (const c of r.checks) {
      const key = `${c.tier}:${c.cat}`;
      (byCat[key] ??= { tier: c.tier, cat: c.cat, pass: 0, total: 0 }); byCat[key].total++; if (c.ok) byCat[key].pass++;
      const mark = c.ok ? '✓' : (c.tier === 'semantic' ? '·' : '✗');
      console.log(`      ${mark} ${(c.tier === 'semantic' ? '[sem] ' : '').padEnd(6)}${c.cat.padEnd(12)} ${c.detail}`);
    }
  }
  const core = tally(results, 'core');
  const sem = tally(results, 'semantic');
  const coreAcc = core.total ? core.pass / core.total : 0;
  const semAcc = sem.total ? sem.pass / sem.total : 0;

  const line = (label, v) => console.log(`      ${label.padEnd(26)} ${(100 * v.pass / Math.max(1, v.total)).toFixed(1)}%  (${v.pass}/${v.total})`);
  console.log('\n  ' + '─'.repeat(62) + '\n  PER-CATEGORY');
  const catReport = {};
  for (const v of Object.values(byCat)) {
    catReport[`${v.tier}.${v.cat}`] = { accuracy: +(100 * v.pass / v.total).toFixed(1), pass: v.pass, total: v.total };
    line(`${v.tier === 'semantic' ? '[sem] ' : ''}${v.cat}`, v);
  }
  console.log('  ' + '─'.repeat(62));
  console.log(`  CORE geometry accuracy (gated):     ${(coreAcc * 100).toFixed(1)}%  (${core.pass}/${core.total})`);
  console.log(`  SEMANTIC features (gap to close):   ${(semAcc * 100).toFixed(1)}%  (${sem.pass}/${sem.total})  ← roadmap target\n`);

  writeFileSync(join(root, 'benchmark', 'results.json'), JSON.stringify({
    core: { accuracy: +(coreAcc * 100).toFixed(1), pass: core.pass, total: core.total },
    semantic: { accuracy: +(semAcc * 100).toFixed(1), pass: sem.pass, total: sem.total },
    categories: catReport, fixtures: results.length,
  }, null, 2));

  const minArg = process.argv.indexOf('--min');
  if (minArg !== -1) {
    const min = parseFloat(process.argv[minArg + 1]);
    if (coreAcc < min) { console.error(`  ✗ FAIL: core ${(coreAcc * 100).toFixed(1)}% < required ${(min * 100).toFixed(0)}%\n`); process.exit(1); }
  }
  return coreAcc;
}

// Compute overall accuracy without printing (used by the regression test).
export async function computeOverall() {
  const results = [];
  for (const fx of SYNTHETIC_FIXTURES) results.push(scoreFixture(fx.name, [fx.mesh()], fx.truth));
  for (const fx of STEP_FIXTURES) {
    const meshes = await loadStepMeshes(fx.file);
    if (meshes) results.push(scoreFixture(fx.name, meshes, fx.truth));
  }
  // Gate/regression is on the CORE tier only (semantic is the aspirational target).
  let pass = 0, total = 0;
  for (const r of results) for (const c of r.checks) if (c.tier === 'core') { total++; if (c.ok) pass++; }
  return { overall: total ? pass / total : 0, pass, total };
}

// Only run the report when executed directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
