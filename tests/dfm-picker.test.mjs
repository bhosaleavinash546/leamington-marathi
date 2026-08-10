// CAN A DIE-CASTING ENGINEER FIND DIE CASTING?
//
// Written after a live demo in which the user went looking for HPDC in front of
// a director and could not find it. Every casting process was implemented,
// routed to its own rule family and covered by tests. None of them was
// FINDABLE: the process is keyed 'Die Casting (Aluminium)' and the letters
// H-P-D-C appeared nowhere in the product, LPDC was 'Low-Pressure Die Casting',
// and sheet metal was 'Stamping / Deep Drawing' with neither word in it.
//
// A feature nobody can find is not shipped, so these are gates on the LABELS
// rather than on the engine.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROCESS_DISPLAY, PROCESS_GROUP_ORDER, PROCESS_TO_DFM_FAMILY,
  processesForMaterial, dfmOptions,
} from '../dfm-process-registry.mjs';
import { MATERIALS, PROCESSES } from '../costing-engine.mjs';

/** Every way a person might go looking for a process, and what they must land on. */
const MUST_FIND = [
  ['HPDC', 'Die Casting (Aluminium)'],
  ['hpdc', 'Die Casting (Aluminium)'],
  ['high pressure die casting', 'Die Casting (Aluminium)'],
  ['druckguss', 'Die Casting (Aluminium)'],
  ['LPDC', 'Low-Pressure Die Casting'],
  ['GDC', 'Gravity Die Casting'],
  ['VHPDC', 'Vacuum-Assisted Die Casting'],
  ['SSM', 'Semi-Solid Casting (Thixo/Rheo)'],
  ['sheetmetal', 'Stamping / Deep Drawing'],
  ['sheet metal', 'Stamping / Deep Drawing'],
  ['lost wax', 'Investment Casting'],
  ['PHS', 'Hot Stamping (Press Hardening)'],
  ['MIM', 'Metal Injection Moulding (MIM)'],
  ['LPBF', 'Laser Powder Bed Fusion (DMLS/SLM)'],
  ['PM', 'Powder Metallurgy (Press & Sinter)'],
];

/** The search a picker does: label first, then the alias list. */
function search(term) {
  const q = term.toLowerCase();
  return Object.entries(PROCESS_DISPLAY)
    .filter(([, d]) => d.label.toLowerCase().includes(q) || d.aliases.some(a => a.toLowerCase().includes(q)))
    .map(([name]) => name);
}

test('the words an engineer types find the process they mean', () => {
  for (const [term, expected] of MUST_FIND) {
    const hits = search(term);
    assert.ok(hits.includes(expected),
      `"${term}" must find ${expected} — it found ${hits.length ? hits.join(', ') : 'nothing'}`);
  }
});

test('HPDC is reachable from every alloy that can be die cast', () => {
  const diecast = ['Aluminium A380 / ADC12 (die-cast)', 'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)',
    'Aluminium Castasil-37 (AlSi9MnMoZr, structural HPDC)', 'Aluminium ADC10 / A383 (die-cast)',
    'Aluminium A360 (die-cast)', 'Aluminium A413 (die-cast)', 'Magnesium AM60B (die-cast)',
    'Magnesium AZ91D (die-cast)'];
  for (const m of diecast) {
    assert.ok(MATERIALS[m], `${m} must exist as a material`);
    const rows = processesForMaterial(m);
    const hpdc = rows.find(r => r.name === 'Die Casting (Aluminium)');
    assert.ok(hpdc, `${m} must offer HPDC`);
    assert.match(hpdc.label, /^HPDC/, 'the acronym must lead the label so type-ahead reaches it');
    assert.equal(hpdc.dfmFamily, 'hpdc', 'and it must route to the HPDC ruleset');
    assert.equal(hpdc.group, 'Casting');
  }
  for (const m of ['Zinc (ZAMAK 2)', 'Zinc ZA-8']) {
    const zinc = processesForMaterial(m).find(r => r.name === 'Die Casting (Zinc)');
    assert.ok(zinc && zinc.dfmFamily === 'hpdc-zinc', `${m} must offer zinc HPDC`);
  }
});

test('every process a user can pick carries a label, a group and a rule route', () => {
  // A process added to the cost engine without a display entry would appear in
  // the menu under its raw key, in an "Other" group, at the bottom — which is
  // how this class of fault gets back in.
  const undisplayed = Object.keys(PROCESSES).filter(n => !PROCESS_DISPLAY[n]);
  assert.deepEqual(undisplayed, [], 'these processes have no display label:\n  ' + undisplayed.join('\n  '));

  for (const [name, d] of Object.entries(PROCESS_DISPLAY)) {
    assert.ok(d.label && d.label.length > 2, `${name} needs a label`);
    assert.ok(PROCESS_GROUP_ORDER.includes(d.group), `${name} sits in unknown group "${d.group}"`);
    assert.ok(Array.isArray(d.aliases), `${name} needs an alias list, even an empty one`);
    // Either it shapes the part and has a rule family, or the registry knows why
    // it does not. Both are handled elsewhere; this just pins the pair.
    assert.ok(Object.prototype.hasOwnProperty.call(PROCESS_TO_DFM_FAMILY, name),
      `${name} must be routed — to a rule family or explicitly to null`);
  }
});

test('the casting alloys a foundry quotes are all selectable', () => {
  const REQUIRED = [
    'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)',
    'Aluminium Castasil-37 (AlSi9MnMoZr, structural HPDC)',
    'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)',
    'Aluminium ADC10 / A383 (die-cast)',
    'Aluminium A360 (die-cast)', 'Aluminium A413 (die-cast)',
    'Aluminium A357 (cast)', 'Aluminium AlSi7Mg0.3 / EN AC-42100 (cast)',
    'Magnesium AM60B (die-cast)', 'Magnesium AM50A (die-cast)',
    'Zinc (ZAMAK 2)', 'Zinc ZA-8',
    'Cast Iron (ADI 900, austempered)', 'Cast Iron (SiMo, exhaust)',
  ];
  const picker = dfmOptions();
  const offered = new Set(picker.materialFamilies.flatMap(f => f.grades));
  for (const m of REQUIRED) {
    assert.ok(MATERIALS[m], `${m} missing from MATERIALS`);
    assert.ok(MATERIALS[m].density > 0, `${m} needs a density or nothing downstream can weigh it`);
    assert.ok(offered.has(m), `${m} exists but never reaches the picker`);
  }
});

test('the menu is grouped, and Casting comes first', () => {
  const rows = processesForMaterial('Aluminium A380 / ADC12 (die-cast)');
  const groups = [...new Set(rows.map(r => r.group))];
  assert.equal(groups[0], 'Casting', 'a die-cast alloy must open on the casting group');
  // Inside a group, the processes that can actually be judged come first.
  const casting = rows.filter(r => r.group === 'Casting');
  const firstWithout = casting.findIndex(r => !r.dfmFamily);
  const lastWith = casting.map(r => !!r.dfmFamily).lastIndexOf(true);
  if (firstWithout >= 0) assert.ok(firstWithout > lastWith, 'rule-bearing processes must sort above the rest');
});
