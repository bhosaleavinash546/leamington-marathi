// AN ALLOW-LIST OF COMPANY NAMES CANNOT BE COMPLETED.
//
// The named-benchmark gate used to tag a claim "unverified:" only when it
// mentioned one of ~55 marques it happened to know. Measured on the live Prism
// corpus (Sept 2026 review, P-1), 26 references naming real companies walked
// straight past it — Vitesco, BorgWarner, Voestalpine, Sadef, Georg Fischer,
// Gienanth, Altair, Schuler, Nemak, Trumpf, Fraunhofer ILT, Nidec, Feintool —
// and reached the reader with no tag at all. Every name missing from the list
// FAILED OPEN, which is the worst possible direction for a hallucination guard.
//
// The rule is now inverted: an unbacked benchmark is unverified, full stop.
// The only remaining list is of GENERIC words, and it fails CLOSED — a word
// missing from it makes a soft claim read as attributable, which is more
// caution rather than less. These tests pin that direction, not the list.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdeas, isAttributableClaim } from '../idea-validation.mjs';

const idea = (benchmarkReference, over = {}) => ({
  id: 'x', title: 'A specific lever with a named grade',
  technicalDescription: 'Replace the mild steel bracket with DP600 at 0.55 mm, which holds section stiffness at a lower gauge because bending stiffness goes with thickness cubed and the higher yield tolerates the reduced section under the same load case. '.repeat(2),
  manufacturingImpact: 'Same press line, same progressive die, one fewer forming station.',
  costSavingTypes: ['material'],
  costSavingPotential: { qualitative: 'Medium', percentage: '8-14%', annualValue: '€6K–€10K at 60,000 units/yr', calculationBasis: '€0.10/part × 60,000' },
  implementationDifficulty: 'Low', riskNotes: 'Fatigue re-validation required on the bracket load case.',
  dfmaPrinciples: ['reduce material'], systemLevel: 'Part', timeToImplement: '6-9 months',
  benchmarkReference, confidenceLevel: 'benchmarked', evidenceSources: [],
  ...over,
});

const gate = (ref, ctx = { searchExecuted: false }, over = {}) => validateIdeas([idea(ref, over)], ctx).ideas[0];

describe('every unbacked benchmark claim is tagged, with no list to walk through', () => {
  it('tags the 12 real companies the old allow-list did not know', () => {
    const escaped = [
      'Vitesco/BorgWarner 800V EDUs adopted inductive PCB position sensors',
      'Sadef/Voestalpine roll-formed body reinforcements replace stamped brackets',
      'Georg Fischer / Gienanth foundry practice for automotive shell-mould iron',
      'Altair topology-optimised cast iron uprights shed 8-15% mass',
      'Schuler high-speed servo lamination lines run 400+ spm',
      'Nemak Mexico ductile-iron chassis castings supplied to European OEMs',
      'Trumpf and EMAG multi-beam laser lamination cutting show near-zero burr',
      'Fraunhofer ILT work on laser edge annealing of electrical steel',
      'Nidec traction motors use stress-relief annealing on stamped stacks',
      'Feintool fineblanked seat-recliner parts reach ~75% material utilisation',
      'Gestamp progressive-die nesting programmes lift stamping yield 8-15%',
      'Bruderer BSTA high-speed lamination lines are standard for this class',
    ];
    for (const ref of escaped) {
      const out = gate(ref);
      assert.match(out.benchmarkReference, /^unverified:/, `NOT TAGGED: ${ref}`);
      assert.equal(out.benchmarkClaim, 'attributable-unverified', `not classed attributable: ${ref}`);
    }
  });

  it('tags a claim naming NO company at all — the tag needs no detection to fire', () => {
    const out = gate('Standard OEM chassis resourcing playbook with open-book should-cost');
    assert.match(out.benchmarkReference, /^unverified:/);
    assert.equal(out.benchmarkClaim, 'generic-unverified', 'a soft claim is still unverified, just not attributable');
  });

  it('tags a company that has not been invented yet — the point of inverting the rule', () => {
    const out = gate('Zorbtech Industries pioneered this on their 2029 platform');
    assert.match(out.benchmarkReference, /^unverified:/);
    assert.equal(out.benchmarkClaim, 'attributable-unverified');
  });

  it('does not double-tag an already-tagged claim', () => {
    const out = gate('unverified: Toyota GBD magnets cut Dy by half');
    assert.equal((out.benchmarkReference.match(/unverified:/gi) || []).length, 1);
  });

  it('leaves a retrieval-backed claim untagged and says so', () => {
    const out = gate('Toyota GBD magnets cut heavy rare earth by ~50%',
      { searchExecuted: true }, { searchDataUsed: true });
    assert.doesNotMatch(out.benchmarkReference, /^unverified:/);
    assert.equal(out.benchmarkClaim, 'retrieval-backed');
  });
});

describe('the attributable test fails CLOSED', () => {
  it('a year makes a claim attributable', () => {
    assert.equal(isAttributableClaim('Adopted across the industry in 2023'), true);
  });

  it('a company in the FIRST position is still caught', () => {
    // The earlier version skipped the sentence opener, which is the same
    // failure-open mistake in miniature: "Gestamp progressive-die nesting…"
    // and "Feintool fineblanked…" both name a company in position zero.
    assert.equal(isAttributableClaim('Gestamp progressive-die nesting programmes lift yield'), true);
    assert.equal(isAttributableClaim('Feintool fineblanked seat parts reach high utilisation'), true);
  });

  it('an unknown capitalised word is treated as attributable, not waved through', () => {
    // The safe direction: a generic word missing from GENERIC_CAPS produces a
    // louder label, never a quieter one.
    assert.equal(isAttributableClaim('Quenchform hardening is common on this class'), true);
  });

  it('only genuinely generic prose comes back generic', () => {
    for (const t of [
      'Standard OEM value-engineering practice for this class of part',
      'Typical automotive industry practice',
      'Common European practice on non-class-A closures',
    ]) assert.equal(isAttributableClaim(t), false, t);
  });

  it('an empty or missing claim is not attributable', () => {
    assert.equal(isAttributableClaim(''), false);
    assert.equal(isAttributableClaim(null), false);
  });
});

describe('the tag is not a quality penalty', () => {
  it('an unverified benchmark does not deduct from qualityScore', () => {
    // ~98% of benchmark references on the live corpus are unbacked attributable
    // claims. A validator flag here would be a constant deduction applied to
    // nearly every idea — it would discriminate nothing and silently re-baseline
    // the whole score. The confidence cap for unbacked ideas already happens
    // upstream, once, for every idea.
    const named = gate('Vitesco/BorgWarner 800V EDUs adopted inductive sensors in 2023');
    const generic = gate('Standard OEM practice for this class of part');
    assert.equal(named.qualityScore, generic.qualityScore,
      'classifying a claim must not change the score — it is a stamp, not a penalty');
    assert.ok(!(named.validationFlags || []).some(f => /benchmark/i.test(f)),
      'no benchmark flag should reach validationFlags');
  });
});
