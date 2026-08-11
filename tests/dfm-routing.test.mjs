// Route comparison: the same part down every process its material can take.
//
// What must hold: only compatible processes are offered, a route that cannot be
// priced keeps its row and its reason rather than vanishing, cost and carbon
// agree about the mass, and nothing is blended into a single ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareRoutes, rankRoutes } from '../dfm-routing.mjs';
import { PROCESS_TO_DFM_FAMILY } from '../dfm-process-registry.mjs';
import { extractMeasures, inferProcessFamily, runDfmRules } from '../dfm-rules.mjs';

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

// ── The chosen route must be findable in its own comparison ─────────────────
//
// A manufacturing head read a report that named STEEL (MILD) · STAMPING on its
// cover, then printed nine processes before the stamping findings, and concluded
// the tool was ignoring the selection. The rules were never generic — only the
// sheet-metal family ever ran — but nothing in the table said which row was
// theirs, so the page read as a survey of every process.

test('the chosen process is marked in the route table, and only that one', () => {
  const { routes, chosenProcess } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Sand Casting',
  });
  const chosen = routes.filter(r => r.isChosen);
  assert.equal(chosen.length, 1, 'exactly one row is the chosen route');
  assert.equal(chosen[0].process, 'Sand Casting');
  assert.equal(chosenProcess, 'Sand Casting');
  assert.ok(routes.some(r => !r.isChosen), 'the alternatives are still there');
});

test('with no process chosen no row claims to be the one', () => {
  const { routes, chosenProcess } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86,
  });
  assert.equal(chosenProcess, null);
  assert.equal(routes.filter(r => r.isChosen).length, 0);
  for (const r of routes) assert.equal(r.deltaPieceEur, undefined,
    'a delta against nothing is not a number');
});

test('every alternative is priced as a difference from the chosen route', () => {
  const { routes } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Sand Casting',
  });
  const chosen = routes.find(r => r.isChosen);
  assert.ok(Number.isFinite(chosen.piecePriceEur));
  assert.equal(chosen.deltaPieceEur, undefined, 'the chosen route has no delta against itself');
  for (const r of routes) {
    if (r.isChosen) continue;
    if (!Number.isFinite(r.piecePriceEur)) { assert.equal(r.deltaPieceEur, null); continue; }
    // The delta is arithmetic on the two prices, not a second estimate.
    assert.equal(r.deltaPieceEur, Math.round((r.piecePriceEur - chosen.piecePriceEur) * 100) / 100);
  }
});

test('the basis sentence names the chosen route as the subject, not one of many', () => {
  const { basis } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Sand Casting',
  });
  assert.match(basis, /Your route is Sand Casting/);
  assert.match(basis, /alternative to yours/);
});

test('a chosen process the material cannot take marks nothing', () => {
  // Injection Moulding is not offered for A356, so no row can be it. The table
  // must not invent a marked row to satisfy the request.
  const { routes, chosenProcess } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Injection Moulding',
  });
  assert.equal(chosenProcess, null);
  assert.equal(routes.filter(r => r.isChosen).length, 0);
});

test('a finding records the material that was in play even when the rule ignores it', async () => {
  // `thresholdBasis: 'process-generic'` covered two different situations and the
  // report asserted the wrong one: covers that read STEEL (MILD) carried findings
  // that read "no material was given". The material now travels with the row.
  const sheet = {
    dfm: {
      wallThickness: { p50Mm: 1.6 },
      sheetMetal: { isSheetMetal: true, thicknessMm: 1.6, minBendToBendToThickness: 1 },
      features: {},
    },
  };
  const withMaterial = runDfmRules(sheet, 'sheet-metal', { material: 'Steel (mild)' });
  const f = withMaterial.findings.find(x => x.id === 'sm-bend-to-bend');
  assert.ok(f, 'the bend-land rule fires at 1 flat/t');
  assert.equal(f.thresholdBasis, 'process-generic', 'mild steel has no band on this rule');
  assert.equal(f.thresholdMaterial, 'Steel (mild)', 'but the alloy WAS given and must say so');

  const without = runDfmRules(sheet, 'sheet-metal');
  const g = without.findings.find(x => x.id === 'sm-bend-to-bend');
  assert.equal(g.thresholdMaterial, null, 'and when it was not given, that is a different claim');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CASTING TRANCHE
//
// Six processes that were only reachable by mis-selecting a neighbour, and one
// rule TYPE the catalogue could not previously express: how small a hole can be
// CAST at all, as against how deep a core pin can go for its diameter. Every
// casting family carried the second and none carried the first.
// ═══════════════════════════════════════════════════════════════════════════

test('the new casting processes are offered, priced and routed to a rule family', async () => {
  const { processesForMaterial } = await import('../dfm-process-registry.mjs');
  const { PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const { PROCESSES } = await import('../costing-engine.mjs');
  const offered = new Map(processesForMaterial('Aluminium A356 (cast)').map(p => [p.name, p]));
  for (const [name, fam] of [
    ['Low-Pressure Die Casting', 'lpdc'],
    ['Squeeze Casting', 'squeeze-casting'],
    ['Semi-Solid Casting (Thixo/Rheo)', 'semi-solid'],
    ['Shell Mould Casting', 'shell-mould'],
    ['Centrifugal Casting', 'centrifugal'],
    // Routed to HPDC ON PURPOSE: evacuating the cavity changes the gas in it,
    // not the shape the die can make.
    ['Vacuum-Assisted Die Casting', 'hpdc'],
  ]) {
    assert.ok(offered.has(name), `${name} must be selectable for a casting alloy`);
    assert.equal(offered.get(name).dfmFamily, fam, `${name} must route to ${fam}`);
    assert.ok(PROCESS_FAMILIES[fam], `${fam} must be a real rule family`);
    assert.ok(PROCESSES[name], `${name} must be in the cost model or it cannot be a route`);
  }
});

test('every new casting family actually has rules — none is an empty name', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  for (const fam of ['lpdc', 'squeeze-casting', 'semi-solid', 'shell-mould', 'centrifugal']) {
    const n = DFM_RULES.filter(r => r.process === fam).length;
    assert.ok(n >= 3, `${fam} has ${n} rules — a family with no rules inflates the picker and judges nothing`);
  }
});

test('the as-cast hole floor differs by family, and each one is reachable', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  const floors = Object.fromEntries(DFM_RULES
    .filter(r => r.measure === 'minHoleDiaMm')
    .map(r => [r.process, r.threshold]));
  // The whole point of the rule type: these are NOT the same number.
  assert.equal(floors['hpdc'], 2.5);
  assert.equal(floors['hpdc-zinc'], 1.5);
  assert.equal(floors['gravity-die'], 6.0);
  assert.equal(floors['lpdc'], 6.0);
  assert.equal(floors['investment-casting'], 1.5);
  // Sand deliberately absent — no sand cored-HOLE minimum was found in the
  // research, and interpolating one would look identical to the four above.
  assert.equal(floors['sand-casting'], undefined,
    'sand must stay unwritten rather than carry an invented floor');
});

test('the unwritten sand rule is DECLARED, not silently missing', async () => {
  const { UNWRITTEN_RULES } = await import('../dfm-rule-catalogue.mjs');
  assert.ok(UNWRITTEN_RULES.some(u => /SAND casting/i.test(u.topic) && /cored hole/i.test(u.topic)),
    'a threshold that could not be sourced must be declared, not left as an absence');
});

test('a Ø2 bore splits the casting families exactly as their floors say', () => {
  const part = {
    featureTable: [{ kind: 'hole', diaMm: 2.0, depthMm: 8, through: true, count: 1 }],
    dfm: { wallThickness: { p50Mm: 3 }, draft: {}, features: {} },
  };
  const verdict = fam => {
    const r = runDfmRules(part, fam, { material: 'Aluminium A356 (cast)' });
    return [...r.findings, ...r.passed].find(f => f.measure === 'minHoleDiaMm')?.status;
  };
  assert.equal(verdict('hpdc'), 'fail', '2.0 is under the 2.5 aluminium die floor');
  assert.equal(verdict('gravity-die'), 'fail', '2.0 is far under the 6.0 permanent-mould floor');
  assert.equal(verdict('lpdc'), 'fail', 'low pressure uses the same permanent-mould core hardware');
  assert.equal(verdict('investment-casting'), 'pass', 'a ceramic core goes to 1.5');
});

test('blind and through slenderness are measured separately, not shared', () => {
  // One part, two holes. The COMBINED figure is the through hole's 5.0; the
  // blind hole is at 1.5 and is sound. A blind limit of 2 judged on the
  // combined figure condemns a hole that is fine — which is what happened
  // while both rules read `maxHoleDepthToDia`.
  const part = {
    featureTable: [
      { kind: 'hole', diaMm: 10, depthMm: 15, through: false, count: 1 },
      { kind: 'hole', diaMm: 4, depthMm: 20, through: true, count: 1 },
    ],
    dfm: { wallThickness: { p50Mm: 4 }, draft: {}, features: {} },
  };
  const m = extractMeasures(part);
  assert.equal(m.maxBlindHoleDepthToDia, 1.5);
  assert.equal(m.maxThroughHoleDepthToDia, 5);
  assert.equal(m.maxHoleDepthToDia, 5, 'the combined figure is the through hole');

  const r = runDfmRules(part, 'investment-casting');
  const blind = [...r.findings, ...r.passed].find(f => f.id === 'inv-blind-core-ld');
  const thru = [...r.findings, ...r.passed].find(f => f.id === 'inv-through-core-ld');
  assert.equal(blind.status, 'pass', 'the blind hole at 1.5 is inside the limit of 2');
  assert.equal(thru.status, 'pass', 'the through hole at 5.0 is at the limit of 5');
});

test('a part with no blind hole makes the blind rule abstain, not pass at zero', () => {
  // `Number(null) === 0` has bitten this file before. A blind measure of 0 would
  // PASS an "at most" limit and read in the report as a check that happened.
  const part = {
    featureTable: [{ kind: 'hole', diaMm: 8, depthMm: 40, through: true, count: 1 }],
    dfm: { wallThickness: { p50Mm: 4 }, draft: {}, features: {} },
  };
  const m = extractMeasures(part);
  assert.equal(m.maxBlindHoleDepthToDia, undefined);
  const r = runDfmRules(part, 'investment-casting');
  assert.ok(r.notEvaluated.some(f => f.id === 'inv-blind-core-ld'),
    'no blind hole means the blind rule was not checked — not that it passed');
});

test('semi-solid draft is genuinely more permissive than HPDC, not a copy', () => {
  // The reason the family exists: a 0.5-degree wall that HPDC correctly rejects
  // is castable here, and judging it by the HPDC family would send an engineer
  // to add draft they do not need.
  const lowDraft = {
    dfm: {
      wallThickness: { p5Mm: 1.2, p50Mm: 2.0, spreadRatio: 0.4 },
      draft: { wallAreaBelowDraftPct: { '0.5': 8, '1': 40, '1.5': 55, '5': 80 }, undercutFaceCount: 0 },
      features: {},
    },
  };
  const hpdc = runDfmRules(lowDraft, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const ssm = runDfmRules(lowDraft, 'semi-solid', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.ok(hpdc.findings.some(f => f.measure === 'wallAreaBelowDraftPct'),
    'HPDC must reject 40% of the wall under 1 degree');
  assert.ok(!ssm.findings.some(f => f.measure === 'wallAreaBelowDraftPct'),
    'semi-solid reads the 0.5-degree point and passes — that difference IS the route');
});

test('centrifugal asks about SHAPE, and abstains when the shape was not measured', () => {
  const round = { dfm: { revolution: { axisymmetricAreaPct: 99.4 }, wallThickness: { p5Mm: 8 }, draft: {}, features: {} } };
  const flat = { dfm: { revolution: { axisymmetricAreaPct: 62.0 }, wallThickness: { p5Mm: 8 }, draft: {}, features: {} } };
  const unmeasured = { dfm: { revolution: { reason: 'kernel refused' }, wallThickness: { p5Mm: 8 }, draft: {}, features: {} } };

  const id = 'cent-body-of-revolution';
  const statusOf = (geo) => {
    const r = runDfmRules(geo, 'centrifugal');
    return [...r.findings, ...r.passed, ...r.notEvaluated].find(f => f.id === id)?.status;
  };
  assert.equal(statusOf(round), 'pass');
  assert.equal(statusOf(flat), 'fail');
  // NOT a fail. An unmeasured shape that defaulted to 0 would condemn every part
  // whose kernel call happened to throw.
  assert.equal(statusOf(unmeasured), 'not-evaluated');
});

test('every new casting process prices, and low-pressure beats gravity on yield', async () => {
  const { computeShouldCost } = await import('../costing-engine.mjs');
  const base = { material: 'Aluminium A356 (cast)', weightKg: 0.86, annualVolume: 50_000, region: 'Germany' };
  for (const process of ['Low-Pressure Die Casting', 'Squeeze Casting',
    'Semi-Solid Casting (Thixo/Rheo)', 'Vacuum-Assisted Die Casting',
    'Shell Mould Casting', 'Centrifugal Casting']) {
    const c = computeShouldCost({ ...base, process });
    assert.ok(Number.isFinite(c.totalShouldCost) && c.totalShouldCost > 0, `${process} must price`);
    assert.ok(Number.isFinite(c.drivers?.inputMassKg), `${process} must report a buy-to-fly mass`);
  }
  // The commercial fact that makes LPDC worth quoting: the fill tube is the
  // feeder and drains back, so less metal is poured per good part than gravity.
  const lp = computeShouldCost({ ...base, process: 'Low-Pressure Die Casting' });
  const gd = computeShouldCost({ ...base, process: 'Gravity Die Casting' });
  assert.ok(lp.drivers.inputMassKg < gd.drivers.inputMassKg,
    `LPDC must pour less than gravity (${lp.drivers.inputMassKg} vs ${gd.drivers.inputMassKg})`);
});

test('every priced casting route also carries a carbon factor', async () => {
  const { PROCESS_KWH_PER_KG } = await import('../carbon.mjs');
  for (const process of ['Low-Pressure Die Casting', 'Squeeze Casting',
    'Semi-Solid Casting (Thixo/Rheo)', 'Vacuum-Assisted Die Casting',
    'Shell Mould Casting', 'Centrifugal Casting']) {
    assert.ok(Number.isFinite(PROCESS_KWH_PER_KG[process]),
      `${process} would show a blank CO2e column beside a priced one`);
  }
});

test('the new routes appear in the route comparison for a casting alloy', () => {
  const { routes, skipped } = compareRoutes(CASTING, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Die Casting (Aluminium)',
  });
  const names = routes.map(r => r.process);
  for (const n of ['Low-Pressure Die Casting', 'Squeeze Casting', 'Shell Mould Casting']) {
    assert.ok(names.includes(n), `${n} must be offered as an alternative route`);
  }
  // And nothing became unpriceable in the process.
  for (const r of routes) {
    assert.ok(Number.isFinite(r.piecePriceEur) || r.costReason,
      `${r.process} has neither a price nor a reason`);
  }
  assert.ok(!skipped.some(s => s.process === 'Low-Pressure Die Casting'),
    'LPDC takes aluminium and must not be listed as inapplicable');
});

test('a route the geometry rules out is NOT VIABLE, not a cheap option', () => {
  // On a real casting bracket this table showed Centrifugal Casting at EUR 7.77
  // with a score of 63 — below the route the user had chosen — while the
  // geometry said a spinning mould cannot make the part at all. A low score and
  // an impossible route are different statements and the table has to make both.
  const flat = {
    volume: { cm3: 320 },
    dfm: {
      revolution: { axisymmetricAreaPct: 29.0 },
      wallThickness: { p5Mm: 8, p50Mm: 12, spreadRatio: 0.5 },
      draft: { wallAreaBelowDraftPct: { '1': 3 }, undercutFaceCount: 0 },
      features: {},
    },
  };
  const { routes } = compareRoutes(flat, {
    material: 'Aluminium A356 (cast)', weightKg: 0.86, chosenProcess: 'Gravity Die Casting',
  });
  const cent = routes.find(r => r.process === 'Centrifugal Casting');
  assert.equal(cent.viable, false);
  assert.match(cent.blockedReason, /body of revolution/);
  // It keeps its price and its findings — hiding them would leave the reader
  // wondering what was wrong — but it is no longer offered as a comparison.
  assert.ok(Number.isFinite(cent.piecePriceEur));

  // And nothing else is collateral damage: an ordinary bad score stays viable.
  const gdc = routes.find(r => r.process === 'Gravity Die Casting');
  assert.notEqual(gdc.viable, false, 'a low score is not a blocked route');
});

test('a round part makes the same route viable — the flag tracks geometry, not the process', () => {
  const round = {
    volume: { cm3: 320 },
    dfm: {
      revolution: { axisymmetricAreaPct: 99.1 },
      wallThickness: { p5Mm: 8, p50Mm: 12, spreadRatio: 0.5 },
      draft: { wallAreaBelowDraftPct: { '1': 3 }, undercutFaceCount: 0 },
      features: {},
    },
  };
  const { routes } = compareRoutes(round, { material: 'Aluminium A356 (cast)', weightKg: 0.86 });
  const cent = routes.find(r => r.process === 'Centrifugal Casting');
  assert.notEqual(cent.viable, false);
  assert.equal(cent.blockedReason, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SHEET & BULK TRANCHE
//
// `sheet-metal` covered blanking, bending and drawing with one set of numbers.
// Three of those are different processes: fine blanking pierces at 0.65 t where
// conventional blanking needs 1.0; press-hardened 22MnB5 wants 6 r/t where mild
// steel wants 1; and a drawn cup fails on depth-to-diameter, which no sheet rule
// asked about.
// ═══════════════════════════════════════════════════════════════════════════

test('the new forming processes are offered, priced, carbon-scored and routed', async () => {
  const { processesForMaterial } = await import('../dfm-process-registry.mjs');
  const { PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const { PROCESSES, computeShouldCost } = await import('../costing-engine.mjs');
  const { PROCESS_KWH_PER_KG } = await import('../carbon.mjs');
  const offered = new Map(processesForMaterial('Steel (mild)').map(p => [p.name, p]));
  for (const [name, fam] of [
    ['Fine Blanking', 'fine-blanking'],
    ['Hot Stamping (Press Hardening)', 'hot-stamping'],
    ['Deep Drawing (Multi-stage)', 'deep-drawing'],
    ['Metal Spinning', 'metal-spinning'],
    ['Cold Heading / Upsetting', 'cold-heading'],
    ['Open-Die Forging', 'open-die-forging'],
  ]) {
    assert.ok(offered.has(name), `${name} must be selectable for mild steel`);
    assert.equal(offered.get(name).dfmFamily, fam);
    assert.ok(PROCESS_FAMILIES[fam], `${fam} must be a real rule family`);
    assert.ok(PROCESSES[name], `${name} must be in the cost model`);
    assert.ok(Number.isFinite(PROCESS_KWH_PER_KG[name]), `${name} would show a blank CO2e column`);
    const c = computeShouldCost({ material: 'Steel (mild)', process: name, weightKg: 0.4, annualVolume: 100_000, region: 'Germany' });
    assert.ok(c.totalShouldCost > 0, `${name} must price`);
  }
});

test('tube bending is priced but explicitly NOT judged', async () => {
  const { processesForMaterial } = await import('../dfm-process-registry.mjs');
  const { PROCESSES } = await import('../costing-engine.mjs');
  const row = processesForMaterial('Steel (mild)').find(p => p.name === 'Tube Bending');
  assert.ok(row, 'it is a real route and must be offered');
  assert.ok(PROCESSES['Tube Bending'], 'and it must price');
  // The honest half: no family, and a reason that names what is missing.
  assert.equal(row.dfmFamily, null);
  assert.match(row.noDfmReason, /recognised AS a tube/);
});

test('ONE geometry, THREE families, three different verdicts on the same measure', () => {
  // The central claim of the tranche. A family copied from its neighbour and
  // renamed would return the same answer for all three and this is the only
  // test that would notice.
  const bracket = {
    dfm: {
      sheetMetal: { isSheetMetal: true, thicknessMm: 2, minBendRadiusToThickness: 1.5 },
      wallThickness: { p50Mm: 2 }, draft: {}, features: {},
    },
  };
  const verdict = (fam, id, material) => {
    const r = runDfmRules(bracket, fam, { material });
    return [...r.findings, ...r.passed, ...r.notEvaluated].find(f => f.id === id)?.status;
  };
  // 1.5 r/t: fine for mild steel, fine as a fine-blanking corner, and a crack
  // waiting to happen in press-hardened martensite.
  assert.equal(verdict('sheet-metal', 'sm-bend-radius', 'Steel (mild)'), 'pass');
  assert.equal(verdict('fine-blanking', 'fb-corner-radius', 'Steel (mild)'), 'pass');
  assert.equal(verdict('hot-stamping', 'hs-bend-radius', 'Steel 22MnB5 (press-hardened)'), 'fail');
});

test('fine blanking is more permissive than conventional blanking, in the right direction', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  const th = id => DFM_RULES.find(r => r.id === id)?.threshold;
  // The whole reason to pay for a triple-action press: finer holes, narrower
  // webs, closer edges, a tighter band. If any of these were COPIED from the
  // sheet-metal family the process would be indistinguishable from stamping.
  assert.ok(th('fb-hole-diameter') < th('sm-hole-diameter'), 'fine blanking pierces finer');
  assert.ok(th('fb-hole-to-hole') < th('sm-hole-to-hole'), 'and leaves narrower webs');
  assert.ok(th('fb-hole-to-edge') < th('sm-hole-to-edge'), 'and goes closer to the edge');
  assert.ok(th('fb-tolerance-capability') < th('sm-tolerance-capability'), 'and holds a tighter band');
});

test('the draw-depth proxy abstains on a skewed draw rather than measuring the wrong span', () => {
  const skewed = {
    boundingBox: { xMm: 60, yMm: 40, zMm: 10 },
    dfm: { wallThickness: { p50Mm: 3 }, draft: { drawDirectionXYZ: [0.577, 0.577, 0.577] }, features: {} },
  };
  assert.equal(extractMeasures(skewed).drawDepthToWidth, undefined,
    'along a skewed axis the box extents stop describing the cup');

  const axial = { ...skewed, dfm: { ...skewed.dfm, draft: { drawDirectionXYZ: [0, 0, 1] } } };
  // 10 deep over the narrower 40 span = 0.25.
  assert.equal(extractMeasures(axial).drawDepthToWidth, 0.25);
});

test('the deep-draw depth rule tracks the alloy, because the draw ratio does', () => {
  const deepCup = {
    boundingBox: { xMm: 50, yMm: 50, zMm: 40 },   // 40/50 = 0.8
    dfm: { wallThickness: { p50Mm: 1.5, spreadRatio: 0.2 }, draft: { drawDirectionXYZ: [0, 0, 1] }, features: {} },
  };
  const statusFor = material => {
    const r = runDfmRules(deepCup, 'deep-drawing', { material });
    return [...r.findings, ...r.passed].find(f => f.id === 'dd-draw-depth')?.status;
  };
  // First-draw limiting ratio is 2.0:1 for steel and 1.6:1 for aluminium, so the
  // same 0.8 cup is one operation in mild steel and is not in 5052.
  assert.equal(statusFor('Steel (mild)'), 'pass', 'mild steel approaches 1.0 in one draw');
  assert.equal(statusFor('Aluminium 5052 (sheet)'), 'fail', 'aluminium draws less');
  assert.equal(statusFor('Steel (high-strength)'), 'fail', 'HSS has less elongation to give the wall');
});

test('metal spinning blocks a flat part and clears a round one', () => {
  const mk = pct => ({
    dfm: { revolution: { axisymmetricAreaPct: pct }, wallThickness: { p50Mm: 2 },
      draft: { undercutFaceCount: 0 }, features: {} },
  });
  assert.equal(runDfmRules(mk(70), 'metal-spinning').blockers.length, 1, 'a bracket cannot be spun');
  assert.equal(runDfmRules(mk(99), 'metal-spinning').blockers.length, 0, 'a shell can');
  // The blocking concept is now used by two independent families, which is the
  // point at which it stops being a special case for one rule.
  assert.equal(runDfmRules(mk(70), 'centrifugal').blockers.length, 1);
});

test('open-die forging is looser than closed-die on every axis it shares', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  const th = id => DFM_RULES.find(r => r.id === id)?.threshold;
  const cut = id => DFM_RULES.find(r => r.id === id)?.draftCutoffDeg;
  // Judging an open-die forging by closed-die numbers condemns it on every rule
  // at once, which is what happened while there was only one hot-forging family.
  assert.ok(th('odf-tolerance-capability') > th('forge-hot-tolerance-capability'), 'looser band');
  assert.ok(th('odf-min-web') > th('forge-hot-min-web'), 'thicker minimum section');
  assert.ok(th('odf-uniformity') > th('forge-hot-uniformity'), 'more section variation tolerated');
  assert.ok(cut('odf-draft-minimum') > cut('forge-hot-draft-minimum'), 'more draft required');
});

test('every family in the catalogue has rules, and every rule has a home', async () => {
  const { DFM_RULES, PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const counts = {};
  for (const r of DFM_RULES) counts[r.process] = (counts[r.process] || 0) + 1;
  for (const fam of Object.keys(PROCESS_FAMILIES)) {
    assert.ok(counts[fam] >= 3, `${fam} has ${counts[fam] || 0} rules — a named family that judges nothing`);
  }
  for (const r of DFM_RULES) {
    assert.ok(PROCESS_FAMILIES[r.process], `${r.id} belongs to unknown family ${r.process}`);
    assert.ok(r.source && r.source.length > 40, `${r.id} must carry a real source string`);
    assert.ok(r.fix && r.rationale, `${r.id} must tell the reader what to do about it`);
  }
  const ids = DFM_RULES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate rule id');
});

test('the three new unwritten rules are declared with what they need', async () => {
  const { UNWRITTEN_RULES } = await import('../dfm-rule-catalogue.mjs');
  for (const pattern of [/Tube bending/i, /Corner ANGLE/i, /LIMITING DRAW RATIO/i]) {
    const row = UNWRITTEN_RULES.find(u => pattern.test(u.topic));
    assert.ok(row, `${pattern} must be declared, not silently absent`);
    assert.ok(row.needs && row.proxy, 'and must say what it needs and what stands in for it');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE MACHINING SPLIT
//
// One family judged a turned shaft, a wire-cut die plate, a gun-drilled
// manifold and a broached spline by seven thresholds. The internal corner alone
// spans two orders of magnitude across them: 3 mm for an end mill, 0.15 for a
// wire. And TWO of those seven rules had never produced a value on any part.
// ═══════════════════════════════════════════════════════════════════════════

test('the two dead machining measures now have values', () => {
  // `mach-pocket-depth-ratio` and `mach-internal-corner-radius` were written
  // against measurements nothing computed. Both reported NOT EVALUATED on every
  // part ever analysed; the recogniser had the data and was discarding it.
  const part = {
    dfm: {
      features: { minInternalCornerRadiusMm: 2.0, maxPocketDepthToWidth: 6.0 },
      wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {},
    },
  };
  const m = extractMeasures(part);
  assert.equal(m.minInternalCornerRadiusMm, 2.0);
  assert.equal(m.maxPocketDepthToWidth, 6.0);

  const r = runDfmRules(part, 'machining', { material: 'Steel (mild)' });
  const corner = [...r.findings, ...r.passed].find(f => f.id === 'mach-internal-corner-radius');
  const pocket = [...r.findings, ...r.passed].find(f => f.id === 'mach-pocket-depth-ratio');
  assert.ok(corner, 'the corner rule must no longer abstain');
  assert.ok(pocket, 'nor the pocket rule');
  assert.equal(corner.status, 'fail', '2 mm is under the 3 mm end-mill limit');
  assert.equal(pocket.status, 'fail', '6:1 is past the 4:1 pocket limit');
});

test('a part with no concave fillet ABSTAINS rather than failing at zero', () => {
  // The whole three-state discipline. A part drawn with sharp internal corners
  // has not been measured as having a tiny corner; it has been measured as
  // having none, and a hard 0 would fail every "at least" rule on it.
  const sharp = { dfm: { features: {}, wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {} } };
  assert.equal(extractMeasures(sharp).minInternalCornerRadiusMm, undefined);
  const r = runDfmRules(sharp, 'machining', { material: 'Steel (mild)' });
  assert.ok(r.notEvaluated.some(f => f.id === 'mach-internal-corner-radius'));
});

test('ONE corner, THREE machining families, thresholds two orders of magnitude apart', () => {
  const part = { dfm: { features: { minInternalCornerRadiusMm: 2.0 }, wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {} } };
  const verdict = (fam, id) => {
    const r = runDfmRules(part, fam, { material: 'Steel (mild)' });
    return [...r.findings, ...r.passed].find(f => f.id === id)?.status;
  };
  // An end mill cannot make a 2 mm corner at this catalogue's limit; a turning
  // insert nose makes it easily; a wire makes one twenty times finer.
  assert.equal(verdict('machining', 'mach-internal-corner-radius'), 'fail');
  assert.equal(verdict('turning', 'turn-internal-corner-radius'), 'pass');
  assert.equal(verdict('wire-edm', 'wedm-internal-corner-radius'), 'pass');
});

test('through-only processes reject a blind feature by COUNT, not by ratio', () => {
  const withBlind = {
    featureTable: [
      { kind: 'hole', diaMm: 20, depthMm: 15, through: false, count: 1 },
      { kind: 'hole', diaMm: 20, depthMm: 60, through: true, count: 1 },
    ],
    dfm: { wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {}, features: {} },
  };
  const m = extractMeasures(withBlind);
  assert.equal(m.blindHoleCount, 1);
  for (const [fam, id] of [['wire-edm', 'wedm-no-blind-features'], ['broaching', 'broach-no-blind']]) {
    const r = runDfmRules(withBlind, fam, { material: 'Steel (mild)' });
    assert.ok(r.findings.some(f => f.id === id), `${fam} must reject a blind feature`);
  }
});

test('a part whose holes were never classified abstains rather than reading as zero blind', () => {
  // `Number(null) === 0` again: a hard 0 would clear the wire-EDM and broaching
  // rules on a part nobody classified.
  const unclassified = {
    featureTable: [{ kind: 'hole', diaMm: 20, depthMm: 15, count: 1 }],   // no `through` flag
    dfm: { wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {}, features: {} },
  };
  assert.equal(extractMeasures(unclassified).blindHoleCount, undefined);
  const r = runDfmRules(unclassified, 'wire-edm', { material: 'Steel (mild)' });
  assert.ok(r.notEvaluated.some(f => f.id === 'wedm-no-blind-features'));
});

test('gun drilling reaches twenty times further than the generic machining limit', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  const th = id => DFM_RULES.find(r => r.id === id)?.threshold;
  assert.equal(th('mach-hole-depth-ratio'), 5);
  assert.equal(th('gundrill-hole-ld'), 100);
  // A fuel rail judged at 5:1 fails the rule the process was invented to beat.
  const deep = {
    featureTable: [{ kind: 'hole', diaMm: 6, depthMm: 300, through: true, count: 1 }],
    dfm: { wallThickness: { p50Mm: 10, p5Mm: 10 }, draft: {}, features: {} },
  };
  const generic = runDfmRules(deep, 'machining', { material: 'Steel (mild)' });
  const gun = runDfmRules(deep, 'deep-hole-drilling', { material: 'Steel (mild)' });
  assert.ok(generic.findings.some(f => f.measure === 'maxHoleDepthToDia'), '50:1 fails a twist drill');
  assert.ok(!gun.findings.some(f => f.measure === 'maxHoleDepthToDia'), 'and is routine for a gun drill');
});

test('broaching has a ceiling as well as a floor, and both fire', () => {
  const mk = dia => ({
    featureTable: [{ kind: 'hole', diaMm: dia, depthMm: dia * 2, through: true, count: 1 }],
    dfm: { wallThickness: { p50Mm: 20, p5Mm: 20 }, draft: {}, features: {} },
  });
  const tooSmall = runDfmRules(mk(6), 'broaching', { material: 'Steel (mild)' });
  const justRight = runDfmRules(mk(40), 'broaching', { material: 'Steel (mild)' });
  const tooBig = runDfmRules(mk(150), 'broaching', { material: 'Steel (mild)' });
  assert.ok(tooSmall.findings.some(f => f.id === 'broach-min-dia'), 'a Ø6 broach snaps');
  assert.equal(justRight.findings.length, 0, 'Ø40 through is exactly what broaching is for');
  assert.ok(tooBig.findings.some(f => f.id === 'broach-max-dia'), 'a Ø150 broach outgrows the machine');
});

test('the lathe slenderness measure abstains on anything that is not round', () => {
  // Caught by the benchmark, not by review: a first draft gated at 60%
  // axisymmetric and a flat 60x40x10 plate scores 69.7% — its two large faces
  // are perpendicular to Z — so the measure reported a 0.17 L/D "shaft".
  const plate = {
    boundingBox: { xMm: 60, yMm: 40, zMm: 10 },
    dfm: { revolution: { axisymmetricAreaPct: 69.7, axisXYZ: [0, 0, 1] }, wallThickness: { p50Mm: 10 }, draft: {}, features: {} },
  };
  assert.equal(extractMeasures(plate).slendernessLtoD, undefined);

  const shaft = {
    boundingBox: { xMm: 20, yMm: 20, zMm: 200 },
    dfm: { revolution: { axisymmetricAreaPct: 98, axisXYZ: [0, 0, 1] }, wallThickness: { p50Mm: 10 }, draft: {}, features: {} },
  };
  assert.equal(extractMeasures(shaft).slendernessLtoD, 10);
  const r = runDfmRules(shaft, 'turning', { material: 'Steel (mild)' });
  assert.ok(r.findings.some(f => f.id === 'turn-slenderness'), '10:1 needs a steady rest');
});

test('the four machining routes are offered, priced, carbon-scored and routed', async () => {
  const { processesForMaterial } = await import('../dfm-process-registry.mjs');
  const { PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const { PROCESSES, computeShouldCost } = await import('../costing-engine.mjs');
  const { PROCESS_KWH_PER_KG } = await import('../carbon.mjs');
  const offered = new Map(processesForMaterial('Steel (mild)').map(p => [p.name, p]));
  for (const [name, fam] of [
    ['Turning (CNC)', 'turning'],
    ['Wire EDM', 'wire-edm'],
    ['Deep-Hole / Gun Drilling', 'deep-hole-drilling'],
    ['Broaching', 'broaching'],
  ]) {
    assert.ok(offered.has(name), `${name} must be selectable`);
    assert.equal(offered.get(name).dfmFamily, fam);
    assert.ok(PROCESS_FAMILIES[fam]);
    assert.ok(PROCESSES[name]);
    assert.ok(Number.isFinite(PROCESS_KWH_PER_KG[name]), `${name} would show a blank CO2e column`);
    assert.ok(computeShouldCost({ material: 'Steel (mild)', process: name, weightKg: 0.4, annualVolume: 20_000, region: 'Germany' }).totalShouldCost > 0);
  }
  // Wire EDM must price ABOVE general machining on the same part — it is the
  // slowest route in the catalogue, and a table that showed it cheaper would
  // send an engineer down it for the wrong reason.
  const base = { material: 'Steel (mild)', weightKg: 0.4, annualVolume: 20_000, region: 'Germany' };
  const edm = computeShouldCost({ ...base, process: 'Wire EDM' }).totalShouldCost;
  const cnc = computeShouldCost({ ...base, process: 'Machining (CNC)' }).totalShouldCost;
  assert.ok(edm > cnc, `wire EDM (${edm}) must price above CNC (${cnc})`);
});

test('sinker EDM is declared unwritten rather than copied from wire EDM', async () => {
  const { UNWRITTEN_RULES, PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  assert.ok(!PROCESS_FAMILIES['sinker-edm'], 'it must not exist as a family');
  const row = UNWRITTEN_RULES.find(u => /SINKER/i.test(u.topic));
  assert.ok(row && row.needs && row.proxy, 'and must be declared with what it needs');
});

// ═══════════════════════════════════════════════════════════════════════════
// PLASTICS BEYOND INJECTION MOULDING, AND THE POWDER / ADDITIVE ROUTES
//
// The additive family is the first in this catalogue whose governing rule is
// not about a tool or a die at all. There is no draw and no ejection: the
// constraint is gravity, and what sits under a downward-facing surface.
// ═══════════════════════════════════════════════════════════════════════════

test('the five new routes are offered, priced, carbon-scored and routed', async () => {
  const { processesForMaterial } = await import('../dfm-process-registry.mjs');
  const { PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const { PROCESSES, computeShouldCost } = await import('../costing-engine.mjs');
  const { PROCESS_KWH_PER_KG } = await import('../carbon.mjs');
  for (const [name, fam, material] of [
    ['Thermoforming', 'thermoforming', 'ABS'],
    ['Rotational Moulding', 'rotational-moulding', 'HDPE'],
    ['Powder Metallurgy (Press & Sinter)', 'powder-metallurgy', 'Steel (mild)'],
    ['Metal Injection Moulding (MIM)', 'mim', 'Steel (mild)'],
    ['Laser Powder Bed Fusion (DMLS/SLM)', 'lpbf', 'Titanium Ti-6Al-4V'],
  ]) {
    const offered = new Map(processesForMaterial(material).map(p => [p.name, p]));
    assert.ok(offered.has(name), `${name} must be selectable for ${material}`);
    assert.equal(offered.get(name).dfmFamily, fam);
    assert.ok(PROCESS_FAMILIES[fam]);
    assert.ok(PROCESSES[name]);
    assert.ok(Number.isFinite(PROCESS_KWH_PER_KG[name]), `${name} would show a blank CO2e column`);
    assert.ok(computeShouldCost({ material, process: name, weightKg: 0.3, annualVolume: 5_000, region: 'Germany' }).totalShouldCost > 0);
  }
});

test('the overhang curve is a CURVE, and each rule names the angle it means', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  // 45 degrees is a rule of thumb, not a constant — some alloys and parameter
  // sets self-support to 30. A rule reading the curve without naming its angle
  // is the same bug the draft rules had before `draftCutoffDeg`.
  for (const r of DFM_RULES.filter(r => r.measure === 'overhangAreaBelowDeg')) {
    assert.ok(Number.isFinite(r.overhangCutoffDeg), `${r.id} reads the curve without naming an angle`);
  }
  const part = {
    dfm: { overhang: { overhangAreaBelowDeg: { 30: 2, 45: 28, 60: 40 }, downFacingAreaPct: 45 },
      wallThickness: { p50Mm: 3, p5Mm: 3 }, draft: {}, features: {} },
  };
  const r = runDfmRules(part, 'lpbf', { material: 'Titanium Ti-6Al-4V' });
  const row = [...r.findings, ...r.passed].find(f => f.id === 'lpbf-overhang-45');
  // It must read the 45 point (28), not the 30 point (2) or the 60 point (40).
  assert.equal(row.measured, 28);
  assert.equal(row.status, 'fail');
});

test('an unmeasured overhang abstains rather than reading as a clean 0%', () => {
  // A hard 0 would pass every additive part ever uploaded.
  const part = {
    dfm: { overhang: { reason: 'kernel refused' }, wallThickness: { p50Mm: 3, p5Mm: 3 }, draft: {}, features: {} },
  };
  assert.equal(extractMeasures(part)._overhangCurve, undefined);
  const r = runDfmRules(part, 'lpbf', { material: 'Titanium Ti-6Al-4V' });
  assert.ok(r.notEvaluated.some(f => f.id === 'lpbf-overhang-45'));
});

test('powder metallurgy is judged on the SINGLE press axis, which is its whole constraint', () => {
  const oneAxis = {
    dfm: { setups: { estimatedSetupCount: 1 }, wallThickness: { p5Mm: 4, p50Mm: 6 },
      draft: { undercutFaceCount: 0 }, features: {} },
  };
  const crossFeature = {
    dfm: { setups: { estimatedSetupCount: 3 }, wallThickness: { p5Mm: 4, p50Mm: 6 },
      draft: { undercutFaceCount: 0 }, features: {} },
  };
  const idsOf = geo => runDfmRules(geo, 'powder-metallurgy', { material: 'Steel (mild)' }).findings.map(f => f.id);
  assert.ok(!idsOf(oneAxis).includes('pm-single-press-axis'), 'a one-direction part presses');
  assert.ok(idsOf(crossFeature).includes('pm-single-press-axis'),
    'a cross hole cannot be pressed — it is secondary machining nobody quoted');
});

test('MIM has a MAXIMUM wall, which no plastic moulding rule has', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  assert.ok(DFM_RULES.find(r => r.id === 'mim-max-wall'), 'the binder has to get out of the middle');
  const chunky = {
    dfm: { wallThickness: { p5Mm: 3, p50Mm: 18 }, draft: { undercutFaceCount: 0 }, features: {} },
  };
  const r = runDfmRules(chunky, 'mim', { material: 'Steel (mild)' });
  assert.ok(r.findings.some(f => f.id === 'mim-max-wall'), '18 mm is past the 12.5 mm debinding limit');
});

test('rotational moulding is the only family with a wall WINDOW, not a floor', () => {
  const idsFor = (p5, p50) => runDfmRules({
    dfm: { wallThickness: { p5Mm: p5, p50Mm: p50 }, draft: { undercutFaceCount: 0 }, features: {} },
  }, 'rotational-moulding', { material: 'HDPE' }).findings.map(f => f.id);
  assert.ok(idsFor(1.5, 2.0).includes('rm-min-wall'), 'below 3 mm the powder may not bridge at all');
  assert.ok(idsFor(4.0, 14.0).includes('rm-max-wall'), 'above 10 mm the inside never fuses');
  assert.equal(idsFor(4.0, 6.0).length, 0, '4-6 mm is exactly where the process lives');
});

test('thermoforming and deep drawing ask the SAME question with different answers', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  const tf = DFM_RULES.find(r => r.id === 'tf-draw-ratio');
  const dd = DFM_RULES.find(r => r.id === 'dd-draw-depth');
  assert.equal(tf.measure, dd.measure, 'one geometric question');
  // A sheet stretched over a tool and a blank drawn into a die are not the same
  // limit, and the base thresholds must not have been copied.
  assert.notEqual(tf.threshold, dd.threshold);
});

test('three more gaps are declared rather than filled with invented numbers', async () => {
  const { UNWRITTEN_RULES, PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  for (const pattern of [/PERCENTAGE of dimension/i, /BUILD ORIENTATION/i, /BLOW MOULDING/i]) {
    const row = UNWRITTEN_RULES.find(u => pattern.test(u.topic));
    assert.ok(row && row.needs && row.proxy, `${pattern} must be declared with what it needs`);
  }
  assert.ok(!PROCESS_FAMILIES['blow-moulding'], 'blow moulding must not exist as a copied family');
});

test('the whole catalogue still holds its own invariants', async () => {
  const { DFM_RULES, PROCESS_FAMILIES } = await import('../dfm-rule-catalogue.mjs');
  const counts = {};
  for (const r of DFM_RULES) counts[r.process] = (counts[r.process] || 0) + 1;
  for (const fam of Object.keys(PROCESS_FAMILIES)) {
    assert.ok(counts[fam] >= 3, `${fam} has ${counts[fam] || 0} rules`);
  }
  for (const r of DFM_RULES) {
    assert.ok(PROCESS_FAMILIES[r.process], `${r.id} belongs to unknown family ${r.process}`);
    assert.ok(r.source && r.source.length > 40, `${r.id} must carry a real source string`);
    assert.ok(r.fix && r.rationale, `${r.id} must tell the reader what to do about it`);
    assert.ok(['high', 'medium', 'low'].includes(r.severity), `${r.id} has an odd severity`);
  }
  const ids = DFM_RULES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate rule id');
});

test('every shaping process in the cost model is either routed or explained', async () => {
  const { PROCESS_TO_DFM_FAMILY, NO_DFM_REASON } = await import('../dfm-process-registry.mjs');
  const { PROCESSES } = await import('../costing-engine.mjs');
  for (const name of Object.keys(PROCESSES)) {
    assert.ok(name in PROCESS_TO_DFM_FAMILY,
      `${name} is priced but the DFM registry has never heard of it — it would vanish from the route table`);
    if (PROCESS_TO_DFM_FAMILY[name] === null) {
      assert.ok(NO_DFM_REASON[name], `${name} carries no rules and no reason`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMODITY-SWEEP FIXES
//
// A 93-part sweep across ten automotive commodities measured what the catalogue
// can actually SAY about real-shaped parts, as opposed to whether its numbers
// are right. Two holes dominated everything else, and both are guarded here.
// ═══════════════════════════════════════════════════════════════════════════

test('a sheet part with no modelled bend is still measured, and says on what basis', () => {
  // The sheet family was gated on BEND recognition. Measured over ten stamped
  // brackets: the engine read the wall at 1.60 mm and the holes at Ø8 —
  // everything four of the nine rules need — and abstained on all nine.
  const noBend = {
    dfm: {
      sheetMetal: {
        isSheetMetal: false, thicknessMm: 1.6,
        thicknessBasis: 'derived from the ray-cast wall median',
        minHoleDiaToThickness: 5, minHoleToEdgeToThickness: 6.27,
      },
      apertures: { smallestApertureMm: 8 },
      wallThickness: { p50Mm: 1.6 }, draft: {}, features: {},
    },
  };
  const m = extractMeasures(noBend);
  assert.equal(m.sheetThicknessMm, 1.6);
  assert.match(m._sheetThicknessBasis, /ray-cast wall/);
  const r = runDfmRules(noBend, 'sheet-metal', { material: 'Steel (mild)' });
  assert.ok(r.evaluatedCount >= 3, `expected the thickness-derived rules to run, got ${r.evaluatedCount}`);
  // The bend-dependent ones must STILL abstain — the fix widens what can be
  // measured, it does not invent a bend.
  for (const id of ['sm-bend-radius', 'sm-hole-to-bend', 'sm-bend-to-bend', 'sm-flange-length']) {
    assert.ok(r.notEvaluated.some(f => f.id === id), `${id} must still abstain with no bend`);
  }
});

test('a part with no sheet thickness at all still abstains completely', () => {
  const casting = { dfm: { sheetMetal: { isSheetMetal: false, reason: 'no bends' }, wallThickness: { p50Mm: 12 }, draft: {}, features: {} } };
  const r = runDfmRules(casting, 'sheet-metal', { material: 'Steel (mild)' });
  assert.equal(r.evaluatedCount, 0, 'a casting is not judged by sheet rules');
  assert.equal(r.score, null, 'and scores null, not 100');
});

test('the tightest tolerance can be DECLARED, and never outranks real PMI', () => {
  // 93 abstentions over 93 parts: every tolerance-capability rule in the
  // catalogue — one per family — had never fired on a single part, because
  // almost no STEP carries semantic PMI.
  const bare = { dfm: { wallThickness: { p50Mm: 3, p5Mm: 3 }, draft: {}, features: {} } };
  assert.equal(extractMeasures(bare).tightestToleranceMm, undefined);
  assert.equal(extractMeasures(bare, { declaredToleranceMm: 0.05 }).tightestToleranceMm, 0.05);
  assert.match(extractMeasures(bare, { declaredToleranceMm: 0.05 })._toleranceBasis, /DECLARED/);

  // PMI wins when the file actually carries it — a typed number must never
  // override a measured one.
  const withPmi = { dfm: { pmi: { tightestToleranceMm: 0.02 }, wallThickness: { p50Mm: 3 }, draft: {}, features: {} } };
  const m = extractMeasures(withPmi, { declaredToleranceMm: 0.5 });
  assert.equal(m.tightestToleranceMm, 0.02);
  assert.match(m._toleranceBasis, /AP242/);
});

test('a declared tolerance carries its basis onto the finding, and only that finding', () => {
  // hpdc's tolerance rule is now the NADCA #402 capability check, so the
  // declared band arrives as a margin — the provenance contract is unchanged:
  // the finding must say the band was DECLARED, and nothing else may.
  const geo = { dfm: { wallThickness: { p50Mm: 3, p5Mm: 3 }, draft: { undercutFaceCount: 0 }, features: {} } };
  const r = runDfmRules(geo, 'hpdc', { material: 'Aluminium A356 (cast)', declaredToleranceMm: 0.05 });
  const tol = [...r.findings, ...r.passed].find(f => f.measure === 'nadca402ToleranceMargin');
  assert.ok(tol, 'the tolerance rule must now evaluate');
  assert.match(tol.measuredBasis, /DECLARED/);
  // No other finding may pick up a stray provenance claim.
  const TOLERANCE_MEASURES = new Set(['tightestToleranceMm', 'nadca402ToleranceMargin', 'nadca402FlatnessMargin']);
  for (const f of [...r.findings, ...r.passed]) {
    if (!TOLERANCE_MEASURES.has(f.measure)) assert.equal(f.measuredBasis, undefined, `${f.id} carries a stray basis`);
  }
  // Families NOT covered by #402 still evaluate the declared band directly.
  const lp = runDfmRules(geo, 'lpdc', { material: 'Aluminium A356 (cast)', declaredToleranceMm: 0.05 });
  const lpTol = [...lp.findings, ...lp.passed].find(f => f.measure === 'tightestToleranceMm');
  assert.ok(lpTol, 'lpdc keeps its screening tolerance rule until ISO 8062-3 is held');
  assert.match(lpTol.measuredBasis, /DECLARED/);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE THREE GAPS THE COMMODITY SWEEP LEFT OPEN
// ═══════════════════════════════════════════════════════════════════════════

test('a body of revolution is inferred as turned, from a measurement', () => {
  // The inference was silent on all ten turned shafts. It is not a hard
  // question: the axisymmetry pass already scored them, at the same 90% bar the
  // centrifugal and spinning rules use.
  const shaft = {
    boundingBox: { xMm: 30, yMm: 30, zMm: 160 },
    dfm: {
      revolution: { axisymmetricAreaPct: 97.4, axisXYZ: [0, 0, 1] },
      wallThickness: { p50Mm: 8, p95Mm: 9 }, draft: {}, features: { counts: {} },
    },
  };
  const inf = inferProcessFamily(shaft);
  assert.equal(inf.family, 'turning');
  assert.equal(inf.confidence, 'measured');
  assert.match(inf.evidence.join(' '), /97.4% of the surface is a body of revolution/);
  // And it says what else a round part could be, rather than implying certainty.
  assert.match(inf.notes.join(' '), /spun, centrifugally cast/);
});

test('draft says TOOLED; the material says which tool', () => {
  // The inference used to stop at "this part leaves a tool" and return null,
  // which is why it scored 0 of 10 on every casting and moulding in the sweep —
  // it had the hard half of the answer and threw it away for want of the easy
  // half. The caller knows the material.
  const tooled = (p50) => ({
    dfm: {
      wallThickness: { p50Mm: p50, p95Mm: p50 * 1.2 },
      draft: { areaPct: { releasing: 62, undercut: 1 } },
      features: { counts: {} }, revolution: { axisymmetricAreaPct: 30 },
    },
  });
  const fam = (p50, material) => inferProcessFamily(tooled(p50), { material }).family;

  assert.equal(fam(2.5, 'Aluminium A380 / ADC12 (die-cast)'), 'hpdc', 'thin aluminium is die cast');
  assert.equal(fam(6, 'Aluminium A356 (cast)'), 'gravity-die', 'a heavier aluminium wall is gravity');
  assert.equal(fam(14, 'Aluminium A356 (cast)'), 'sand-casting', 'and a very heavy one is sand');
  assert.equal(fam(3, 'PA66-GF30 (glass-filled)'), 'injection-moulding');
  assert.equal(fam(2, 'Zinc (ZAMAK 3)'), 'hpdc-zinc');
  assert.equal(fam(9, 'Cast Iron (Ductile/GJS)'), 'sand-casting', 'iron is not die cast');
  assert.equal(fam(3, 'EPDM Rubber'), 'rubber-moulding');

  // With no material it still refuses to guess, and says why.
  const silent = inferProcessFamily(tooled(3));
  assert.equal(silent.family, null);
  assert.match(silent.notes.join(' '), /Choose a material, or pick the family/);
});

test('an internal corner is any concave partial arc — a bore is not one', () => {
  // Measured over 93 parts: `minInternalCornerRadiusMm` abstained 20 times,
  // because it only looked at faces the blend recogniser had accepted — a fair
  // test for an edge break and the wrong one for the corner of a deep pocket.
  const withCorner = { dfm: { features: { minInternalCornerRadiusMm: 1.2 }, wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {} } };
  assert.equal(extractMeasures(withCorner).minInternalCornerRadiusMm, 1.2);
  const r = runDfmRules(withCorner, 'machining', { material: 'Aluminium 6061' });
  assert.ok(r.findings.some(f => f.id === 'mach-internal-corner-radius'), '1.2 mm is under the 3 mm end-mill limit');
  // A part with sharp corners has NO internal corner — that is not a small one.
  const sharp = { dfm: { features: {}, wallThickness: { p50Mm: 8, p5Mm: 8 }, draft: {} } };
  assert.equal(extractMeasures(sharp).minInternalCornerRadiusMm, undefined);
});

test('extrusion now asks the two questions an extruder asks', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  assert.equal(DFM_RULES.filter(r => r.process === 'extrusion').length, 6, 'was four generic rules');
  // A profile too big for a general-purpose press, with a channel too deep for
  // its die tongue — the two ways an extrusion quote actually goes wrong.
  const big = {
    boundingBox: { xMm: 220, yMm: 180, zMm: 3000 },
    dfm: { features: { maxPocketDepthToWidth: 5.2 }, wallThickness: { p5Mm: 3, p50Mm: 3, spreadRatio: 0.1 },
      draft: { undercutFaceCount: 0 } },
  };
  const m = extractMeasures(big);
  assert.equal(m.circumscribingCircleMm, 284.3, 'hypot(180, 220) = 284.25 — the section, not the length');
  const r = runDfmRules(big, 'extrusion', { material: 'Aluminium 6082' });
  assert.ok(r.findings.some(f => f.id === 'extr-circumscribing-circle'), '283 mm is past a general-purpose press');
  assert.ok(r.findings.some(f => f.id === 'extr-tongue-ratio'), '5.2:1 will break the die tongue');
});

test('powder metallurgy now bites on a density gradient', async () => {
  const { DFM_RULES } = await import('../dfm-rule-catalogue.mjs');
  assert.equal(DFM_RULES.filter(r => r.process === 'powder-metallurgy').length, 6, 'was four generic rules');
  // A tall thin-walled bush: the powder column is thirteen times the wall.
  const bush = {
    boundingBox: { xMm: 40, yMm: 40, zMm: 39 },
    dfm: {
      setups: { estimatedSetupCount: 1, accessDirections: [{ directionXYZ: [0, 0, 1], featureCount: 1 }] },
      wallThickness: { p5Mm: 3, p50Mm: 3 }, draft: { undercutFaceCount: 0 }, features: {},
    },
    featureTable: [{ kind: 'hole', diaMm: 34, depthMm: 39, through: true, count: 1 }],
  };
  assert.equal(extractMeasures(bush).pressDepthToWallRatio, 13);
  const r = runDfmRules(bush, 'powder-metallurgy', { material: 'Steel (mild)' });
  assert.ok(r.findings.some(f => f.id === 'pm-press-depth-ratio'), '13:1 is past the 8:1 density limit');

  // A flat disc is the SAME part rotated, and must not false-alarm: the powder
  // column is the disc thickness, not its diameter. Taking the largest box
  // extent instead would fail every flat pressed part there is.
  const disc = {
    boundingBox: { xMm: 110, yMm: 110, zMm: 20 },
    dfm: {
      setups: { estimatedSetupCount: 1, accessDirections: [{ directionXYZ: [0, 0, 1], featureCount: 5 }] },
      wallThickness: { p5Mm: 20, p50Mm: 20 }, draft: { undercutFaceCount: 0 }, features: {},
    },
    featureTable: [{ kind: 'hole', diaMm: 18, depthMm: 20, through: true, count: 1 }],
  };
  assert.equal(extractMeasures(disc).pressDepthToWallRatio, 1);
  assert.equal(runDfmRules(disc, 'powder-metallurgy', { material: 'Steel (mild)' }).findings.length, 0);
});
