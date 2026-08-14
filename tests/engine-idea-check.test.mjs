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
