// Analyze review, 29 Sept 2026 — defects found by re-running the deterministic
// stages over the 127 saved live ideas (benchmark/prism-runs*), pinned as
// behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAnnualValueMid, rankIdeas } from '../idea-quality.mjs';
import { parseMoney } from '../src/services/report-core.mjs';
import { parseMoneyRange } from '../idea-arith.mjs';
import { resolveRoute, resolveProcess } from '../material-process-resolve.mjs';
import { PROCESS_ALIASES, PROCESS_STAND_INS } from '../material-aliases.mjs';
import { runEngineChecks } from '../engine-idea-check.mjs';
import { PROCESSES } from '../costing-engine.mjs';

// ── The annual-value reader ─────────────────────────────────────────────────

test('the value reader takes the first money figure, not every number in the string', () => {
  // Was 5,200,000: €0.4M averaged with the 10,000,000 volume after "ex-works".
  assert.equal(parseAnnualValueMid('€0.4M ex-works at 10,000,000 units/yr, less logistics'), 400000);
  assert.equal(parseAnnualValueMid('€6K–€11K at 60,000 units/yr'), 8500);
  assert.equal(parseAnnualValueMid('£350K–£650K at 80,000 units/yr'), 500000);
  assert.equal(parseAnnualValueMid('€3-5M'), 4000000);
  assert.equal(parseAnnualValueMid('350K–650K'), 500000);
  assert.equal(parseAnnualValueMid('€12,600'), 12600);
  assert.equal(parseAnnualValueMid(''), 0);
  assert.equal(parseAnnualValueMid('80,000 units only'), 0);
});

test('a minus before the currency is a sign; a cost-neutral claim is never NaN', () => {
  assert.equal(parseAnnualValueMid('Net −€0.6M–€1.2M part cost; offset by range/thermal value'), -900000);
  const n = parseAnnualValueMid('Approx. cost-neutral at part level (~€0 to -€0.3M at 10M/yr)');
  assert.ok(Number.isFinite(n) && n <= 0);
  assert.deepEqual(parseMoneyRange('Net −€0.6M–€1.2M part cost'), { lo: -1200000, hi: -600000, mid: -900000 });
});

test('the export reader and the ranking reader agree on every shape', () => {
  for (const v of ['€0.4M ex-works at 10,000,000 units/yr', 'Net −€0.6M–€1.2M', '€40K-€90K net at 60,000 units/yr', '350K–650K', '€3-5M', 'n/a']) {
    assert.equal(parseMoney(v), parseAnnualValueMid(v), v);
  }
});

// ── Ranking ─────────────────────────────────────────────────────────────────

const idea = (title, annualValue, extra = {}) => ({ title, qualityScore: 70, costSavingPotential: { annualValue }, ...extra });

test('an idea whose own basis multiplies out to less than its claim ranks on the basis', () => {
  // Live lamination run: claimed €1.7–2.9M, basis €115,400 — it was #2.
  const inflated = idea('Backlack', '€1.7M–€2.9M at 10,000,000 units/yr',
    { arithmetic: { status: 'mismatch', computedEur: 115400, deltaPct: -93 } });
  const honest = idea('Nesting', '€400K–€500K at 10,000,000 units/yr', { arithmetic: { status: 'consistent', computedEur: 450000, deltaPct: 0 } });
  const filler = [1, 2, 3].map(k => idea(`f${k}`, '€200K–€300K at 10,000,000 units/yr'));
  rankIdeas([inflated, honest, ...filler]);
  assert.ok(honest.rank.score > inflated.rank.score);
  assert.match(inflated.rank.basis, /ranked on its own basis €115K, not the claimed €2\.3M/);
});

test('an overshoot keeps the (lower) claim; a cost increase ranks below every saving', () => {
  const over = idea('Over', '€100K', { arithmetic: { status: 'mismatch', computedEur: 300000, deltaPct: 200 } });
  const cost = idea('Cost', 'Net −€0.6M–€1.2M part cost');
  const none = idea('None', '');
  rankIdeas([over, cost, none]);
  assert.doesNotMatch(over.rank.basis, /ranked on its own basis/);
  assert.ok(cost.rank.score < none.rank.score, 'a stated cost increase sorts below an idea with no value at all');
  assert.match(cost.rank.basis, /net cost INCREASE/);
});

// ── The process resolver ────────────────────────────────────────────────────

test('the catalogue\'s own process names resolve, including the ones containing "+"', () => {
  for (const key of Object.keys(PROCESSES)) {
    const r = resolveRoute(key, PROCESSES);
    assert.deepEqual(r?.keys, [key], key);
    assert.equal(r.approx, false, key);
  }
  // A real chain still splits.
  assert.deepEqual(resolveRoute('HPDC + CNC + e-coat', PROCESSES).keys,
    ['Die Casting (Aluminium)', 'Machining (CNC)', 'E-coat (KTL)']);
});

test('stand-ins are real aliases, and are flagged as stand-ins; synonyms are not', () => {
  for (const [key, list] of Object.entries(PROCESS_STAND_INS)) {
    for (const a of list) assert.ok(PROCESS_ALIASES[key]?.includes(a), `${a} is not an alias of ${key}`);
  }
  assert.equal(resolveProcess('clinching', PROCESSES).standIn, 'clinching');
  assert.equal(resolveProcess('self-piercing rivet', PROCESSES).key, 'MIG Welding Assembly');
  assert.equal(resolveProcess('HPDC', PROCESSES).standIn, undefined);
  assert.equal(resolveProcess('Croning', PROCESSES).key, 'Shell Mould Casting');
});

test('an engine comparison whose changed step is a stand-in declines instead of answering a different question', () => {
  const ideas = [
    { title: 'SPR replaces spot welds', engineCheckRequest: { baselineMaterial: 'Steel (mild)', baselineProcess: 'Resistance Spot Welding', proposedProcess: 'self-piercing rivet', referenceWeightKg: 0.5 } },
    { title: 'Bonding replaces MIG', engineCheckRequest: { baselineMaterial: 'Steel (mild)', baselineProcess: 'MIG welding', proposedProcess: 'adhesive bonding', referenceWeightKg: 0.5 } },
    // Unchanged stand-in on both sides: the material move is still checkable.
    { title: 'DP600 in a clinched assembly', engineCheckRequest: { baselineMaterial: 'Steel (mild)', proposedMaterial: 'Steel (high-strength)', baselineProcess: 'Stamping + clinching', proposedProcess: 'Stamping + clinching', referenceWeightKg: 0.5, proposedWeightKg: 0.4 } },
    { title: 'Laser cut and bend', engineCheckRequest: { baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing', proposedProcess: 'Laser Cutting + Bending', referenceWeightKg: 0.21 } },
  ];
  runEngineChecks(ideas, { annualVolume: 60000 });
  assert.equal(ideas[0].engineCheck, null);
  assert.match(ideas[0].engineCheckReason, /"self-piercing rivet" is priced on the MIG Welding Assembly model/);
  assert.equal(ideas[1].engineCheck, null);
  assert.match(ideas[1].engineCheckReason, /adhesive bonding/);
  assert.ok(ideas[2].engineCheck, ideas[2].engineCheckReason);
  assert.ok(ideas[3].engineCheck, ideas[3].engineCheckReason);
  assert.match(ideas[3].engineCheck.referenceCase, /via Laser Cutting \+ Bending/);
});
