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

test('"pressure"/"press"/"impression" no longer hijacked by the stamping branch', () => {
  // Every one of these contains "press" and used to resolve to Stamping.
  assert.equal(resolveProcess('high pressure die casting')?.key, 'Die Casting (Aluminium)');
  assert.equal(resolveProcess('pressure diecast aluminium')?.key, 'Die Casting (Aluminium)');
  assert.equal(resolveProcess('press forging')?.key, 'Forging (Hot)');
  assert.equal(resolveProcess('impression die forging')?.key, 'Forging (Hot)');
  assert.equal(resolveProcess('forging press')?.key, 'Forging (Hot)');
  // …but genuine sheet-metal terms still reach Stamping.
  assert.equal(resolveProcess('stamping')?.key, 'Stamping / Deep Drawing');
  assert.equal(resolveProcess('deep drawing')?.key, 'Stamping / Deep Drawing');
  assert.equal(resolveProcess('progressive die')?.key, 'Stamping / Deep Drawing');
});

test('low-pressure die casting routes to the gravity/permanent-mould model, not HPDC', () => {
  assert.equal(resolveProcess('low pressure die casting')?.key, 'Gravity Die Casting');
  assert.equal(resolveProcess('LPDC')?.key, 'Gravity Die Casting');
  // HPDC still resolves to the aluminium die-casting model.
  assert.equal(resolveProcess('high pressure diecasting')?.key, 'Die Casting (Aluminium)');
});

test('cold heading / forming / thread rolling resolve to cold forging (not null)', () => {
  assert.equal(resolveProcess('cold heading')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('cold headed fastener')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('cold forming')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('thread rolling')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('cold forging')?.key, 'Forging (Cold)');
});

test('semi-solid magnesium routes to a family-compatible die-casting process', () => {
  assert.equal(resolveProcess('thixomolding')?.key, 'Die Casting (Aluminium)');
  assert.equal(resolveProcess('semi-solid casting')?.key, 'Die Casting (Aluminium)');
});

test('GGG (ductile) grades no longer mis-grade as grey iron', () => {
  assert.equal(resolveMaterial('GGG50')?.key, 'Cast Iron (Ductile/GJS)');
  assert.equal(resolveMaterial('GGG40')?.key, 'Cast Iron (Ductile/GJS)');
  assert.equal(resolveMaterial('ductile iron GGG50')?.key, 'Cast Iron (Ductile/GJS)');
  assert.equal(resolveMaterial('EN-GJS-500-7')?.key, 'Cast Iron (Ductile/GJS)');
  // grey grades still resolve to grey
  assert.equal(resolveMaterial('GG25')?.key, 'Cast Iron (Grey)');
  assert.equal(resolveMaterial('EN-GJL-250')?.key, 'Cast Iron (Grey)');
});

test('case-hardening / forging steels resolve to high-strength, not mild', () => {
  assert.equal(resolveMaterial('16MnCr5')?.key, 'Steel (high-strength)');
  assert.equal(resolveMaterial('20MnCr5')?.key, 'Steel (high-strength)');
  assert.equal(resolveMaterial('42CrMo4')?.key, 'Steel (high-strength)');
  assert.equal(resolveMaterial('34CrNiMo6')?.key, 'Steel (high-strength)');
});

test('EN AC-46000 die-cast alloy resolves to cast Al, not wrought 6061', () => {
  assert.equal(resolveMaterial('EN AC-46000')?.key, 'Aluminium A356 (cast)');
  assert.equal(resolveMaterial('A380')?.key, 'Aluminium A356 (cast)');
  assert.equal(resolveMaterial('ADC12')?.key, 'Aluminium A356 (cast)');
  // genuine wrought grade unaffected
  assert.equal(resolveMaterial('6061')?.key, 'Aluminium 6061');
});
