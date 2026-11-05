/**
 * Gravity die casting, from the sourced research of 5 Nov 2026 (scripts/research/2026-11-gravity-lpdc/data.json +
 * notes.md). One describe block a change, each failing before it:
 *   1. the die cycle from the metal poured a die opening and the section 2·V/S (was a flat 0.08 h a casting);
 *   2. the crew by cell type, chosen by annual volume (was one operator a machine);
 *   3. the die priced in H13 for its 100,000-cycle life, slides priced (was cast-iron blocks at a separate 50,000);
 *   4. China's tilt machine on the Chinese list price (was the UK £82,769 at par);
 *   5. aluminium T6 / T5 a station priced in each book, an advisory heat-treat question (was £1.10/kg × a steel Q&T factor);
 *   6. impressions an advisory question; two make two castings a die opening (was hard-coded to one).
 * Low-pressure die casting was researched in the same round and is deferred (not built).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { CASTING_RULES, gravityPlan, castingSectionMm, GRAVITY_IMPRESSIONS_DECISION_ID, AL_HEAT_TREAT_DECISION_ID } from '../src/engine/cost-input-rules/commodities/casting.js';
import { RULE_PATH_MAP } from '../src/engine/cost-input-rules/apply.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { gravityDieCycle, gravityCellFor, gravityImpressionsFit, GRAVITY_CYCLE, GRAVITY_DIE, GRAVITY_AUTO_CELL_MIN_CASTINGS } from '../src/engine/casting-gravity.js';
import { alHeatTreatStation, alHeatTreatGbpPerKg, AL_HT_FURNACE, AL_HT_ASSUMPTIONS } from '../src/engine/al-heat-treat.js';
import { estimateGravityMouldCost, gravityDieSteelKg } from '../src/engine/casting-tooling.js';
import { BOUGHT_OUT_GBP, TOOL_MATERIAL_GBP_PER_KG } from '../src/engine/toolmaking.js';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { HEAT_TREAT_COST_PER_KG } from '../src/engine/modules/casting-advisor.js';
import { costMeasuredPart, regionalBook } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { CHINA_BOOK } from '../src/engine/country-books/cn.js';
import { withRates } from '../src/engine/rate-context.js';
import { buildCoreReport } from '../src/export/executive-summary.js';

const BASE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const PART1 = { ...BASE.find(p => p.part === 'Part1.stp')!.geometry, status: 'success' } as unknown as OCCTGeometry;
const P1 = { 'material.family': 'aluminium', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
  'service.toleranceClass': 'standard', 'service.safetyCritical': 'no', 'material.grade': 'mat-lm25' };
const ctx = (annualVolume = 200_000, answers: Record<string, string> = P1, geo = PART1): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer', annualVolume, filename: 'Part1.stp', answers,
} as RuleContext);
const rules = (c: RuleContext) => runCostInputRules(CAST_AND_MACHINE_RULES, c);
const cast = (c: RuleContext) => rules(c).suggestions.casting as Record<string, unknown>;
const basisOf = (c: RuleContext, path: string) => String(rules(c).byRule[path]?.basis ?? '');
const BOOK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
async function part1(region: 'UK' | 'CN', extra: Record<string, string> = {}) {
  const r = await costMeasuredPart(PART1, 'Part1.stp', { partNumber: 'Part1', file: 'Part1.stp', annualVolume: 200_000, commodity: 'cast_and_machine' } as never,
    { ...P1, ...extra }, region, { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, BOOK, { partNumber: 'Part1', file: 'Part1.stp', status: 'error' } as never);
  expect(r.status).toBe('costed');
  return r as typeof r & { trace: { operations: Array<{ operationName: string; cycleTimeHr: number; labourTimeHr: number; partsPerCycle: number; manning: number; labourId: string; machineId: string }>; drivers: { rawMaterial: { energyKwh?: { electricity?: number }; consumablesItems?: Array<{ label: string; gbp: number }> }; tooling: { items?: Array<{ label: string; gbp: number; sets?: number }> } } }; params: Record<string, unknown> };
}

describe('1. the gravity die cycle follows the metal poured and the section (was a flat 0.08 h a casting)', () => {
  it('Part1: 3 min × (10.4 mm ÷ 10 mm)² = 3.24 min a die opening — the section term governs its 2.25 kg pour', () => {
    const c = ctx();
    expect(castingSectionMm(c)).toBe(10.4);
    const v = Number(cast(c).cycleTimeSandGravHr);
    expect(v).not.toBe(0.08);
    expect(v).toBeCloseTo(3 * 1.04 ** 2 / 60, 6);
    const g = gravityPlan(c)!;
    expect(g.pourKg).toBeLessThan(GRAVITY_CYCLE.smallPourKg);   // the mass term sits at its small-part anchor
    expect(g.cycle.governs).toBe('section');
  });
  it('the anchors: 3.0 min at ≤ 3 kg poured, 4.8 min at ≥ 7.5 kg (the former book figure), linear between; 9 min ceiling', () => {
    expect(gravityDieCycle(2, 5).min).toBe(3);
    expect(gravityDieCycle(7.5, 5).min).toBeCloseTo(4.8, 10);
    expect(gravityDieCycle(20, 5).min).toBeCloseTo(4.8, 10);
    expect(gravityDieCycle(5.25, 5).min).toBeCloseTo(3.9, 10);
    expect(gravityDieCycle(2, 25).min).toBe(9);
    expect(gravityDieCycle(2, 25).governs).toBe('ceiling');
  });
  it('the basis prints the formula, the sources (G2, G4, G5, G3) and labels the fit engineering-typical', () => {
    const b = basisOf(ctx(), 'casting.cycleTimeSandGravHr');
    for (const s of ['G2 — FMT (Hall, 2009)', 'G4 — MIRAE', 'G5 — Bonollo', 'G3 — Foundry-Planet', 'Chvorinov', 'engineering-typical, not sourced',
      '3 × (10.40 ÷ 10)² = 3.245 min', 'kg poured a die opening']) expect(b).toContain(s);
  });
});

describe('2. the crew follows the cell type, chosen by annual volume (was one operator a machine)', () => {
  it('a manual tilt-pour cell (½) below the threshold, a multi-machine cell (¼, Gauss 1 : 4) at or above it', () => {
    expect(gravityCellFor(GRAVITY_AUTO_CELL_MIN_CASTINGS - 1).cell.crew).toBe(0.5);
    expect(gravityCellFor(GRAVITY_AUTO_CELL_MIN_CASTINGS).cell.crew).toBe(0.25);
    expect(Number(cast(ctx(20_000)).manning)).toBe(0.5);
    expect(Number(cast(ctx(200_000)).manning)).toBe(0.25);
  });
  it('the basis prints the cell, the labelled threshold, the source and what the multi-machine cell does not price', () => {
    const b = basisOf(ctx(200_000), 'casting.manning');
    expect(b).toMatch(/200,000 castings a year ≥ 50,000 \(the threshold is CostVision engineering judgement, not sourced\)/);
    expect(b).toMatch(/one operator to four machines — G3/);
    expect(b).toMatch(/robot ladle \/ dosing unit, holding furnace and extraction portal are NOT priced/);
    expect(basisOf(ctx(20_000), 'casting.manning')).toMatch(/manual tilt-pour cell.*engineering-typical, not sourced/);
  });
});

describe('3. the die is priced in H13 for its 100,000-cycle life — material and life ONE decision; slides priced', () => {
  it('the build-up prices H13 blocks (not cast iron) and the life is 100,000 die cycles × impressions', () => {
    const e = estimateGravityMouldCost({ projectedAreaCm2: 138, cavities: 1 });
    const steel = e.detail.lines.find(l => l.kind === 'material')!;
    expect(steel.item).toMatch(/H13/);
    expect(steel.cost).toBe(Math.round(gravityDieSteelKg(138) * TOOL_MATERIAL_GBP_PER_KG.h13));
    expect(e.detail.lines.some(l => /Cast-iron/i.test(l.item))).toBe(false);
    expect(GRAVITY_DIE.lifeDieCycles).toBe(100_000);
    expect(Number(cast(ctx()).dieMouldLife)).toBe(100_000);
    expect(basisOf(ctx(), 'casting.dieMouldLife')).toMatch(/H13.*D3.*D5.*our inference \(grade D\).*NOT priced/);
  });
  it('slides (the complexity input it ignored) are priced as the moulding build-up prices a side action', () => {
    const none = estimateGravityMouldCost({ projectedAreaCm2: 138, cavities: 1 });
    const three = estimateGravityMouldCost({ projectedAreaCm2: 138, cavities: 1, slidesPerCavity: 3 });
    expect(three.detail.lines.find(l => /Core-pull cylinders × 3/.test(l.item))!.cost).toBe(3 * BOUGHT_OUT_GBP.corePullCylinder);
    expect(three.detail.lines.find(l => /Slide machining & fitting × 3/.test(l.item))!.hours).toBeCloseTo(3 * (28 + 138 / 200), 1);
    expect(three.total).toBeGreaterThan(none.total);
    // Part1: 16 undercut faces ≈ 3 slides; the basis says so and prints the Chinese caliper-mould cross-check (D1)
    const b = basisOf(ctx(), 'casting.dieMouldCostGBP');
    expect(b).toMatch(/16 undercut face\(s\) ≈ 3 slide\(s\) a cavity priced as the moulding build-up prices a side action/);
    expect(b).toMatch(/D1 — Made-in-China \(WuXi JingJie\)/);
  });
  it('Part1 in the UK: 11 die sets over 1,000,000 castings (+3 % rejects) where 21 were bought at 50,000', async () => {
    const r = await part1('UK');
    const dies = r.trace.drivers.tooling.items!.filter(i => /^Permanent mould/.test(i.label));
    expect(dies.reduce((a, i) => a + (i.sets ?? 0), 0)).toBe(Math.ceil(1_000_000 / 0.97 / 100_000));
  }, 60_000);
});

describe('4. China\'s gravity tilt machine on the Chinese list price (was the UK £82,769 at par)', () => {
  it('the China book carries the Jingda listing as a capex group, machine only, labelled', () => {
    const g = CHINA_BOOK.machines.groups.find(x => x.id === 'gravity-tilt-domestic')!;
    expect(g).toBeDefined();
    expect(new RegExp(g.match).test('grav-die-cast-std')).toBe(true);
    expect(g.refCapexGbp).toBeCloseTo(19_800 / 1.3344, 1);
    expect(g.basis).toMatch(/ESTIMATE: machine only — holding furnace, ladle \/ robot and die cooling NOT included/);
  });
  it('China\'s machine rate falls (¥55.27/h on the UK capital) while the UK book keeps its £82,769', () => {
    const cn = regionalBook(BOOK, 'CN', new Map());
    const m = cn.machines.find(x => x.id === 'grav-die-cast-std') as unknown as { computedRatePerHr: number };
    expect(m.computedRatePerHr * 8.88).toBeCloseTo(28.68, 1);
    const uk = BOOK.machines.find(x => x.id === 'grav-die-cast-std')!;
    expect(uk.sourceNote).toMatch(/Capex £82,769/);
  });
});

describe('5. aluminium T6 / T5 is a station priced in each book (was £1.10/kg × a steel quench-and-temper factor)', () => {
  it('the station: H1\'s furnace set — 0.9483 kWh/kg, 0.0085 operator-h/kg, capital £0.007782/kg; T5 the ageing furnace only', () => {
    const t6 = alHeatTreatStation('T6');
    expect(t6.kwhPerKg).toBeCloseTo((AL_HT_FURNACE.solutionKw * 8.5 + AL_HT_FURNACE.ageKw * 6.5) * 0.6 / 1000, 6);
    expect(t6.labourHrPerKg).toBeCloseTo(8.5 / 1000, 9);
    expect(t6.capitalGbpPerKg).toBeCloseTo((37_470 / 10 + 37_470 * 0.035) / (650 * 1000), 6);
    const t5 = alHeatTreatStation('T5');
    expect(t5.kwhPerKg).toBeCloseTo(30 * 6.5 * 0.6 / 1000, 6);
    expect(t5.capitalGbpPerKg).toBeLessThan(t6.capitalGbpPerKg);
    expect(t6.basis).toMatch(/ESTIMATE \(grade D/);
    expect(AL_HT_ASSUMPTIONS.labourId).toBe('lab-uk-furnace');
    expect((HEAT_TREAT_COST_PER_KG as Record<string, number>).t6).toBeUndefined();
  });
  it('the module: kWh to the core, the furnace operator an operation, the capital a £ a kg — none of it a steel Q&T factor', () => {
    const IN: CastingInputs = { subtype: 'gravity', materialId: 'mat-lm25', partWeightKg: 2, castingYield: 0.6, rejectRate: 0.03,
      labourId: 'lab-uk-foundry', oee: 0.8, manning: 0.5, labourEfficiency: 0.92, amortizationVolume: 100_000,
      gravity: { machineId: 'grav-die-cast-std', cycleTimeHr: 0.05, mouldCost: 10_000, mouldLife: 100_000 }, heatTreatment: 'T6' };
    const d = computeCastingDrivers(IN);
    const without = computeCastingDrivers({ ...IN, heatTreatment: 'F' });
    const st = alHeatTreatStation('T6');
    expect(d.rawMaterial.energyKwh!.electricity! - (without.rawMaterial.energyKwh!.electricity ?? 0)).toBeCloseTo(2 * st.kwhPerKg, 9);
    const op = d.operations.find(o => /^Heat treatment T6/.test(o.operationName))!;
    expect(op.labourId).toBe('lab-uk-furnace');
    expect(op.labourTimeHr).toBeCloseTo(2 * st.labourHrPerKg, 9);
    expect(op.benchOperation).toBe(true);
    expect(d.rawMaterial.consumablesItems!.find(i => /furnace capital/.test(i.label))!.gbp).toBeCloseTo(2 * st.capitalGbpPerKg, 9);
    // a heat treater's typed £/kg replaces the station
    const toll = computeCastingDrivers({ ...IN, heatTreatCostPerKg: 0.8 });
    expect(toll.operations.some(o => /^Heat treatment T6/.test(o.operationName))).toBe(false);
    expect(toll.rawMaterial.consumablesItems!.find(i => i.label === 'heat treatment')!.gbp).toBeCloseTo(1.6, 9);
  });
  it('Part1: UK and China each price the station in their own book (tariff, furnace rate); the UK figure is the same build-up', async () => {
    const st = alHeatTreatStation('T6');
    for (const region of ['UK', 'CN'] as const) {
      const r = await part1(region);
      const op = r.trace.operations.find(o => /^Heat treatment T6/.test(o.operationName))!;
      expect(op).toBeDefined();
      const kg = Number(r.params.castPartWeightKg);
      expect(op.labourTimeHr).toBeCloseTo(kg * st.labourHrPerKg, 9);
      expect(r.trace.drivers.rawMaterial.energyKwh!.electricity!).toBeGreaterThan(kg * st.kwhPerKg);
    }
    const ruleBasisUK = basisOf(ctx(), 'casting.heatTreatment');
    expect(ruleBasisUK).toContain(`£${alHeatTreatGbpPerKg(st, 0.182, 24.6).toFixed(4)}/kg before labour efficiency`);
    const cnBook = regionalBook(BOOK, 'CN', new Map());
    const cnBasis = withRates(cnBook, () => basisOf({ ...ctx(), rates: cnBook } as RuleContext, 'casting.heatTreatment'));
    expect(cnBasis).not.toContain('× country heat-treat factor');
    expect(cnBasis).toContain(`${st.kwhPerKg} kWh/kg × £${cnBook.energy[0].electricityPerKwh}/kWh`);
  }, 120_000);
  it('an advisory question T6 / T5 / F, T6 costed until answered; "as cast" switches the station off on screen and headless', () => {
    const asked = rules(ctx()).decisions.find(d => d.id === AL_HEAT_TREAT_DECISION_ID)!;
    expect(asked.severity).toBe('advisory');
    expect(asked.options.map(o => o.value)).toEqual(['T6', 'T5', 'F']);
    expect(asked.options.find(o => o.costed)?.value).toBe('T6');
    expect(cast(ctx()).heatTreatment).toBe('T6');
    const f = cast(ctx(200_000, { ...P1, [AL_HEAT_TREAT_DECISION_ID]: 'F' }));
    expect(f.heatTreatment).toBe('F');
    expect(rules(ctx(200_000, { ...P1, [AL_HEAT_TREAT_DECISION_ID]: 'F' })).decisions.some(d => d.id === AL_HEAT_TREAT_DECISION_ID)).toBe(false);
    // headless: the rule path is mapped and toCostParams passes the station only for T6 / T5
    expect(RULE_PATH_MAP['casting.heatTreatment']).toEqual({ to: 'casting.heatTreatment' });
    const base = { materialId: 'mat-lm25', netWeightKg: 1.2, casting: { subtype: 'gravity', yieldFraction: 0.6, cycleTimeSandGravHr: 0.05, dieMouldCostGBP: 1, dieMouldLife: 1, cavities: 1, cycleTimeHpdcSec: 0 } };
    const tp = (ht: string) => toCostParams('casting', { ...base, casting: { ...base.casting, heatTreatment: ht } } as never, 200_000, 'aluminium')!.params;
    expect(tp('T6').heatTreatment).toBe('T6');
    expect(tp('F').heatTreatment).toBeUndefined();
    // screen: both forms carry the select and pass it to the module
    const ui = readFileSync('src/ui/main.ts', 'utf8');
    for (const id of ['cast-ht-route', 'cam-ht-route']) expect(ui).toContain(`id="${id}"`);
    expect(ui).toContain("heatTreatment: alHeatTreatmentSel('cast-ht-route')");
    expect(ui).toContain("heatTreatment: alHeatTreatmentSel('cam-ht-route')");
  });
  it('steel keeps its normalise rate × the heat-treat service factor (only aluminium T6 / T5 left the steel factor)', () => {
    const steel = { 'material.family': 'steel', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
    const g = BASE.find(p => p.part === 'Casting_Braket.stp')!.geometry;
    const c = cast(ctx(50_000, steel, g));
    expect(c.heatTreatCostPerKg).toBe(0.35);
    expect(c.heatTreatment).toBe('none');
  });
});

describe('6. impressions an advisory question; two make two castings a die opening (was hard-coded to one)', () => {
  it('one costed until answered, the question advisory, two offered with the fit printed', () => {
    const r = rules(ctx());
    const q = r.decisions.find(d => d.id === GRAVITY_IMPRESSIONS_DECISION_ID)!;
    expect(q.severity).toBe('advisory');
    expect(q.options.find(o => o.costed)?.value).toBe('1');
    expect(q.options.find(o => o.value === '2')!.consequence).toMatch(/fit the 800 × 600 mm die face.*≤ 250 kg/);
    expect(Number(cast(ctx()).gravityImpressions)).toBe(1);
  });
  it('answered two (and they fit): the die prices two cavities, its life is 200,000, the cycle is a die opening of twice the metal', () => {
    const two = ctx(200_000, { ...P1, [GRAVITY_IMPRESSIONS_DECISION_ID]: '2' });
    const c2 = cast(two), c1 = cast(ctx());
    expect(Number(c2.gravityImpressions)).toBe(2);
    expect(Number(c2.dieMouldLife)).toBe(200_000);
    expect(Number(c2.dieMouldCostGBP)).toBeGreaterThan(Number(c1.dieMouldCostGBP));
    const g = gravityPlan(two)!;
    expect(g.pourKg).toBeCloseTo(2 * gravityPlan(ctx())!.pourKg, 9);
    expect(Number(c2.cycleTimeSandGravHr)).toBeCloseTo(gravityDieCycle(g.pourKg, 10.4).hr, 9);
    expect(RULE_PATH_MAP['casting.gravityImpressions']).toEqual({ to: 'casting.impressions' });
  });
  it('the module makes `impressions` castings a die cycle (screen and headless alike)', async () => {
    const r1 = await part1('CN'), r2 = await part1('CN', { [GRAVITY_IMPRESSIONS_DECISION_ID]: '2' });
    const op = (r: typeof r1) => r.trace.operations.find(o => o.operationName === 'Gravity Die Casting')!;
    expect(op(r1).partsPerCycle).toBe(1);
    expect(op(r2).partsPerCycle).toBe(2);
    expect((r2.params.gravity as { impressions: number }).impressions).toBe(2);
    expect(r2.total!).toBeLessThan(r1.total!);
    // the core report's negotiation line says a die cycle makes two castings (it would print die cycles as castings)
    const rvs = Object.entries(r2.provenance ?? {}).map(([id, p]) => ({ label: id, fieldId: id, value: String((p as { value: unknown }).value ?? ''), ruleValue: String((p as { value: unknown }).value ?? ''), basis: String((p as { basis?: unknown }).basis ?? '') }));
    const t2 = r2.trace as unknown as { stackInput: never; result: never };
    const core = buildCoreReport({ result: t2.result, input: t2.stackInput, library: regionalBook(BOOK, 'CN', new Map()), commodity: 'cast_and_machine', region: 'CN', cadMeta: { checks: { decisions: [], ruleValues: rvs } } as never, regionalRows: [] } as never);
    expect(core.negotiation.find(n => n.driver === 'Die casting cell rate')?.ours).toMatch(/min a die cycle × 2 impressions \([\d.]+ castings an hour\).*÷ 2 a casting/);
    const ui = readFileSync('src/ui/main.ts', 'utf8');
    for (const id of ['cast-grav-imp', 'cam-grav-imp']) expect(ui).toContain(`id="${id}"`);
    expect(ui).toContain("impressions: num('cast-grav-imp') || 1");
    expect(ui).toContain("impressions: num('cam-grav-imp') || 1");
  }, 120_000);
  it('two that do not fit the die stay one, and the 60 % sand plate rule is not applied to a permanent die', () => {
    expect(gravityImpressionsFit(2, [500, 400], 100).fits).toBe(false);   // 2 × 550 > 800
    expect(gravityImpressionsFit(2, [200, 150], 260).fits).toBe(false);   // die over 250 kg
    expect(gravityImpressionsFit(2, [200, 150], 200).fits).toBe(true);
    expect(gravityImpressionsFit(2, [200, 150], 200).text).not.toMatch(/60 %/);
  });
  it('the casting route (not only cast + machine) carries the same questions', () => {
    const c = { ...ctx(), commodity: 'casting' } as RuleContext;
    const ids = runCostInputRules(CASTING_RULES, c).decisions.map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining([GRAVITY_IMPRESSIONS_DECISION_ID, AL_HEAT_TREAT_DECISION_ID]));
  });
});
