/**
 * The aluminium extrusion build, 3 Oct 2026 — one test per decision.
 *
 * Traced on eight parts modelled in OCP (cad-audit/parts/AL_modelled_parts.py —
 * not customer parts). docs/cad/aluminium-extrusion-build-2026-10.md has the
 * sources, the planner method and the hand reconciliation of the crash box.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AL_MARKET, AL_ALLOYS, AL_PRESSES, BILLET_PREMIUM_USD_PER_T, billetPriceGbpPerKg, alBilletId, AL_ALLOY_LIST,
} from '../src/engine/al-extrusion-data.js';
import { planAlExtrusion, chooseDieType, planImpact, planConform } from '../src/engine/modules/aluminium-extrusion-advisor.js';
import { buildAlExtrusionInputs, computeAluminiumExtrusionDrivers, temperNeeds } from '../src/engine/modules/aluminium-extrusion.js';
import { ALUMINIUM_EXTRUSION_RULES, fabrication, measuredSection } from '../src/engine/cost-input-rules/commodities/aluminium-extrusion.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { processFromNames } from '../src/engine/cost-input-rules/derive/part-evidence.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, alBilletMaterialFactors, REGIONAL_DATA, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const ctx = (part: string, answers: Record<string, string>, annualVolume = 50_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'aluminium_extrusion', commoditySource: 'engineer', annualVolume,
  filename: part, answers: { 'commodity.route': 'aluminium_extrusion', ...answers },
} as RuleContext);
const rules = (part: string, a: Record<string, string>) =>
  runCostInputRules(ALUMINIUM_EXTRUSION_RULES, ctx(part, a)).suggestions.alExtrusion as Record<string, number | string>;
const headless = async (part: string, a: Record<string, string>, v = 50_000, region = 'UK') =>
  await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: v, commodity: 'aluminium_extrusion' } as never,
    { 'commodity.route': 'aluminium_extrusion', ...a }, region as never, { annualVolume: v } as never,
    recomputeMachineRates(DEFAULT_RATE_LIBRARY), { partNumber: part, file: part, status: 'error' } as never) as
    { status: string; total: number; breakdown: Record<string, number>; error?: string };

const CRASH = { areaMm2: 1386, perimeterMm: 918, ccdMm: 144.2, voids: 2, minWallMm: 3, partLengthMm: 400 };

describe('1. billet: LME + the regional all-in premium + the alloy adder', () => {
  it('UK 6063 = (LME + $1,100) ÷ $/£ — £3.27/kg on 30 Sep 2026', () => {
    const want = (AL_MARKET.lmeUsdPerT + BILLET_PREMIUM_USD_PER_T.UK.usdPerT + AL_ALLOYS['6063'].billetAdderUsdPerT)
      / AL_MARKET.usdPerGbp / 1000;
    expect(billetPriceGbpPerKg('6063', 'UK')).toBeCloseTo(want, 3);
    expect(billetPriceGbpPerKg('6063', 'UK')).toBeCloseTo(3.267, 2);
  });
  it('every region has a premium with a basis; the US carries the tariff, China sits under LME', () => {
    for (const r of Object.keys(REGIONAL_DATA) as ManufacturingRegion[]) {
      expect(BILLET_PREMIUM_USD_PER_T[r].basis.length).toBeGreaterThan(10);
    }
    expect(billetPriceGbpPerKg('6063', 'US')).toBeGreaterThan(billetPriceGbpPerKg('6063', 'DE') * 1.3);
    expect(billetPriceGbpPerKg('6063', 'CN')).toBeLessThan(AL_MARKET.lmeUsdPerT / AL_MARKET.usdPerGbp / 1000);
  });
  it('hard alloys cost more billet than soft (7075 > 6082 > 6063)', () => {
    expect(billetPriceGbpPerKg('7075', 'UK')).toBeGreaterThan(billetPriceGbpPerKg('6082', 'UK'));
    expect(billetPriceGbpPerKg('6082', 'UK')).toBeGreaterThan(billetPriceGbpPerKg('6063', 'UK'));
  });
  it('the regional library prices each billet at its region — both regional paths agree', () => {
    for (const r of ['US', 'CN', 'DE', 'MX'] as ManufacturingRegion[]) {
      const lib = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, r);
      const m = lib.materials.find(x => x.id === alBilletId('6082'))!;
      expect(m.pricePerKg).toBeCloseTo(billetPriceGbpPerKg('6082', r), 3);
      expect(alBilletMaterialFactors('6082')[r]!).toBeCloseTo(billetPriceGbpPerKg('6082', r) / billetPriceGbpPerKg('6082', 'UK'), 6);
    }
  });
  it('every alloy has a billet in the library', () => {
    for (const a of AL_ALLOY_LIST) expect(DEFAULT_RATE_LIBRARY.materials.some(m => m.id === alBilletId(a))).toBe(true);
  });
});

describe('2. the press plan', () => {
  it('the crash box: porthole die, 2,500 t press, ratio ~32, force within 90%', () => {
    const p = planAlExtrusion({ ...CRASH, alloy: '6082', annualVolume: 50_000 });
    expect(p.dieType).toBe('hollow-porthole');
    expect(p.pressId).toBe('al-ext-press-2500t');
    expect(p.ratio).toBeGreaterThan(25); expect(p.ratio).toBeLessThan(40);
    expect(p.forceT).toBeLessThanOrEqual(0.9 * 2500);
    expect(p.recovery).toBeGreaterThan(0.85); expect(p.recovery).toBeLessThan(0.97);
  });
  it('a whole number of parts per strand; billet ≥ strand metal + butt', () => {
    const p = planAlExtrusion({ ...CRASH, alloy: '6082', annualVolume: 50_000 });
    expect(Number.isInteger(p.partsPerStrand)).toBe(true);
    expect(p.billetKg).toBeGreaterThan(p.partsPerPush * p.extrudedKgPerPart + p.buttKg - 1e-6);
    expect(p.billetKgPerPart * p.partsPerPush).toBeCloseTo(p.billetKg, 1);
  });
  it('the press is the smallest that holds the circle and the force', () => {
    const small = planAlExtrusion({ areaMm2: 132, perimeterMm: 160, ccdMm: 42.7, voids: 0, minWallMm: 2, partLengthMm: 1200, alloy: '6060', annualVolume: 50_000 });
    expect(small.pressId).toBe('al-ext-press-800t');
    const big = planAlExtrusion({ areaMm2: 3500, perimeterMm: 1600, ccdMm: 300, voids: 3, minWallMm: 3, partLengthMm: 1500, alloy: '6082', annualVolume: 50_000 });
    expect(AL_PRESSES.find(x => x.id === big.pressId)!.forceT).toBeGreaterThanOrEqual(5500);
  });
  it('7xxx runs slower than 6063 on the same section', () => {
    const a = planAlExtrusion({ ...CRASH, alloy: '6063', annualVolume: 50_000 });
    const b = planAlExtrusion({ ...CRASH, alloy: '7075', annualVolume: 50_000 });
    expect(b.exitSpeedMPerMin).toBeLessThan(a.exitSpeedMPerMin);
  });
  it('die type follows the section and the route', () => {
    expect(chooseDieType({ ...CRASH, voids: 0 }, '6063', 'direct').type).toBe('solid');
    expect(chooseDieType(CRASH, '6063', 'direct').type).toMatch(/^hollow/);
    expect(chooseDieType({ ...CRASH, voids: 1 }, '7075', 'indirect').type).toBe('seamless-mandrel');
  });
  it('Conform and impact plan without a billet press', () => {
    expect(planConform({ areaMm2: 400, perimeterMm: 100, ccdMm: 41, voids: 0, minWallMm: 10, partLengthMm: 400 }, '1050').feasible).toBe(true);
    const imp = planImpact(0.029, 46);
    expect(imp.slugKg).toBeGreaterThan(0.029);
    expect(imp.toolGbp).toBeGreaterThan(0);
  });
  it('tempers: T6 on 6082 ages, T4 solution-treats only, H112 needs neither', () => {
    expect(temperNeeds('6082', 'T6').age).toBe(true);
    expect(temperNeeds('6082', 'T4').age).toBe(false);
    expect(temperNeeds('5083', 'H112')).toEqual({ age: false, sht: false });
  });
});

describe('3. the cost: the engine builds it, and it reconciles', () => {
  it('drivers run the universal stack: material = billet less scrap credit, tooling = dies by the tonne', () => {
    const b = buildAlExtrusionInputs({ alloy: '6082', route: 'direct', section: CRASH, partWeightKg: 1.49, annualVolume: 50_000,
      temper: 'T6', finish: 'mill', finishAreaM2: 0.37, bends: 0, cncMinutes: 0, cncFixturings: 0, fabFeatureRows: 0 });
    const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
    const r = computeUniversalStack({ partName: 'crash box', packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.1, marginPct: 0.08,
      ...computeAluminiumExtrusionDrivers(b.inputs) } as never, lib);
    const s = { material: r.breakdown.rawMaterial, tooling: r.breakdown.tooling, total: r.total };
    const billet = lib.materials.find(m => m.id === alBilletId('6082'))!.pricePerKg;
    expect(s.material).toBeGreaterThan(b.inputs.extrudedKgPerPart * billet * 0.95);
    expect(s.material).toBeLessThan(b.inputs.billetKgPerPart * billet * 1.1);
    expect(s.tooling).toBeGreaterThan(0);
    expect(s.total).toBeGreaterThan(s.material);
  });
});

describe('4. from CAD: the kernel section, fabrication and routing', () => {
  it('the kernel measures the section: crash box 2 voids, 1,386 mm², constant', () => {
    const sec = measuredSection(ctx('AL_Crash_Box.stp', { 'material.alAlloy': '6082' }))!;
    expect(sec.voids).toBe(2);
    expect(sec.areaMm2).toBeCloseTo(1386, -1);
  });
  it('hollow chambers are not pockets: only the 4 bolt holes are machined on the crash box', () => {
    const c = ctx('AL_Crash_Box.stp', { 'material.alAlloy': '6082' });
    const f = fabrication(c, measuredSection(c)!);
    expect(f.minutes).toBeLessThan(2);
    expect(f.basis).not.toMatch(/pocket/);
  });
  it('a notched bracket is costed by the metal it loses', () => {
    const c = ctx('AL_Machined_Bracket.stp', { 'material.alAlloy': '6082' });
    expect(fabrication(c, measuredSection(c)!).basis).toMatch(/machined away/);
  });
  it('routing offers aluminium extrusion for every profile, the short heat sink and the machined bracket included', () => {
    for (const p of ['AL_Crash_Box.stp', 'AL_Battery_Rail.stp', 'AL_Trim_Channel.stp', 'AL_Bumper_Beam.stp',
      'AL_Heat_Sink.stp', 'AL_Machined_Bracket.stp', 'AL_Busbar.stp']) {
      const v = inferCommodity({ ...ctx(p, {}), commodity: undefined, commoditySource: undefined, answers: {} } as never);
      expect(v.decision?.options.map(o => o.value), p).toContain('aluminium_extrusion');
    }
  });
  it('a revolved cup is offered impact extrusion (never leaned)', () => {
    const v = inferCommodity({ ...ctx('AL_Battery_Can.stp', {}), commodity: undefined, commoditySource: undefined, answers: {} } as never);
    expect(v.decision?.options.map(o => o.value)).toContain('aluminium_extrusion');
    expect(v.decision?.options.find(o => o.value === 'aluminium_extrusion')?.leaning).not.toBe(true);
  });
  it('a name with an aluminium alloy reads as an aluminium extrusion', () => {
    expect(processFromNames([{ text: '6063 extrusion rail', where: 'product name' }] as never)?.route).toBe('aluminium_extrusion');
  });
  it('the alloy is asked, never guessed', () => {
    const r = runCostInputRules(ALUMINIUM_EXTRUSION_RULES, ctx('AL_Crash_Box.stp', {}));
    expect(r.decisions.some(d => d.id === 'material.alAlloy')).toBe(true);
  });
});

describe('5. headless costs every part, and matches the rules', () => {
  const PARTS: Array<[string, Record<string, string>, number, number]> = [
    ['AL_Crash_Box.stp', { 'material.alAlloy': '6082' }, 6, 20],
    ['AL_Battery_Rail.stp', { 'material.alAlloy': '6063' }, 20, 60],
    ['AL_Trim_Channel.stp', { 'material.alAlloy': '6060', 'al.finish': 'anodise' }, 1.5, 8],
    ['AL_Bumper_Beam.stp', { 'material.alAlloy': '7003', 'al.bends': '1' }, 15, 50],
    ['AL_Heat_Sink.stp', { 'material.alAlloy': '6063', 'al.finish': 'anodise' }, 2, 10],
    ['AL_Machined_Bracket.stp', { 'material.alAlloy': '6082' }, 3, 15],
    ['AL_Busbar.stp', { 'material.alAlloy': '1050', 'al.route': 'conform' }, 1.5, 8],
    ['AL_Battery_Can.stp', { 'material.alAlloy': '1050', 'al.route': 'impact' }, 0.2, 2],
  ];
  for (const [p, a, lo, hi] of PARTS) {
    it(`${p} costs between £${lo} and £${hi} at 50k/yr`, async () => {
      const r = await headless(p, a);
      expect(r.status, r.error).toBe('costed');
      expect(r.total).toBeGreaterThan(lo); expect(r.total).toBeLessThan(hi);
    });
  }
  it('Conform and impact are reached by the stated route', () => {
    expect(rules('AL_Busbar.stp', { 'material.alAlloy': '1050', 'al.route': 'conform' }).press).toMatch(/conform/);
    expect(rules('AL_Battery_Can.stp', { 'material.alAlloy': '1050', 'al.route': 'impact' }).press).toMatch(/impact/);
  });
  it('the US costs the crash box more than China — the billet premium reaches the headline', async () => {
    const a = { 'material.alAlloy': '6082' };
    expect((await headless('AL_Crash_Box.stp', a, 50_000, 'US')).total).toBeGreaterThan((await headless('AL_Crash_Box.stp', a, 50_000, 'CN')).total);
  });
});
