import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaterial, resolveProcess } from '../material-process-resolve.mjs';
import { MATERIALS, PROCESSES } from '../costing-engine.mjs';

test('exact catalogue keys resolve to themselves (not approx)', () => {
  for (const k of Object.keys(MATERIALS)) {
    const r = resolveMaterial(k);
    assert.equal(r?.key, k);
    assert.equal(r.approx, false);
  }
  for (const k of Object.keys(PROCESSES)) {
    const r = resolveProcess(k);
    assert.equal(r?.key, k);
    assert.equal(r.approx, false);
  }
});

test('free-text materials map to the right catalogue grade', () => {
  assert.equal(resolveMaterial('ductile cast iron')?.key, 'Cast Iron (Ductile/GJS)');
  assert.equal(resolveMaterial('GJS-500')?.key, 'Cast Iron (Ductile/GJS)');
  assert.equal(resolveMaterial('grey iron GG25')?.key, 'Cast Iron (Grey)');
  assert.equal(resolveMaterial('Titanium Ti-6Al-4V')?.key, 'Titanium Ti-6Al-4V');
  assert.equal(resolveMaterial('ZAMAK 5')?.key, 'Zinc (ZAMAK 5)');
  assert.equal(resolveMaterial('brass CuZn39')?.key, 'Brass (CuZn39)');
  assert.equal(resolveMaterial('A356')?.key, 'Aluminium A356 (cast)');
  assert.equal(resolveMaterial('DP780')?.key, 'Steel (high-strength)');
  assert.equal(resolveMaterial('6061')?.key, 'Aluminium 6061');
  assert.ok(resolveMaterial('ductile cast iron').approx);
});

test('free-text processes map to the right catalogue entry', () => {
  assert.equal(resolveProcess('sand casting')?.key, 'Sand Casting');
  assert.equal(resolveProcess('lost wax')?.key, 'Investment Casting');
  assert.equal(resolveProcess('gravity die')?.key, 'Gravity Die Casting');
  assert.equal(resolveProcess('zinc die casting')?.key, 'Die Casting (Zinc)');
  assert.equal(resolveProcess('HPDC')?.key, 'Die Casting (Aluminium)');
  assert.equal(resolveProcess('CNC machining')?.key, 'Machining (CNC)');
  assert.equal(resolveProcess('RTM layup')?.key, 'Composite Layup (RTM)');
});

test('unrecognised / empty input returns null', () => {
  assert.equal(resolveMaterial(''), null);
  assert.equal(resolveMaterial('   '), null);
  assert.equal(resolveMaterial('unobtainium'), null);
  assert.equal(resolveProcess('teleportation'), null);
});
