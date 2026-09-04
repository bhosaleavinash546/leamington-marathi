// THE THREE KINDS ADDED AFTER READING WHAT THE CHECKER COULD NOT EXPRESS.
//
// Engine-check coverage sat at 43.5% on the live Prism corpus. Reading the 35
// ideas that stayed null showed the gap was not physics but QUESTION SHAPE:
// five proposed collapsing variants onto a common part, two proposed moving the
// plant, one proposed a faster press — and every one of those is a single
// computeShouldCost call away, because volume, region and cycle have always
// been first-class engine inputs. The checker simply had no way to ask.
//
// The generation prompt had even told the model commonisation was inexpressible
// and to omit the field, so the model dutifully omitted it five times.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runEngineChecks, KINDS, MAX_CHECK_CANDIDATES } from '../engine-idea-check.mjs';
import { REGIONS, computeShouldCost } from '../costing-engine.mjs';

const check = (req, opts = {}) => {
  const idea = { title: 't', engineCheckRequest: req };
  runEngineChecks([idea], { region: 'Germany', annualVolume: 200_000, ...opts });
  return idea;
};

describe('footprint — the same part in another region', () => {
  it('prices a region move the substitution check called "nothing changed"', () => {
    const i = check({ kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, baselineRegion: 'Germany', proposedRegion: 'Morocco' });
    assert.ok(i.engineCheck, i.engineCheckReason);
    assert.equal(i.engineCheck.kind, 'footprint');
    assert.equal(i.engineCheck.direction, 'confirmed');
    assert.ok(i.engineCheck.savingPct > 0);
    assert.match(i.engineCheck.basis, /EX-WORKS/, 'the freight and duty exclusion must be stated, not implied');
  });

  it('a move to a DEARER region is contradicted, not quietly hidden', () => {
    const i = check({ kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, baselineRegion: 'China', proposedRegion: 'Germany' });
    assert.equal(i.engineCheck.direction, 'contradicted');
    assert.ok(i.engineCheck.savingPct < 0);
  });

  it('refuses a region the rate library does not have, by name', () => {
    const i = check({ kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'Atlantis' });
    assert.equal(i.engineCheck, null);
    assert.match(i.engineCheckReason, /Atlantis.*not in the engine's rate library/);
  });

  it('refuses a move to the region it is already in', () => {
    const i = check({ kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, baselineRegion: 'Germany', proposedRegion: 'Germany' });
    assert.equal(i.engineCheck, null);
    assert.match(i.engineCheckReason, /nothing changed/);
  });
});

describe('commonisation — N variants onto one part', () => {
  it('prices the volume effect of collapsing variants', () => {
    const i = check({ kind: 'commonisation', material: 'Electrical Steel (M250-35A)', process: 'Lamination Stamping (Electrical Steel)', weightKg: 0.8, variants: 4, baselineVolumePerVariant: 50_000 });
    assert.ok(i.engineCheck, i.engineCheckReason);
    assert.equal(i.engineCheck.kind, 'commonisation');
    assert.equal(i.engineCheck.direction, 'confirmed');
    // It must be the SAME number the engine gives for the two volumes directly.
    const at50k = computeShouldCost({ material: 'Electrical Steel (M250-35A)', process: 'Lamination Stamping (Electrical Steel)', weightKg: 0.8, annualVolume: 50_000, region: 'Germany' }).totalShouldCost;
    const at200k = computeShouldCost({ material: 'Electrical Steel (M250-35A)', process: 'Lamination Stamping (Electrical Steel)', weightKg: 0.8, annualVolume: 200_000, region: 'Germany' }).totalShouldCost;
    assert.equal(i.engineCheck.baselineEur, Number(at50k.toFixed(2)));
    assert.equal(i.engineCheck.proposedEur, Number(at200k.toFixed(2)));
  });

  it('states the content penalty it does NOT price', () => {
    const i = check({ kind: 'commonisation', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, variants: 3, baselineVolumePerVariant: 20_000 });
    assert.match(i.engineCheck.basis, /heaviest variant/, 'a common part is usually the heaviest variant — the basis must say the mass penalty is excluded');
  });

  it('refuses a variant count that is not a consolidation', () => {
    for (const variants of [1, 0, 80, 'lots', undefined]) {
      const i = check({ kind: 'commonisation', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, variants });
      assert.equal(i.engineCheck, null, `variants=${variants} must be refused`);
      assert.match(i.engineCheckReason, /variant count/);
    }
  });
});

describe('cycle — a rate change on the same part', () => {
  it('prices a faster press bought with a dearer machine', () => {
    const i = check({ kind: 'cycle', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, cycleMult: 0.55, machineMult: 1.35 });
    assert.ok(i.engineCheck, i.engineCheckReason);
    assert.equal(i.engineCheck.kind, 'cycle');
    assert.ok(i.engineCheck.savingPct > 0);
    assert.match(i.engineCheck.referenceCase, /cycle -45%, machine rate \+35%/);
  });

  it('a dearer machine with no rate gain is contradicted', () => {
    const i = check({ kind: 'cycle', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, machineMult: 1.5 });
    assert.equal(i.engineCheck.direction, 'contradicted');
  });

  it('refuses a rate claim outside the clamp rather than capping it silently', () => {
    const i = check({ kind: 'cycle', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, cycleMult: 0.02 });
    assert.equal(i.engineCheck, null);
    assert.match(i.engineCheckReason, /between 0\.2 and 5/);
  });

  it('refuses a multi-op route — a rate change belongs to one operation', () => {
    const i = check({ kind: 'cycle', material: 'Steel (mild)', process: 'Stamping / Deep Drawing + E-coat', weightKg: 1, cycleMult: 0.6 });
    assert.equal(i.engineCheck, null);
    assert.match(i.engineCheckReason, /single operation/);
  });
});

describe('the verdict is replayable', () => {
  it('the check INPUT is kept, on stamps and on nulls alike', () => {
    // It used to be deleted as "model-internal", which made a deterministic
    // check the one thing in the pipeline that could not be re-derived: when
    // the resolver improved there was no way to ask the saved corpus whether
    // the improvement helped, short of paying for a fresh live run.
    const good = check({ kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'China' });
    const bad = check({ kind: 'footprint', material: 'Unobtanium', process: 'Wishing', weightKg: 1, proposedRegion: 'China' });
    assert.ok(good.engineCheckInput, 'a stamped check must keep its input');
    assert.ok(bad.engineCheckInput, 'a REFUSED check must keep its input too — that is the one worth re-testing');
    assert.equal(good.engineCheckRequest, undefined, 'the request is re-homed, not duplicated');
  });
});

describe('the electrical-steel pairs the corpus needed', () => {
  it('electrical steel can be stamped, annealed and laser-blanked', () => {
    for (const process of ['Stamping / Deep Drawing', 'Laser Cutting + Bending']) {
      assert.doesNotThrow(() => computeShouldCost({ material: 'Electrical Steel (M250-35A)', process, weightKg: 0.8, annualVolume: 200_000, region: 'Germany' }), process);
    }
    const i = check({ kind: 'substitution', baselineMaterial: 'M250-35A electrical steel', baselineProcess: 'Lamination Stamping', proposedMaterial: 'M250-35A electrical steel', proposedProcess: 'Lamination Stamping + Heat Treatment' });
    assert.ok(i.engineCheck, i.engineCheckReason);
  });
});

describe('the kind list is the one thing the null message quotes', () => {
  it('an idea with no request is told what the checker CAN price', () => {
    const idea = { title: 'no request' };
    runEngineChecks([idea], {});
    assert.equal(idea.engineCheck, null);
    for (const k of ['footprint', 'commonisation', 'cycle']) {
      assert.match(idea.engineCheckReason, new RegExp(k), `the reason must name ${k} — a model told a move is inexpressible will not attempt it`);
    }
    assert.ok(KINDS.includes('footprint') && KINDS.includes('commonisation') && KINDS.includes('cycle'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BEST-OF-N, ADJUDICATED BY THE ENGINE (Tier 1).
//
// This is the one place in the pipeline where extra compute is worth spending,
// and the reason is asymmetry: a second candidate costs a few output tokens in
// a call already being made, while the verifier is local, deterministic and
// free. Everywhere else there is no ground truth to adjudicate against, and
// sampling more would only produce more confident output.
//
// Coverage sat at 43.5% and the commonest miss was a single request whose
// material or process name did not resolve — a second phrasing of the same
// physical move converts many of those without changing the idea at all.
// ─────────────────────────────────────────────────────────────────────────────
describe('best-of-N on the check request', () => {
  const run = (idea, opts = {}) => {
    const s = runEngineChecks([idea], { region: 'Germany', annualVolume: 200_000, ...opts });
    return { idea, summary: s };
  };

  it('a second phrasing rescues a move the first phrasing could not name', () => {
    const { idea } = run({
      title: 'Down-gauge to dual-phase',
      engineCheckRequests: [
        { kind: 'substitution', baselineMaterial: 'bog standard steel sheet', baselineProcess: 'pressing', proposedMaterial: 'dual phase', proposedProcess: 'pressing' },
        { kind: 'substitution', baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing', proposedMaterial: 'Steel DP600 (dual-phase)', proposedProcess: 'Stamping / Deep Drawing', referenceWeightKg: 1.2, proposedWeightKg: 0.9 },
      ],
    });
    assert.ok(idea.engineCheck, idea.engineCheckReason);
    assert.equal(idea.engineCheck.kind, 'substitution');
  });

  it('the candidates that did NOT price are kept, with their reasons', () => {
    const { idea } = run({
      title: 'x',
      engineCheckRequests: [
        { kind: 'substitution', baselineMaterial: 'dilithium', baselineProcess: 'replication' },
        { kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'China' },
      ],
    });
    assert.ok(idea.engineCheck, 'the second candidate priced');
    assert.equal(idea.engineCheck.alsoTried.length, 1);
    assert.match(idea.engineCheck.alsoTried[0].reason, /dilithium.*not in the engine catalogue/);
  });

  it('when EVERY candidate fails, the verdict is null and all the attempts are listed', () => {
    // "none of the three ways we could express this priced" is a sharper
    // statement about the catalogue than any single failure.
    const { idea } = run({
      title: 'y',
      engineCheckRequests: [
        { kind: 'substitution', baselineMaterial: 'unobtanium', baselineProcess: 'wishing' },
        { kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'Atlantis' },
      ],
    });
    assert.equal(idea.engineCheck, null);
    assert.match(idea.engineCheckReason, /unobtanium/);
    assert.equal(idea.engineCheckAlsoTried.length, 2);
    assert.match(idea.engineCheckAlsoTried[1].reason, /Atlantis/);
  });

  it('the single-request shape still works exactly as before', () => {
    const { idea } = run({ title: 'z', engineCheckRequest: { kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'China' } });
    assert.ok(idea.engineCheck);
    assert.equal(idea.engineCheck.kind, 'footprint');
    assert.equal(idea.engineCheck.alsoTried, undefined, 'one candidate, nothing else tried');
  });

  it('caps the candidates so a runaway array cannot become a compute hole', () => {
    const many = Array.from({ length: 20 }, () => ({ kind: 'substitution', baselineMaterial: 'nonsense', baselineProcess: 'nonsense' }));
    const { idea } = run({ title: 'w', engineCheckRequests: many });
    assert.equal(idea.engineCheck, null);
    assert.ok(idea.engineCheckAlsoTried.length <= MAX_CHECK_CANDIDATES, `tried ${idea.engineCheckAlsoTried.length}, cap is ${MAX_CHECK_CANDIDATES}`);
  });

  it('counts how many ideas needed more than one phrasing', () => {
    const { summary } = run({
      title: 'v',
      engineCheckRequests: [
        { kind: 'substitution', baselineMaterial: 'nope', baselineProcess: 'nope' },
        { kind: 'footprint', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1, proposedRegion: 'China' },
      ],
    });
    assert.equal(summary.multiCandidate, 1);
  });
});
