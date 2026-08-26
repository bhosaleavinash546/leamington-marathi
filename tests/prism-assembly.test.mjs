// Assembly core — suggestions that stay suggestions, roll-ups that disclose
// what they leave out, evidence numbered at three levels.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDU_PART_HINTS, suggestForName, rollUpBom, assemblyEvidence, ASSEMBLY_LENSES,
  numberSections, assemblyPromptBlock,
} from '../prism-assembly.mjs';
import { MATERIALS, PROCESSES } from '../costing-engine.mjs';

const CAT = { materials: MATERIALS, processes: PROCESSES };

describe('part recognition hints', () => {
  it('every hint names a material and process the catalogue actually holds', () => {
    for (const h of EDU_PART_HINTS) {
      if (h.boughtPart) { assert.ok(!h.material && !h.process, `${h.id} is a bought part and must not carry a route`); continue; }
      assert.ok(MATERIALS[h.material], `${h.id} points at unknown material "${h.material}"`);
      assert.ok(PROCESSES[h.process], `${h.id} points at unknown process "${h.process}"`);
    }
  });

  it('maps real EDU product-tree names to the right block', () => {
    const cases = [
      ['STATOR_LAMINATION_STACK', 'Stator', 'Electrical Steel (M250-35A)'],
      ['ROTOR_SHAFT_800V', 'Rotor', 'Steel 42CrMo4 / 4140'],
      ['HAIRPIN_WINDING_SET', 'Windings', 'Copper (enamelled winding wire)'],
      ['NdFeB_MAGNET_SEGMENT', 'Rotor', 'Magnet (NdFeB, sintered, heavy-RE)'],
      ['MOTOR_HOUSING_WATER_JACKET', 'Housing', 'Aluminium A380 / ADC12 (die-cast)'],
      ['PHASE_BUSBAR_U', 'Power connection', 'Copper (Cu-ETP)'],
    ];
    for (const [name, sub, mat] of cases) {
      const s = suggestForName(name, CAT);
      assert.ok(s, `${name} matched nothing`);
      assert.equal(s.subassembly, sub, name);
      assert.equal(s.material, mat, name);
      assert.ok(s.basis.length > 20, `${name} suggestion carries no basis`);
    }
  });

  it('bought parts are named as bought, never given an engine route', () => {
    for (const n of ['DEEP_GROOVE_BEARING_6208', 'RESOLVER_ASSY', 'M8x30_BOLT']) {
      const s = suggestForName(n, CAT);
      assert.equal(s.boughtPart, true, n);
      assert.equal(s.material, null);
      assert.match(s.basis, /price|catalogue|PCB/i);
    }
  });

  it('an unrecognised name suggests nothing rather than guessing', () => {
    assert.equal(suggestForName('PART_4711_REV_C', CAT), null);
    assert.equal(suggestForName('', CAT), null);
  });
});

describe('BOM roll-up', () => {
  const rows = [
    { name: 'Stator lamination stack', subassembly: 'Stator', massKg: 12, costEur: 44, qty: 1 },
    { name: 'Hairpin winding set', subassembly: 'Windings', massKg: 4.5, costEur: 81, qty: 1 },
    { name: 'Magnet segment', subassembly: 'Rotor', massKg: 0.15, costEur: 17, qty: 12 },
    { name: 'Bearing 6208', subassembly: 'Rotor', boughtPriceEur: 4.2, qty: 2 },
    { name: 'Inverter power module', subassembly: 'Inverter', qty: 1, uncostedReason: 'bought electronics — use the PCB tool' },
  ];

  it('totals extended cost, shares by subassembly, and ranks blocks by money', () => {
    const r = rollUpBom(rows);
    assert.equal(r.totalEur, 44 + 81 + 17 * 12 + 4.2 * 2);
    assert.equal(r.partCount, 1 + 1 + 12 + 2);
    assert.equal(r.subassemblies[0].subassembly, 'Rotor', 'the 12 magnets are the biggest block');
    const sum = r.subassemblies.reduce((s, x) => s + x.sharePct, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `shares sum to ${sum}`);
  });

  it('DISCLOSES what it left out — the total is a floor, and says so', () => {
    const r = rollUpBom(rows);
    assert.equal(r.uncosted.length, 1);
    assert.equal(r.uncosted[0].name, 'Inverter power module');
    assert.match(r.caveat, /NOT in this total/);
    assert.match(r.caveat, /floor, not the assembly's cost/);
    assert.equal(r.costedPct, 80);
  });

  it('distinguishes engine figures from user-entered bought-part prices', () => {
    const r = rollUpBom(rows);
    const rotor = r.subassemblies.find(s => s.subassembly === 'Rotor');
    assert.ok(rotor.rows.some(x => x.source === 'engine'));
    assert.ok(rotor.rows.some(x => /bought-part price entered by the user/.test(x.source)));
  });

  it('a fully costed BOM says so instead of borrowing the caveat', () => {
    const r = rollUpBom(rows.slice(0, 4));
    assert.equal(r.uncosted.length, 0);
    assert.match(r.caveat, /All 4 BOM rows are costed/);
    assert.match(r.caveat, /held-out accuracy/);
  });

  it('returns null on an empty BOM rather than a zero total', () => {
    assert.equal(rollUpBom([]), null);
    assert.equal(rollUpBom(null), null);
  });
});

describe('assembly evidence and lenses', () => {
  const r = rollUpBom([
    { name: 'Stator lamination stack', subassembly: 'Stator', massKg: 12, costEur: 44, qty: 1 },
    { name: 'Hairpin winding set', subassembly: 'Windings', massKg: 4.5, costEur: 81, qty: 1 },
    { name: 'Inverter module', subassembly: 'Inverter', qty: 1, uncostedReason: 'bought electronics' },
  ]);

  it('renders all three levels plus the excluded rows', () => {
    const secs = assemblyEvidence({ assemblyName: '800V EDU', rollUp: r, contextLines: ['800V PSM traction EDU.'] });
    const ids = secs.map(s => s.id);
    for (const need of ['assembly', 'subassembly', 'parts', 'uncosted', 'assembly-context']) {
      assert.ok(ids.includes(need), `missing ${need} section`);
    }
    const assemblyText = secs.find(s => s.id === 'assembly').lines.join('\n');
    assert.match(assemblyText, /Cost share: Windings/);
    assert.match(assemblyText, /% of BOM rows costed/);
    assert.match(secs.find(s => s.id === 'uncosted').lines.join('\n'), /saving is unpriced/);
  });

  it('every lens targets a real level and only real sections', () => {
    const ids = new Set(assemblyEvidence({ assemblyName: 'x', rollUp: r }).map(s => s.id).concat('assembly-context'));
    const levels = new Set(['Assembly', 'Subassembly', 'Part']);
    for (const l of ASSEMBLY_LENSES) {
      assert.ok(levels.has(l.level), `${l.id} has no valid systemLevel`);
      for (const s of l.sections) assert.ok(ids.has(s), `${l.id} references unknown section ${s}`);
      assert.match(l.directive, /systemLevel/);
    }
  });
});

describe('assembly prompt block', () => {
  const r = rollUpBom([
    { name: 'Stator stack', subassembly: 'Stator', massKg: 12, costEur: 44, qty: 1 },
    { name: 'Inverter', subassembly: 'Inverter', qty: 1, uncostedReason: 'bought electronics' },
  ]);
  const numbered = numberSections(assemblyEvidence({ assemblyName: 'EDU', rollUp: r }));

  it('numbers uniquely and demands citation, cost-share order and unpriced honesty', () => {
    const refs = numbered.flatMap(s => s.lines.map(l => l.ref));
    assert.equal(new Set(refs).size, refs.length);
    const block = assemblyPromptBlock(numbered);
    assert.match(block, /UNTRUSTED DATA/);
    assert.match(block, /evidenceRefs/);
    assert.match(block, /COST-SHARE order/);
    assert.match(block, /saving is unpriced/);
  });

  it('a lens slices the evidence and states its level', () => {
    const lens = ASSEMBLY_LENSES.find(l => l.id === 'part-line');
    const block = assemblyPromptBlock(numbered, lens);
    assert.match(block, /LENS: Part-line attack \(Part level\)/);
    assert.doesNotMatch(block, /Assembly roll-up/);
  });
});
