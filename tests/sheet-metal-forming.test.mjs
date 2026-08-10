// Sheet-metal forming physics from Boljanovic, "Sheet Metal Forming Processes
// and Die Design".
//
// The truths here come from the book's own tables and from algebra on its
// equations — NOT from running the code and recording what it said. Where the
// book prints a worked example whose arithmetic does not follow from its own
// equation (the springback example on p.85 computes 0.915*(8+1)-1 and prints
// 5.405, which is 7.235), the identity is tested instead of the printed number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEND_COEFFICIENT_C, minBendRadiusMm, maxBendRadiusMm,
  kFactor, bendAllowanceMm, springback, springbackFromTable,
  minPunchedHoleMm, blankingForceKN, bendingForceKN, pressClass,
  drawStages, stripLayout, sheetPropertiesFor, PUNCH_PERMISSIBLE_STRESS_MPA,
} from '../sheet-metal-forming.mjs';

// ── Bend radius: Table 5.2 ─────────────────────────────────────────────────
test('the bend coefficient is material AND temper, not one number', () => {
  // The whole point. Our old rule said 1.0 r/t for everything; the table spans
  // 0.0 to 6.0, so one number is wrong at both ends.
  assert.equal(BEND_COEFFICIENT_C.aluminium.soft, 0.0);
  assert.equal(BEND_COEFFICIENT_C['aluminium-2000'].hard, 6.0);
  assert.equal(BEND_COEFFICIENT_C['low-carbon-steel'].soft, 0.5);
  assert.equal(BEND_COEFFICIENT_C['low-carbon-steel'].hard, 3.0);
});

test('minimum bend radius is c*T, with the band published beside it', () => {
  const r = minBendRadiusMm('Steel (mild)', 2.0, 'hard');
  assert.equal(r.ok, true);
  assert.equal(r.minRadiusMm, 6.0);                 // c = 3.0, T = 2
  assert.deepEqual(r.bandMm, [1.0, 6.0]);           // 0.5*T .. 3.0*T
  assert.match(r.basis, /Table 5\.2/);
});

test('an unknown temper is judged at the ANNEALED limit, and says so', () => {
  // Chosen so a FINDING is certain: a part failing the annealed figure fails in
  // every condition. A pass is qualified, and the basis line carries the
  // qualification rather than a footnote nobody reads.
  const r = minBendRadiusMm('Steel (mild)', 2.0);
  assert.equal(r.minRadiusMm, 1.0);                 // c = 0.5 soft
  assert.equal(r.temper, 'assumed annealed');
  assert.match(r.basis, /ANNEALED/);
  assert.match(r.basis, /fails in\s+any condition/);
});

test('a material with no properties on file ABSTAINS with the reason', () => {
  const r = minBendRadiusMm('Unobtanium', 2.0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no sheet-metal properties on file/);
  assert.equal(sheetPropertiesFor(null).known, false);
});

test('maximum bend radius exists and is T*E/(2*YS)', () => {
  // The check nobody makes: a gentler bend than this never yields, so the part
  // springs back flat.
  const r = maxBendRadiusMm('Steel (mild)', 1.0);
  assert.equal(r.ok, true);
  assert.equal(r.maxRadiusMm, 420);                 // 1*210000/(2*250)
});

// ── Bend allowance: Table 5.3 ──────────────────────────────────────────────
test('the K-factor is a CURVE, not the folklore 0.33 or 0.5', () => {
  assert.equal(kFactor(0.1), 0.23);
  assert.equal(kFactor(1.0), 0.41);
  assert.equal(kFactor(10.0), 0.50);
  // Interpolated between 0.5 -> 0.37 and 0.8 -> 0.40.
  assert.ok(Math.abs(kFactor(0.65) - 0.385) < 0.001);
});

test('the K-factor is clamped at both ends, never extrapolated', () => {
  assert.equal(kFactor(0.01), 0.23);
  assert.equal(kFactor(500), 0.50);
  assert.equal(kFactor(0), null);
  assert.equal(kFactor(-1), null);
});

test('bend allowance follows Eq. 5.19', () => {
  // R/T = 1 -> K = 0.41. L = 0.017453 * 90 * (0.41*2 + 2) = 4.4288...
  const l = bendAllowanceMm(2, 2, 90);
  assert.ok(Math.abs(l - 4.429) < 0.002, `got ${l}`);
});

test('bend allowance abstains rather than guessing a missing input', () => {
  assert.equal(bendAllowanceMm(2, 0, 90), null);
  assert.equal(bendAllowanceMm(2, 2, 0), null);
  assert.equal(bendAllowanceMm(null, 2, 90), null);
});

// ── Springback: Eq. 5.21/5.22 and Table 5.4 ────────────────────────────────
test('springback is computed from YS/E, so strong steel springs back more', () => {
  const mild = springback('Steel (mild)', 5, 1.5, 90);
  const dp980 = springback('Steel DP980 (dual-phase)', 5, 1.5, 90);
  assert.equal(mild.ok, true);
  assert.equal(dp980.ok, true);
  // Same geometry, 2.8x the yield: markedly more recovery.
  assert.ok(dp980.springbackFactor < mild.springbackFactor,
    `${dp980.springbackFactor} should be below ${mild.springbackFactor}`);
  assert.ok(dp980.overbendDeg > mild.overbendDeg);
});

test('the springback factor is consistent with its own definition (Eq. 5.21)', () => {
  // Ks = (2Ri/T + 1)/(2Rf/T + 1). The book's printed worked example does not
  // satisfy this, so the IDENTITY is what gets tested.
  const s = springback('Aluminium 7075', 6, 2, 90);
  const recomputed = (2 * (6 / 2) + 1) / (2 * (s.finalRadiusMm / 2) + 1);
  // 1e-3, not 1e-6: both published figures are rounded for display (the factor
  // to 4 dp, the radius to 3), so recomputing one from the other cannot agree
  // to more than the coarser of the two. Testing tighter than the numbers are
  // printed tests the rounding, not the physics.
  assert.ok(Math.abs(recomputed - s.springbackFactor) < 1e-3,
    `${recomputed} vs ${s.springbackFactor}`);
});

test('the final radius is always LARGER and the final angle SMALLER', () => {
  // Sec. 5.7: "The final angle after springback is smaller and the final bend
  // radius is larger." A sign error here would tell a die designer to underbend.
  const s = springback('Aluminium 5052 (sheet)', 4, 1.5, 90);
  assert.ok(s.finalRadiusMm > 4);
  assert.ok(s.finalAngleDeg < 90);
  assert.ok(s.overbendDeg > 0);
});

test('an overbend beyond the practical 2-8% band is flagged', () => {
  // Sec. 5.7 gives 2-8% overbend as the practical allowance. Past that, the
  // answer is bottoming or stretch bending, not more overbend.
  const gentle = springback('Steel DP980 (dual-phase)', 40, 1.0, 90);
  assert.equal(gentle.beyondPracticalOverbend, true);
});

test('Table 5.4 is available for cross-checking, and interpolates', () => {
  assert.equal(springbackFromTable('2024-T', 1.0), 0.92);
  assert.equal(springbackFromTable('2024-T', 25.0), 0.35);
  assert.equal(springbackFromTable('7075-T', 4.0), 0.915);
  const mid = springbackFromTable('2024-T', 8.0);
  assert.ok(mid < 0.80 && mid > 0.70);
  assert.equal(springbackFromTable('nope', 4), null);
});

// ── Punching: Sec. 9.3.3 ───────────────────────────────────────────────────
test('the minimum punched hole scales with SHEET strength', () => {
  // d/T = 2.8*UTS/sigma_pd. This is the finding: the flat "d/t >= 1" is safe on
  // mild steel and passes AHSS holes that upset the punch.
  const mild = minPunchedHoleMm('Steel (mild)', 1.0);
  const dp980 = minPunchedHoleMm('Steel DP980 (dual-phase)', 1.0);
  assert.ok(Math.abs(mild.minDiaOverT - (2.8 * 370) / 980) < 0.002);
  assert.ok(Math.abs(dp980.minDiaOverT - (2.8 * 980) / 980) < 0.002);
  assert.ok(mild.minDiaOverT < 1.1, 'mild steel is comfortably under the old flat rule');
  assert.ok(dp980.minDiaOverT > 2.7, 'DP980 needs nearly three times the sheet thickness');
});

test('a better punch material moves the limit, and is an input not a constant', () => {
  const stock = minPunchedHoleMm('Steel DP980 (dual-phase)', 1.0);
  const better = minPunchedHoleMm('Steel DP980 (dual-phase)', 1.0, 1560);
  assert.ok(better.minDiaOverT < stock.minDiaOverT);
  assert.equal(PUNCH_PERMISSIBLE_STRESS_MPA, 980, 'the conservative end of the book range is the default');
});

// ── Forces and press: Eq. 3.1, 4.3, 4.4, 5.7 ───────────────────────────────
test('blanking force is 0.7*L*T*UTS and the PRESS is sized 30% above it', () => {
  const f = blankingForceKN('Steel (mild)', 2.0, 500);
  // 0.7 * 500 * 2 * 370 = 259,000 N = 259 kN
  assert.ok(Math.abs(f.forceKN - 259) < 0.5);
  assert.ok(Math.abs(f.pressForceKN - 336.7) < 0.5);
  assert.match(f.basis, /Eq\. 4\.3/);
});

test('bending force follows Eq. 5.7 with the die opening', () => {
  // F = 0.67*370*100*4/(2+2+2) = 16,533 N = 16.5 kN
  const f = bendingForceKN('Steel (mild)', 2.0, 100, 2, 2);
  assert.ok(Math.abs(f.forceKN - 16.5) < 0.2, `got ${f.forceKN}`);
});

test('the press class is a machine you can buy, not a bare number', () => {
  const c = pressClass(336.7);
  assert.equal(c.requiredTonnes, 34.3);
  assert.equal(c.pressTonnes, 40);
  assert.equal(c.beyondLadder, false);
});

test('a part beyond the largest press says so instead of rounding into the table', () => {
  const c = pressClass(400000);
  assert.equal(c.pressTonnes, null);
  assert.equal(c.beyondLadder, true);
});

// ── Deep drawing: Table 6.2 ────────────────────────────────────────────────
test('draw stages are COUNTED, which is what a single depth ratio cannot do', () => {
  // T_r = 100*1/100 = 1.0% -> band 0.6-1.0. m1 = 0.55 -> 55, m2 = 0.78 -> 42.9,
  // m3 = 0.80 -> 34.3. A 35 mm cup therefore needs three draws.
  const d = drawStages(100, 35, 1.0);
  assert.equal(d.ok, true);
  assert.equal(d.stages, 3);
  assert.equal(d.sequence.length, 3);
  assert.match(d.basis, /Table 6\.2/);
});

test('a shallow cup needs one draw and a deep one needs many', () => {
  assert.equal(drawStages(100, 60, 1.0).stages, 1);
  assert.ok(drawStages(100, 22, 1.0).stages >= 4);
});

test('a cup still too large after five draws is BEYOND the table, not extrapolated', () => {
  const d = drawStages(200, 5, 1.0);
  assert.equal(d.beyondTable, true);
  assert.equal(d.stages, 5);
});

test('material below the table floor abstains rather than being judged', () => {
  const d = drawStages(1000, 100, 0.5);          // T_r = 0.05%, under 0.08
  assert.equal(d.ok, false);
  assert.match(d.reason, /outside the table/);
});

test('a cup no smaller than its blank needs no draw at all', () => {
  assert.equal(drawStages(100, 100, 1).stages, 0);
});

// ── Strip layout: Sec. 4.4 ─────────────────────────────────────────────────
test('utilisation is computed with the book\'s webs and its 70% target', () => {
  // T = 1 mm: m = 1 + 0.015*100 = 2.5 mm, n = 4.3 mm (Table 4.3).
  // strip = 100 + 5 = 105, pitch = 200 + 4.3 = 204.3 -> 20000/21451.5 = 93.2%
  const s = stripLayout(100, 200, 1.0);
  assert.equal(s.ok, true);
  assert.equal(s.edgeWebMm, 2.5);
  assert.equal(s.blankWebMm, 4.3);
  assert.ok(Math.abs(s.utilisationPct - 93.2) < 0.2, `got ${s.utilisationPct}`);
  assert.equal(s.meetsBookTarget, true);
});

test('a small blank on a thick sheet falls under the book target', () => {
  const s = stripLayout(12, 12, 4.0);
  assert.ok(s.utilisationPct < 70);
  assert.equal(s.meetsBookTarget, false);
});

test('thin strip uses the absolute web table, not the formula', () => {
  const s = stripLayout(60, 60, 0.5);
  assert.equal(s.edgeWebMm, 2.0);                 // Table 4.3, strip <= 75 mm
  assert.match(s.basis, /Table 4\.3/);
});

test('the utilisation figure declares itself a LOWER bound', () => {
  // Real nesting rotates and interlocks blanks. Claiming a rectangular envelope
  // is the true utilisation would overstate the waste on every non-rectangular
  // part.
  assert.match(stripLayout(100, 200, 1.0).basis, /LOWER bound/);
});

test('an alloy the book does not cover ABSTAINS instead of borrowing a wrong row', () => {
  // 6000-series is heat-treatable structural aluminium and Table 5.2 has no row
  // for it. Mapping it onto the pure-aluminium row produced a 0-1.2 r/t band
  // against the 3.0 r/t the catalogue already holds for 6061-T6 — the book
  // appearing to contradict a good value when it is simply silent.
  const r = minBendRadiusMm('Aluminium 6061', 2.0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no 6000-series row/);
  // The other formulas still run: they need UTS, YS and E, not a bend group.
  assert.equal(springback('Aluminium 6061', 4, 2, 90).ok, true);
  assert.equal(minPunchedHoleMm('Aluminium 6061', 2).ok, true);
});
