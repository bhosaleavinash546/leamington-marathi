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
  // "deep drawing" reaches the multi-stage draw model added later — a finer
  // answer than the generic press line, and still not a forging or a casting.
  assert.equal(resolveProcess('deep drawing')?.key, 'Deep Drawing (Multi-stage)');
  assert.equal(resolveProcess('progressive die')?.key, 'Stamping / Deep Drawing');
});

test('low-pressure die casting routes to its own model, not HPDC', () => {
  // Originally the nearest available neighbour was Gravity Die Casting; the
  // catalogue now carries the real LPDC process (different fill, different
  // yield, different cycle), and the resolver reaches it.
  assert.equal(resolveProcess('low pressure die casting')?.key, 'Low-Pressure Die Casting');
  assert.equal(resolveProcess('LPDC')?.key, 'Low-Pressure Die Casting');
  // HPDC still resolves to the aluminium die-casting model.
  assert.equal(resolveProcess('high pressure diecasting')?.key, 'Die Casting (Aluminium)');
});

test('cold heading / forming / thread rolling resolve to a cold-forming op (not null)', () => {
  // The catalogue gained a dedicated header/upsetter line; the generic cold
  // forge remains for everything that is not a headed part.
  assert.equal(resolveProcess('cold heading')?.key, 'Cold Heading / Upsetting');
  assert.equal(resolveProcess('thread rolling')?.key, 'Cold Heading / Upsetting');
  assert.equal(resolveProcess('cold headed fastener')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('cold forming')?.key, 'Forging (Cold)');
  assert.equal(resolveProcess('cold forging')?.key, 'Forging (Cold)');
});

test('semi-solid magnesium routes to a family-compatible semi-solid process', () => {
  // Both spellings reach the real thixo/rheo model now, whose families cover
  // aluminium AND magnesium — the compatibility point the original test made.
  assert.equal(resolveProcess('thixomolding')?.key, 'Semi-Solid Casting (Thixo/Rheo)');
  assert.equal(resolveProcess('thixomoulding')?.key, 'Semi-Solid Casting (Thixo/Rheo)');
  assert.equal(resolveProcess('semi-solid casting')?.key, 'Semi-Solid Casting (Thixo/Rheo)');
  assert.ok(PROCESSES['Semi-Solid Casting (Thixo/Rheo)'].families.includes('magnesium'));
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

test('case-hardening / forging steels resolve to their own grades, never to mild', () => {
  // The defect this guards is "resolves to Steel (mild)". The catalogue has
  // since gained the actual grades, so each reaches itself.
  assert.equal(resolveMaterial('16MnCr5')?.key, 'Steel 16MnCr5 (case-hardening)');
  assert.equal(resolveMaterial('20MnCr5')?.key, 'Steel 16MnCr5 (case-hardening)');
  assert.equal(resolveMaterial('42CrMo4')?.key, 'Steel 42CrMo4 / 4140');
  assert.equal(resolveMaterial('34CrNiMo6')?.key, 'Steel 42CrMo4 / 4140');
  for (const q of ['16MnCr5', '20MnCr5', '42CrMo4', '34CrNiMo6']) {
    assert.notEqual(resolveMaterial(q)?.key, 'Steel (mild)', `${q} must never price as mild steel`);
  }
});

test('die-cast alloys resolve to their own cast grades, not to wrought 6061', () => {
  // Originally all three collapsed onto A356 — the nearest cast entry. A356 is
  // a gravity/permanent-mould alloy and these are HPDC alloys, so the collapse
  // was itself a defect (review R-26); each now reaches its own grade.
  assert.equal(resolveMaterial('EN AC-46000')?.key, 'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)');
  assert.equal(resolveMaterial('A380')?.key, 'Aluminium A380 / ADC12 (die-cast)');
  assert.equal(resolveMaterial('ADC12')?.key, 'Aluminium A380 / ADC12 (die-cast)');
  // genuine wrought grade unaffected
  assert.equal(resolveMaterial('6061')?.key, 'Aluminium 6061');
});

// ── E-drive families (live EDU after-run, Sept 2026: 14 of 19 unpriced ideas
//    failed here — "electrical steel" resolved to Steel (mild), NdFeB to nothing)
import { test as etest } from 'node:test';
import eassert from 'node:assert/strict';
etest('resolveMaterial knows electrical steel, magnets, winding wire and impregnation resin', () => {
  eassert.equal(resolveMaterial('NdFeB N42UH sintered magnet (bulk Dy 2-3%)').key, 'Magnet (NdFeB, sintered, heavy-RE)');
  eassert.equal(resolveMaterial('NdFeB magnet set, single-V IPM (1.8 kg)').key, 'Magnet (NdFeB, sintered, heavy-RE)');
  eassert.equal(resolveMaterial('Y30BH ferrite magnet').key, 'Magnet (Ferrite, Y30BH)');
  eassert.equal(resolveMaterial('Hairpin Cu profile (discrete I-pin)').key, 'Copper (enamelled winding wire)');
  eassert.equal(resolveMaterial('VPI impregnation resin (unfilled epoxy)').key, 'Epoxy (impregnation resin)');
  eassert.equal(resolveMaterial('M250-35A non-oriented electrical steel').key, 'Electrical Steel (M250-35A)');
  eassert.equal(resolveMaterial('NO20 0.20 mm electrical steel').key, 'Electrical Steel (NO20, 0.20 mm)');
  // A grade designation beats a family name even when the family name is the
  // longer string — see buildIndex in material-aliases.mjs.
  eassert.equal(resolveMaterial('20JNEH1200 silicon steel').key, 'Electrical Steel (NO20, 0.20 mm)');
  eassert.equal(resolveMaterial('CR340LA').key, 'Steel (high-strength)');
  eassert.equal(resolveMaterial('DC04 mild sheet').key, 'Steel (mild)');
});
