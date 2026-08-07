#!/usr/bin/env node
// DFM geometry accuracy gate.
//
// Runs the analytic fixtures through the PRODUCTION path — the same
// cad-geometry-bridge.mjs the server uses — and compares against arithmetic
// truth from benchmark/dfm-fixtures.mjs. Fixtures are held out in the sense that
// matters: their answers come from how they were built, not from what the engine
// said last time, so tuning a constant to pass cannot work.
//
//   node benchmark/dfm-run.mjs [--min 1.0] [--json]
//
// Skips cleanly (exit 0) when cadquery-ocp is unavailable, matching how the
// key-dependent evals behave — CI without the Python wheel reports SKIPPED
// rather than a false failure. It never reports a PASS it did not earn.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DFA_FIXTURES, DFM_FIXTURES } from './dfm-fixtures.mjs';
import { extractMeasures, runDfmRules } from '../dfm-rules.mjs';
import { analyzeGeometry } from '../cad-engine/cad-geometry-bridge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXDIR = join(HERE, 'dfm-fixtures');
const argv = process.argv.slice(2);
const MIN = Number(argv[argv.indexOf('--min') + 1]) || 1.0;
const AS_JSON = argv.includes('--json');

function ocpAvailable() {
  try {
    execFileSync('python3', ['-c', 'import OCP'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const checks = [];
const record = (fixture, name, ok, detail) => checks.push({ fixture, name, ok, detail });
const near = (got, want, tolPct) =>
  Number.isFinite(got) && Math.abs(got - want) <= Math.abs(want) * tolPct + 1e-9;

/** Re-run the draft classification along a forced axis via the Python module. */
function draftAlong(file, axis) {
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(join(HERE, '..', 'cad-engine'))})
import dfm_geometry as G
from OCP.STEPControl import STEPControl_Reader
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
r = STEPControl_Reader(); r.ReadFile(${JSON.stringify(join(FIXDIR, file))}); r.TransferRoots()
s = r.OneShape()
t = G.tessellate(s, 0.2)
it = IntCurvesFace_ShapeIntersector(); it.Load(s, 1e-4)
print(json.dumps(G.strip_private(G.classify_draft(t, it, ${JSON.stringify(axis)}))))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf-8', maxBuffer: 32 << 20 });
  return JSON.parse(out.trim().split('\n').pop());
}

async function main() {
  if (!ocpAvailable()) {
    console.log('DFM benchmark SKIPPED — cadquery-ocp not installed (pip install cadquery-ocp).');
    console.log('This is a skip, not a pass: the geometry gate did not run.');
    process.exit(0);
  }

  for (const fx of DFM_FIXTURES) {
    const path = join(FIXDIR, fx.file);
    let g;
    try {
      g = await analyzeGeometry(await readFile(path), fx.file);
    } catch (e) {
      record(fx.file, 'analyze', false, `bridge threw: ${e.message}`);
      continue;
    }
    if (g.status !== 'success') {
      record(fx.file, 'analyze', false, g.error || 'engine error');
      continue;
    }
    const t = fx.truth;
    const wall = g.wallThickness || {};
    const zAxis = draftAlong(fx.file, [0, 0, 1]);

    if (t.volumeMm3 !== undefined) {
      record(fx.file, 'volume', near(g.volume?.mm3, t.volumeMm3, 0.005),
        `${g.volume?.mm3} vs ${t.volumeMm3}`);
    }
    if (t.wallP50Mm !== undefined) {
      record(fx.file, 'wall p50', near(wall.p50Mm, t.wallP50Mm, 0.02),
        `${wall.p50Mm} vs ${t.wallP50Mm} mm`);
    }
    if (t.wallP5Mm !== undefined) {
      record(fx.file, 'wall p5', near(wall.p5Mm, t.wallP5Mm, 0.02),
        `${wall.p5Mm} vs ${t.wallP5Mm} mm`);
    }
    if (t.uniformity !== undefined) {
      record(fx.file, 'uniformity', wall.uniformity === t.uniformity,
        `${wall.uniformity} vs ${t.uniformity}`);
    }
    if (t.setupCount !== undefined) {
      record(fx.file, 'setups', g.setupAnalysis?.estimatedSetupCount === t.setupCount,
        `${g.setupAnalysis?.estimatedSetupCount} vs ${t.setupCount}`);
    }
    if (t.undercutFaceCountAtZ !== undefined) {
      record(fx.file, 'undercuts @+Z', zAxis.undercutFaceCount === t.undercutFaceCountAtZ,
        `${zAxis.undercutFaceCount} vs ${t.undercutFaceCountAtZ}`);
    }
    if (t.zeroDraftFaceCountAtZ !== undefined) {
      record(fx.file, 'zero-draft @+Z', zAxis.zeroDraftFaceCount === t.zeroDraftFaceCountAtZ,
        `${zAxis.zeroDraftFaceCount} vs ${t.zeroDraftFaceCountAtZ}`);
    }
    if (t.minWallDraftDeg !== undefined) {
      record(fx.file, 'min wall draft', near(zAxis.minWallDraftDeg, t.minWallDraftDeg, 0.02),
        `${zAxis.minWallDraftDeg} vs ${t.minWallDraftDeg} deg`);
    }
    if (t.maxWallDraftDeg !== undefined) {
      record(fx.file, 'max wall draft', near(zAxis.maxWallDraftDeg, t.maxWallDraftDeg, 0.02),
        `${zAxis.maxWallDraftDeg} vs ${t.maxWallDraftDeg} deg`);
    }
    if (t.releasingAreaPctMin !== undefined) {
      record(fx.file, 'releasing area', (zAxis.areaPct?.releasing ?? 0) >= t.releasingAreaPctMin,
        `${zAxis.areaPct?.releasing}% >= ${t.releasingAreaPctMin}%`);
    }
    if (t.bestDrawAxis !== undefined) {
      const d = g.dfm?.draft?.drawDirectionXYZ || [];
      const idx = { x: 0, y: 1, z: 2 }[t.bestDrawAxis];
      record(fx.file, 'draw sweep', Math.abs(d[idx] ?? 0) > 0.99,
        `[${d}] should be ${t.bestDrawAxis}`);
      record(fx.file, 'best undercut area',
        (g.dfm?.draft?.areaPct?.undercut ?? 99) <= t.bestUndercutAreaPct + 0.01,
        `${g.dfm?.draft?.areaPct?.undercut}% <= ${t.bestUndercutAreaPct}%`);
    }
    for (const h of t.holes || []) {
      const row = (g.featureTable || []).find(
        r => r.kind === 'hole' && near(r.diaMm, h.diaMm, 0.02)
          && (h.depthMm === undefined || near(r.depthMm, h.depthMm, 0.02)));
      record(fx.file, `hole Ø${h.diaMm}`, !!row && row.through === h.through,
        row ? `through=${row.through} vs ${h.through}` : 'not found');
    }
    if (t.sheetMetal !== undefined) {
      const sm = g.dfm?.sheetMetal || {};
      for (const [k, want] of Object.entries(t.sheetMetal)) {
        record(fx.file, `sheet ${k}`, near(sm[k], want, 0.02), `${sm[k]} vs ${want}`);
      }
    }
    if (t.sheetMetalRulesEvaluated !== undefined) {
      // The point of the wave: this family used to evaluate 0 of 4 on every part.
      const r = runDfmRules(g, 'sheet-metal');
      record(fx.file, 'sheet rules evaluated', r.evaluatedCount === t.sheetMetalRulesEvaluated,
        `${r.evaluatedCount}/${r.ruleCount} evaluated, score ${r.score}`);
    }
    if (t.ribs !== undefined) {
      const got = g.dfm?.features?.ribs || [];
      record(fx.file, 'rib count', got.length === t.ribs.length,
        `${got.length} vs ${t.ribs.length}`);
      t.ribs.forEach((want, i) => {
        const r = got[i] || {};
        const ok = near(r.thicknessMm, want.thicknessMm, 0.02)
          && near(r.heightMm, want.heightMm, 0.02)
          && (want.lengthMm === undefined || near(r.lengthMm, want.lengthMm, 0.02));
        record(fx.file, `rib ${i} t x h`, ok,
          `${r.thicknessMm} x ${r.heightMm} (len ${r.lengthMm}) vs ${want.thicknessMm} x ${want.heightMm}`);
      });
    }
    if (t.ribMeasures !== undefined) {
      const m = extractMeasures(g);
      for (const [k, want] of Object.entries(t.ribMeasures)) {
        record(fx.file, `measure ${k}`, near(m[k], want, 0.02), `${m[k]} vs ${want}`);
      }
    }
    if (t.ruleOutcomes !== undefined) {
      // Not just "the rule ran" — the exact verdict, so a threshold edited to
      // make findings disappear fails the gate.
      for (const [family, wanted] of Object.entries(t.ruleOutcomes)) {
        const r = runDfmRules(g, family);
        const byId = Object.fromEntries(
          [...r.findings, ...r.passed, ...r.notEvaluated].map(x => [x.id, x.status]));
        for (const [id, want] of Object.entries(wanted)) {
          record(fx.file, `rule ${id}`, byId[id] === want, `${byId[id] ?? 'absent'} vs ${want}`);
        }
      }
    }
    if (t.bosses !== undefined) {
      const n = (g.featureTable || []).filter(r => r.kind === 'boss')
        .reduce((s, r) => s + (r.count || 0), 0);
      record(fx.file, 'bosses', n === t.bosses, `${n} vs ${t.bosses}`);
    }

    // ── Feature recognition ──────────────────────────────────────────────────
    const fr = g.dfm?.features;
    if (t.featureCounts !== undefined) {
      // `featureCountsIgnoring` drops kinds whose exact COUNT is a meshing
      // artefact rather than a design fact — a fillet-every-edge part yields a
      // number of blend faces that depends on how OCCT split them, so asserting
      // "38 fillets" would be asserting a tessellation detail. The kinds that
      // carry engineering meaning (pocket, slot, chamfer) are still exact.
      const ignore = new Set(t.featureCountsIgnoring || []);
      const got = Object.fromEntries(
        Object.entries(fr?.counts ?? {}).filter(([k]) => !ignore.has(k)));
      const want = t.featureCounts;
      // Exact match both ways: a recogniser that invents an extra feature is as
      // wrong as one that misses a real one.
      const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
      const bad = [...keys].filter(k => (got[k] ?? 0) !== (want[k] ?? 0));
      record(fx.file, 'feature counts', bad.length === 0,
        `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    }
    if (t.unclassifiedAreaPctMin !== undefined) {
      record(fx.file, 'unclassified area', (fr?.unclassifiedAreaPct ?? -1) >= t.unclassifiedAreaPctMin,
        `${fr?.unclassifiedAreaPct}% >= ${t.unclassifiedAreaPctMin}% (must admit what it cannot name)`);
    }
    if (t.compoundHole !== undefined) {
      const c = (fr?.compoundHoles || [])[0];
      const w = t.compoundHole;
      const ok = !!c && c.kind === w.kind
        && near(c.boreDiaMm, w.boreDiaMm, 0.02)
        && near(c.featureDiaMm, w.featureDiaMm, 0.02)
        && (w.featureDepthMm === undefined || near(c.featureDepthMm, w.featureDepthMm, 0.02))
        && (w.includedAngleDeg === undefined || near(c.includedAngleDeg, w.includedAngleDeg, 0.02))
        && (w.through === undefined || c.through === w.through);
      record(fx.file, 'compound hole', ok,
        c ? `${c.kind} Ø${c.boreDiaMm}→Ø${c.featureDiaMm} d${c.featureDepthMm} ang${c.includedAngleDeg} through=${c.through}`
          : 'none found');
    }
  }

  // ── Assembly decomposition / DFA ───────────────────────────────────────────
  for (const fx of DFA_FIXTURES) {
    let d;
    try {
      d = JSON.parse(execFileSync('python3',
        [join(HERE, '..', 'cad-engine', 'assembly_decompose.py'), join(FIXDIR, fx.file)],
        { encoding: 'utf-8', maxBuffer: 64 << 20 }).trim().split('\n').pop());
    } catch (e) {
      record(fx.file, 'decompose', false, `threw: ${e.message}`);
      continue;
    }
    const t = fx.truth;
    record(fx.file, 'solid count', d.solidCount === t.solidCount, `${d.solidCount} vs ${t.solidCount}`);
    record(fx.file, 'distinct types', d.distinctPartTypes === t.distinctPartTypes,
      `${d.distinctPartTypes} vs ${t.distinctPartTypes}`);
    const biggest = Math.max(0, ...(d.instanceGroups || []).map(g => g.count));
    record(fx.file, 'instance grouping', biggest === t.largestInstanceGroup,
      `largest group ${biggest} vs ${t.largestInstanceGroup} (identical parts must share a signature)`);
    if (t.symmetry) {
      for (const [idx, want] of Object.entries(t.symmetry)) {
        const got = d.parts?.[Number(idx)]?.symmetry || {};
        const ok = got.continuous === want.continuous
          && (want.totalDeg === undefined || Math.abs((got.totalDeg ?? -1) - want.totalDeg) < 0.5);
        record(fx.file, `symmetry part ${idx}`, ok,
          `α+β=${got.totalDeg} continuous=${got.continuous} vs α+β=${want.totalDeg} continuous=${want.continuous}`);
      }
    }
    if (t.contacts !== undefined) {
      record(fx.file, 'contacts', (d.contacts || []).length === t.contacts,
        `${(d.contacts || []).length} vs ${t.contacts}`);
    }
  }

  const pass = checks.filter(c => c.ok).length;
  const score = checks.length ? pass / checks.length : 0;

  if (AS_JSON) {
    console.log(JSON.stringify({ score, pass, total: checks.length, checks }, null, 2));
  } else {
    let last = '';
    for (const c of checks) {
      if (c.fixture !== last) { console.log(`\n  ${c.fixture}`); last = c.fixture; }
      console.log(`    ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(20)} ${c.detail}`);
    }
    console.log('\n  ──────────────────────────────────────────────────────────');
    console.log(`  DFM geometry accuracy: ${(score * 100).toFixed(1)}%  (${pass}/${checks.length})`);
  }
  if (score < MIN) {
    console.error(`\nFAILED: ${(score * 100).toFixed(1)}% < required ${(MIN * 100).toFixed(1)}%`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
