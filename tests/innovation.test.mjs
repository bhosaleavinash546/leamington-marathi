// Innovation method cores: the deterministic math (DFA scoring, value index,
// target gap, morphological combinatorics) and the catalogue completeness.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  METHODS, methodIds, getMethod, SCAMPER, EFFECTS, TRENDS, CIRCULARITY,
  dfaScore, valueIndex, targetGap, morphology, functionCostMatrix, specRelaxationDeltas,
} from '../innovation.mjs';

describe('innovation catalogue', () => {
  it('has all 10 methods across the 3 tiers with required metadata', () => {
    assert.equal(METHODS.length, 10);
    for (const m of METHODS) {
      assert.ok(m.id && m.name && m.blurb && [1, 2, 3].includes(m.tier), `bad method ${m.id}`);
    }
    assert.deepEqual([...new Set(methodIds())].length, 10);   // unique ids
    assert.ok(getMethod('dfa'));
    assert.equal(getMethod('nope'), null);
  });

  it('curated knowledge lists are populated', () => {
    assert.equal(SCAMPER.length, 7);
    assert.ok(SCAMPER.every(s => s.verb && s.q && s.auto));
    assert.ok(EFFECTS.length >= 6 && EFFECTS.every(e => e.fn && e.effects.length >= 3));
    assert.ok(TRENDS.length >= 8 && TRENDS.every(t => t.name && t.next && t.auto));
    assert.ok(CIRCULARITY.length >= 6 && CIRCULARITY.every(c => c.strategy && c.detail));
  });
});

describe('DFA (Boothroyd-Dewhurst)', () => {
  it('counts a part necessary if ANY of the three questions is true', () => {
    const r = dfaScore([
      { name: 'housing', moves: false, differentMaterial: false, mustSeparate: true },   // service → necessary
      { name: 'gear', moves: true, differentMaterial: false, mustSeparate: false },        // moves → necessary
      { name: 'insulator', moves: false, differentMaterial: true, mustSeparate: false },   // material → necessary
      { name: 'spacer', moves: false, differentMaterial: false, mustSeparate: false },     // none → candidate
      { name: 'bracket', moves: false, differentMaterial: false, mustSeparate: false },    // none → candidate
    ]);
    assert.equal(r.totalParts, 5);
    assert.equal(r.theoreticalMin, 3);
    assert.deepEqual(r.consolidationCandidates.sort(), ['bracket', 'spacer']);
    assert.equal(r.designEfficiencyPct, 60);   // 3/5
  });

  it('never divides by zero — a fully-consolidatable set floors min at 1', () => {
    const r = dfaScore([{ name: 'a' }, { name: 'b' }]);
    assert.equal(r.theoreticalMin, 1);
    assert.equal(r.consolidationCandidates.length, 2);
  });

  it('rejects an empty part list', () => assert.throws(() => dfaScore([])));
});

describe('Value Engineering value index', () => {
  it('flags a function that costs a lot but is worth little', () => {
    const r = valueIndex([
      { name: 'transmit load', costPct: 40, worthPct: 60 },
      { name: 'look finished', costPct: 40, worthPct: 5 },     // poor value
      { name: 'resist corrosion', costPct: 20, worthPct: 35 },
    ]);
    const finish = r.rows.find(x => x.name === 'look finished');
    assert.ok(finish.valueIndex < 0.7, `expected poor value, got ${finish.valueIndex}`);
    assert.ok(r.poorValueFunctions.includes('look finished'));
    const load = r.rows.find(x => x.name === 'transmit load');
    assert.ok(load.valueIndex >= 0.7);
  });

  it('normalises arbitrary raw weights to shares', () => {
    const r = valueIndex([{ name: 'a', costPct: 2, worthPct: 2 }, { name: 'b', costPct: 6, worthPct: 6 }]);
    // equal cost/worth per function → value index ≈ 1 each
    assert.ok(r.rows.every(x => Math.abs(x.valueIndex - 1) < 0.05));
    assert.equal(Math.round(r.rows[0].costPct + r.rows[1].costPct), 100);
  });
});

describe('Design-to-Cost gap', () => {
  it('computes the gap and allocates it across reducibility-weighted buckets', () => {
    const r = targetGap(12, 10, [
      { name: 'material', cost: 6, reducibility: 0.6 },
      { name: 'process', cost: 4, reducibility: 0.4 },
      { name: 'overhead', cost: 2, reducibility: 0.1 },
    ]);
    assert.equal(r.gap, 2);
    assert.equal(r.gapPct, 16.7);
    assert.equal(r.achievable, false);
    const sum = r.allocations.reduce((s, a) => s + a.target, 0);
    assert.ok(Math.abs(sum - 2) < 0.01, `allocations must sum to the gap, got ${sum}`);
    // material (biggest × most reducible) carries the most
    const material = r.allocations.find(a => a.name === 'material');
    assert.ok(material.target === Math.max(...r.allocations.map(a => a.target)));
  });

  it('reports already-achieved when target ≥ current', () => {
    const r = targetGap(10, 11, []);
    assert.ok(r.gap < 0 && r.achievable);
  });

  it('rejects non-positive current cost', () => assert.throws(() => targetGap(0, 5, [])));
});

describe('Morphological analysis', () => {
  it('computes the full combination space and a diverse sample', () => {
    const r = morphology([
      { name: 'actuate', options: ['solenoid', 'motor', 'pneumatic', 'SMA'] },
      { name: 'mount', options: ['bracket', 'integrated boss'] },
      { name: 'seal', options: ['O-ring', 'lip', 'labyrinth'] },
    ], 5);
    assert.equal(r.totalCombinations, 4 * 2 * 3);   // 24
    assert.equal(r.sampledConcepts.length, 5);
    // each concept picks one option per dimension
    for (const c of r.sampledConcepts) assert.equal(c.length, 3);
    // the diagonal walk spreads first-dimension options (not all the same)
    const firstDimPicks = new Set(r.sampledConcepts.map(c => c[0].option));
    assert.ok(firstDimPicks.size > 1);
  });

  it('caps the sample at the number of real combinations', () => {
    const r = morphology([{ name: 'x', options: ['a', 'b'] }], 10);
    assert.equal(r.totalCombinations, 2);
    assert.equal(r.sampledConcepts.length, 2);
  });

  it('rejects sub-functions with no options', () => assert.throws(() => morphology([{ name: 'x', options: [] }])));
});

describe('functionCostMatrix (FAST)', () => {
  const COMPONENTS = [{ name: 'housing', cost: 40 }, { name: 'gear set', cost: 50 }, { name: 'seals', cost: 10 }];
  const FUNCTIONS = [{ name: 'transmit torque', worthPct: 60 }, { name: 'contain lubricant', worthPct: 25 }, { name: 'locate assembly', worthPct: 15 }];
  const ALLOC = [
    [10, 40, 50],   // housing: mostly containment + location
    [95, 0, 5],     // gears: torque
    [0, 100, 0],    // seals: containment
  ];

  it('function costs sum exactly to total component cost', () => {
    const r = functionCostMatrix(COMPONENTS, FUNCTIONS, ALLOC);
    assert.equal(r.totalCost, 100);
    const fnSum = r.functions.reduce((s, f) => s + f.cost, 0);
    assert.ok(Math.abs(fnSum - 100) < 0.05, `function costs sum ${fnSum}`);
  });

  it('flags poor-value functions (cost share ≫ worth share)', () => {
    const r = functionCostMatrix(COMPONENTS, FUNCTIONS, ALLOC);
    // contain lubricant: cost 40+0+10=… → 4+0+10=… check: housing 40×40%=16, seals 10×100%=10 → 26% cost vs 25% worth → balanced
    // locate assembly: housing 40×50%=20 + gears 50×5%=2.5 → 22.5% cost vs 15% worth → VI 0.67 → poor
    assert.ok(r.poorValueFunctions.includes('locate assembly'));
    const torque = r.functions.find(f => f.name === 'transmit torque');
    assert.ok(torque.valueIndex > 1, 'torque is worth more than it costs');
  });

  it('enforces the rows-sum-to-100 invariant with the offending component named', () => {
    assert.throws(() => functionCostMatrix(COMPONENTS, FUNCTIONS, [[50, 30, 10], [95, 0, 5], [0, 100, 0]]), /housing.*sums to 90/);
  });

  it('tolerates small LLM rounding (±2) by renormalising', () => {
    const r = functionCostMatrix(COMPONENTS, FUNCTIONS, [[10, 40, 51], [95, 0, 5], [0, 100, 0]]);
    const fnSum = r.functions.reduce((s, f) => s + f.cost, 0);
    assert.ok(Math.abs(fnSum - 100) < 0.05, 'renormalised to exact within tolerance');
  });

  it('rejects dimension mismatches and empty inputs', () => {
    assert.throws(() => functionCostMatrix([], FUNCTIONS, []));
    assert.throws(() => functionCostMatrix(COMPONENTS, FUNCTIONS, [[100, 0], [95, 5], [0, 100]]), /entries/);
    assert.throws(() => functionCostMatrix(COMPONENTS, FUNCTIONS, ALLOC.slice(0, 2)), /one row per component/);
  });
});

describe('specRelaxationDeltas (Spec & Tolerance Challenge)', () => {
  const BASE = { material: 'aluminium', process: 'cnc machining', weightKg: 1.2, annualVolume: 80000, region: 'Germany' };

  it('relaxing precision → standard saves real engine money, monotonically', () => {
    const r = specRelaxationDeltas({ ...BASE, toleranceClass: 'precision', surfaceFinish: 'polished', criticalCharacteristics: 6 });
    assert.ok(r.baseline > 0);
    assert.ok(r.steps.length >= 4, `expected tol×2 + fin×2 + cc steps, got ${r.steps.length}`);
    for (const s of r.steps) assert.ok(s.savingEur > 0, `${s.label} must save (got €${s.savingEur})`);
    const tight = r.steps.find(s => s.id === 'tol-tight');
    const std = r.steps.find(s => s.id === 'tol-standard');
    assert.ok(std.savingEur > tight.savingEur, 'two steps down saves more than one');
    const ccHalf = r.steps.find(s => s.id === 'cc-half');
    const ccZero = r.steps.find(s => s.id === 'cc-zero');
    assert.ok(ccZero.savingEur > ccHalf.savingEur, 'deleting all CCs saves more than half');
  });

  it('already-standard drawing has no relaxation steps', () => {
    const r = specRelaxationDeltas({ ...BASE, toleranceClass: 'standard', surfaceFinish: 'standard', criticalCharacteristics: 0 });
    assert.equal(r.steps.length, 0);
  });

  it('rejects unknown material/process and bad weight', () => {
    assert.throws(() => specRelaxationDeltas({ ...BASE, material: 'unobtainium-x99-zzz' }));
    assert.throws(() => specRelaxationDeltas({ ...BASE, weightKg: 0 }), /weightKg/);
  });
});
