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
  const add = (cat, ok, detail) => checks.push({ cat, ok, detail });

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
  return { name, checks };
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
  let pass = 0, total = 0;
  console.log('\n  CAD PIPELINE ACCURACY BENCHMARK\n  ' + '─'.repeat(60));
  for (const r of results) {
    if (r.skipped) { console.log(`  ⊘ ${r.name} (skipped — fixture file missing)`); continue; }
    const p = r.checks.filter(c => c.ok).length, t = r.checks.length;
    console.log(`\n  ${p === t ? '✓' : '✗'} ${r.name}  (${p}/${t})`);
    for (const c of r.checks) {
      (byCat[c.cat] ??= { pass: 0, total: 0 }); byCat[c.cat].total++; if (c.ok) byCat[c.cat].pass++;
      pass += c.ok ? 1 : 0; total++;
      console.log(`      ${c.ok ? '✓' : '✗'} ${c.cat.padEnd(10)} ${c.detail}`);
    }
  }
  const overall = total ? pass / total : 0;
  console.log('\n  ' + '─'.repeat(60) + '\n  PER-CATEGORY ACCURACY');
  const catReport = {};
  for (const [cat, v] of Object.entries(byCat)) {
    const acc = v.pass / v.total;
    catReport[cat] = { accuracy: +(acc * 100).toFixed(1), pass: v.pass, total: v.total };
    console.log(`      ${cat.padEnd(10)} ${(acc * 100).toFixed(1)}%  (${v.pass}/${v.total})`);
  }
  console.log('  ' + '─'.repeat(60));
  console.log(`  OVERALL: ${(overall * 100).toFixed(1)}%  (${pass}/${total} checks)\n`);

  writeFileSync(join(root, 'benchmark', 'results.json'),
    JSON.stringify({ overall: +(overall * 100).toFixed(1), categories: catReport, checks: pass, total, fixtures: results.length }, null, 2));

  const minArg = process.argv.indexOf('--min');
  if (minArg !== -1) {
    const min = parseFloat(process.argv[minArg + 1]);
    if (overall < min) { console.error(`  ✗ FAIL: overall ${(overall * 100).toFixed(1)}% < required ${(min * 100).toFixed(0)}%\n`); process.exit(1); }
  }
  return overall;
}

// Compute overall accuracy without printing (used by the regression test).
export async function computeOverall() {
  const results = [];
  for (const fx of SYNTHETIC_FIXTURES) results.push(scoreFixture(fx.name, [fx.mesh()], fx.truth));
  for (const fx of STEP_FIXTURES) {
    const meshes = await loadStepMeshes(fx.file);
    if (meshes) results.push(scoreFixture(fx.name, meshes, fx.truth));
  }
  let pass = 0, total = 0;
  for (const r of results) for (const c of r.checks) { total++; if (c.ok) pass++; }
  return { overall: total ? pass / total : 0, pass, total };
}

// Only run the report when executed directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
