// Horizon review, 28 Sept 2026: each defect found, pinned with truth that is
// computed independently of the code under test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bassAdoption, bassCumulative, bassTimeFor, costOutlook, wrightCostIndex, projectAdoption,
  isPrelaunch, foresightFor, resolveParts, scoreSnapshot, laneFor, PRELAUNCH_BASIS,
} from '../foresight.mjs';
import { inferCommodityKey } from '../src/data/commodity-classify.mjs';

const simpson = (f, a, b, n = 4000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return (s * h) / 3; };
const cards = (r) => [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];

describe('Wright runs on cumulative volume', () => {
  it('the closed-form Bass integral equals numerical integration', () => {
    for (const T of [0.5, 3, 8, 20]) assert.ok(Math.abs(bassCumulative(T) - simpson(bassAdoption, 0, T)) < 1e-6, `T=${T}`);
  });
  it('a 55%-of-90% technology at 12% learning: index from the cumulative doublings, not the share ratio', () => {
    const F0 = 55 / 90, t0 = bassTimeFor(F0);
    const cum0 = Math.max(simpson(bassAdoption, 0, t0), F0);
    const cum8 = cum0 + simpson(bassAdoption, t0, t0 + 8);
    const expected = wrightCostIndex(cum8 / cum0, 0.12);
    assert.equal(costOutlook({ adoptionPct: 55, ceiling: 90, costTrend: 'falling' }, 8), expected);
    assert.ok(expected <= 0.8, `cumulative volume roughly quadruples, so ~two doublings: got ${expected}`);
  });
  it('a saturated technology keeps learning, slowly, and a rising one never gets cheaper', () => {
    const sat = costOutlook({ adoptionPct: 90, ceiling: 90, costTrend: 'falling' }, 8);
    assert.ok(sat < 1 && sat > 0.8, `${sat}`);
    assert.ok(costOutlook({ adoptionPct: 20, ceiling: 90, costTrend: 'rising' }, 8) >= 1);
  });
});

describe('projections', () => {
  it('a technology at its ceiling holds there instead of declining', () => {
    assert.equal(projectAdoption(90, 1, { ceilingPct: 90 }), 90);
    assert.equal(projectAdoption(90, 8, { ceilingPct: 90 }), 90);
  });
  it('+0 years is today, not the seeded share', () => {
    assert.equal(projectAdoption(0, 0), 0);
    assert.equal(projectAdoption(12, 0), 12);
  });
});

describe('pre-launch technologies are not launched today', () => {
  it('0% with no production anywhere is pre-launch; 0% with a named programme is not', () => {
    assert.equal(isPrelaunch(0, null), true);
    assert.equal(isPrelaunch(0, 'none cited'), true);
    assert.equal(isPrelaunch(0, 'Toyota Mirai (2014)'), false);
    assert.equal(isPrelaunch(3, null), false);
    assert.equal(isPrelaunch(0, null, 8), false, 'TRL 8+ with no named programme is a curation gap, not pre-launch');
    assert.equal(isPrelaunch(0, null, 6), true);
  });
  it('a TRL-6 cathode at 0% projects nothing and is laned by maturity', () => {
    const c = cards(foresightFor({ commodity: 'Battery' })).find((x) => x.id === 'lmr-cathode');
    assert.ok(c, 'lmr-cathode present');
    assert.equal(c.projection.prelaunch, true);
    assert.deepEqual([c.projection.adoption.in3, c.projection.adoption.in5, c.projection.adoption.in8], [null, null, null]);
    assert.equal(c.projection.crossings, null);
    assert.equal(c.projection.basis, PRELAUNCH_BASIS);
    assert.notEqual(c.horizon, 'H1', 'no production anywhere is not a quote-now decision');
    assert.equal(laneFor(c).horizon, c.horizon);
  });
});

describe('matching is by whole word', () => {
  it('a word inside another word is not a match', () => {
    const ids = (q) => resolveParts(q).map((m) => m.tech.id);
    assert.ok(!ids('turbocharger').includes('bidirectional-obc'), 'charger inside turbocharger');
    assert.ok(!ids('crankshaft').includes('hollow-halfshafts'), 'shaft inside crankshaft');
    assert.ok(!ids('muffler and silencer').includes('virtual-validation'), 'sil inside silencer');
    assert.ok(!ids('variable valve timing').includes('48v-lv-net'), 'lv inside valve');
  });
  it('plurals still match', () => {
    assert.ok(resolveParts('on-board chargers').some((m) => m.tech.id === 'bidirectional-obc'));
  });
});

describe('one generic word from another commodity is context, not an answer', () => {
  it('rotor magnets: brake-disc coatings are labelled related, not exact', () => {
    const r = foresightFor({ query: 'rotor magnets' });
    const disc = cards(r).find((c) => c.id === 'coated-brake-discs');
    if (disc) assert.equal(disc.related, true);
  });
  it('48v MHEV battery keeps the 48 V battery as an exact answer (two hits)', () => {
    const c = cards(foresightFor({ query: '48v mhev battery', commodityHint: 'Powertrain' })).find((x) => x.id === '48v-battery-nextgen');
    assert.ok(c && !c.related);
  });
  it('the BOM commodity is used as a hint when the text alone says nothing', () => {
    const r = foresightFor({ query: 'lambda sensors', commodityHint: 'Powertrain' });
    for (const c of cards(r).filter((x) => x.commodity !== 'Powertrain')) assert.equal(c.related, true, `${c.id} is not a lambda-sensor answer`);
  });
  it('a DC-link capacitor is an EDU part, not an A/C compressor via "cap-AC-itor"', () => {
    assert.equal(inferCommodityKey('dc link capacitor'), 'EDU');
    assert.ok(!cards(foresightFor({ query: 'dc link capacitor' })).some((c) => c.id === 'e-compressor-800v' && !c.related));
  });
});

describe('ledger scoring', () => {
  const now = new Map([['x', { trl: 8, adoptionPct: 6, horizon: 'H1', momentum: 50, confidence: 'probable', ceiling: 10 }]]);
  it('scores on the ceiling the card was drawn with, not the default 90%', () => {
    const [d] = scoreSnapshot([{ id: 'x', name: 'x', adoptionPct: 2, ceilingPct: 10, laneRule: 'r' }], now, 3, 'r');
    assert.equal(d.projectedForNow, projectAdoption(2, 3, { ceilingPct: 10 }));
    assert.notEqual(d.projectedForNow, projectAdoption(2, 3), 'the 90% default is a different curve');
  });
  it('an old snapshot without a stored ceiling uses the current one and says so', () => {
    const [d] = scoreSnapshot([{ id: 'x', name: 'x', adoptionPct: 2, laneRule: 'r' }], now, 3, 'r');
    assert.equal(d.projectedForNow, projectAdoption(2, 3, { ceilingPct: 10 }));
    assert.match(d.ceilingBasis, /predates stored ceilings/);
  });
  it('a pre-launch snapshot is not scored', () => {
    const [d] = scoreSnapshot([{ id: 'x', name: 'x', adoptionPct: 0, prelaunch: true, laneRule: 'r' }], now, 3, 'r');
    assert.equal(d.projectionError, null);
    assert.match(d.unscoredReason, /no projection was made/);
  });
});
