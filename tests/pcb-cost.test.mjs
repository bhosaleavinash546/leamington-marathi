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
  const sum = Object.values(r.breakdown).reduce((a, b) => a + b.value, 0);
  assert.ok(Math.abs(sum - r.total) < 0.05, `breakdown ${sum} vs total ${r.total}`);
  assert.ok(Math.abs((r.componentCost + r.fabCost + r.assemblyCost + r.logistics + r.overhead) - r.total) < 0.05);
  assert.equal(r.currency, 'GBP');
});

test('placement/lead counts route SMT vs TH correctly, and BGA/active flagged', () => {
  const r = costBom(sampleBom);
  assert.equal(r.stats.totalPlacements, 38);   // mcu+power+20R+15C+crystal
  assert.equal(r.stats.thLeads, 10);           // connector 10 pins × 1
  assert.equal(r.stats.bgaPlacements, 1);      // mcu 48 pins ≥ 48 → fine-pitch
  assert.equal(r.stats.activeDevices, 2);      // mcu + ic_power
});

test('cost scales down with volume across tiers (not just NRE)', () => {
  const proto = costBom(sampleBom, { volume: 10 });
  const k1 = costBom(sampleBom, { volume: 1000 });
  const k100 = costBom(sampleBom, { volume: 100000 });
  assert.ok(proto.total > k1.total * 1.4, 'prototype should be well above 1k');
  assert.ok(k100.total < k1.total * 0.75, 'high volume should be well below 1k');
  // component unit price itself moves with volume (not just NRE)
  assert.ok(k100.componentCost < k1.componentCost * 0.7);
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

test('a POSITIVE unit-cost override wins; blank/zero falls back to class average', () => {
  assert.equal(costBom({ board: {}, components: [{ type: 'mcu', qty: 1, unitCostOverride: 12.5 }] }).lines[0].unitCost, 12.5);
  // blank / 0 must NOT zero the component out
  const zeroed = costBom({ board: {}, components: [{ type: 'mcu', qty: 1, unitCostOverride: 0 }] });
  assert.ok(zeroed.lines[0].unitCost > 1, 'zero override should fall back to class average, not 0');
  const blank = costBom({ board: {}, components: [{ type: 'mcu', qty: 1, unitCostOverride: '' }] });
  assert.ok(blank.lines[0].unitCost > 1);
});

test('output type is normalised so a re-cost reprices consistently', () => {
  const r = costBom({ board: {}, components: [{ type: '  MCU  ', qty: 1 }] });
  assert.equal(r.lines[0].type, 'mcu');          // not 'other'
  assert.equal(r.lines[0].label, 'Microcontroller');
});

test('uniqueParts dedupes by type+package', () => {
  const r = costBom({ board: {}, components: [
    { type: 'resistor', package: '0402', qty: 10 },
    { type: 'resistor', package: '0402', qty: 5 },   // same class+pkg
    { type: 'resistor', package: '0603', qty: 8 },   // different pkg
  ] });
  assert.equal(r.stats.uniqueParts, 2);
  assert.equal(r.stats.lineItems, 3);
});

test('every component class has a positive unit price and valid mount', () => {
  for (const [k, v] of Object.entries(COMPONENT_CLASSES)) {
    assert.ok(v.unit > 0, `${k} unit`);
    assert.ok(v.mount === 'SMT' || v.mount === 'TH', `${k} mount`);
    assert.ok(v.pins >= 1, `${k} pins`);
  }
});
