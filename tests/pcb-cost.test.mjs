import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costBom, COMPONENT_CLASSES } from '../pcb-cost.mjs';

const sampleBom = {
  board: { widthMm: 80, heightMm: 60, layers: 4, finish: 'enig' },
  components: [
    { refDes: 'U1', type: 'mcu', qty: 1, mount: 'SMT', pins: 48 },
    { refDes: 'U2', type: 'ic_power', qty: 1 },
    { refDes: 'R1-R20', type: 'resistor', qty: 20 },
    { refDes: 'C1-C15', type: 'capacitor_mlcc', qty: 15 },
    { refDes: 'J1', type: 'connector', qty: 1, mount: 'TH', pins: 10 },
    { refDes: 'Y1', type: 'crystal', qty: 1 },
  ],
};

test('costs a typical board with a breakdown that sums to the total', () => {
  const r = costBom(sampleBom);
  assert.ok(r.total > 0);
  const sum = r.breakdown.components.value + r.breakdown.fab.value + r.breakdown.assembly.value + r.breakdown.overhead.value;
  assert.ok(Math.abs(sum - r.total) < 0.05, `breakdown ${sum} vs total ${r.total}`);
  // component + fab + assembly + overhead identity
  assert.ok(Math.abs((r.componentCost + r.fabCost + r.assemblyCost + r.overhead) - r.total) < 0.05);
  assert.equal(r.currency, 'EUR');
});

test('placement/lead counts route SMT vs TH correctly', () => {
  const r = costBom(sampleBom);
  // SMT placements = 1(mcu)+1(power)+20(R)+15(C)+1(crystal) = 38
  assert.equal(r.stats.totalPlacements, 38);
  // TH leads = connector 10 pins × 1
  assert.equal(r.stats.thLeads, 10);
});

test('more layers and a larger board cost more to fab', () => {
  const two = costBom({ ...sampleBom, board: { widthMm: 80, heightMm: 60, layers: 2, finish: 'hasl' } });
  const six = costBom({ ...sampleBom, board: { widthMm: 160, heightMm: 120, layers: 6, finish: 'enig' } });
  assert.ok(six.fabCost > two.fabCost * 3);
});

test('higher volume lowers per-board NRE share', () => {
  const lo = costBom(sampleBom, { volume: 100 });
  const hi = costBom(sampleBom, { volume: 100000 });
  assert.ok(hi.total < lo.total);   // NRE amortised over more boards
});

test('unknown component type falls back to "other", not NaN', () => {
  const r = costBom({ board: {}, components: [{ refDes: 'X1', type: 'flux_capacitor', qty: 1 }] });
  assert.ok(Number.isFinite(r.total) && r.total > 0);
  assert.equal(r.lines[0].type, 'other');
});

test('garbage/negative inputs are clamped, never NaN', () => {
  const r = costBom({ board: { widthMm: -5, heightMm: 'abc', layers: 3, finish: 'gold' }, components: [{ type: 'resistor', qty: -10 }] });
  assert.ok(Number.isFinite(r.total) && r.total > 0);
  assert.equal(r.board.layers, 2);          // 3 not allowed → default 2
  assert.equal(r.board.finish, 'hasl');     // unknown finish → default
  assert.equal(r.lines[0].qty, 1);          // qty clamped to ≥1
});

test('a unit-cost override wins over the class average', () => {
  const r = costBom({ board: {}, components: [{ type: 'mcu', qty: 1, unitCostOverride: 12.5 }] });
  assert.equal(r.lines[0].unitCost, 12.5);
});

test('every component class has a positive unit price and valid mount', () => {
  for (const [k, v] of Object.entries(COMPONENT_CLASSES)) {
    assert.ok(v.unit > 0, `${k} unit`);
    assert.ok(v.mount === 'SMT' || v.mount === 'TH', `${k} mount`);
    assert.ok(v.pins >= 1, `${k} pins`);
  }
});
