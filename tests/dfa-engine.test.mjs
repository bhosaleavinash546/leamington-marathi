// DFA engine and time-model tests.
//
// The properties worth protecting are the honest ones: the design-efficiency
// index must be WITHHELD until a human has answered the three questions, an
// unmeasured symmetry must not become an orientation penalty, and a suspected
// fastener must never be asserted as fact. Everything else is arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TIME_MODEL, handlingTime, insertionTime, partTime } from '../dfa-time-model.mjs';
import { analyseDfa, looksLikeFastener, proposeNecessity } from '../dfa-engine.mjs';

/** Shaped like cad-engine/assembly_decompose.py output. */
const DECOMP = {
  status: 'success',
  solidCount: 3,
  distinctPartTypes: 2,
  parts: [
    {
      index: 0, name: 'bracket', volumeMm3: 40000, maxDimMm: 80, midDimMm: 50, minDimMm: 10,
      principalMoments: [8666666.7, 21666666.7, 29666666.7],
      signature: 'plate-sig',
      symmetry: { alphaDeg: 180, betaDeg: 180, totalDeg: 360, continuous: false, order: 2 },
    },
    {
      index: 1, name: 'pin-a', volumeMm3: 1256.64, maxDimMm: 25, midDimMm: 8, minDimMm: 8,
      principalMoments: [10053.1, 70476.4, 70476.4],
      signature: 'pin-sig',
      symmetry: { alphaDeg: 180, betaDeg: 0, totalDeg: 180, continuous: true, order: null },
    },
    {
      index: 2, name: 'pin-b', volumeMm3: 1256.64, maxDimMm: 25, midDimMm: 8, minDimMm: 8,
      principalMoments: [10053.1, 70476.4, 70476.4],
      signature: 'pin-sig',
      symmetry: { alphaDeg: 180, betaDeg: 0, totalDeg: 180, continuous: true, order: null },
    },
  ],
  instanceGroups: [
    { signature: 'pin-sig', count: 2, partIndices: [1, 2], representative: 1, name: 'pin-a' },
    { signature: 'plate-sig', count: 1, partIndices: [0], representative: 0, name: 'bracket' },
  ],
  contacts: [[0, 1], [0, 2]],
};

const ALL_ANSWERED = {
  0: { moves: false, differentMaterial: false, mustSeparate: true },
  1: { moves: false, differentMaterial: false, mustSeparate: false },
  2: { moves: false, differentMaterial: false, mustSeparate: false },
};

// ── Time model ───────────────────────────────────────────────────────────────

test('the time model declares its provenance and is not Boothroyd tables', () => {
  assert.match(TIME_MODEL.basis, /NOT Boothroyd/i);
  assert.ok(TIME_MODEL.version);
});

test('a symmetric body of revolution carries no orientation penalty', () => {
  const h = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 25, minDimMm: 8 });
  assert.equal(h.sec, TIME_MODEL.baseHandlingSec);
});

test('an asymmetric part costs more to orient than a symmetric one', () => {
  const sym = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 50, minDimMm: 20 });
  const asym = handlingTime({ symmetry: { totalDeg: 720 }, maxDimMm: 50, minDimMm: 20 });
  assert.ok(asym.sec > sym.sec, `${asym.sec} should exceed ${sym.sec}`);
});

test('unmeasured symmetry applies NO penalty and says so', () => {
  const h = handlingTime({ maxDimMm: 50, minDimMm: 20 });
  const note = h.reasons.find(r => r.factor === 'orientation');
  assert.equal(note.sec, 0);
  assert.match(note.note, /not measured/);
});

test('tiny parts and very large parts both cost more to handle', () => {
  const tiny = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 4, minDimMm: 4 });
  const ok = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 100, minDimMm: 40 });
  const huge = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 900, minDimMm: 200 });
  assert.ok(tiny.sec > ok.sec);
  assert.ok(huge.sec > ok.sec);
});

test('a heavy part triggers the two-person / hoist flag', () => {
  const h = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 400, minDimMm: 100, massKg: 22 });
  assert.equal(h.needsHoist, true);
  assert.ok(h.sec > TIME_MODEL.hoistAddSec);
});

test('a thin part is harder to pick up', () => {
  const thin = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 60, minDimMm: 1.0 });
  const thick = handlingTime({ symmetry: { totalDeg: 180 }, maxDimMm: 60, minDimMm: 12 });
  assert.ok(thin.sec > thick.sec);
});

test('securing operations dominate insertion time, screws over snap fits', () => {
  const snap = insertionTime({ securing: 'snapFit' });
  const screw = insertionTime({ securing: 'screw' });
  const none = insertionTime({ securing: 'none' });
  assert.ok(screw.sec > snap.sec && snap.sec > none.sec);
});

test('insertion difficulty flags only apply when set', () => {
  const clean = insertionTime({});
  const awkward = insertionTime({ insertionFlags: { notSelfLocating: true, restrictedAccess: true } });
  assert.equal(clean.sec, TIME_MODEL.baseInsertionSec);
  assert.ok(awkward.sec > clean.sec);
});

test('calibration scales the model without touching its reasons', () => {
  const base = partTime({ symmetry: { totalDeg: 180 }, maxDimMm: 30, minDimMm: 8 }, TIME_MODEL, 1);
  const cal = partTime({ symmetry: { totalDeg: 180 }, maxDimMm: 30, minDimMm: 8 }, TIME_MODEL, 1.5);
  assert.ok(Math.abs(cal.totalSec - base.totalSec * 1.5) < 0.02);
  assert.equal(cal.calibration, 1.5);
});

// ── Fastener detection and the three questions ───────────────────────────────

test('a repeated small body of revolution reads as a probable fastener', () => {
  const f = looksLikeFastener(DECOMP.parts[1], 2);
  assert.equal(f.isFastener, true);
  assert.ok(['low', 'medium'].includes(f.confidence));
  assert.match(f.note, /confirm against the BOM/i);
});

test('a one-off plate does not read as a fastener', () => {
  assert.equal(looksLikeFastener(DECOMP.parts[0], 1).isFastener, false);
});

test('geometry PROPOSES the three answers and never asserts them', () => {
  const props = proposeNecessity(DECOMP.parts[1], { contactCount: 1, groupSize: 2 });
  assert.equal(props.length, 3);
  const moves = props.find(p => p.question === 'moves');
  assert.equal(moves.proposed, null, 'motion is not visible in a static model');
  const mat = props.find(p => p.question === 'differentMaterial');
  assert.equal(mat.proposed, null);
  for (const p of props) assert.ok(p.reason.length > 20, `${p.question} must explain itself`);
});

// ── Full analysis ────────────────────────────────────────────────────────────

test('the design-efficiency index is WITHHELD until the questions are answered', () => {
  const r = analyseDfa(DECOMP, { density: 7.85 });
  assert.equal(r.designEfficiencyPct, null);
  assert.equal(r.theoreticalMinParts, null);
  assert.equal(r.completeness.indexAvailable, false);
  assert.equal(r.completeness.unanswered, 3);
  assert.match(r.completeness.note, /withheld/);
  // The geometric half still stands on its own.
  assert.ok(r.totalAssemblyTimeSec > 0);
});

test('once answered, the index is computed and the arithmetic checks out', () => {
  const r = analyseDfa(DECOMP, { density: 7.85, answers: ALL_ANSWERED });
  assert.equal(r.theoreticalMinParts, 1);
  assert.equal(r.completeness.indexAvailable, true);
  const expected = Math.round((1 * TIME_MODEL.idealPartSec) / r.totalAssemblyTimeSec * 1000) / 10;
  assert.equal(r.designEfficiencyPct, expected);
  assert.deepEqual(r.consolidationCandidates.map(c => c.index), [1, 2]);
});

test('a partially answered assembly still withholds the index', () => {
  const r = analyseDfa(DECOMP, { density: 7.85, answers: { 0: ALL_ANSWERED[0] } });
  assert.equal(r.designEfficiencyPct, null);
  assert.equal(r.completeness.unanswered, 2);
  assert.deepEqual(r.completeness.unansweredParts.map(p => p.index), [1, 2]);
});

test('assembly cost is only reported when a labour rate is supplied', () => {
  assert.equal(analyseDfa(DECOMP, { density: 7.85 }).assemblyCostEur, null);
  const r = analyseDfa(DECOMP, { density: 7.85, labourRateEurPerHr: 42 });
  assert.ok(r.assemblyCostEur > 0);
  assert.equal(r.assemblyCostEur, Math.round((r.totalAssemblyTimeSec / 3600) * 42 * 100) / 100);
});

test('screws lengthen the assembly and worsen the index', () => {
  const plain = analyseDfa(DECOMP, { density: 7.85, answers: ALL_ANSWERED });
  const screwed = analyseDfa(DECOMP, {
    density: 7.85, answers: ALL_ANSWERED, securingByIndex: { 1: 'screw', 2: 'screw' },
  });
  assert.ok(screwed.totalAssemblyTimeSec > plain.totalAssemblyTimeSec);
  assert.ok(screwed.designEfficiencyPct < plain.designEfficiencyPct);
});

test('instance grouping is carried through to the rows', () => {
  const r = analyseDfa(DECOMP, { density: 7.85 });
  assert.equal(r.rows[1].groupSize, 2);
  assert.equal(r.rows[0].groupSize, 1);
  assert.equal(r.distinctPartTypes, 2);
});

test('a failed decomposition is rejected rather than analysed', () => {
  assert.throws(() => analyseDfa({ status: 'error', error: 'nope' }), /successful assembly decomposition/);
  assert.throws(() => analyseDfa(null), /successful assembly decomposition/);
});

test('a part that failed to measure is carried as skipped, not silently dropped', () => {
  const withBad = {
    ...DECOMP,
    parts: [...DECOMP.parts, { index: 3, name: 'broken', error: 'boolean failed' }],
  };
  const r = analyseDfa(withBad, { density: 7.85 });
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[3].skipped, true);
  assert.equal(r.totalParts, 3, 'a part that could not be measured must not be timed');
});

// An assumed density is not a measurement. It drives handling time and so the
// assembly cost, and it used to reach the report indistinguishable from a mass
// derived from a material the user actually stated.
test('dfa: a substituted density is stamped, not silent', () => {
  const decomposition = {
    status: 'success',
    distinctPartTypes: 1,
    parts: [
      { index: 0, name: 'housing', volumeMm3: 120000, maxDimMm: 90, minDimMm: 20, symmetry: 1 },
      { index: 1, name: 'cover', volumeMm3: 40000, maxDimMm: 60, minDimMm: 10, symmetry: 2 },
    ],
  };
  // No material given at all.
  const assumed = analyseDfa(decomposition, {});
  assert.equal(assumed.massAssumptions.assumedParts, 2);
  assert.equal(assumed.massAssumptions.statedParts, 0);
  assert.match(assumed.massAssumptions.note, /assumes steel/);
  for (const r of assumed.rows) {
    assert.equal(r.densityAssumed, true, `${r.name} must admit its mass was assumed`);
    assert.match(r.massBasis, /no material was given/);
  }

  // Density supplied for one part only — the split must be reported honestly.
  const mixed = analyseDfa(decomposition, { densityByIndex: { 0: 2.7 } });
  assert.equal(mixed.massAssumptions.assumedParts, 1);
  assert.equal(mixed.massAssumptions.statedParts, 1);
  assert.equal(mixed.rows[0].densityAssumed, false);
  assert.equal(mixed.rows[0].density, 2.7);
  assert.match(mixed.rows[0].massBasis, /supplied density/);
  // Aluminium is ~1/3 the density of steel, so the assumption was not harmless.
  assert.ok(mixed.rows[0].massKg < assumed.rows[0].massKg / 2);
});
