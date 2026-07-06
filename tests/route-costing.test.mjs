import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShouldCost, computeRouteCost, simulateRouteCost } from '../costing-engine.mjs';
import { resolveRoute } from '../material-process-resolve.mjs';
import { computeCarbon } from '../carbon.mjs';
import { applyLiveMaterialPrices } from '../material-commodity.mjs';
import { MATERIALS } from '../costing-engine.mjs';

const knuckle = { material: 'Cast Iron (Ductile/GJS)', weightKg: 6.7, annualVolume: 200000, region: 'China' };

test('a routed part costs MORE than its raw primary op (machining adds real cost)', () => {
  const raw = computeShouldCost({ ...knuckle, process: 'Sand Casting' }).totalShouldCost;
  const routed = computeRouteCost({ ...knuckle, route: ['Sand Casting', 'Machining (secondary ops)', 'Washing & Final Inspection'] }).totalShouldCost;
  assert.ok(routed > raw * 1.2, `routed ${routed} should exceed raw ${raw} by the machining content`);
  assert.ok(routed < raw * 2.5, `routed ${routed} implausibly high vs raw ${raw}`);
});

test('single-op route delegates to computeShouldCost (identical result)', () => {
  const a = computeRouteCost({ ...knuckle, route: ['Sand Casting'] }).totalShouldCost;
  const b = computeShouldCost({ ...knuckle, process: 'Sand Casting' }).totalShouldCost;
  assert.equal(a, b);
});

test('rolled-throughput yield compounds and machining stock inflates the poured mass', () => {
  const r = computeRouteCost({ ...knuckle, route: ['Sand Casting', 'Machining (secondary ops)'] });
  assert.ok(r.drivers.rolledThroughputYield < 94 && r.drivers.rolledThroughputYield > 85, `RTY ${r.drivers.rolledThroughputYield}`);
  // 6.7 kg finished / 0.92 machining stock / 0.55 sand yield ≈ 13.2 kg poured
  assert.ok(r.drivers.inputMassKg > 12.5 && r.drivers.inputMassKg < 14, `poured ${r.drivers.inputMassKg}`);
});

test('a conversion-only op as PRIMARY throws a clear error (both entry points)', () => {
  assert.throws(() => computeRouteCost({ ...knuckle, route: ['E-coat (KTL)', 'Sand Casting'] }), /primary/i);
  assert.throws(() => computeShouldCost({ ...knuckle, process: 'E-coat (KTL)' }), /downstream operation/i);
});

test('family guard applies per-op in a route', () => {
  assert.throws(() => computeRouteCost({ material: 'Polypropylene (PP)', weightKg: 0.2, annualVolume: 100000, region: 'China', route: ['Injection Moulding', 'Zinc Plating'] }), /not compatible/i);
});

test('billet Machining (CNC) downstream maps to the secondary-op model (no buy-to-fly double charge)', () => {
  const r = computeRouteCost({ ...knuckle, route: ['Sand Casting', 'Machining (CNC)'] });
  assert.equal(r.inputs.route[1], 'Machining (secondary ops)');
});

test('resolveRoute parses chained free text and arrays', () => {
  assert.deepEqual(resolveRoute('HPDC + CNC machining + powder coat').keys,
    ['Die Casting (Aluminium)', 'Machining (CNC)', 'Powder Coating']);
  assert.deepEqual(resolveRoute(['Sand casting', 'heat treatment']).keys, ['Sand Casting', 'Heat Treatment (batch)']);
  assert.equal(resolveRoute('sand casting').keys.length, 1);
  assert.equal(resolveRoute('teleport + magic'), null);
});

test('route simulation band is ordered and plausible', () => {
  const s = simulateRouteCost({ ...knuckle, route: ['Sand Casting', 'Machining (secondary ops)'] });
  assert.ok(s.p10 < s.p50 && s.p50 < s.p90);
  const spread = (s.p90 - s.p10) / s.p50;
  assert.ok(spread > 0.12 && spread < 0.8, `spread ${spread}`);
});

test('tolerance class and surface finish raise cost, disclosed in drivers', () => {
  const base = { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 1.2, annualVolume: 150000, region: 'Germany' };
  const std = computeShouldCost(base).totalShouldCost;
  const tight = computeShouldCost({ ...base, toleranceClass: 'precision', surfaceFinish: 'fine' });
  assert.ok(tight.totalShouldCost > std * 1.03, `${tight.totalShouldCost} vs ${std}`);
  assert.equal(tight.drivers.toleranceClass, 'precision');
});

test('tonnage tiers: projected area picks the machine size; no area keeps the flat rate', () => {
  const base = { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 8, annualVolume: 80000, region: 'Germany' };
  const flat = computeShouldCost(base);
  const big = computeShouldCost({ ...base, projectedAreaCm2: 3500 });   // ~2450 t press
  assert.equal(flat.drivers.machineTier, undefined);
  assert.ok(big.drivers.machineTier.clampTonnage > 2000);
  assert.ok(big.totalShouldCost > flat.totalShouldCost, 'a structural casting on a 2400t cell must cost more than the flat 95/hr assumption');
});

test('IM cooling-dominated cycle scales with wall thickness, not just mass', () => {
  const base = { material: 'Polypropylene (PP)', process: 'Injection Moulding', weightKg: 0.3, annualVolume: 300000, region: 'China' };
  const thin = computeShouldCost({ ...base, wallThicknessMm: 1.5 });
  const thick = computeShouldCost({ ...base, wallThicknessMm: 4 });
  assert.ok(thick.drivers.cycleSecPerPart > thin.drivers.cycleSecPerPart * 2, `wall² scaling: ${thin.drivers.cycleSecPerPart}s vs ${thick.drivers.cycleSecPerPart}s`);
});

test('carbon block: material + process CO2e and a CBAM line only for non-EU regions', () => {
  const cn = computeCarbon({ material: 'Cast Iron (Ductile/GJS)', route: ['Sand Casting', 'Machining (secondary ops)'], region: 'China' }, { inputMassKg: 13.2, finishedMassKg: 6.7 });
  assert.ok(cn.totalKgCo2e > 20 && cn.totalKgCo2e < 40, `knuckle CO2e ${cn.totalKgCo2e}`);
  assert.ok(cn.cbam && cn.cbam.eur > 0, 'China → EU import should carry a CBAM line');
  const de = computeCarbon({ material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', region: 'Germany' }, { inputMassKg: 13.2, finishedMassKg: 6.7 });
  assert.equal(de.cbam, null, 'EU production carries ETS through rates, no CBAM line');
});

test('cast irons ride the steel-index proxy and land on baseline at seed', () => {
  const seed = { lastRefresh: Date.now(), data: { steel_hrc_eu: { label: 'Steel HRC (EU)', value: 710, unit: '€/t' } } };
  const { library, priceBasis } = applyLiveMaterialPrices({ MATERIALS, PROCESSES: {}, REGIONS: {} }, seed);
  assert.ok(Math.abs(library.MATERIALS['Cast Iron (Grey)'].price - 0.50) < 0.005);
  assert.ok(Math.abs(library.MATERIALS['Cast Iron (Ductile/GJS)'].price - 0.58) < 0.005);
  assert.equal(priceBasis['Cast Iron (Grey)'].proxy, true, 'proxy basis must be flagged honestly');
});
