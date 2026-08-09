// Route comparison: the same part down every process its material can take.
//
// What must hold: only compatible processes are offered, a route that cannot be
// priced keeps its row and its reason rather than vanishing, cost and carbon
// agree about the mass, and nothing is blended into a single ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareRoutes, rankRoutes } from '../dfm-routing.mjs';
import { PROCESS_TO_DFM_FAMILY } from '../dfm-process-registry.mjs';
import { extractMeasures, runDfmRules } from '../dfm-rules.mjs';

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
