// Phase 1: evidence currency, and the research trigger that finally reads it.
//
// The Phase 0 review measured the tool answering nine of nine commodity lenses
// from a static file it never re-checked, because the trigger asked "are there
// enough cards?" and never "are they still true?". These tests pin the fix and
// the honesty rules around it — including the ones that are easy to regress
// into flattery: undated is not fresh, and a future year is not evidence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_AFTER, evidenceYear, currencyTier, currencyOf, landscapeCurrency,
  foresightFor, REGISTER_VINTAGE,
} from '../foresight.mjs';
import { shouldResearch, RESEARCH_TRIGGER } from '../foresight-research.mjs';
import { auditRegister } from '../foresight-audit.mjs';
import { FORESIGHT_REGISTER } from '../src/data/tech-foresight-register.mjs';

const NOW = REGISTER_VINTAGE;

describe('evidence currency', () => {
  it('reads the newest year the entry can actually prove', () => {
    assert.equal(evidenceYear({ firstProduction: 'Tesla Model 3 (2017), now industry-wide' }), 2017);
    assert.equal(evidenceYear({ firstProduction: 'BYD Blade (2020)', note: 'refreshed 2025' }), 2025);
  });

  it('a FUTURE year is an announcement, not evidence', () => {
    // The bug this pins: an unproduced technology whose note said "cells 2028"
    // scored evidenceYear 2028 and read as fresher than a shipping one.
    assert.equal(evidenceYear({ note: 'commercial cells 2028, pre-production 2027' }), null);
    assert.equal(currencyTier({ note: 'production planned 2030' }), 'undated');
    // an already-happened year alongside a future one still counts
    assert.equal(evidenceYear({ note: 'shipped 2024, next gen 2029' }), 2024);
  });

  it('undated is its own state — absent is never treated as fresh', () => {
    assert.equal(currencyTier({ name: 'no years anywhere' }), 'undated');
    const c = currencyOf({ name: 'x' });
    assert.equal(c.tier, 'undated');
    assert.equal(c.evidenceYear, null);
    assert.equal(c.verified, false);
    assert.match(c.basis, /no dated evidence/);
  });

  it('stale begins exactly where the audit says it does — one definition', () => {
    assert.equal(currencyTier({ firstProduction: `(${NOW - STALE_AFTER})` }), 'stale');
    assert.equal(currencyTier({ firstProduction: `(${NOW - STALE_AFTER + 1})` }), 'fresh');
  });

  it('lastVerified marks a REAL re-check and is reported as such', () => {
    const c = currencyOf({ lastVerified: '2026-08', evidenceUrl: 'https://example.com/x', firstProduction: 'old thing (2015)' });
    assert.equal(c.tier, 'fresh');
    assert.equal(c.verified, true);
    assert.equal(c.evidenceUrl, 'https://example.com/x');
    assert.match(c.basis, /re-verified 2026-08/);
    // and an entry WITHOUT it never claims verification
    assert.equal(currencyOf({ firstProduction: 'shipped (2025)' }).verified, false);
  });

  it('landscape currency counts stale AND undated as not-fresh', () => {
    const l = landscapeCurrency([
      { firstProduction: '(2025)' }, { firstProduction: '(2017)' }, { name: 'undated' },
    ]);
    assert.deepEqual([l.fresh, l.stale, l.undated, l.total], [1, 1, 1, 3]);
    assert.ok(Math.abs(l.notFreshShare - 2 / 3) < 1e-9);
  });

  it('every card the engine emits carries its currency', () => {
    const r = foresightFor({ commodity: 'Battery' });
    const cards = [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];
    assert.ok(cards.length > 0);
    for (const c of cards) {
      assert.ok(c.currency, `${c.id} has no currency stamp`);
      assert.ok(['fresh', 'stale', 'undated'].includes(c.currency.tier));
    }
    assert.equal(r.currency.total, cards.filter((c) => !c.related).length || cards.length);
  });
});

describe('research fires on staleness, not only thinness', () => {
  it('a stale-but-well-covered landscape now triggers research', () => {
    // The exact shape Phase 0 measured: plenty of cards, none recently confirmed.
    const stale = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, firstProduction: '(2017)' }));
    const result = { count: 12, horizons: { H1: stale(8), H2: stale(4), H3: [] } };
    const t = shouldResearch(result);
    assert.equal(t.research, true);
    assert.equal(t.reason, 'stale-register-coverage');
    assert.equal(t.currency.notFreshShare, 1);
  });

  it('a fresh, well-covered landscape does NOT pay for research', () => {
    const fresh = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, firstProduction: '(2025)' }));
    const t = shouldResearch({ count: 12, horizons: { H1: fresh(8), H2: fresh(4), H3: [] } });
    assert.equal(t.research, false);
    assert.equal(t.reason, 'register-coverage-sufficient');
  });

  it('landscape padding does not get a vote on the answer’s currency', () => {
    // 2 fresh EXACT cards + 20 stale RELATED ones: the user asked about the two.
    const exact = [{ id: 'e1', firstProduction: '(2025)' }, { id: 'e2', firstProduction: '(2026)' }];
    const padding = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, firstProduction: '(2016)', related: true }));
    const t = shouldResearch({ count: 22, horizons: { H1: [...exact, ...padding], H2: [{ id: 'e3', firstProduction: '(2025)' }], H3: [] } });
    assert.notEqual(t.reason, 'stale-register-coverage');
  });

  it('the thinness triggers still work', () => {
    assert.equal(shouldResearch({ count: 0, horizons: { H1: [], H2: [], H3: [] } }).reason, 'no-register-match');
    assert.equal(shouldResearch({ count: 2, horizons: { H1: [{ id: 'a', firstProduction: '(2025)' }], H2: [{ id: 'b', firstProduction: '(2025)' }], H3: [] } }).reason, 'thin-register-coverage');
  });

  it('the threshold is a stated majority, not a tuned number', () => {
    assert.equal(RESEARCH_TRIGGER.maxNotFreshShare, 0.5);
  });
});

describe('register currency gate (ratchet)', () => {
  // A gate, not a scoreboard: the share of the register carrying stale or
  // undated evidence may FALL but never rise past this ceiling. Lower it when
  // re-curation lands; never raise it to make a red build green.
  //
  // The ceiling is set at the MEASURED reality, never at an aspiration, and it
  // RATCHETS DOWN as re-curation lands. History, so the direction is visible:
  //   0.72  Phase 1 baseline — 71.1% not fresh (69 stale + 59 undated of 180)
  //   0.68  after the first worst-first re-curation pass — 67.8% (64 + 58)
  // Six entries were re-verified against live 2026 sources with dated
  // programmes and evidence URLs, which moved BIW's median cited year from 2020
  // to 2022 and Exterior's from 2019 to 2022. The number is still bad; it is
  // supposed to be, until the remaining 122 entries are worked through.
  const CEILING = 0.68;

  it('does not rot further than the ratchet allows', () => {
    const l = landscapeCurrency(FORESIGHT_REGISTER);
    assert.ok(
      l.notFreshShare <= CEILING,
      `register not-fresh share ${(l.notFreshShare * 100).toFixed(1)}% exceeds the ${(CEILING * 100).toFixed(0)}% ratchet — `
      + 're-curate stale entries (npm run horizon:audit lists them worst-first) rather than raising this number',
    );
  });

  it('the audit and the engine agree on what stale means', () => {
    const audit = auditRegister();
    const auditStale = audit.byFlag['stale-evidence'] ?? 0;
    const engineStale = FORESIGHT_REGISTER.filter((t) => currencyTier(t) === 'stale').length;
    assert.equal(auditStale, engineStale, 'audit and engine disagree about staleness — they must share one definition');
  });
});
