// THE FAULTS FOUND BY REVIEWING THREE SHIPPED REPORTS, EACH PINNED BY A TEST.
//
// Every case here failed before the fix and passes after it. They are kept
// together rather than scattered into the per-module files because they share a
// provenance — a real steering knuckle, a real die-cast bracket and a real seat
// bracket, exported by a user, read finding by finding, then re-run through the
// live engine. That is a different kind of evidence from a fixture, and the
// point of each test is to stop the specific sentence the report printed from
// ever being printed again.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DFM_RULES } from '../dfm-rule-catalogue.mjs';
import { scoreOf } from '../dfm-rules.mjs';
import { priceFindings } from '../dfm-cost-impact.mjs';
import { SECONDARY_OPERATION_FAMILIES } from '../dfm-process-registry.mjs';

test('the bend-radius finding is never priced against a flat blank', () => {
  // The report said "a saving of EUR 1.26 per part (EUR 151,200 per year)" on a
  // finding whose fix is "open the inside radius". The pricer behind it costed
  // 23 bends against zero bends — the whole forming content of the design.
  const finding = {
    id: 'sm-bend-radius', severity: 'medium', measure: 'minBendRadiusToThickness',
    measured: 1.187, unit: 'r/t',
  };
  const [priced] = priceFindings([finding], {
    material: 'Steel (high-strength)', region: 'Germany', annualVolume: 120_000,
    geometry: { partVolumeCm3: 71.066, surfaceAreaCm2: 919.37, boundingBoxMm: { x: 255.77, y: 226.07, z: 31 } },
    sheet: { isSheetMetal: true, thicknessMm: 1.6, bendCount: 23 },
  });
  assert.equal(priced.cost.priced, false,
    'a bend-radius change removes no bends, so nothing about it is priceable by the forming model');
  assert.match(priced.cost.reason, /forming content|scrap/i);
});

test('a score is a fraction of what was actually checked, not a flat penalty', () => {
  const threeHighTwoMedium = [
    { severity: 'high' }, { severity: 'high' }, { severity: 'high' },
    { severity: 'medium' }, { severity: 'medium' },
  ];
  const eightEvaluated = [...threeHighTwoMedium, { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }];

  // The die-cast bracket: 3 high + 2 medium out of 8 evaluated rules. The old
  // flat form gave 1/100 and put the chosen route below a 3-rule family that
  // scored 100 — a ranking artefact of how many rules each family owns.
  const real = scoreOf(threeHighTwoMedium, 8, eightEvaluated);
  assert.ok(real > 1 && real < 50, `expected a mid-range score, got ${real}`);

  // Two families, same proportion of failure, must score the same however many
  // rules they contain. This is the property the old form did not have.
  const small = scoreOf([{ severity: 'high' }], 2, [{ severity: 'high' }, { severity: 'high' }]);
  const large = scoreOf(
    [{ severity: 'high' }, { severity: 'high' }, { severity: 'high' }], 6,
    Array.from({ length: 6 }, () => ({ severity: 'high' })));
  assert.equal(small, large, 'half the evaluated weight failing must score the same in any family');

  assert.equal(scoreOf([], 0, []), null, 'nothing evaluated is not a clean sheet');
  assert.equal(scoreOf([], 4, Array.from({ length: 4 }, () => ({ severity: 'high' }))), 100);
});

test('cold heading and MIM are ruled out by size before anything else is asked', () => {
  for (const [id, process, limit] of [
    ['ch-max-envelope', 'cold-heading', 150],
    ['mim-max-envelope', 'mim', 100],
  ]) {
    const rule = DFM_RULES.find(r => r.id === id);
    assert.ok(rule, `${id} must exist`);
    assert.equal(rule.process, process);
    assert.equal(rule.blocking, true, `${id} must be a feasibility gate, not a low score`);
    assert.equal(rule.measure, 'maxEnvelopeMm');
    assert.equal(rule.threshold, limit);
  }
});

test('processes that finish a part are not offered as ways to make it', () => {
  // Broaching at EUR 4.74 and wire EDM at EUR 68.46 sat in a cheapest-first
  // table as alternatives to die casting a bracket.
  for (const family of ['broaching', 'wire-edm', 'deep-hole-drilling']) {
    assert.ok(SECONDARY_OPERATION_FAMILIES[family],
      `${family} must be marked as an operation rather than a route`);
  }
  assert.ok(!SECONDARY_OPERATION_FAMILIES.hpdc, 'a real net-shape route must not be flagged');
  assert.ok(!SECONDARY_OPERATION_FAMILIES['sheet-metal']);
});

test('every rule with per-material thresholds keeps its generic number out of its title', () => {
  // "Inside bend radius below one material thickness" was printed against a
  // measurement of 1.187 r/t — which is ABOVE one thickness — because the rule
  // had resolved 2 r/t for high-strength steel while the title still quoted the
  // generic 1. A title that names a number the rule may not be using is a
  // contradiction waiting for a material override.
  const NUMBER_WORDS = /\b(one|two|three|four|half|single)\b/i;
  // `dd-draw-depth` counts DRAWING OPERATIONS, not thicknesses: "too deep to
  // draw in one operation" describes what the rule means and stays true at every
  // threshold it can resolve to. Exempted by name and by reason, so the next
  // person to add an exemption has to justify it in the same place.
  const EXEMPT = new Set(['dd-draw-depth']);
  const offenders = DFM_RULES
    .filter(r => r.byMaterial || r.byMaterialFamily)
    .filter(r => !EXEMPT.has(r.id))
    .filter(r => NUMBER_WORDS.test(r.title) || /\d/.test(r.title))
    .map(r => `${r.id}: "${r.title}"`);
  assert.deepEqual(offenders, [],
    'these titles quote a threshold that a material override can change:\n  ' + offenders.join('\n  '));
});

test('a draft finding says which angle it was measured at', () => {
  // Page 1 printed 64.07% (the forging rule, 5 deg) and page 2 printed 56.39%
  // (the geometry panel, 1 deg) under identical words.
  const draftRules = DFM_RULES.filter(r => r.measure === 'wallAreaBelowDraftPct');
  assert.ok(draftRules.length > 5);
  for (const r of draftRules) {
    assert.ok(Number.isFinite(r.draftCutoffDeg),
      `${r.id} reads the draft curve and must name the angle it reads it at`);
  }
});
