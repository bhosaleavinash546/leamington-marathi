// DFM rule evaluator and cost-impact tests.
//
// The behaviour worth protecting here is not "does it find a thick wall" — it is
// that an UNMEASURED rule never reports as a pass, and an UNPRICEABLE finding
// never reports a number. Both would turn an honest report into a confident
// wrong one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DFM_RULES, PROCESS_FAMILIES, rulesFor } from '../dfm-rule-catalogue.mjs';
import { extractMeasures, runDfmRules, runAllDfmRules, scoreOf } from '../dfm-rules.mjs';
import { priceFindings, summarisePricedImpact } from '../dfm-cost-impact.mjs';

/** A part measured like the engine measures one: 5 mm wall, no draft, 1 undercut. */
const THICK_UNDRAFTED = {
  dfm: {
    wallThickness: { p5Mm: 4.6, p50Mm: 5.0, p95Mm: 5.4, spreadRatio: 0.16 },
    draft: { wallAreaBelowMinDraftPct: 100, minWallDraftDeg: null, undercutFaceCount: 1 },
    setups: { estimatedSetupCount: 5 },
    features: { prismatic: [] },
  },
};
/** A well-behaved HPDC part: 2.5 mm uniform wall, drafted, no undercuts. */
const GOOD_CASTING = {
  dfm: {
    wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6, spreadRatio: 0.08 },
    draft: { wallAreaBelowMinDraftPct: 0, minWallDraftDeg: 3.0, undercutFaceCount: 0 },
    setups: { estimatedSetupCount: 1 },
    features: { prismatic: [] },
  },
};

test('catalogue entries are well formed and every one cites a source', () => {
  assert.ok(DFM_RULES.length >= 15, `expected a real catalogue, got ${DFM_RULES.length}`);
  for (const r of DFM_RULES) {
    assert.ok(PROCESS_FAMILIES[r.process], `${r.id}: unknown process ${r.process}`);
    assert.ok(['high', 'medium', 'low'].includes(r.severity), `${r.id}: bad severity`);
    assert.ok(r.rationale && r.rationale.length > 40, `${r.id}: needs a real rationale`);
    assert.ok(r.fix && r.fix.length > 20, `${r.id}: needs an actionable fix`);
    // A threshold with no provenance is an assertion, not a guideline.
    assert.ok(r.source && r.source.length > 10, `${r.id}: threshold must cite a source`);
    assert.ok(r.measure, `${r.id}: must name a measure`);
  }
  assert.equal(new Set(DFM_RULES.map(r => r.id)).size, DFM_RULES.length, 'rule ids must be unique');
});

test('extractMeasures never invents a value it was not given', () => {
  const m = extractMeasures({});
  for (const [k, v] of Object.entries(m)) {
    assert.equal(v, undefined, `${k} must be undefined on empty geometry, got ${v}`);
  }
});

test('a thick undrafted part fails the HPDC wall and draft rules', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  const ids = r.findings.map(f => f.id);
  assert.ok(ids.includes('hpdc-wall-thickness-range'), `expected wall finding, got ${ids}`);
  assert.ok(ids.includes('hpdc-draft-minimum'), `expected draft finding, got ${ids}`);
  assert.ok(ids.includes('hpdc-undercuts'), `expected undercut finding, got ${ids}`);
  // Highest severity first — the report reads top-down.
  assert.equal(r.findings[0].severity, 'high');
});

test('a good casting passes the rules it can be judged on', () => {
  const r = runDfmRules(GOOD_CASTING, 'hpdc');
  const failed = r.findings.map(f => f.id);
  assert.ok(!failed.includes('hpdc-wall-thickness-range'), `2.5 mm is in band, got ${failed}`);
  assert.ok(!failed.includes('hpdc-draft-minimum'));
  assert.ok(!failed.includes('hpdc-undercuts'));
  assert.ok(r.score > 80, `expected a high score, got ${r.score}`);
});

test('a rule with no measurement is NOT EVALUATED, never a pass', () => {
  const r = runDfmRules(GOOD_CASTING, 'sheet-metal');
  // No bend recognition yet, so every sheet-metal rule must abstain.
  assert.equal(r.findings.length, 0);
  assert.equal(r.passed.length, 0, 'unmeasured rules must not be counted as passes');
  assert.equal(r.notEvaluated.length, r.ruleCount);
  assert.equal(r.coveragePct, 0);
  for (const n of r.notEvaluated) {
    assert.ok(n.reason && n.reason.length > 10, `${n.id} must say WHY it was not evaluated`);
  }
});

test('the score is null rather than 100 when nothing could be evaluated', () => {
  const r = runDfmRules(GOOD_CASTING, 'sheet-metal');
  assert.equal(r.score, null, 'a perfect score on zero checks would be a lie');
  assert.equal(scoreOf([], 0), null);
});

test('coverage reports how much of the catalogue actually ran', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  assert.equal(r.evaluatedCount, r.findings.length + r.passed.length);
  assert.ok(r.coveragePct > 0 && r.coveragePct <= 100);
  assert.equal(r.ruleCount, rulesFor('hpdc').length);
});

test('runAllDfmRules covers every declared process family', () => {
  const all = runAllDfmRules(THICK_UNDRAFTED);
  assert.deepEqual(all.map(r => r.process).sort(), Object.keys(PROCESS_FAMILIES).sort());
});

test('an unknown process family throws rather than silently returning nothing', () => {
  assert.throws(() => runDfmRules(GOOD_CASTING, 'forging-by-hand'), /Unknown process family/);
});

// ── Cost impact ──────────────────────────────────────────────────────────────

const CTX = {
  material: 'Aluminium A356 (cast)',
  process: 'Die Casting (Aluminium)',
  region: 'Germany',
  annualVolume: 120000,
  weightKg: 1.2,
  geometry: {
    boundingBoxMm: { x: 120, y: 80, z: 40 },
    partVolumeCm3: 180,
    surfaceAreaCm2: 320,
    holes: [{ diaMm: 8, depthMm: 20, count: 4 }],
  },
};

test('a thick wall is priced by the engine, with a real saving', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  const priced = priceFindings(r.findings, CTX);
  const wall = priced.find(f => f.id === 'hpdc-wall-thickness-range');
  assert.ok(wall.cost.priced, `expected a priced finding, got ${JSON.stringify(wall.cost)}`);
  assert.match(wall.cost.basis, /computeShouldCost/);
  assert.ok(wall.cost.deltaEur > 0, `thinning 5.0 -> 3.5 mm must save money, got ${wall.cost.deltaEur}`);
  assert.equal(wall.cost.changeDescription, 'wall 5 mm → 3.5 mm');
  assert.ok(wall.cost.annualDeltaEur > wall.cost.deltaEur);
});

test('undercuts are reported as UNPRICED with a reason, not as zero', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  const priced = priceFindings(r.findings, CTX);
  const uc = priced.find(f => f.id === 'hpdc-undercuts');
  assert.equal(uc.cost.priced, false);
  assert.ok(uc.cost.reason.length > 20);
  assert.equal(uc.cost.deltaEur, undefined, 'an unpriced finding must carry no number');
});

test('an external cost range is labelled as literature, not as an engine result', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'injection-moulding');
  const priced = priceFindings(r.findings, { ...CTX, process: 'Injection Moulding', material: 'ABS' });
  const uc = priced.find(f => f.id === 'im-undercuts');
  assert.equal(uc.cost.priced, false);
  assert.match(uc.cost.externalGuideline, /NOT an engine result/i);
});

test('setup consolidation is priced through the machining engine', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'machining');
  const priced = priceFindings(r.findings, { ...CTX, material: 'Aluminium 6061', process: 'Machining (CNC)' });
  const s = priced.find(f => f.id === 'mach-setup-count');
  assert.ok(s.cost.priced, JSON.stringify(s.cost));
  assert.match(s.cost.basis, /featuredMachiningCost/);
  assert.ok(s.cost.deltaEur > 0, `5 setups -> 3 must save money, got ${s.cost.deltaEur}`);
});

test('pricing degrades to unpriced instead of throwing on missing context', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  const priced = priceFindings(r.findings, {});      // no material, no weight
  assert.equal(priced.length, r.findings.length);
  for (const f of priced) assert.equal(f.cost.priced, false);
});

test('the impact summary excludes unpriced findings and says so', () => {
  const r = runDfmRules(THICK_UNDRAFTED, 'hpdc');
  const s = summarisePricedImpact(priceFindings(r.findings, CTX));
  assert.ok(s.pricedCount >= 1);
  assert.ok(s.unpricedCount >= 1);
  assert.ok(s.perPartEur > 0);
  assert.match(s.caveat, /could not be priced/);
});
