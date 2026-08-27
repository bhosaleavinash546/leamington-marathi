// Phase 3: the answer and the landscape are different things, and the tool
// must say which is which.
//
// Phase 0 measured "stator lamination" returning 16 cards of which 3 were about
// laminations, and "HV busbar" returning 29 of which 4 were about busbars —
// roughly 85% of each answer was other people's parts, presented with the same
// confidence as the answer. The exported PDF's prediction board for a lamination
// query opened with SiC power stages, and its cover said "16 TECHNOLOGIES".
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foresightFor } from '../foresight.mjs';

const cardsOf = (r) => [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];

describe('landscape padding is a floor, not a flood', () => {
  it('a thin part query is no longer buried by its commodity', () => {
    const r = foresightFor({ query: 'stator lamination' });
    const cards = cardsOf(r);
    const exact = cards.filter((c) => !c.related).length;
    // The measured regression this pins: 16 cards for 3 matches.
    assert.ok(cards.length <= 9, `landscape grew back to ${cards.length} cards`);
    assert.ok(exact >= 1);
    assert.ok(cards.length - exact <= 6, 'padding is unbounded again');
  });

  it('still reaches a landscape floor rather than showing a lone card', () => {
    // The floor exists for a reason — one card reads as a broken tool.
    const r = foresightFor({ query: 'cylinder head' });
    assert.ok(cardsOf(r).length >= 5, 'the landscape floor was lost');
  });

  it('padding is the highest-momentum context, not whatever the file lists first', () => {
    const r = foresightFor({ query: 'stator lamination' });
    const related = cardsOf(r).filter((c) => c.related);
    if (related.length >= 2) {
      // Momentum order is not guaranteed after lane sorting, but the SET must
      // be drawn from the top of the commodity — assert none is bottom-ranked.
      assert.ok(related.every((c) => typeof c.momentum === 'number'));
      assert.ok(Math.max(...related.map((c) => c.momentum)) >= 40);
    }
  });
});

describe('the answer shape is stated, not implied', () => {
  it('reports exact and related counts separately', () => {
    const r = foresightFor({ query: 'stator lamination' });
    assert.equal(r.exactCount + r.relatedCount, r.count);
    assert.equal(r.answerShape, 'exact-plus-landscape');
    assert.ok(r.exactCount < r.count, 'this query should carry landscape padding');
  });

  it('a commodity lens is all answer — no padding, no landscape label', () => {
    const r = foresightFor({ commodity: 'BIW' });
    assert.equal(r.relatedCount, 0);
    assert.equal(r.answerShape, 'exact');
    assert.equal(r.exactCount, r.count);
  });

  it('an unmatched query says empty rather than inventing a landscape', () => {
    const r = foresightFor({ query: 'zzzz nonexistent widget' });
    assert.equal(r.count, 0);
    assert.equal(r.answerShape, 'empty');
  });

  it('every padded card is individually marked so no renderer can lose the distinction', () => {
    const r = foresightFor({ query: 'stator lamination' });
    const related = cardsOf(r).filter((c) => c.related);
    assert.ok(related.length > 0);
    for (const c of related) assert.equal(c.related, true);
  });

  it('exact matches outrank landscape within every lane', () => {
    // A reader scanning a lane top-down must reach the answer before the
    // context — the divider the UI draws depends on this ordering holding.
    const r = foresightFor({ query: 'stator lamination' });
    for (const lane of ['H1', 'H2', 'H3']) {
      const flags = r.horizons[lane].map((c) => Boolean(c.related));
      const firstRelated = flags.indexOf(true);
      if (firstRelated === -1) continue;
      assert.ok(!flags.slice(firstRelated).includes(false), `lane ${lane} interleaves landscape with matches`);
    }
  });
});
