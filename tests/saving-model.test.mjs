// ARITHMETIC BY CONSTRUCTION.
//
// Three measured defects had one cause: the model PRODUCED a number as prose
// and a parser RE-DERIVED it. 16.1% of bases could not be read at all; the same
// arithmetic restated in the cost bridge could not be reconciled (median ×0.30
// apart); and before the parser was repaired, 14 of 16 reported "mismatches"
// were the reader's error. Remove the re-derivation and all three go.
//
// What this module guarantees is arithmetic FAITHFULNESS — the total follows
// from the terms. It does not guarantee the terms are TRUE; that is what the
// engine check is for, and conflating the two would be its own overclaim.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSavingModel, applySavingModel, renderAnnualValue } from '../saving-model.mjs';
import { checkArithmetic } from '../idea-arith.mjs';

const t = (label, value, scope = 'per-part', sign = 'saving', of = undefined) => ({ label, value, scope, sign, of });

describe('the total follows from the terms', () => {
  it('multiplies per-part terms by volume and adds annual ones', () => {
    const r = evaluateSavingModel({ terms: [
      t('material at reduced gauge', 0.20),
      t('grade premium', 0.06, 'per-part', 'cost'),
      t('tooling avoidance', 82_920, 'annual'),
    ] }, { annualVolume: 60_000 });
    assert.equal(r.ok, true, r.reason);
    // (0.20 − 0.06) × 60,000 + 82,920
    assert.equal(r.annualEur, 91_320);
    assert.equal(r.perPartEur, 0.14);
  });

  it('a COST term subtracts — it is not netted off in the model\'s head', () => {
    const saving = evaluateSavingModel({ terms: [t('a', 1)] }, { annualVolume: 1000 });
    const withCost = evaluateSavingModel({ terms: [t('a', 1), t('b', 0.4, 'per-part', 'cost')] }, { annualVolume: 1000 });
    assert.equal(saving.annualEur, 1000);
    assert.equal(withCost.annualEur, 600);
  });

  it('a percentage term resolves against the term it names', () => {
    const r = evaluateSavingModel({ terms: [
      t('material', 0.50),
      t('scrap recovery', 10, 'of', 'saving', 'material'),
    ] }, { annualVolume: 1000 });
    assert.equal(r.annualEur, 550);   // 0.50 + 10% of 0.50 = 0.55
  });

  it('a percentage of a term that does not exist is left UNPRICED, not guessed', () => {
    const r = evaluateSavingModel({ terms: [
      t('material', 0.50),
      t('mystery uplift', 10, 'of', 'saving', 'something we never stated'),
    ] }, { annualVolume: 1000 });
    assert.equal(r.annualEur, 500, 'the unresolvable term contributes nothing');
    assert.ok(r.unpricedTerms.some(x => /mystery uplift/.test(x)));
    assert.match(r.unpricedTerms[0], /not one of the other terms/);
  });

  it('a value that is not a number is unpriced and named', () => {
    const r = evaluateSavingModel({ terms: [t('material', 0.5), t('vibe', 'lots')] }, { annualVolume: 1000 });
    assert.equal(r.annualEur, 500);
    assert.ok(r.unpricedTerms.some(x => /vibe/.test(x)));
  });
});

describe('it refuses rather than guesses', () => {
  it('refuses an empty or absent model', () => {
    for (const m of [null, undefined, {}, { terms: [] }]) {
      assert.equal(evaluateSavingModel(m, { annualVolume: 1000 }).ok, false);
    }
  });

  it('refuses a per-part saving with no volume anywhere', () => {
    const r = evaluateSavingModel({ terms: [t('material', 0.5)] }, {});
    assert.equal(r.ok, false);
    assert.match(r.reason, /no annual volume/);
  });

  it('an annual-only model needs no volume', () => {
    const r = evaluateSavingModel({ terms: [t('tooling avoidance', 50_000, 'annual')] }, {});
    assert.equal(r.ok, true);
    assert.equal(r.annualEur, 50_000);
  });

  it('the model\'s own volume beats the run\'s', () => {
    const r = evaluateSavingModel({ volume: 200_000, terms: [t('material', 1)] }, { annualVolume: 60_000 });
    assert.equal(r.annualEur, 200_000);
  });
});

describe('the prose is rendered FROM the arithmetic', () => {
  const idea = () => ({
    savingModel: { terms: [t('material', 0.20), t('grade premium', 0.06, 'per-part', 'cost'), t('tooling avoidance', 82_920, 'annual')], excluded: ['re-validation cost', 'freight'] },
    costSavingPotential: { annualValue: '€30K–€50K at 60,000 units/yr', calculationBasis: 'roughly €0.14/part times volume, plus tooling' },
  });

  it('replaces the stated value with the computed one, visibly', () => {
    const i = idea();
    const r = applySavingModel(i, { annualVolume: 60_000 });
    assert.equal(r.ok, true);
    assert.equal(i.costSavingPotential.annualValue, '€91K at 60,000 units/yr');
    assert.equal(i.savingModel.computedAnnualEur, 91_320);
    // The swap is never silent — the model's own wording is kept beside it.
    assert.equal(i.savingModel.modelStated, '€30K–€50K at 60,000 units/yr');
    assert.equal(r.replaced, true, 'this fixture states €30K–€50K against terms that compute €91,320');
  });

  it('the rendered basis shows the whole walk, sign by sign', () => {
    const i = idea();
    applySavingModel(i, { annualVolume: 60_000 });
    const b = i.costSavingPotential.calculationBasis;
    assert.match(b, /\+€0\.200\/part \(material\)/);
    assert.match(b, /−€0\.060\/part \(grade premium\)/);
    assert.match(b, /\+€82,920\/yr \(tooling avoidance\)/);
    assert.match(b, /= €91,320\/yr/);
  });

  it('exclusions are printed, not dropped', () => {
    const i = idea();
    applySavingModel(i, { annualVolume: 60_000 });
    assert.deepEqual(i.savingModel.excluded, ['re-validation cost', 'freight']);
  });

  it('renderAnnualValue scales to K and M', () => {
    assert.equal(renderAnnualValue({ ok: true, annualEur: 2_400_000, volume: 1000 }), '€2.40M at 1,000 units/yr');
    assert.equal(renderAnnualValue({ ok: true, annualEur: 91_320, volume: 60_000 }), '€91K at 60,000 units/yr');
    assert.equal(renderAnnualValue({ ok: true, annualEur: 640, volume: 100 }), '€640 at 100 units/yr');
  });
});

describe('a computed figure is not re-parsed', () => {
  it('checkArithmetic returns `computed`, and does NOT check its own output', () => {
    const i = { savingModel: { terms: [t('material', 0.20)], excluded: ['freight'] }, costSavingPotential: { annualValue: 'nonsense' } };
    applySavingModel(i, { annualVolume: 60_000 });
    const a = checkArithmetic(i, { annualVolume: 60_000 });
    assert.equal(a.status, 'computed');
    assert.equal(a.computedEur, 12_000);
    assert.equal(a.deltaPct, 0);
    assert.match(a.note, /not asserted/);
    assert.match(a.note, /NOT included: freight/);
  });

  it('an idea WITHOUT a structured model still goes through the parser', () => {
    const a = checkArithmetic({ costSavingPotential: { annualValue: '€60K at 60,000 units/yr', calculationBasis: '€1.00/part × 60,000' } }, { annualVolume: 60_000 });
    assert.equal(a.status, 'consistent', 'the prose path is unchanged for ideas that do not decompose');
  });

  it('a refused model leaves the idea on the prose path rather than half-applied', () => {
    const i = { savingModel: { terms: [] }, costSavingPotential: { annualValue: '€60K at 60,000 units/yr', calculationBasis: '€1.00/part × 60,000' } };
    const r = applySavingModel(i, { annualVolume: 60_000 });
    assert.equal(r.ok, false);
    assert.equal(i.costSavingPotential.annualValue, '€60K at 60,000 units/yr', 'nothing was overwritten');
  });
});

describe('what it deliberately does not claim', () => {
  it('a faithful total can still be built on a false term', () => {
    // The whole point of keeping the engine check separate. "Material saves
    // €400/part" computes perfectly and is nonsense; arithmetic faithfulness
    // is not correctness, and the module says so rather than implying more.
    const r = evaluateSavingModel({ terms: [t('material', 400)] }, { annualVolume: 60_000 });
    assert.equal(r.ok, true);
    assert.equal(r.annualEur, 24_000_000);
  });
});
