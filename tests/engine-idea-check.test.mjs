// Engine cross-check of live generated ideas: material/process substitutions
// must stamp a real engineCheck; inexpressible or unresolvable moves must stay
// honestly null; the request field must never leak to the client.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runEngineChecks } from '../engine-idea-check.mjs';

const mk = (req) => ({ title: 'x', engineCheckRequest: req });

describe('engine-idea-check', () => {
  it('confirms a genuine cost-down move (near-net forging vs billet CNC)', () => {
    const idea = mk({
      baselineMaterial: 'Steel (high-strength)', baselineProcess: 'Machining (CNC)',
      proposedMaterial: 'Steel (high-strength)', proposedProcess: 'Forging (Hot) + Machining (secondary ops)',
      referenceWeightKg: 1.5, proposedWeightKg: 1.5,
    });
    const s = runEngineChecks([idea], { region: 'Germany', annualVolume: 60000 });
    assert.equal(s.checked, 1);
    assert.ok(idea.engineCheck);
    assert.equal(idea.engineCheck.direction, 'confirmed');
    assert.ok(idea.engineCheck.baselineEur > idea.engineCheck.proposedEur);
    assert.equal(idea.engineCheckRequest, undefined);   // request never leaks
  });

  it('contradicts a move the engine disagrees with (small steel bracket → PA66 at same mass class)', () => {
    const idea = mk({
      baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing',
      proposedMaterial: 'Titanium Ti-6Al-4V', proposedProcess: 'Machining (CNC)',
      referenceWeightKg: 0.8, proposedWeightKg: 0.8,
    });
    const s = runEngineChecks([idea]);
    assert.equal(idea.engineCheck.direction, 'contradicted');
    assert.equal(s.contradicted, 1);
  });

  it('returns honest null for unresolvable materials and missing requests', () => {
    const bad = mk({ baselineMaterial: 'Unobtanium', baselineProcess: 'Wishing', proposedMaterial: 'PP', proposedProcess: 'Injection Moulding', referenceWeightKg: 1 });
    const none = { title: 'no request' };
    const s = runEngineChecks([bad, none]);
    assert.equal(bad.engineCheck, null);
    assert.equal(none.engineCheck, null);
    assert.equal(s.unexpressible, 2);
  });

  it('refuses to stamp a no-op "check" (identical baseline and proposed)', () => {
    const idea = mk({
      baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing',
      proposedMaterial: 'Steel (mild)', proposedProcess: 'Stamping / Deep Drawing',
      referenceWeightKg: 1.0, proposedWeightKg: 1.0,
    });
    runEngineChecks([idea]);
    assert.equal(idea.engineCheck, null);
  });

  it('clamps absurd weights to the reference default instead of computing nonsense', () => {
    const idea = mk({
      baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing',
      proposedMaterial: 'Aluminium 6061', proposedProcess: 'Stamping / Deep Drawing',
      referenceWeightKg: 1e9, proposedWeightKg: -5,
    });
    const s = runEngineChecks([idea], { defaultWeightKg: 1.0 });
    assert.equal(s.checked, 1);
    assert.match(idea.engineCheck.referenceCase, /^1 kg /);
  });
});

// A wiring harness is not "a part with a process", so no material/process
// substitution resolves for it and every harness idea came back unexpressible —
// measured at 0 of 14 on the body harness, the worst coverage of any part class
// in the platform. harness-cost.mjs models the commodity properly and was
// sitting in the repo with nothing calling it.
describe('harness ideas are checkable', () => {
  const opts = { region: 'Mexico', annualVolume: 120000 };

  it('confirms a real reduction and reports the engine figure', () => {
    const ideas = [{ title: 'Consolidate connectors', harnessCheckRequest: { baseline: { circuits: 180, connectors: 30, splices: 22 }, proposed: { connectors: 22, splices: 14 } } }];
    const s = runEngineChecks(ideas, opts);
    const ec = ideas[0].engineCheck;
    assert.ok(ec, 'a harness idea must now be checkable');
    assert.equal(ec.direction, 'confirmed');
    assert.ok(ec.savingPct > 0 && ec.baselineEur > ec.proposedEur);
    assert.match(ec.referenceCase, /wiring harness/);
    assert.match(ec.referenceCase, /connectors 30 → 22/);
    assert.equal(s.checked, 1);
  });

  it('CONTRADICTS a change that adds cost — direction is measured, not assumed', () => {
    const ideas = [{ title: 'More circuits', harnessCheckRequest: { baseline: { circuits: 180 }, proposed: { circuits: 210 } } }];
    runEngineChecks(ideas, opts);
    assert.equal(ideas[0].engineCheck.direction, 'contradicted');
    assert.ok(ideas[0].engineCheck.savingPct < 0);
  });

  it('leaves unstated fields unchanged rather than defaulting them', () => {
    const ideas = [{ title: 'Shorter routing only', harnessCheckRequest: { baseline: { circuits: 180, avgLengthM: 2.1 }, proposed: { avgLengthM: 1.7 } } }];
    runEngineChecks(ideas, opts);
    const rc = ideas[0].engineCheck.referenceCase;
    assert.match(rc, /avgLengthM 2\.1 → 1\.7/);
    assert.doesNotMatch(rc, /circuits/, 'circuits did not change and must not be reported as changed');
  });

  it('refuses to stamp a check where nothing moved', () => {
    const ideas = [{ title: 'No-op', harnessCheckRequest: { baseline: { circuits: 180 }, proposed: { circuits: 180 } } }];
    const s = runEngineChecks(ideas, opts);
    assert.equal(ideas[0].engineCheck, null, 'a check proving nothing must not be stamped');
    assert.equal(s.unexpressible, 1);
  });

  it('refuses out-of-range or incomplete requests instead of guessing', () => {
    const ideas = [
      { title: 'No circuits', harnessCheckRequest: { baseline: {}, proposed: { circuits: 10 } } },
      { title: 'Absurd', harnessCheckRequest: { baseline: { circuits: 999999 }, proposed: { circuits: 10 } } },
    ];
    runEngineChecks(ideas, opts);
    for (const i of ideas) assert.equal(i.engineCheck, null, `${i.title} must be null, never fabricated`);
  });

  it('strips the request from the idea — the stamp is the product', () => {
    const ideas = [{ title: 'x', harnessCheckRequest: { baseline: { circuits: 100 }, proposed: { circuits: 80 } } }];
    runEngineChecks(ideas, opts);
    assert.equal('harnessCheckRequest' in ideas[0], false);
  });
});

// ── Extended levers: tolerance, assembly, and a reason on every null ─────────
// Measured on four live Prism runs, 47–100% of ideas were null because only a
// material/process substitution was expressible. These pin the new kinds and
// the rule that a null ALWAYS says why.
describe('engine-idea-check: extended levers', () => {
  it('prices a tolerance relaxation through the engine drawing drivers', () => {
    const idea = mk({
      kind: 'tolerance', material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting + Machining (CNC)', weightKg: 4.2,
      baseline: { toleranceClass: 'precision', surfaceFinish: 'fine', criticalCharacteristics: 6 },
      proposed: { toleranceClass: 'tight', surfaceFinish: 'standard', criticalCharacteristics: 3 },
    });
    const s = runEngineChecks([idea], { region: 'Germany', annualVolume: 60000 });
    assert.equal(s.checked, 1);
    assert.equal(idea.engineCheck.kind, 'tolerance');
    assert.equal(idea.engineCheck.direction, 'confirmed');
    assert.match(idea.engineCheck.referenceCase, /precision tol .* → tight tol/);
    assert.equal(idea.engineCheckReason, undefined);
    assert.deepEqual(s.byKind, { tolerance: 1 });
  });

  it('refuses a tolerance request where nothing changed, with the reason', () => {
    const idea = mk({ kind: 'tolerance', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', baseline: { toleranceClass: 'tight' }, proposed: { toleranceClass: 'tight' } });
    runEngineChecks([idea]);
    assert.equal(idea.engineCheck, null);
    assert.match(idea.engineCheckReason, /nothing changed/);
  });

  it('prices a part-count / joining change through the DFA time model', () => {
    const good = mk({ kind: 'assembly', baseline: { parts: 3, fasteners: { screw: 6 } }, proposed: { parts: 1, fasteners: {} } });
    const bad = mk({ kind: 'assembly', baseline: { parts: 1, fasteners: {} }, proposed: { parts: 2, fasteners: { boltNut: 4 } } });
    const s = runEngineChecks([good, bad], { region: 'Germany', annualVolume: 60000 });
    assert.equal(s.checked, 2);
    assert.equal(good.engineCheck.kind, 'assembly');
    assert.equal(good.engineCheck.direction, 'confirmed');
    assert.ok(good.engineCheck.baselineEur > good.engineCheck.proposedEur);
    assert.match(good.engineCheck.referenceCase, /3 parts \(6 screw\) → 1 parts/);
    assert.match(good.engineCheck.basis, /NOT included/, 'the basis must say material/tooling consequences are excluded');
    assert.equal(bad.engineCheck.direction, 'contradicted');
    // Labour rate is the region's: the same move is cheaper to do in Mexico, so it saves less there.
    const mx = mk({ kind: 'assembly', baseline: { parts: 3, fasteners: { screw: 6 } }, proposed: { parts: 1, fasteners: {} } });
    runEngineChecks([mx], { region: 'Mexico', annualVolume: 60000 });
    assert.ok(mx.engineCheck.baselineEur < good.engineCheck.baselineEur);
  });

  it('every null carries a reason, and the summary tallies them', () => {
    const none = { title: 'no request' };
    const unknownMat = mk({ baselineMaterial: 'Unobtanium', baselineProcess: 'Stamping / Deep Drawing', proposedMaterial: 'Steel (mild)', proposedProcess: 'Stamping / Deep Drawing' });
    const unchanged = mk({ baselineMaterial: 'Steel (mild)', baselineProcess: 'Stamping / Deep Drawing', proposedMaterial: 'Steel (mild)', proposedProcess: 'Stamping / Deep Drawing', referenceWeightKg: 1, proposedWeightKg: 1 });
    const noParts = mk({ kind: 'assembly', baseline: {}, proposed: { parts: 1 } });
    const s = runEngineChecks([none, unknownMat, unchanged, noParts]);
    assert.equal(s.unexpressible, 4);
    for (const i of [none, unknownMat, unchanged, noParts]) {
      assert.equal(i.engineCheck, null);
      assert.ok(typeof i.engineCheckReason === 'string' && i.engineCheckReason.length > 10, `reason missing on "${i.title}"`);
    }
    assert.match(none.engineCheckReason, /no engine-check request/);
    assert.match(unknownMat.engineCheckReason, /"Unobtanium" not in the engine catalogue/);
    assert.match(unchanged.engineCheckReason, /nothing changed/);
    assert.match(noParts.engineCheckReason, /part count/);
    assert.equal(Object.values(s.reasons).reduce((a, b) => a + b, 0), 4);
  });

  it('a mass-only change is stamped kind "mass"', () => {
    const idea = mk({ baselineMaterial: 'Aluminium A356 (cast)', baselineProcess: 'Gravity Die Casting', proposedMaterial: 'Aluminium A356 (cast)', proposedProcess: 'Gravity Die Casting', referenceWeightKg: 2.0, proposedWeightKg: 1.6 });
    runEngineChecks([idea]);
    assert.equal(idea.engineCheck.kind, 'mass');
    assert.equal(idea.engineCheck.direction, 'confirmed');
  });
});
