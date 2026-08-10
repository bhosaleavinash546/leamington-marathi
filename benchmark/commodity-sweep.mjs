// COMMODITY SWEEP — what the DFM engine can actually say about real-shaped parts.
//
// The DFM gate (benchmark/dfm-run.mjs) proves the kernel returns the RIGHT
// NUMBER on parts whose truth is arithmetic. It cannot tell you whether the
// catalogue has anything to say about a die-cast housing, because no fixture in
// it is one. Those are different questions and a tool can pass the first while
// failing the second completely: a rule that is correct and abstains on every
// real part is worth nothing.
//
// This sweep runs the FULL production path — the same analyzeGeometry the
// endpoint calls, the same rule engine, the same route comparison — over a
// corpus of ten automotive commodities at ten variants each, and reports:
//
//   * did the geometry engine read it at all, and how long did it take;
//   * what COVERAGE the intended process family achieved (evaluated / total);
//   * which rules abstained, aggregated, so the biggest holes are named;
//   * whether the family the geometry INFERS matches the one a plant would use;
//   * whether any finding is obviously wrong given the part's design parameters.
//
//   node benchmark/commodity-sweep.mjs [--json] [--commodity sheet-bracket]
//
// It is a MEASUREMENT, not a gate: there is no pass mark, because "how much of
// the catalogue applies to a gear blank" has no target — it has an answer, and
// the answer is what tells you where to build next.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeGeometry } from '../cad-engine/cad-geometry-bridge.mjs';
import { extractMeasures, runDfmRules, inferProcessFamily } from '../dfm-rules.mjs';
import { compareRoutes } from '../dfm-routing.mjs';
import { DFM_RULES, PROCESS_FAMILIES } from '../dfm-rule-catalogue.mjs';
import { MATERIALS } from '../costing-engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'commodity-corpus');
const AS_JSON = process.argv.includes('--json');
const ONLY = (() => {
  const i = process.argv.indexOf('--commodity');
  return i > 0 ? process.argv[i + 1] : null;
})();
// A DECLARED tightest tolerance, as an engineer would type it. Run the sweep
// with and without to see what the tolerance rules are worth: no STEP in this
// corpus carries semantic PMI, and without a declaration every one of them
// abstains on every part.
const DECLARED_TOL = (() => {
  const i = process.argv.indexOf('--tolerance');
  return i > 0 ? Number(process.argv[i + 1]) : undefined;
})();

const log = (...a) => { if (!AS_JSON) console.log(...a); };

if (!existsSync(join(DIR, 'manifest.json'))) {
  console.error('No corpus. Run: python3 benchmark/commodity-corpus/generate.py');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf-8'));
const parts = manifest.filter(m => !m.buildError && (!ONLY || m.commodity === ONLY));

const rows = [];
const t0 = Date.now();

for (const m of parts) {
  const row = { ...m, ok: false };
  const started = Date.now();
  let geo;
  try {
    geo = await analyzeGeometry(await readFile(join(DIR, m.file)), m.file, 240_000);
  } catch (e) {
    row.error = `bridge threw: ${e.message}`;
    rows.push(row); log(`  ${m.file}  ✗ ${row.error}`);
    continue;
  }
  row.ms = Date.now() - started;
  if (geo.status !== 'success') {
    row.error = geo.error;
    rows.push(row); log(`  ${m.file}  ✗ ${geo.error}`);
    continue;
  }
  row.ok = true;

  // ── What the geometry itself measured ──────────────────────────────────
  const ms = extractMeasures(geo);
  row.measured = {
    volumeCm3: geo.volume?.cm3 ?? null,
    wallP50Mm: ms.wallP50Mm ?? null,
    wallP5Mm: ms.wallP5Mm ?? null,
    wallCoveragePct: geo.dfm?.wallThickness?.measuredAreaPct ?? null,
    holes: (geo.featureTable || []).filter(f => f.kind === 'hole').length,
    minHoleDiaMm: ms.minHoleDiaMm ?? null,
    isSheetMetal: !!geo.dfm?.sheetMetal?.isSheetMetal,
    axisymmetricPct: ms.axisymmetricAreaPct ?? null,
    undercutRegions: ms.undercutFaceCount ?? null,
    unclassifiedAreaPct: geo.dfm?.features?.unclassifiedAreaPct ?? null,
  };

  // ── The family a plant would use, judged ───────────────────────────────
  const r = runDfmRules(geo, m.intendedFamily, { material: m.material, declaredToleranceMm: DECLARED_TOL });
  row.family = {
    id: m.intendedFamily,
    name: r.processName,
    ruleCount: r.ruleCount,
    evaluated: r.evaluatedCount,
    coveragePct: r.coveragePct,
    score: r.score,
    findings: r.findings.map(f => ({ id: f.id, title: f.title, measured: f.measured, unit: f.unit, threshold: f.thresholdText, severity: f.severity })),
    abstained: r.notEvaluated.map(f => ({ id: f.id, measure: f.measure })),
  };

  // ── What the GEOMETRY infers, against what the part is for ─────────────
  const inf = inferProcessFamily(geo);
  row.inferred = { family: inf.family, confidence: inf.confidence, evidence: inf.evidence };
  row.inferenceAgrees = inf.family == null ? null : inf.family === m.intendedFamily;

  // ── Does the whole route table hold up on this part ────────────────────
  const density = MATERIALS[m.material]?.density;
  const weightKg = density && geo.volume?.cm3 > 0 ? (geo.volume.cm3 * density) / 1000 : null;
  if (weightKg) {
    try {
      const rt = compareRoutes(geo, { material: m.material, weightKg, chosenProcess: m.intendedProcess });
      row.routes = {
        offered: rt.routes.length,
        priced: rt.routes.filter(x => Number.isFinite(x.piecePriceEur)).length,
        scored: rt.routes.filter(x => x.score !== null).length,
        notViable: rt.routes.filter(x => x.viable === false).map(x => x.process),
        chosenFound: rt.routes.some(x => x.isChosen),
      };
    } catch (e) { row.routes = { error: e.message }; }
  }
  rows.push(row);
  log(`  ${m.file.padEnd(26)} ${String(row.ms).padStart(6)}ms  cov ${String(row.family.coveragePct).padStart(5)}%  `
    + `score ${String(row.family.score ?? '—').padStart(4)}  ${row.family.findings.length} findings`
    + (row.inferenceAgrees === false ? `  ⚠ infers ${row.inferred.family}` : ''));
}

// ─── Aggregate ───────────────────────────────────────────────────────────────
const good = rows.filter(r => r.ok);
const byCommodity = {};
for (const r of good) {
  const c = (byCommodity[r.commodity] ??= {
    commodity: r.commodity, family: r.family.id, n: 0, coverage: [], scores: [],
    findings: 0, ms: [], inferOk: 0, inferWrong: 0, inferNone: 0, abstained: {},
  });
  c.n++;
  c.coverage.push(r.family.coveragePct);
  if (r.family.score != null) c.scores.push(r.family.score);
  c.findings += r.family.findings.length;
  c.ms.push(r.ms);
  if (r.inferenceAgrees === true) c.inferOk++;
  else if (r.inferenceAgrees === false) c.inferWrong++;
  else c.inferNone++;
  for (const a of r.family.abstained) c.abstained[a.id] = (c.abstained[a.id] || 0) + 1;
}
const mean = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const summary = Object.values(byCommodity).map(c => ({
  commodity: c.commodity, family: c.family, parts: c.n,
  meanCoveragePct: mean(c.coverage),
  minCoveragePct: Math.min(...c.coverage),
  meanScore: mean(c.scores),
  findingsPerPart: Math.round((c.findings / c.n) * 10) / 10,
  meanMs: mean(c.ms),
  inference: { agrees: c.inferOk, disagrees: c.inferWrong, silent: c.inferNone },
  // The rules that NEVER evaluated on this commodity. Named individually,
  // because "coverage is 55%" tells you nothing you can act on and "the four
  // tolerance rules abstained on all ten parts" tells you exactly what to build.
  alwaysAbstained: Object.entries(c.abstained).filter(([, n]) => n === c.n).map(([id]) => id),
}));

// Which measures are the bottleneck ACROSS the whole corpus.
const abstainByMeasure = {};
for (const r of good) {
  for (const a of r.family.abstained) abstainByMeasure[a.measure] = (abstainByMeasure[a.measure] || 0) + 1;
}
const topBlockers = Object.entries(abstainByMeasure).sort((a, b) => b[1] - a[1]).slice(0, 12);

const report = {
  generatedAt: new Date().toISOString(),
  corpus: { declared: manifest.length, built: parts.length, analysed: good.length, failed: rows.length - good.length },
  catalogue: { rules: DFM_RULES.length, families: Object.keys(PROCESS_FAMILIES).length },
  wallClockSec: Math.round((Date.now() - t0) / 1000),
  summary,
  topBlockers: topBlockers.map(([measure, n]) => ({ measure, abstentions: n })),
  failures: rows.filter(r => !r.ok).map(r => ({ file: r.file, error: r.error })),
};

if (AS_JSON) {
  console.log(JSON.stringify({ report, rows }, null, 1));
} else {
  console.log('\n  ─────────────────────────────────────────────────────────────────────────');
  console.log('  COMMODITY SWEEP\n');
  console.log('  commodity          family              n   cov%  min%  score  find/pt   ms   infer');
  for (const s of summary) {
    console.log(`  ${s.commodity.padEnd(18)} ${s.family.padEnd(19)} ${String(s.parts).padStart(2)}  `
      + `${String(s.meanCoveragePct).padStart(5)} ${String(s.minCoveragePct).padStart(5)}  `
      + `${String(s.meanScore ?? '—').padStart(5)}  ${String(s.findingsPerPart).padStart(6)}  `
      + `${String(s.meanMs).padStart(5)}   ${s.inference.agrees}/${s.parts}`);
  }
  console.log('\n  RULES THAT NEVER EVALUATED, by commodity:');
  for (const s of summary) {
    if (s.alwaysAbstained.length) {
      console.log(`    ${s.commodity}: ${s.alwaysAbstained.join(', ')}`);
    }
  }
  console.log('\n  BIGGEST MEASUREMENT GAPS across the corpus (abstentions):');
  for (const b of report.topBlockers) console.log(`    ${String(b.abstentions).padStart(4)}  ${b.measure}`);
  if (report.failures.length) {
    console.log('\n  PARTS THE ENGINE COULD NOT READ:');
    for (const f of report.failures) console.log(`    ${f.file}: ${f.error}`);
  }
  const allCov = good.map(r => r.family.coveragePct);
  console.log(`\n  ${good.length} parts · catalogue ${report.catalogue.rules} rules / ${report.catalogue.families} families`);
  console.log(`  mean coverage ${mean(allCov)}% · ${report.wallClockSec}s wall clock`);
  console.log('  ─────────────────────────────────────────────────────────────────────────');
}
