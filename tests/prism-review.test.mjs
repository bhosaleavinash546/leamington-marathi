// Prism review, 28 Sept 2026 — the defects the live runs found, pinned as
// behaviour rather than as source text.
//
//   1. W3 (process premium) took Cold Heading as the entitlement for a die-cast
//      housing, a stamped bracket and a machined ribbed plate. A route may only
//      be argued when something shows it can form the shape (shapeFeasibility).
//   2. After DFM coverage became "evaluated / APPLICABLE rules", the W3 floor
//      read 100% for a route checked on 1 of 6 rules. It now reads rule DEPTH.
//   3. The CAD-derived mass used a stock density for 25 of 69 materials and a
//      flat 1.05 g/cm³ for every plastic, while the UI called it "catalogue
//      density". It now uses the catalogue density and says which it used.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defensibleRoutes, ruleDepthPct, cadMass, cadMassKg, w3Exclusions,
  W3_MIN_DFM_SCORE, W3_MIN_RULE_DEPTH_PCT,
} from '../part360.mjs';
import {
  SHAPE_CLASS, SHAPE_CLASS_NAMES, SECONDARY_OPERATION_FAMILIES, PROCESS_TO_DFM_FAMILY, shapeFeasibility,
} from '../dfm-process-registry.mjs';
import { PROCESS_FAMILIES } from '../dfm-rule-catalogue.mjs';
import { compareRoutes, recommendableRoutes } from '../dfm-routing.mjs';
import { MATERIALS } from '../costing-engine.mjs';

// ── 1. Shape feasibility ─────────────────────────────────────────────────────

test('every route family has a shape class; every secondary operation has none', () => {
  for (const fam of Object.keys(PROCESS_FAMILIES)) {
    if (SECONDARY_OPERATION_FAMILIES[fam] && fam !== 'turning') {
      assert.equal(SHAPE_CLASS[fam], undefined, `${fam} is an operation, not a route`);
    } else {
      assert.ok(SHAPE_CLASS[fam], `${fam} has no shape class`);
      assert.ok(SHAPE_CLASS_NAMES[SHAPE_CLASS[fam]], `${SHAPE_CLASS[fam]} is unnamed`);
    }
  }
  for (const fam of Object.values(PROCESS_TO_DFM_FAMILY).filter(Boolean)) {
    assert.ok(SHAPE_CLASS[fam] || SECONDARY_OPERATION_FAMILIES[fam], `${fam} unclassified`);
  }
});

test('a wire header is not shown able to make a die casting, a stamping or a machined plate', () => {
  for (const chosenFamily of ['hpdc', 'sheet-metal', 'machining']) {
    const f = shapeFeasibility('cold-heading', { chosenFamily });
    assert.equal(f.established, false, chosenFamily);
    assert.match(f.basis, /redesign/);
  }
});

test('the three ways a shape class is established', () => {
  // Same class as the route the part is already made by.
  assert.equal(shapeFeasibility('gravity-die', { chosenFamily: 'hpdc' }).established, true);
  // Shape-universal.
  assert.equal(shapeFeasibility('machining', { chosenFamily: 'hpdc' }).established, true);
  assert.equal(shapeFeasibility('lpbf', { chosenFamily: 'sheet-metal' }).established, true);
  // The class the geometry itself measures.
  assert.equal(shapeFeasibility('hot-stamping', { chosenFamily: 'machining', inferredFamily: 'sheet-metal' }).established, true);
  // None of them.
  assert.equal(shapeFeasibility('extrusion', { chosenFamily: 'hpdc', inferredFamily: 'hpdc' }).established, false);
  // An operation is never a route.
  assert.equal(shapeFeasibility('broaching', { chosenFamily: 'broaching' }).established, false);
});

test('a turned solid is not a spun shell or a centrifugal casting', () => {
  // Three round-part routes, three different shapes: only the chosen class counts.
  assert.equal(shapeFeasibility('metal-spinning', { chosenFamily: 'turning', inferredFamily: 'turning' }).established, false);
  assert.equal(shapeFeasibility('centrifugal', { chosenFamily: 'turning', inferredFamily: 'turning' }).established, false);
});

/** A 2.5 mm uniform-wall part with releasing draft: the geometry says "tooled". */
const HOUSING = {
  volume: { cm3: 53.7 },
  boundingBox: { xMm: 80, yMm: 60, zMm: 30 },
  dfm: {
    wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6, spreadRatio: 0.08 },
    draft: { areaPct: { releasing: 80, undercut: 2 } },
    features: { counts: {} },
  },
};

test('compareRoutes marks each row with its shape class, and recommendableRoutes honours it', () => {
  const { routes } = compareRoutes(HOUSING, {
    material: 'Aluminium A380 / ADC12 (die-cast)', weightKg: 0.145, chosenProcess: 'Die Casting (Aluminium)',
  });
  for (const r of routes) {
    assert.equal(typeof r.shapeEstablished, 'boolean', r.process);
    assert.ok(r.shapeBasis, r.process);
  }
  const ch = routes.find(r => r.process === 'Cold Heading / Upsetting');
  if (ch) assert.equal(ch.shapeEstablished, false);
  const rec = recommendableRoutes(routes).map(r => r.process);
  for (const p of rec) {
    const row = routes.find(r => r.process === p);
    assert.equal(row.shapeEstablished, true);
    assert.notEqual(row.viable, false);
    assert.notEqual(row.netShape, false);
    assert.ok(row.evaluatedCount > 0);
    assert.ok(!row.isChosen);
  }
  assert.ok(!rec.includes('Cold Heading / Upsetting'));
  assert.ok(!rec.includes('Extrusion'));
});

test('W3 says why routes were left out, and says nothing when none were', () => {
  assert.equal(w3Exclusions(0, 0), '');
  assert.match(w3Exclusions(0, 3), /3 routes not shown able to form this shape/);
  assert.match(w3Exclusions(1, 0), new RegExp(`1 route with a DFM score below ${W3_MIN_DFM_SCORE}`));
  assert.match(w3Exclusions(2, 1), /1 route not shown.*; 2 routes with a DFM score/);
});

// ── 2. Rule depth, not applicable-rule coverage ──────────────────────────────

test('rule depth is evaluated over ALL rules, not over the applicable ones', () => {
  assert.equal(ruleDepthPct({ ruleCount: 6, evaluatedCount: 1, coveragePct: 100 }), 100 / 6);
  // Older rows without counts fall back to their coverage figure.
  assert.equal(ruleDepthPct({ coveragePct: 55 }), 55);
});

test('defensibleRoutes: a 100 over one rule is not a basis; 60 over four of six is', () => {
  const thin = { process: 'thin', score: 100, ruleCount: 6, evaluatedCount: 1, coveragePct: 100 };
  const deep = { process: 'deep', score: 60, ruleCount: 6, evaluatedCount: 4, coveragePct: 80 };
  const low = { process: 'low', score: W3_MIN_DFM_SCORE - 1, ruleCount: 6, evaluatedCount: 6 };
  const unscored = { process: 'unscored', score: null, ruleCount: 6, evaluatedCount: 0 };
  const edge = { process: 'edge', score: W3_MIN_DFM_SCORE, ruleCount: 5, evaluatedCount: 2 };   // 40% exactly
  assert.equal(W3_MIN_RULE_DEPTH_PCT, 40);
  assert.deepEqual(defensibleRoutes([thin, deep, low, unscored, edge]).map(r => r.process), ['deep', 'edge']);
});

// ── 3. CAD-derived mass ─────────────────────────────────────────────────────

test('CAD mass uses the catalogue density and names it', () => {
  const geo = { volume: { cm3: 100 }, weights: { plasticKg: 0.105 } };
  const pom = Object.keys(MATERIALS).find(k => /POM|Acetal/i.test(k));
  assert.ok(pom, 'catalogue has POM');
  const m = cadMass(geo, pom, MATERIALS);
  assert.equal(m.kg, Math.round(100 * MATERIALS[pom].density * 10) / 10000);
  assert.notEqual(m.kg, 0.105, 'not the flat 1.05 g/cm³ stock plastic');
  assert.match(m.basis, /measured 100\.00 cm³ ×/);
  assert.equal(cadMassKg(geo, pom, MATERIALS), m.kg);
});

test('every catalogue material yields a CAD mass from its own density', () => {
  const geo = { volume: { cm3: 10 } };
  for (const [key, mat] of Object.entries(MATERIALS)) {
    if (!(mat.density > 0)) continue;
    const m = cadMass(geo, key, MATERIALS);
    assert.ok(m && m.kg > 0, key);
    assert.match(m.basis, /cm³ ×/, key);
  }
});

test('without a catalogue it falls back to the stock weight, and says so; without volume it is null', () => {
  const m = cadMass({ volume: { cm3: 100 }, weights: { steelKg: 0.785 } }, 'Steel (mild)');
  assert.equal(m.kg, 0.785);
  assert.match(m.basis, /stock steel density/);
  assert.equal(cadMass({}, 'Steel (mild)', MATERIALS), null);
});
