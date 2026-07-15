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
