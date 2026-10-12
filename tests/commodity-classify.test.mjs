import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inferCommodityKey, COMMODITY_KEYS, marketplaceCommodityOf, MARKETPLACE_COMMODITY_KEYS, OFF_ROAD_SYSTEM_NAMES } from '../src/data/commodity-classify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('canonical systems resolve to their own group', () => {
  assert.equal(inferCommodityKey('Battery Pack'), 'Battery');
  assert.equal(inferCommodityKey('EDU / Electric Drive Unit'), 'EDU');
  assert.equal(inferCommodityKey('Chassis'), 'Chassis');
  assert.equal(inferCommodityKey('Driveline'), 'Driveline');
  assert.equal(inferCommodityKey('Body Structure'), 'BIW');
  assert.equal(inferCommodityKey('Thermal Management'), 'Electrical');
});

test('driveline subject variants route to Driveline (the C1 bug)', () => {
  for (const s of ['Transfer Case', 'Differential', 'Half Shafts', 'Propeller Shafts', 'Automatic Gearbox (7–8 Speed)', 'Axle / Differential']) {
    assert.equal(inferCommodityKey(s), 'Driveline', `${s} should be Driveline`);
  }
});

test('battery / EDU variants route correctly', () => {
  assert.equal(inferCommodityKey('BEV Battery'), 'Battery');
  assert.equal(inferCommodityKey('BMS'), 'Battery');
  assert.equal(inferCommodityKey('E-Motor'), 'EDU');
  assert.equal(inferCommodityKey('Control & Sensing'), 'EDU');
});

test('ICE/hybrid powertrain variants route to Powertrain', () => {
  for (const s of ['PHEV Powertrain', 'Mild Hybrid Powertrain', 'Engine / Powertrain', 'Exhaust System', 'Fuel / Fluid Systems']) {
    assert.equal(inferCommodityKey(s), 'Powertrain', `${s} should be Powertrain`);
  }
});

test('empty / nullish input returns null, never throws', () => {
  assert.equal(inferCommodityKey(''), null);
  assert.equal(inferCommodityKey(null), null);
  assert.equal(inferCommodityKey(undefined), null);
});

test('every key returned is a valid commodity key', () => {
  for (const s of ['Suspension', 'Door Hardware', 'Glazing / Thermal', 'Cooling System', 'NVH / Damping']) {
    const k = inferCommodityKey(s);
    assert.ok(COMMODITY_KEYS.includes(k), `${s} -> ${k} not a valid key`);
  }
});

test('DATA INTEGRITY: every seeded marketplace system resolves (no orphans)', () => {
  const files = ['marketplace-extra-ideas.json', 'marketplace-suv-ideas.json', 'marketplace-bev-cooling-ideas.json', 'marketplace-driveline-ideas.json'];
  const systems = new Set();
  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(root, f), 'utf-8'));
    for (const idea of arr) systems.add(idea.system);
  }
  const orphans = [...systems].filter(s => inferCommodityKey(s) === null);
  assert.deepEqual(orphans, [], `orphaned systems: ${orphans.join(', ')}`);
});


describe('Off-Road Features marketplace commodity (DECISIONS 127)', () => {
  it('is a marketplace key on top of the engineering keys, which stay unchanged', () => {
    assert.deepEqual(MARKETPLACE_COMMODITY_KEYS, [...COMMODITY_KEYS, 'OffRoad']);
    assert.ok(!COMMODITY_KEYS.includes('OffRoad'));
  });
  it('files an idea only by its explicit ideaData.commodity, as object or JSON string', () => {
    assert.equal(marketplaceCommodityOf({ system: 'Axles', ideaData: { commodity: 'Off-Road Features' } }), 'OffRoad');
    assert.equal(marketplaceCommodityOf({ system: 'Axles', ideaData: JSON.stringify({ commodity: 'Off-Road Features' }) }), 'OffRoad');
    assert.equal(marketplaceCommodityOf({ system: 'Off-Road Hardware', ideaData: { offRoad: true } }), 'Chassis');
  });
  it('every Off-Road Features sub-system still has an engineering commodity', () => {
    for (const s of OFF_ROAD_SYSTEM_NAMES) assert.ok(COMMODITY_KEYS.includes(inferCommodityKey(s)), s);
  });
  it('the 300-idea off-road luxury pack is filed under Off-Road Features', () => {
    const pack = JSON.parse(readFileSync(new URL('../marketplace-offroad-luxury-ideas.json', import.meta.url), 'utf8'));
    assert.equal(pack.length, 300);
    for (const x of pack) assert.equal(marketplaceCommodityOf(x), 'OffRoad', x.id);
  });
});
