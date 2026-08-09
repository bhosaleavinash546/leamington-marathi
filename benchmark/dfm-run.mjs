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

import { ADDITIVE_FIXTURES, CASTING_FIXTURES, DEGENERATE_FIXTURES, DFA_FIXTURES, DFM_FIXTURES, MACHINING_FIXTURES, PMI_FIXTURES, SHEET_FORMING_FIXTURES } from './dfm-fixtures.mjs';
import { extractMeasures, runDfmRules } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';
import { analyseDfa } from '../dfa-engine.mjs';
import { analyzeGeometry, tessellateToSTL } from '../cad-engine/cad-geometry-bridge.mjs';

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

/**
 * The tessellation metadata the VIEWER receives — the other half of every
 * face-id claim. Run through the production bridge so the gate checks what the
 * browser actually gets, not a re-derivation of it.
 */
const tessCache = new Map();
async function tessMeta(file) {
  if (tessCache.has(file)) return tessCache.get(file);
  let meta = null;
  try {
    const r = await tessellateToSTL(await readFile(join(FIXDIR, file)), file, { withMeta: true });
    meta = r?.status === 'success' ? r.meta : null;
  } catch {
    meta = null;
  }
  tessCache.set(file, meta);
  return meta;
}

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
    if (t.undercutRegionAtZ !== undefined) {
      const reg = (zAxis.undercutRegions || [])[0];
      const w = t.undercutRegionAtZ;
      const ok = !!reg && w.centroidXYZ.every((v, i) => Math.abs((reg.centroidXYZ?.[i] ?? 1e9) - v) <= 0.5)
        && (w.draftDeg === undefined || Math.abs((reg.draftDeg ?? 1e9) - w.draftDeg) <= 0.5);
      record(fx.file, 'undercut anchor', ok,
        reg ? `centroid [${reg.centroidXYZ}] draft ${reg.draftDeg} vs [${w.centroidXYZ}] ${w.draftDeg}`
          : 'no located region emitted');
    }

    // ── Face-id resolution ───────────────────────────────────────────────────
    // Does the id an analysis reports land on the RIGHT SURFACE in the viewer's
    // own metadata? This is the only check that can catch an off-by-one, and an
    // off-by-one is exactly what shipped: the undercut on box-side-hole is the
    // cylindrical bore, the analysis said face 6, and the viewer painted its
    // face 6 — a PLANE. Every count in this gate was green throughout.
    if (t.faceIdResolves !== undefined) {
      const meta = await tessMeta(fx.file);
      if (!meta) {
        record(fx.file, 'face id resolves', false, 'tessellation metadata unavailable');
      } else {
        const byId = new Map((meta.faces || []).map(f => [f.id, f]));
        record(fx.file, 'face id base', meta.faceIdBase === 1,
          `faceIdBase=${meta.faceIdBase} order=${meta.faceIdOrder}`);
        for (const [what, wantType] of Object.entries(t.faceIdResolves)) {
          const ids = what === 'undercutAtZ' ? (zAxis.undercutFaceIds || [])
            : what === 'featureTableCylinders'
              ? (g.featureTable || []).flatMap(r => (r.kind === 'hole' || r.kind === 'boss') && r.faceIds ? r.faceIds : [])
              : [];
          if (!ids.length && what === 'featureTableCylinders') continue;  // no ids exported yet
          const types = ids.map(i => byId.get(i)?.type ?? 'MISSING');
          record(fx.file, `face id -> ${what}`,
            types.length > 0 && types.every(ty => ty === wantType),
            `ids [${ids}] resolve to [${types}], expected all ${wantType}`);
        }
      }
    }
    if (t.notSheetMetal) {
      const sm = g.dfm?.sheetMetal || {};
      record(fx.file, 'not sheet metal', sm.isSheetMetal === false,
        sm.isSheetMetal
          ? `WRONGLY classified as ${sm.thicknessMm} mm sheet with ${sm.bendCount} bends`
          : 'rejected, with a reason');
      // The sheet-metal family must then evaluate NOTHING rather than judging a
      // casting against bend-radius guidelines.
      const r = runDfmRules(g, 'sheet-metal');
      record(fx.file, 'sheet rules abstain', r.evaluatedCount === 0 && r.score === null,
        `${r.evaluatedCount}/${r.ruleCount} evaluated, score ${r.score}`);
    }
    if (t.viewerMesh) {
      // Counted from the VIEWER's own tessellation — the STL the browser is
      // actually sent — not from the analysis mesh, which is a different and
      // coarser one. A bore's segment count is the number of distinct triangle
      // normals around its axis.
      const meta = await tessMeta(fx.file);
      // Counted from `triFace` — the per-triangle face id array the browser is
      // sent — because the face records carry no triangle count of their own.
      const perFace = new Map();
      for (const id of meta.triFace ?? []) perFace.set(Number(id), (perFace.get(Number(id)) ?? 0) + 1);
      const bores = (meta.faces ?? []).filter(f => f.type === 'cylinder');
      const segs = bores.length ? Math.max(...bores.map(f => perFace.get(f.id) ?? 0)) : 0;
      // A through bore's wall is a tube of quads, each split into two triangles.
      const perCircle = Math.floor(segs / 2);
      record(fx.file, 'viewer mesh smoothness', perCircle >= t.viewerMesh.minSegmentsPerCircle,
        `~${perCircle} segments/circle vs >= ${t.viewerMesh.minSegmentsPerCircle} (a bore below this reads as a polygon)`);
    }
    if (t.apertures) {
      const a = g.dfm?.apertures || {};
      for (const [k, want] of Object.entries(t.apertures)) {
        record(fx.file, `aperture ${k}`, near(a[k], want, 0.01), `${a[k]} vs ${want}`);
      }
    }
    if (t.toolAccess !== undefined) {
      const ta = g.dfm?.toolAccess || {};
      for (const [k, want] of Object.entries(t.toolAccess)) {
        record(fx.file, `tool access ${k}`, near(ta[k], want, 0.001), `${ta[k]} vs ${want}`);
      }
    }
    if (t.toolAccessUnreachablePctMin !== undefined) {
      const got = g.dfm?.toolAccess?.unreachableAreaPct;
      record(fx.file, 'tool access unreachable',
        Number.isFinite(got) && got >= t.toolAccessUnreachablePctMin,
        `${got}% >= ${t.toolAccessUnreachablePctMin}% (a pocket narrower than the cutter must show)`);
    }
    if (t.sheetMetalRulesAbstaining) {
      // A rule with nothing to measure must be NOT EVALUATED, never a fail.
      const r = runDfmRules(g, 'sheet-metal');
      const abstaining = new Set(r.notEvaluated.map(f => f.id));
      for (const id of t.sheetMetalRulesAbstaining) {
        record(fx.file, `abstains: ${id}`, abstaining.has(id),
          abstaining.has(id) ? 'not evaluated, with a reason'
            : `WRONGLY ${[...r.findings, ...r.passed].find(f => f.id === id)?.status} at measured `
              + `${[...r.findings, ...r.passed].find(f => f.id === id)?.measured}`);
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
        if (want.centroidXY) {
          const c = r.centroidXYZ || [];
          const anchored = want.centroidXY.every((v, k) => Math.abs((c[k] ?? 1e9) - v) <= 0.5);
          record(fx.file, `rib ${i} anchor`, anchored,
            `[${c[0]}, ${c[1]}] vs [${want.centroidXY}]`);
        }
      });
    }
    // Measures the rules are written against, checked directly. A rule can only
    // be as right as the number it compares, and these are arithmetic from the
    // construction like everything else here.
    for (const group of [t.ribMeasures, t.measures]) {
      if (group === undefined) continue;
      const m = extractMeasures(g);
      for (const [k, want] of Object.entries(group)) {
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

  // ── Degenerate inputs ──────────────────────────────────────────────────────
  // These assert HONEST DEGRADATION, not accuracy. Nothing here has a
  // measurement to be right about; what is checked is that a bad file produces a
  // clean typed outcome instead of a stack-trace fragment, kernel internals, or
  // a confident number computed at a scale nobody validated.
  for (const fx of DEGENERATE_FIXTURES) {
    const path = join(FIXDIR, fx.file);
    let g;
    try {
      g = await analyzeGeometry(await readFile(path), fx.file);
    } catch (e) {
      // A THROWN error is itself a failure: the bridge's contract is a typed
      // result object, and an exception here reaches the route as a 500.
      record(fx.file, 'no throw', false, `bridge threw: ${e.message}`);
      continue;
    }
    record(fx.file, 'typed result', g && typeof g.status === 'string',
      `status=${g?.status}`);

    const blob = JSON.stringify(g);
    for (const needle of fx.mustNotContain || []) {
      record(fx.file, `no "${needle}"`, !blob.includes(needle),
        blob.includes(needle) ? `leaked: ${blob.slice(Math.max(0, blob.indexOf(needle) - 40), blob.indexOf(needle) + 60)}` : 'clean');
    }
    if (fx.errorExpected) {
      record(fx.file, 'clean error', g.status === 'error' && typeof g.error === 'string' && g.error.length > 15,
        g.error ? `"${g.error.slice(0, 90)}"` : `status=${g.status}, no message`);
    }
    if (fx.noWallThickness) {
      // `wall_thickness` must return None, not a partial dict. The regression it
      // guards produced a TRUTHY object that passed every `if wall_stats:` guard
      // and then raised KeyError on the next line.
      const w = g.dfm?.wallThickness;
      record(fx.file, 'no wall published', !w || w.p50Mm === undefined,
        w ? `published ${JSON.stringify(w).slice(0, 70)}` : 'none, as required');
    }
    if (fx.unitWarning) {
      record(fx.file, 'unit warning', typeof g.unitWarning === 'string' && g.unitWarning.length > 10,
        g.unitWarning ? `"${g.unitWarning.slice(0, 70)}"` : 'ABSENT — the report would show sub-mm findings silently');
    }
    if (fx.suppressedEvaluatedCount !== undefined) {
      // The route's suppression path, exercised directly: a unit error must
      // withhold every dimensional rule rather than evaluate it at the wrong
      // scale. Rebuilt here rather than imported so the gate tests the BEHAVIOUR
      // and not a shared helper's return value.
      const raw = runDfmRules(g, 'hpdc');
      const unitsSuspect = typeof g.unitWarning === 'string' && g.unitWarning.length > 0;
      const evaluated = unitsSuspect ? 0 : raw.evaluatedCount;
      record(fx.file, 'findings withheld', evaluated === fx.suppressedEvaluatedCount,
        `${evaluated} evaluated (raw engine would have evaluated ${raw.evaluatedCount}, `
        + `finding ${raw.findings.length} at a scale nobody checked)`);
    }
  }

  // ── Semantic PMI (AP242) ──────────────────────────────────────────────────
  // Tolerances are not in the shape, so nothing else in this gate can catch a
  // PMI reader that silently returns nothing on every file.
  for (const fx of PMI_FIXTURES) {
    // `--json` must emit JSON and nothing else: the geometry test parses this
    // process's whole stdout, so one stray header line fails the suite with a
    // parse error rather than a useful message.
    if (!AS_JSON) console.log(`\n  ${fx.file}  (PMI)`);
    let g;
    try {
      g = await analyzeGeometry(await readFile(join(FIXDIR, fx.file)), fx.file);
    } catch (e) {
      record(fx.file, 'analyze for PMI', false, `bridge threw: ${e.message}`);
      continue;
    }
    const pmi = g.dfm?.pmi || {};
    const t = fx.truth;
    record(fx.file, 'pmi present', pmi.present === t.present, `${pmi.present} vs ${t.present}`);
    if (t.tightestToleranceMm !== undefined) {
      record(fx.file, 'tightest tolerance', near(pmi.tightestToleranceMm, t.tightestToleranceMm, 0.001),
        `${pmi.tightestToleranceMm} vs ${t.tightestToleranceMm} mm`);
    }
    if (t.dimensionCount !== undefined) {
      record(fx.file, 'dimension count', pmi.dimensionCount === t.dimensionCount,
        `${pmi.dimensionCount} vs ${t.dimensionCount}`);
    }
    if (t.geometricToleranceCount !== undefined) {
      record(fx.file, 'geom tolerance count', pmi.geometricToleranceCount === t.geometricToleranceCount,
        `${pmi.geometricToleranceCount} vs ${t.geometricToleranceCount}`);
    }
    if (t.geomToleranceTypeName !== undefined) {
      const got = pmi.geometricTolerances?.[0];
      record(fx.file, 'geom tolerance type', got?.typeName === t.geomToleranceTypeName,
        `${got?.typeName} vs ${t.geomToleranceTypeName} (a guessed enum map read flatness as symmetry)`);
      record(fx.file, 'geom tolerance value', near(got?.valueMm, t.geomToleranceValueMm, 0.001),
        `${got?.valueMm} vs ${t.geomToleranceValueMm} mm`);
    }
    if (t.reasonMatches) {
      record(fx.file, 'absence explains itself', String(pmi.reason || '').includes(t.reasonMatches),
        pmi.reason ? 'reason given' : 'NO REASON — reads as "no tolerance problems"');
    }
    for (const fam of t.toleranceRulesAbstain || []) {
      const r = runDfmRules(g, fam);
      const row = [...r.findings, ...r.passed, ...r.notEvaluated]
        .find(f => f.measure === 'tightestToleranceMm');
      record(fx.file, `${fam} tolerance rule abstains`, row?.status === 'not-evaluated',
        row ? `${row.status} at ${row.measured}` : 'rule missing entirely');
    }
  }


  // ── Casting: as-cast feature size and body-of-revolution ──────────────────
  // The three measures the casting tranche added, against analytic truth. The
  // blind/through split is the one that matters most: the combined figure and
  // the blind figure differ by a factor of two on the same part, and every
  // casting family judged both by the combined number until now.
  for (const fx of CASTING_FIXTURES) {
    if (!AS_JSON) console.log(`\n  ${fx.file}  (casting)`);
    let g;
    try {
      g = await analyzeGeometry(await readFile(join(FIXDIR, fx.file)), fx.file);
    } catch (e) {
      record(fx.file, 'analyze for casting', false, `bridge threw: ${e.message}`);
      continue;
    }
    const t = fx.truth;
    const m = extractMeasures(g);

    if (t.axisymmetricAreaPct !== undefined) {
      const rev = g.dfm?.revolution || {};
      record(fx.file, 'axisymmetric area', near(rev.axisymmetricAreaPct, t.axisymmetricAreaPct, 0.5),
        `${rev.axisymmetricAreaPct}% vs ${t.axisymmetricAreaPct}% by construction`);
      if (t.axisXYZ) {
        const got = rev.axisXYZ || [];
        const dot = Math.abs(got.reduce((a, v, i) => a + v * t.axisXYZ[i], 0));
        record(fx.file, 'revolution axis', near(dot, 1, 0.01),
          `[${got.join(', ')}] vs [${t.axisXYZ.join(', ')}]`);
      }
    }
    if (t.minHoleDiaMm !== undefined) {
      record(fx.file, 'smallest bore', near(m.minHoleDiaMm, t.minHoleDiaMm, 0.02),
        `${m.minHoleDiaMm} vs ${t.minHoleDiaMm} mm`);
    }
    if (t.maxBlindHoleDepthToDia !== undefined) {
      record(fx.file, 'blind L/D', near(m.maxBlindHoleDepthToDia, t.maxBlindHoleDepthToDia, 0.02),
        `${m.maxBlindHoleDepthToDia} vs ${t.maxBlindHoleDepthToDia}`);
    }
    if (t.maxThroughHoleDepthToDia !== undefined) {
      record(fx.file, 'through L/D', near(m.maxThroughHoleDepthToDia, t.maxThroughHoleDepthToDia, 0.02),
        `${m.maxThroughHoleDepthToDia} vs ${t.maxThroughHoleDepthToDia}`);
    }
    if (t.maxHoleDepthToDia !== undefined) {
      record(fx.file, 'combined L/D', near(m.maxHoleDepthToDia, t.maxHoleDepthToDia, 0.02),
        `${m.maxHoleDepthToDia} vs ${t.maxHoleDepthToDia} — the figure the blind limit used to be judged on`);
    }
    if (t.blindMeasureAbsent) {
      // ABSENT, not zero. A part with no blind hole must make the blind rule
      // abstain; a 0 would pass every "at most" limit and read as a clean check.
      record(fx.file, 'no blind hole abstains', m.maxBlindHoleDepthToDia === undefined,
        m.maxBlindHoleDepthToDia === undefined ? 'undefined' : `${m.maxBlindHoleDepthToDia} — a hard zero would pass silently`);
    }
    if (t.wallP50Mm !== undefined) {
      record(fx.file, 'wall p50', near(m.wallP50Mm, t.wallP50Mm, 0.3),
        `${m.wallP50Mm} vs ${t.wallP50Mm} mm`);
    }
    if (t.centrifugalBodyOfRevolutionPasses) {
      const r = runDfmRules(g, 'centrifugal');
      const row = [...r.findings, ...r.passed, ...r.notEvaluated]
        .find(f => f.id === 'cent-body-of-revolution');
      record(fx.file, 'body-of-revolution rule PASSES', row?.status === 'pass',
        row ? `${row.status} at ${row.measured}%` : 'rule missing entirely');
    }
    for (const fam of t.minHoleFailsIn || []) {
      const row = [...runDfmRules(g, fam).findings].find(f => f.measure === 'minHoleDiaMm');
      record(fx.file, `${fam} rejects the fine bore`, !!row,
        row ? `fails at ${row.measured} ${row.unit} against ${row.thresholdText}` : 'no finding — the fine hole passed');
    }
    for (const fam of t.minHolePassesIn || []) {
      const r = runDfmRules(g, fam);
      const row = [...r.findings, ...r.passed].find(f => f.measure === 'minHoleDiaMm');
      record(fx.file, `${fam} accepts the fine bore`, row?.status === 'pass',
        row ? `${row.status} at ${row.measured} ${row.unit}` : 'rule missing entirely');
    }
  }


  // ── Sheet & bulk forming: one geometry, different families, different answers ─
  // A family copied from its neighbour and renamed would pass every isolated
  // check in this gate. Only a cross-family comparison catches it.
  for (const fx of SHEET_FORMING_FIXTURES) {
    if (!AS_JSON) console.log(`\n  ${fx.file}  (sheet/bulk forming)`);
    let g;
    try {
      g = await analyzeGeometry(await readFile(join(FIXDIR, fx.file)), fx.file);
    } catch (e) {
      record(fx.file, 'analyze for forming', false, `bridge threw: ${e.message}`);
      continue;
    }
    const t = fx.truth;
    const m = extractMeasures(g);

    if (t.drawDepthToWidth !== undefined) {
      record(fx.file, 'draw depth/width', near(m.drawDepthToWidth, t.drawDepthToWidth, 0.01),
        `${m.drawDepthToWidth} vs ${t.drawDepthToWidth} from the box extents`);
    }
    if (t.minBendRadiusToThickness !== undefined) {
      record(fx.file, 'bend r/t', near(m.minBendRadiusToThickness, t.minBendRadiusToThickness, 0.01),
        `${m.minBendRadiusToThickness} vs ${t.minBendRadiusToThickness}`);
    }
    if (t.deepDrawingDepthRulePasses !== undefined) {
      const row = [...(() => { const r = runDfmRules(g, 'deep-drawing', { material: 'Steel (mild)' });
        return [...r.findings, ...r.passed, ...r.notEvaluated]; })()].find(f => f.id === 'dd-draw-depth');
      record(fx.file, 'deep-draw depth rule', row?.status === (t.deepDrawingDepthRulePasses ? 'pass' : 'fail'),
        row ? `${row.status} at ${row.measured} ${row.unit}` : 'rule missing entirely');
    }
    if (t.spinningBlocked !== undefined) {
      const r = runDfmRules(g, 'metal-spinning', { material: 'Steel (mild)' });
      const blocked = (r.blockers || []).length > 0;
      record(fx.file, `spinning ${t.spinningBlocked ? 'BLOCKED' : 'not blocked'}`, blocked === t.spinningBlocked,
        blocked ? `blocked: ${r.blockedReason}` : `viable at ${m.axisymmetricAreaPct}% axisymmetric`);
    }
    for (const v of t.bendRadiusVerdicts || []) {
      const r = runDfmRules(g, v.family, { material: v.material });
      const row = [...r.findings, ...r.passed, ...r.notEvaluated].find(f => f.id === v.ruleId);
      record(fx.file, `${v.family} ${v.ruleId}`, row?.status === v.status,
        row ? `${row.status} at ${row.measured} ${row.unit} against ${row.thresholdText} (expected ${v.status})`
            : 'rule missing entirely');
    }
    if (t.thresholdSpread) {
      // The verdicts above are only meaningful if the numbers behind them differ.
      for (const [id, want] of Object.entries(t.thresholdSpread)) {
        const rule = DFM_RULES.find(r => r.id === id);
        record(fx.file, `${id} base threshold`, rule?.threshold === want,
          `${rule?.threshold} vs ${want} — identical thresholds would mean a copied family`);
      }
    }
  }


  // ── Machining: the two measures that had never produced a value ───────────
  for (const fx of MACHINING_FIXTURES) {
    if (!AS_JSON) console.log(`\n  ${fx.file}  (machining)`);
    let g;
    try {
      g = await analyzeGeometry(await readFile(join(FIXDIR, fx.file)), fx.file);
    } catch (e) {
      record(fx.file, 'analyze for machining', false, `bridge threw: ${e.message}`);
      continue;
    }
    const t = fx.truth;
    const m = extractMeasures(g);

    for (const [key, tol] of [['minInternalCornerRadiusMm', 0.02], ['maxPocketDepthToWidth', 0.02],
      ['maxHoleDiaMm', 0.02], ['minHoleDiaMm', 0.02], ['slendernessLtoD', 0.02]]) {
      if (t[key] === undefined) continue;
      record(fx.file, key, near(m[key], t[key], tol), `${m[key]} vs ${t[key]}`);
    }
    if (t.blindHoleCount !== undefined) {
      record(fx.file, 'blind feature count', m.blindHoleCount === t.blindHoleCount,
        `${m.blindHoleCount} vs ${t.blindHoleCount}`);
    }
    if (t.slendernessAbsent) {
      // ABSENT, not a number. The longest side of a bracket is not a shaft.
      record(fx.file, 'slenderness abstains on a flat part', m.slendernessLtoD === undefined,
        m.slendernessLtoD === undefined ? 'undefined' : `${m.slendernessLtoD} — a box side read as a shaft`);
    }
    for (const v of t.cornerVerdicts || []) {
      const r = runDfmRules(g, v.family, { material: 'Steel (mild)' });
      const row = [...r.findings, ...r.passed, ...r.notEvaluated].find(f => f.id === v.ruleId);
      record(fx.file, `${v.family} corner rule`, row?.status === v.status,
        row ? `${row.status} at ${row.measured} mm against ${row.thresholdText} (expected ${v.status})`
            : 'rule missing entirely');
    }
    for (const [id, want] of Object.entries(t.cornerThresholds || {})) {
      const rule = DFM_RULES.find(r => r.id === id);
      record(fx.file, `${id} threshold`, rule?.threshold === want,
        `${rule?.threshold} vs ${want} — a cosmetic split would show identical numbers`);
    }
    for (const v of t.blindRejectedBy || []) {
      const r = runDfmRules(g, v.family, { material: 'Steel (mild)' });
      const row = r.findings.find(f => f.id === v.ruleId);
      record(fx.file, `${v.family} rejects the blind feature`, !!row,
        row ? `fails at ${row.measured} ${row.unit}` : 'no finding — a blind hole passed a through-only process');
    }
    if (t.broachingAcceptsIt) {
      const r = runDfmRules(g, 'broaching', { material: 'Steel (mild)' });
      record(fx.file, 'broaching accepts a through bore in range', r.findings.length === 0,
        r.findings.length ? `${r.findings.map(f => f.title).join('; ')}` : `${r.evaluatedCount}/${r.ruleCount} evaluated, none failed`);
    }
  }


  // ── Additive: overhang against the build direction ────────────────────────
  for (const fx of ADDITIVE_FIXTURES) {
    if (!AS_JSON) console.log(`\n  ${fx.file}  (additive)`);
    let g;
    try {
      g = await analyzeGeometry(await readFile(join(FIXDIR, fx.file)), fx.file);
    } catch (e) {
      record(fx.file, 'analyze for additive', false, `bridge threw: ${e.message}`);
      continue;
    }
    const t = fx.truth;
    const o = g.dfm?.overhang || {};
    if (t.downFacingAreaPct !== undefined) {
      record(fx.file, 'down-facing area', near(o.downFacingAreaPct, t.downFacingAreaPct, 0.3),
        `${o.downFacingAreaPct}% vs ${t.downFacingAreaPct}% by construction`);
    }
    if (t.shallowestOverhangDeg !== undefined) {
      record(fx.file, 'shallowest overhang', near(o.shallowestOverhangDeg, t.shallowestOverhangDeg, 0.2),
        `${o.shallowestOverhangDeg} deg vs ${t.shallowestOverhangDeg}`);
    }
    for (const [deg, want] of Object.entries(t.overhangCurve || {})) {
      const got = o.overhangAreaBelowDeg?.[deg];
      record(fx.file, `overhang below ${deg} deg`, near(got, want, 0.3), `${got}% vs ${want}%`);
    }
    if (t.lpbfOverhangRule) {
      const r = runDfmRules(g, 'lpbf', { material: 'Titanium Ti-6Al-4V' });
      const row = [...r.findings, ...r.passed, ...r.notEvaluated].find(f => f.id === 'lpbf-overhang-45');
      record(fx.file, 'lpbf overhang rule', row?.status === t.lpbfOverhangRule,
        row ? `${row.status} at ${row.measured}% (expected ${t.lpbfOverhangRule})` : 'rule missing entirely');
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
    if (t.dfaMinParts) {
      // The theoretical minimum drives the design-efficiency figure, which is
      // the one number a DFA review is remembered by. It must count the BASE
      // part whether or not the base answered yes to any of the three questions.
      const blank = () => Object.fromEntries((d.parts || [])
        .map(p => [p.index, { moves: false, differentMaterial: false, mustSeparate: false }]));
      const withHousing = blank();
      withHousing[1] = { moves: false, differentMaterial: true, mustSeparate: false };
      const a = analyseDfa(d, { answers: withHousing });
      record(fx.file, 'min parts counts the base', a.theoreticalMinParts === t.dfaMinParts.housingNecessary,
        `${a.theoreticalMinParts} vs ${t.dfaMinParts.housingNecessary} (base + housing)`);
      const b = analyseDfa(d, { answers: blank() });
      record(fx.file, 'min parts floor', b.theoreticalMinParts === t.dfaMinParts.nothingNecessary,
        `${b.theoreticalMinParts} vs ${t.dfaMinParts.nothingNecessary} (the base alone)`);
      record(fx.file, 'efficiency follows the minimum',
        a.designEfficiencyPct > b.designEfficiencyPct,
        `${a.designEfficiencyPct}% vs ${b.designEfficiencyPct}% — a wrong minimum halves the headline figure`);
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
