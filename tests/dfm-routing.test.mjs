// Route comparison: the same part down every process its material can take.
//
// What must hold: only compatible processes are offered, a route that cannot be
// priced keeps its row and its reason rather than vanishing, cost and carbon
// agree about the mass, and nothing is blended into a single ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareRoutes, rankRoutes } from '../dfm-routing.mjs';
import { PROCESS_TO_DFM_FAMILY } from '../dfm-process-registry.mjs';
import { runDfmRules } from '../dfm-rules.mjs';

/** A chunky aluminium casting: 15.84 mm median wall, very non-uniform. */
const CASTING = {
  volume: { cm3: 320 },
  dfm: {
    wallThickness: { p5Mm: 4.95, p50Mm: 15.84, p95Mm: 44, spreadRatio: 2.466 },
    draft: { wallAreaBelowDraftPct: { '0.5': 38, '1': 38.4, '1.5': 38.5, '5': 40.4 }, undercutFaceCount: 34 },
    features: { counts: {} },
  },
};

test('only processes the material can take become routes', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const names = routes.map(r => r.process);
  assert.ok(names.includes('Die Casting (Aluminium)'));
  assert.ok(names.includes('Sand Casting'));
  assert.ok(!names.includes('Injection Moulding'), 'aluminium is not injection mouldable');
  assert.ok(!names.includes('Die Casting (Zinc)'), 'A356 is not a zinc alloy');
  // Non-shaping operations are not alternatives to a forming route.
  assert.ok(!names.includes('E-coat (KTL)'));
  assert.ok(!names.includes('Washing & Final Inspection'));
});

test('every route carries its own family, and they are not all the same family', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  for (const r of routes) {
    assert.equal(r.dfmFamily, PROCESS_TO_DFM_FAMILY[r.process]);
  }
  // The whole point: five casting routes must not share one rule family.
  const casting = routes.filter(r => /Casting/.test(r.process));
  assert.ok(new Set(casting.map(r => r.dfmFamily)).size >= 3,
    'casting routes collapsed into one family — the old bug');
});

test('the same geometry scores differently down different routes', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const score = p => routes.find(r => r.process === p)?.score;
  // A 15.84 mm wall is far outside the die-casting band and inside nothing that
  // sand casting objects to as strongly. If these ever equalise, the families
  // have collapsed back into one rule set.
  assert.ok(score('Die Casting (Aluminium)') < score('Sand Casting'),
    'die casting must judge a 15.84 mm wall more harshly than sand casting');
});

test('a score is never reported without the coverage it rests on', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  for (const r of routes) {
    assert.ok(Number.isFinite(r.coveragePct), `${r.process} reports no coverage`);
    if (r.evaluatedCount === 0) {
      assert.equal(r.score, null, `${r.process} scored on zero evaluated rules`);
      assert.match(r.scoreCaveat, /not a clean sheet/);
    }
  }
});

test('cost and carbon are computed on the SAME mass', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const sand = routes.find(r => r.process === 'Sand Casting');
  // Sand casting has the worst metal yield of the casting routes, so it must buy
  // the most metal AND carry the most material carbon. If carbon were computed
  // on the finished weight instead, every route would show the same figure.
  const die = routes.find(r => r.process === 'Die Casting (Aluminium)');
  assert.ok(sand.inputMassKg > 0.86, 'buy-to-fly mass must exceed the finished part');
  assert.ok(sand.inputMassKg > die.inputMassKg, 'sand yields worse than high-pressure die');
  assert.ok(sand.kgCo2eMaterial > die.kgCo2eMaterial,
    'material carbon must follow the bought mass, not the shipped mass');
});

test('tooling is reported as the total cheque, not only the amortised slice', () => {
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const die = routes.find(r => r.process === 'Die Casting (Aluminium)');
  assert.ok(die.toolingEur > 10_000, 'a die is a five-figure investment');
  assert.ok(die.toolingPerPartEur < die.toolingEur, 'per-part and total must be distinct');
});

test('a route that cannot be priced keeps its row and its reason', () => {
  // No mass, so nothing can be costed — but the rules still ran, and dropping
  // the rows would read as "there are no other options".
  const { routes } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)' });
  assert.ok(routes.length > 5);
  for (const r of routes) {
    assert.equal(r.piecePriceEur, null);
    assert.match(r.costReason, /material must be chosen/);
    assert.ok(Number.isFinite(r.coveragePct), 'the DFM half must still have run');
  }
});

test('no material means no comparison, with the reason', () => {
  const out = compareRoutes(CASTING, { weightKg: 0.86 });
  assert.deepEqual(out.routes, []);
  assert.match(out.basis, /needs one/);
});

test('incompatible processes are NAMED, not silently absent', () => {
  const { skipped } = compareRoutes(CASTING, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const names = skipped.map(s => s.process);
  assert.ok(names.includes('Injection Moulding'));
  for (const s of skipped) assert.match(s.reason, /incompatible/);
});

test('ranking never treats a missing number as zero', () => {
  const rows = [
    { process: 'a', piecePriceEur: 5 },
    { process: 'b', piecePriceEur: null },
    { process: 'c', piecePriceEur: 2 },
  ];
  // Cheapest first, and the unpriceable route sorts LAST rather than winning.
  assert.deepEqual(rankRoutes(rows, 'piecePriceEur').map(r => r.process), ['c', 'a', 'b']);
  // Score sorts the other way: higher is better.
  const scored = [{ process: 'a', score: 10 }, { process: 'b', score: 90 }];
  assert.deepEqual(rankRoutes(scored, 'score').map(r => r.process), ['b', 'a']);
});

// ── Per-instance findings ────────────────────────────────────────────────────
// "max hole depth/diameter is 8.2" sends a supplier hunting through the model.
// "Ø6 x 49, four of them, first at (12, -30, 4)" is a review document.

const DEEP_HOLES = {
  featureTable: [
    { kind: 'hole', diaMm: 6, depthMm: 49, through: true, count: 4,
      axisPointXYZ: [12, -30, 4], instancesXYZ: [[12, -30, 4], [40, -30, 4]] },
    { kind: 'hole', diaMm: 20, depthMm: 30, through: true, count: 1, axisPointXYZ: [0, 0, 0] },
    { kind: 'hole', diaMm: 8, depthMm: 56, through: false, count: 2, axisPointXYZ: [5, 5, 5] },
  ],
  dfm: { wallThickness: { p50Mm: 10 }, features: {} },
};

test('a finding names the features that break it, worst first', () => {
  const r = runDfmRules(DEEP_HOLES, 'machining');
  const f = r.findings.find(x => x.id === 'mach-hole-depth-ratio');
  assert.ok(f, 'a 56/8 = 7 L/D hole must fail the 5 L/D machining rule');
  // Two of the three holes break it; the Ø20 x 30 (1.5 L/D) does not.
  assert.equal(f.instanceCount, 2);
  assert.equal(f.instanceTotal, 3);
  assert.equal(f.instances[0].ratio, 8.17, 'worst first: 49/6');
  assert.equal(f.instances[1].ratio, 7);
  assert.deepEqual(f.instances[0].atXYZ, [12, -30, 4], 'and it says where');
  assert.equal(f.instances[0].count, 4, 'and how many of them there are');
});

test('a passing rule lists no offenders but still says how many it checked', () => {
  const shallow = { ...DEEP_HOLES, featureTable: [{ kind: 'hole', diaMm: 20, depthMm: 30, count: 1 }] };
  const r = runDfmRules(shallow, 'machining');
  const f = [...r.findings, ...r.passed].find(x => x.id === 'mach-hole-depth-ratio');
  assert.equal(f.status, 'pass');
  assert.equal(f.instances, undefined, 'a pass must not list offenders');
  assert.equal(f.instanceTotal, 1);
});

test('every draft rule in the catalogue names the angle it means', async () => {
  // The bug this prevents: `wallAreaBelowMinDraftPct` was measured against a
  // hardcoded 1 degree and compared by rules meaning 0.5, 1.5 and 5.
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  for (const r of DFM_RULES) {
    if (r.measure !== 'wallAreaBelowDraftPct') continue;
    assert.ok(Number.isFinite(r.draftCutoffDeg), `${r.id} reads the draft curve without naming an angle`);
  }
  // and no rule is left on the legacy single-cutoff measure
  assert.equal(DFM_RULES.filter(r => r.measure === 'wallAreaBelowMinDraftPct').length, 0);
});

test('an analysis stored before the draft curve existed still evaluates at 1 degree', () => {
  // `wallAreaBelowMinDraftPct` was always the 1-degree figure, so it substitutes
  // for exactly that angle. A rule asking about 5 degrees must ABSTAIN rather
  // than accept it — that substitution would be the original bug in disguise.
  const legacy = { dfm: { wallThickness: { p50Mm: 2.5 }, draft: { wallAreaBelowMinDraftPct: 42 }, features: {} } };
  const hpdc = runDfmRules(legacy, 'hpdc', { material: 'Aluminium A356 (cast)' });
  assert.equal(hpdc.findings.find(f => f.id === 'hpdc-draft-minimum')?.measured, 42);
  const forge = runDfmRules(legacy, 'forging-hot');
  assert.ok(forge.notEvaluated.some(f => f.id === 'forge-hot-draft-minimum'),
    'a 5-degree rule must not silently reuse the 1-degree figure');
});
