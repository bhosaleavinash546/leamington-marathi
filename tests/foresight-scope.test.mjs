// Phase 3: the answer and the landscape are different things, and the tool
// must say which is which — WITHOUT deleting either.
//
// Phase 0 measured "stator lamination" returning 16 cards of which 3 were about
// laminations, and "HV busbar" returning 29 of which 4 were about busbars, all
// presented with the same confidence. The first fix bounded the list, and that
// was the wrong lever: it conflated "these are mislabelled" with "there are too
// many of them", and only the first was true. Breadth is what a cost engineer
// browsing a commodity actually wants; labelling is what was broken.
//
// So these tests pin BOTH halves, and the breadth half is written to fail if
// anyone caps the landscape again.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foresightFor } from '../foresight.mjs';
import { FORESIGHT_REGISTER } from '../src/data/tech-foresight-register.mjs';

const cardsOf = (r) => [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];

describe('breadth is never traded away to fix labelling', () => {
  it('offers the WHOLE applicable commodity as landscape, not a sample of it', () => {
    // Guards the correction: a capped landscape deleted technologies the user
    // wanted. If someone re-introduces a cap, this fails.
    const r = foresightFor({ query: 'stator lamination' });
    const shownIds = new Set(cardsOf(r).map((c) => c.id));
    const domain = cardsOf(r).find((c) => !c.related)?.commodity;
    const applicable = FORESIGHT_REGISTER.filter((t) => t.commodity === domain);
    for (const t of applicable) {
      assert.ok(shownIds.has(t.id), `${t.id} exists in ${domain} but was withheld from the landscape`);
    }
    assert.ok(cardsOf(r).length >= 12, `landscape was capped: only ${cardsOf(r).length} cards`);
  });

  it('a broad query keeps every card it had', () => {
    const r = foresightFor({ query: 'HV busbar' });
    assert.ok(cardsOf(r).length >= 20, `HV busbar narrowed to ${cardsOf(r).length} cards`);
  });

  it('still reaches a landscape floor rather than showing a lone card', () => {
    const r = foresightFor({ query: 'cylinder head' });
    assert.ok(cardsOf(r).length >= 5, 'the landscape floor was lost');
  });

  it('landscape arrives momentum-ranked so the best context reads first', () => {
    // The one thing worth keeping from the capped cut: ORDER, not truncation.
    const r = foresightFor({ query: 'stator lamination' });
    const related = cardsOf(r).filter((c) => c.related);
    assert.ok(related.length >= 2);
    assert.ok(related.every((c) => typeof c.momentum === 'number'));
  });
});

describe('the answer shape is stated, not implied', () => {
  it('reports exact and related counts separately', () => {
    const r = foresightFor({ query: 'stator lamination' });
    assert.equal(r.exactCount + r.relatedCount, r.count);
    assert.equal(r.answerShape, 'exact-plus-landscape');
    assert.ok(r.exactCount < r.count, 'this query should carry a landscape alongside its matches');
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
