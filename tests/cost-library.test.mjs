import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLibrary, mergeLibrary, FIELD_SPECS } from '../cost-library.mjs';
import { computeShouldCost, MATERIALS, PROCESSES } from '../costing-engine.mjs';

test('a partial override of an existing material is valid and merges', () => {
  const custom = { materials: { 'Aluminium 6061': { price: 3.5 } } };
  const { ok, errors } = validateLibrary(custom);
  assert.ok(ok, JSON.stringify(errors));
  const lib = mergeLibrary(custom);
  assert.equal(lib.MATERIALS['Aluminium 6061'].price, 3.5);          // overridden
  assert.equal(lib.MATERIALS['Aluminium 6061'].density, MATERIALS['Aluminium 6061'].density); // kept
  assert.equal(lib.MATERIALS['Steel (mild)'].price, MATERIALS['Steel (mild)'].price);         // untouched
});

test('a new material requires all fields', () => {
  const missing = validateLibrary({ materials: { 'Inconel 718': { price: 25 } } });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some(e => e.row === 'Inconel 718' && e.field === 'density'));
  const full = validateLibrary({ materials: { 'Inconel 718': { price: 25, density: 8.2, scrapRecovery: 0.4, family: 'superalloy' } } });
  assert.ok(full.ok, JSON.stringify(full.errors));
});

test('rejects a percentage entered as 15 instead of 0.15', () => {
  const { ok, errors } = validateLibrary({ regions: { 'Germany': { sgaPct: 15 } } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.field === 'sgaPct' && /fraction/.test(e.message)));
});

test('custom machine rate flows into the should-cost estimate', () => {
  const input = { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 0.4, annualVolume: 40000, region: 'Germany' };
  const base = computeShouldCost(input).totalShouldCost;
  const lib = mergeLibrary({ processes: { 'Machining (CNC)': { machineRate: PROCESSES['Machining (CNC)'].machineRate * 2 } } });
  const withCustom = computeShouldCost(input, {}, null, lib).totalShouldCost;
  assert.ok(withCustom > base, 'doubling the machine rate should raise the cost');
});

test('custom coefficients override cycle/tooling and a new region works end-to-end', () => {
  const lib = mergeLibrary({
    regions: { 'Vietnam': { labour: 6, overheadPct: 0.13, sgaPct: 0.10 } },
    processes: { 'Machining (CNC)': { cyclePerKg: 250 } },
  });
  const r = computeShouldCost({ material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 1.0, annualVolume: 20000, region: 'Vietnam' }, {}, null, lib);
  assert.ok(r.totalShouldCost > 0);
  assert.equal(r.drivers.labourRate, 6);
});

test('reserved prototype keys are rejected, not merged', () => {
  const { ok, errors } = validateLibrary({ materials: { '__proto__': { price: 5 }, 'constructor': { price: 6 } } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /reserved/.test(e.message)));
});

test('material family is lowercased so it matches process families', () => {
  const { normalized } = validateLibrary({ materials: { 'Cast Iron (Grey)': { family: 'Ferrous' } } });
  assert.equal(normalized.materials['Cast Iron (Grey)'].family, 'ferrous');
});

test('plausibility warnings flag likely decimal typos without blocking', () => {
  const { ok, warnings } = validateLibrary({ processes: { 'Machining (CNC)': { machineRate: 6500 } } });
  assert.equal(ok, true, 'a high-but-valid number should not be an error');
  assert.ok(warnings.some(w => w.field === 'machineRate' && /decimal/.test(w.message)));
  // a normal value produces no warning
  assert.equal(validateLibrary({ processes: { 'Machining (CNC)': { machineRate: 72 } } }).warnings.length, 0);
});

test('FIELD_SPECS cover every editable engine field', () => {
  const procFields = FIELD_SPECS.processes.fields.map(f => f.id);
  for (const f of ['machineRate', 'cycleBase', 'cyclePerKg', 'toolingBase', 'toolingPerKg', 'finishPct', 'families']) {
    assert.ok(procFields.includes(f), `missing process field ${f}`);
  }
});
