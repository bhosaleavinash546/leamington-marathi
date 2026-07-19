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
  assert.ok(Math.abs((r.componentCost + r.fabCost + r.assemblyCost + r.testCost + r.logistics + r.overhead + r.tariff) - r.total) < 0.05);
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
  assert.ok(k100.total < k1.total * 0.80, 'high volume should be well below 1k');
  // component unit price itself moves with volume (not just NRE); the mix is
  // MCU-heavy, and silicon discounts flatten — so ~0.75×, not passives-deep.
  assert.ok(k100.componentCost < k1.componentCost * 0.80);
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

// ── v2: per-class volume curves, regions, test strategy, sensitivity ─────────
import { costBomMultiRegion, simulatePcbCost, pcbTornado, classVolMult, PCB_REGIONS } from '../pcb-cost.mjs';

test('per-class volume curves diverge at 150k: passives discount far deeper than silicon', () => {
  const r = classVolMult('resistor', 150000);
  const soc = classVolMult('soc', 150000);
  const mcu = classVolMult('mcu', 150000);
  assert.ok(r < 0.35, `resistor mult ${r} should be deep`);
  assert.ok(soc > 0.8, `soc mult ${soc} should stay high`);
  assert.ok(r < mcu && mcu < soc, 'ordering: passives < mcu < soc');
});

test('no volume cliff: 100k → 150k is smooth and monotonic', () => {
  for (const cls of ['resistor', 'ic_logic', 'soc']) {
    const a = classVolMult(cls, 100000), b = classVolMult(cls, 100001), c = classVolMult(cls, 150000);
    assert.ok(Math.abs(a - b) < 1e-6, `${cls} cliff at 100k`);
    assert.ok(c < a, `${cls} not monotonic`);
  }
  const t1 = costBom(sampleBom, { volume: 100000 }).total;
  const t2 = costBom(sampleBom, { volume: 150000 }).total;
  assert.ok(t2 < t1 && t2 > t1 * 0.9, `150k (£${t2}) should be slightly below 100k (£${t1})`);
});

test('region axis: conversion scales with the hub, materials do not', () => {
  const cn = costBom(sampleBom, { volume: 150000, region: 'china' });
  const de = costBom(sampleBom, { volume: 150000, region: 'germany' });
  const us = costBom(sampleBom, { volume: 150000, region: 'usa' });
  assert.ok(de.assemblyCost > cn.assemblyCost * 2, 'German conversion well above China (line rate, not wage ratio)');
  assert.ok(us.total > cn.total, 'USA total above China');
  // Components are identical across regions (markup lands in overhead, not the line prices).
  assert.ok(Math.abs(de.componentCost - cn.componentCost) < 0.01, 'component cost region-independent');
  assert.ok(de.overhead > cn.overhead, 'markup/overhead higher in Germany');
});

test('multi-region returns all hubs sorted with deltas', () => {
  const mr = costBomMultiRegion(sampleBom, { volume: 150000 });
  assert.equal(mr.results.length, Object.keys(PCB_REGIONS).length);
  for (let i = 1; i < mr.results.length; i++) assert.ok(mr.results[i].total >= mr.results[i - 1].total, 'sorted ascending');
  assert.equal(mr.results[0].deltaVsCheapest, 0);
  const labels = mr.results.map(r => r.region);
  for (const must of ['china', 'india', 'vietnam', 'usa', 'germany']) assert.ok(labels.includes(must), `missing ${must}`);
});

test('automotive grade uplift raises component cost only', () => {
  const auto = costBom(sampleBom, { volume: 10000, autoGrade: true });
  const comm = costBom(sampleBom, { volume: 10000, autoGrade: false });
  assert.ok(auto.componentCost > comm.componentCost * 1.1, 'AEC-Q uplift on components');
  assert.ok(Math.abs(auto.assemblyCost - comm.assemblyCost) < 0.01, 'assembly unaffected');
});

test('test strategy: fixtures amortise and full suite costs more than AOI-only', () => {
  const aoi = costBom(sampleBom, { volume: 150000, testStrategy: 'aoi' });
  const full = costBom(sampleBom, { volume: 150000, testStrategy: 'aoi_ict_fct' });
  assert.ok(full.testCost > aoi.testCost, 'ICT+FCT adds cost');
  // fixture NRE at 150k is pennies per board, not pounds
  assert.ok(full.testCost - aoi.testCost < 2, `delta £${(full.testCost - aoi.testCost).toFixed(2)} should be small at volume`);
  // auto resolves to full suite at automotive volume with active parts
  assert.equal(costBom(sampleBom, { volume: 150000 }).params.testStrategy, 'aoi_ict_fct');
});

test('panel utilisation and tariff move the total in the right direction', () => {
  const base = costBom(sampleBom, { volume: 150000 });
  const poor = costBom(sampleBom, { volume: 150000, panelUtil: 0.6 });
  const tar = costBom(sampleBom, { volume: 150000, tariffPct: 25 });
  assert.ok(poor.fabCost > base.fabCost, 'poor panel utilisation raises fab');
  assert.ok(tar.total > base.total, 'tariff raises total');
  assert.ok(tar.breakdown.tariff && tar.breakdown.tariff.value > 0);
});

test('double-side assembly costs more than single', () => {
  const s = costBom(sampleBom, { volume: 150000, sides: 'single' });
  const d = costBom(sampleBom, { volume: 150000, sides: 'double' });
  assert.ok(d.assemblyCost > s.assemblyCost);
});

test('sensitivity: seeded Monte-Carlo is deterministic with ordered percentiles', () => {
  const a = simulatePcbCost(sampleBom, { volume: 150000 });
  const b = simulatePcbCost(sampleBom, { volume: 150000 });
  assert.deepEqual(a, b, 'same seed → same result');
  assert.ok(a.p10 < a.p50 && a.p50 < a.p90, 'percentiles ordered');
});

test('tornado scenarios are real engine runs ranked by impact', () => {
  const t = pcbTornado(sampleBom, { volume: 150000 });
  assert.ok(t.scenarios.length >= 5);
  for (let i = 1; i < t.scenarios.length; i++) {
    assert.ok(Math.abs(t.scenarios[i - 1].delta) >= Math.abs(t.scenarios[i].delta), 'sorted by |impact|');
  }
  const vol2 = t.scenarios.find(s => s.label === 'Volume ×2');
  assert.ok(vol2 && vol2.delta < 0, 'doubling volume should reduce unit cost');
});
