import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveMaterialPrices, commodityPerKg, MATERIAL_COMMODITY_MAP } from '../material-commodity.mjs';
import { getActiveLibrary } from '../active-library.mjs';
import { computeShouldCost, MATERIALS } from '../costing-engine.mjs';

const priceCache = () => ({
  lastRefresh: Date.parse('2026-07-03T12:00:00Z'),
  data: {
    steel_hrc_eu: { label: 'Steel HRC (EU)', value: 710, unit: '€/t' },
    dp780_ahss:   { label: 'DP780 AHSS', value: 1000, unit: '€/t' },
    aluminium_lme:{ label: 'Aluminium (LME)', value: 2700, unit: '€/t' },
    al_hpdc_a380: { label: 'Al HPDC Alloy (A380)', value: 2850, unit: '€/t' },
    zinc_lme:     { label: 'Zinc (LME)', value: 3100, unit: '€/t' },
    pa66_gf30:    { label: 'PA66-GF30 (Nylon)', value: 3.9, unit: '€/kg' },
    nmc_cell:     { label: 'NMC Pack', value: 108, unit: '€/kWh' },  // non-mass unit
  },
});

test('commodityPerKg normalises €/t and €/kg, rejects non-mass units', () => {
  assert.equal(commodityPerKg({ value: 2700, unit: '€/t' }), 2.7);
  assert.equal(commodityPerKg({ value: 3.9, unit: '€/kg' }), 3.9);
  assert.equal(commodityPerKg({ value: 108, unit: '€/kWh' }), null);
  assert.equal(commodityPerKg({ value: NaN, unit: '€/t' }), null);
  assert.equal(commodityPerKg(undefined), null);
});

test('mapped materials get a live €/kg; unmapped keep the baseline', () => {
  const base = { MATERIALS, PROCESSES: {}, REGIONS: {} };
  const { library, priceBasis, pricedAt } = applyLiveMaterialPrices(base, priceCache());
  // seed commodity values reproduce the library baseline (within the alloy factor/premium)
  assert.ok(Math.abs(library.MATERIALS['Aluminium 6061'].price - 2.85) < 0.01);
  assert.ok(Math.abs(library.MATERIALS['Aluminium A356 (cast)'].price - 2.60) < 0.01);
  assert.ok(priceBasis['Aluminium 6061'].commodityKey === 'aluminium_lme');
  // Titanium has no mapping → untouched
  assert.equal(library.MATERIALS['Titanium Ti-6Al-4V'].price, MATERIALS['Titanium Ti-6Al-4V'].price);
  assert.equal(priceBasis['Titanium Ti-6Al-4V'], undefined);
  assert.equal(pricedAt, '2026-07-03T12:00:00.000Z');
});

test('a commodity spike raises the deterministic part cost', () => {
  const base = { MATERIALS, PROCESSES: getActiveLibrary().PROCESSES, REGIONS: getActiveLibrary().REGIONS };
  const flat = applyLiveMaterialPrices(base, priceCache()).library;
  const spikeCache = priceCache();
  spikeCache.data.al_hpdc_a380.value = 3990;   // +40% aluminium
  const spiked = applyLiveMaterialPrices(base, spikeCache).library;
  const inp = { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 1.2, annualVolume: 150000, region: 'Germany' };
  const flatCost = computeShouldCost(inp, {}, null, flat).totalShouldCost;
  const spikedCost = computeShouldCost(inp, {}, null, spiked).totalShouldCost;
  assert.ok(spikedCost > flatCost * 1.1, `expected material spike to move cost: ${flatCost} -> ${spikedCost}`);
});

test('missing price cache degrades gracefully to baseline (no throw)', () => {
  const base = { MATERIALS, PROCESSES: {}, REGIONS: {} };
  const { library, pricedAt } = applyLiveMaterialPrices(base, { data: {}, lastRefresh: null });
  assert.equal(library.MATERIALS['Aluminium 6061'].price, MATERIALS['Aluminium 6061'].price);
  assert.equal(pricedAt, null);
});

test('every mapped commodity key is a plausible identifier', () => {
  for (const [mat, m] of Object.entries(MATERIAL_COMMODITY_MAP)) {
    assert.ok(typeof m.commodityKey === 'string' && m.commodityKey.length > 0, `${mat} commodityKey`);
    assert.ok(Number.isFinite(m.factor) && m.factor > 0, `${mat} factor`);
    assert.ok(Number.isFinite(m.premium), `${mat} premium`);
  }
});
