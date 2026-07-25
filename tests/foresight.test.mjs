// BrainSpark Horizon — deterministic foresight cores + register integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTER_VINTAGE, horizonWindows, sCurvePhase, horizonFor,
  bassAdoption, bassTimeFor, projectAdoption,
  wrightCostIndex, TREND_LEARNING, costOutlook,
  momentumScore, confidenceTier, resolveParts, foresightFor,
} from '../foresight.mjs';
import { FORESIGHT_REGISTER, REG_ANCHORS, MIN_PER_COMMODITY } from '../src/data/tech-foresight-register.mjs';
import { COMMODITY_KEYS } from '../src/data/commodity-classify.mjs';

// ── Register integrity — the curation rules, enforced ────────────────────────

test('register: ids are unique and kebab-case', () => {
  const ids = FORESIGHT_REGISTER.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9][a-z0-9-]*$/, id);
});

test('register: every entry is structurally valid', () => {
  const anchorIds = new Set(REG_ANCHORS.map((a) => a.id));
  const powertrains = new Set(['ICE', 'MHEV', 'PHEV', 'BEV']);
  const trends = new Set(['falling-fast', 'falling', 'flat', 'rising']);
  const drivers = new Set(['cost', 'regulation', 'performance', 'weight', 'software', 'sustainability']);
  for (const t of FORESIGHT_REGISTER) {
    assert.ok(COMMODITY_KEYS.includes(t.commodity), `${t.id}: bad commodity ${t.commodity}`);
    assert.ok(Number.isInteger(t.trl) && t.trl >= 1 && t.trl <= 9, `${t.id}: trl ${t.trl}`);
    assert.ok(t.adoptionPct >= 0 && t.adoptionPct <= 100, `${t.id}: adoptionPct`);
    assert.ok(t.powertrains.length >= 1 && t.powertrains.every((p) => powertrains.has(p)), `${t.id}: powertrains`);
    assert.ok(trends.has(t.costTrend), `${t.id}: costTrend`);
    assert.ok(t.drivers.length >= 1 && t.drivers.every((d) => drivers.has(d)), `${t.id}: drivers`);
    assert.ok(t.matchTerms.length >= 1, `${t.id}: matchTerms empty`);
    for (const term of t.matchTerms) assert.equal(term, term.toLowerCase(), `${t.id}: matchTerm not lowercase`);
    assert.ok(t.players.length >= 1, `${t.id}: players empty`);
    assert.ok(t.name && t.replaces && t.note, `${t.id}: missing prose fields`);
    if (t.regAnchor) assert.ok(anchorIds.has(t.regAnchor), `${t.id}: unknown regAnchor ${t.regAnchor}`);
  }
});

test('register: reg anchors are unique, dated and cover every referenced id', () => {
  const ids = REG_ANCHORS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of REG_ANCHORS) {
    assert.ok(a.year >= 2024 && a.year <= 2040, `${a.id}: implausible year ${a.year}`);
    assert.ok(a.name && a.region && a.effect, `${a.id}: missing fields`);
  }
});

test('register: every commodity has at least MIN_PER_COMMODITY entries', () => {
  const byCommodity = {};
  for (const t of FORESIGHT_REGISTER) byCommodity[t.commodity] = (byCommodity[t.commodity] ?? 0) + 1;
  for (const key of COMMODITY_KEYS) {
    assert.ok((byCommodity[key] ?? 0) >= MIN_PER_COMMODITY, `${key}: only ${byCommodity[key] ?? 0} entries`);
  }
});

test('register: honesty rules — committed claims need evidence, speculative stay low-adoption', () => {
  for (const t of FORESIGHT_REGISTER) {
    // High adoption claims must carry production evidence or a forcing regulation.
    if (t.adoptionPct >= 15) assert.ok(t.firstProduction || t.regAnchor, `${t.id}: ${t.adoptionPct}% adoption with no evidence`);
    // A tech that isn't production-ready cannot claim meaningful adoption.
    if (t.trl <= 5) assert.ok(t.adoptionPct <= 1, `${t.id}: trl ${t.trl} but ${t.adoptionPct}% adoption`);
  }
});

// ── S-curve + horizons ───────────────────────────────────────────────────────

test('sCurvePhase maps maturity to phases', () => {
  assert.equal(sCurvePhase(3, 0), 'research');
  assert.equal(sCurvePhase(5, 0), 'demonstration');
  assert.equal(sCurvePhase(8, 3), 'takeoff');
  assert.equal(sCurvePhase(9, 20), 'growth');
  assert.equal(sCurvePhase(9, 60), 'mainstream');
});

test('horizonWindows spans H1 now–2027 / H2 2028–2031 / H3 2032+ at vintage 2025', () => {
  const w = horizonWindows(2025);
  assert.equal(w.H1.to, 2027);
  assert.equal(w.H2.from, 2028);
  assert.equal(w.H2.to, 2031);
  assert.equal(w.H3.from, 2032);
  assert.equal(w.H3.to, null);
});

test('horizonFor: maturity sets the base bucket', () => {
  assert.deepEqual(horizonFor(9, 20), { horizon: 'H1', regPulled: false });
  assert.deepEqual(horizonFor(6, 1), { horizon: 'H2', regPulled: false });
  assert.deepEqual(horizonFor(4, 0), { horizon: 'H3', regPulled: false });
});

test('horizonFor: a near-term regulation pulls at most one horizon earlier', () => {
  // TRL 6 (base H2) + regulation biting 2027 (H1 window) → pulled into H1.
  assert.deepEqual(horizonFor(6, 1, 2027, 2025), { horizon: 'H1', regPulled: true });
  // TRL 4 (base H3) + 2027 regulation → only pulled to H2, never two steps.
  assert.deepEqual(horizonFor(4, 0, 2027, 2025), { horizon: 'H2', regPulled: true });
  // Regulation biting later than the base bucket does not pull.
  assert.deepEqual(horizonFor(9, 20, 2035, 2025), { horizon: 'H1', regPulled: false });
});

// ── Bass diffusion ───────────────────────────────────────────────────────────

test('bassAdoption is 0 at launch, monotonic, and saturates below 1', () => {
  assert.equal(bassAdoption(0), 0);
  let prev = 0;
  for (let t = 1; t <= 30; t++) {
    const f = bassAdoption(t);
    assert.ok(f > prev, `t=${t} not monotonic`);
    prev = f;
  }
  assert.ok(prev > 0.99 && prev < 1);
});

test('bassTimeFor inverts bassAdoption', () => {
  for (const F of [0.05, 0.2, 0.5, 0.8]) {
    const t = bassTimeFor(F);
    assert.ok(Math.abs(bassAdoption(t) - F) < 1e-9, `F=${F}`);
  }
});

test('projectAdoption grows from the curated share and clamps at the ceiling', () => {
  const in5 = projectAdoption(10, 5);
  assert.ok(in5 > 10 && in5 <= 90, `in5=${in5}`);
  assert.ok(projectAdoption(10, 8) > in5);
  assert.equal(projectAdoption(88, 40), 90);   // saturation, never 100
  assert.ok(projectAdoption(0, 5) > 0);        // 0% seeds rather than dividing by zero
});

// ── Wright's law ─────────────────────────────────────────────────────────────

test('wrightCostIndex: one doubling at 20% learning costs 0.80', () => {
  assert.equal(wrightCostIndex(2, 0.2), 0.8);
  assert.equal(wrightCostIndex(4, 0.2), 0.64);
  assert.equal(wrightCostIndex(1, 0.2), 1);          // no growth → no learning
  assert.ok(wrightCostIndex(4, -0.05) > 1);          // rising trend → index above 1
});

test('costOutlook: falling trends produce sub-1 indices, rising above 1', () => {
  const falling = { adoptionPct: 5, costTrend: 'falling-fast' };
  const rising = { adoptionPct: 5, costTrend: 'rising' };
  assert.ok(costOutlook(falling, 5) < 1);
  assert.ok(costOutlook(rising, 5) >= 1);
  assert.ok(TREND_LEARNING['falling-fast'] > TREND_LEARNING.falling);
});

// ── Momentum + confidence ────────────────────────────────────────────────────

test('momentumScore is bounded 0–100 and rewards maturity, trend and evidence', () => {
  for (const t of FORESIGHT_REGISTER) {
    const m = momentumScore(t);
    assert.ok(m >= 0 && m <= 100, `${t.id}: ${m}`);
  }
  const hot = momentumScore({ trl: 9, adoptionPct: 40, costTrend: 'falling-fast', drivers: ['cost', 'weight'], firstProduction: 'x', regAnchor: null });
  const cold = momentumScore({ trl: 3, adoptionPct: 0, costTrend: 'rising', drivers: ['performance'], firstProduction: null, regAnchor: null });
  assert.ok(hot > cold + 40);
});

test('confidenceTier follows the honesty rules', () => {
  assert.equal(confidenceTier({ regAnchor: 'euro7', firstProduction: null, trl: 5 }), 'committed');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: 'Tesla (2020)', trl: 6 }), 'committed');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: null, trl: 8 }), 'probable');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: null, trl: 5 }), 'speculative');
});

// ── Part resolution + assembler ──────────────────────────────────────────────

test('resolveParts matches the phrases a cost engineer actually types', () => {
  const stator = resolveParts('EDU stator assembly');
  assert.ok(stator.length > 0);
  assert.equal(stator[0].tech.id, 'hairpin-xpin');

  const battery = resolveParts('BEV HV battery pack');
  assert.ok(battery.some((m) => m.tech.id === 'ctp-ctb'));
  assert.ok(battery.some((m) => m.tech.id === '800v-pack'));

  assert.deepEqual(resolveParts(''), []);
  assert.deepEqual(resolveParts('completely unrelated zzz'), []);
});

test('foresightFor: commodity + powertrain filters and horizon lanes', () => {
  const r = foresightFor({ commodity: 'Battery', powertrain: 'BEV' });
  assert.equal(r.commodity, 'Battery');
  assert.ok(r.count >= MIN_PER_COMMODITY);
  const all = [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];
  assert.equal(all.length, r.count);
  for (const c of all) {
    assert.equal(c.commodity, 'Battery');
    assert.ok(c.powertrains.includes('BEV'));
    assert.ok(['committed', 'probable', 'speculative'].includes(c.confidence));
    assert.ok(c.projection.adoption.in5 >= c.adoptionPct);
    assert.ok(c.projection.basis.includes('modelled'));
  }
  // Lanes are sorted by momentum descending.
  for (const lane of ['H1', 'H2', 'H3']) {
    const ms = r.horizons[lane].map((c) => c.momentum);
    assert.deepEqual(ms, [...ms].sort((a, b) => b - a));
  }
  // Referenced anchors are returned with details.
  for (const a of r.anchors) assert.ok(REG_ANCHORS.some((x) => x.id === a.id));
});

test('foresightFor: free-text query resolves via matchTerms, falls back to the commodity classifier', () => {
  const q = foresightFor({ query: 'inverter' });
  assert.ok(q.matchedByTerms);
  assert.ok([...q.horizons.H1, ...q.horizons.H2, ...q.horizons.H3].some((c) => c.id === 'sic-mainstream'));

  // No matchTerm hit, but the classifier knows where a "wishbone" lives.
  const fb = foresightFor({ query: 'front lower wishbone' });
  assert.equal(fb.matchedByTerms, false);
  assert.equal(fb.commodity, 'Chassis');
  assert.ok(fb.count >= MIN_PER_COMMODITY);
});

test('foresightFor: deterministic — same inputs, same output', () => {
  const a = foresightFor({ query: 'battery pack', powertrain: 'BEV' });
  const b = foresightFor({ query: 'battery pack', powertrain: 'BEV' });
  assert.deepEqual(a, b);
});
