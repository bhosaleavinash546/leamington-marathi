/**
 * Composites on PUBLISHED data (report-standard round, 3 Nov 2026). The research and its re-read are in
 * scripts/research/2026-11-report-standard/composites/{notes.md,data.json} and ../verify.{md,json} (all 34 composites rows
 * CONFIRMED). One block per proposal item; each test failed on the code before the change:
 *   1. tool life by tool material, chosen from the cycles each tool sees (the hat stiffener bought 2,000 tools at a
 *      500-cycle, unsourced life — £25.34 of £69.30 at 200k / 5 yr);
 *   2. layup by method at a published mass rate (0.06 h/m²/ply was 6.5 kg/h — tape-laying speed charged as hand layup);
 *   3. cure by resin system (the unsourced 3.0 h sat outside both published schedules);
 *   4. cure cells implied; 5. the autoclave volume alert; 6. prepreg compression moulding as a process and a route row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  COMPOSITES_RULES, COMP_TOOL_LIFE, chooseToolMaterial, compositesNotCosted, compositesAlert, compositesRouteAlert,
  COMPOSITES_PROCESS_CHOICE_ID, PCM, AUTOCLAVE_VOLUME_ALERT,
} from '../src/engine/cost-input-rules/commodities/composites.js';
import {
  LAMINATE_DECISION_ID, RESIN_SYSTEM_DECISION_ID, HAND_LAYUP_KG_PER_HR, autoclaveCure,
} from '../src/engine/cost-input-rules/derive/laminate.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeCompositeDrivers, type CompositeInputs } from '../src/engine/modules/composites.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { compareRoutes, processVariants } from '../server/services/route-compare.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

process.env.AIR_GAPPED = '1';
const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const LID = 'COMP_Battery_Lid.stp', HAT = 'COMP_Hat_Stiffener.stp';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const ctx = (part: string, sys: string, annualVolume = 200_000, extra: Record<string, string> = {}): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'composites', commoditySource: 'engineer', annualVolume, programmeYears: 5,
  filename: part, answers: { [LAMINATE_DECISION_ID]: sys, 'commodity.route': 'composites', ...extra },
} as RuleContext);
const run = (part: string, sys: string, v = 200_000, extra: Record<string, string> = {}) =>
  runCostInputRules(COMPOSITES_RULES, ctx(part, sys, v, extra));
const sugg = (part: string, sys: string, v = 200_000, extra: Record<string, string> = {}) =>
  run(part, sys, v, extra).suggestions.composites as Record<string, number | string>;

describe('1. tool life by tool material, chosen from the cycles each tool sees', () => {
  it('every life carries its source; only the metal layup tool has none', () => {
    expect(COMP_TOOL_LIFE['cfrp-epoxy'].life).toBe(300);
    expect(COMP_TOOL_LIFE['cfrp-bmi'].life).toBe(500);
    expect(COMP_TOOL_LIFE['nickel-shell'].life).toBe(1_000);
    expect(COMP_TOOL_LIFE['steel-matched'].life).toBe(100_000);
    expect(COMP_TOOL_LIFE['metal-layup'].life).toBeNull();
    expect(COMP_TOOL_LIFE['steel-matched'].source).toMatch(/SMC ANALOGUE/);
    expect(COMP_TOOL_LIFE['cfrp-bmi'].source).toMatch(/fetch tool/);       // TL-5 was read through the fetch tool
    for (const t of Object.values(COMP_TOOL_LIFE)) expect(t.source).toMatch(/\[TL-\d+/);
  });

  it('the shortest-lived material that lasts is chosen; none lasting → the longest, with replacements', () => {
    expect(chooseToolMaterial('prepreg_layup', 25_000, 100).material).toBe('cfrp-epoxy');      // 250 cycles
    expect(chooseToolMaterial('prepreg_layup', 40_000, 100).material).toBe('cfrp-bmi');        // 400
    expect(chooseToolMaterial('prepreg_layup', 80_000, 100).material).toBe('nickel-shell');    // 800
    const steel = chooseToolMaterial('prepreg_compression', 1_000_000, 9);                     // 111,112 a die
    expect(steel).toMatchObject({ material: 'steel-matched', life: 100_000, replacements: true });
  });

  it('hat stiffener at 200k / 5 yr: a metal layup tool, no wear replacements, resurfacing listed as NOT costed', () => {
    const s = sugg(HAT, 'prepreg-cf');
    const tools = Number(s.toolsInService);
    expect(tools).toBe(347);
    // the life entered is the cycles each tool sees — so the module buys exactly the tools in service
    expect(s.toolingLife).toBe(Math.ceil(1_000_000 / tools));
    const d = computeCompositeDrivers({ ...HAT_INPUTS, toolsInService: tools, toolingLife: Number(s.toolingLife) });
    expect(d.tooling.totalToolingCost).toBe(12_671 * tools);
    expect(d.tooling.items!.some(i => i.kind === 'replacement')).toBe(false);
    const basis = run(HAT, 'prepreg-cf').provenance['comp-tool-life'].basis;
    expect(basis).toMatch(/metal layup tool.*no cycle count is published.*NOT a published life/s);
    expect(compositesNotCosted(ctx(HAT, 'prepreg-cf')).map(n => n.item))
      .toContain('Layup tool resurfacing / replacement — not costed (no published cycle life for a metal layup tool (Invar / steel); confirm the life with the tool maker)');
  });

  it('the RTM lid: 11,628 cycles a tool → the matched steel die (SMC analogue), no replacements', () => {
    const s = sugg(LID, 'rtm-gf');
    expect(s.toolingLife).toBe(100_000);
    expect(run(LID, 'rtm-gf').provenance['comp-tool-life'].basis).toMatch(/11,628 cycles a tool.*SMC ANALOGUE/s);
  });
});

describe('2. layup by method at the published mass rate', () => {
  it('hand layup at 2 lb/h: the hat lays 0.3139 kg in 0.346 h (was 0.049 h — 6.5 kg/h, tape-laying speed)', () => {
    expect(HAND_LAYUP_KG_PER_HR).toBeCloseTo(0.9072, 4);
    expect(sugg(HAT, 'prepreg-cf').layupTimeHrPerPart).toBe(0.346);
    const b = run(HAT, 'prepreg-cf').provenance['comp-layup-time'].basis;
    expect(b).toMatch(/HAND LAYUP costed/);
    expect(b).toMatch(/upper bound/);                                  // a flat-charge rate on a shaped tool
    expect(b).toMatch(/Tape laying \(9\.1 kg\/h.*NOT costed/);
  });
  it('dry fabric keeps its area rate and says it is not sourced', () => {
    expect(run(LID, 'rtm-gf').provenance['comp-layup-time'].basis).toMatch(/not sourced/);
  });
});

describe('3. cure by resin system', () => {
  it('180 °C aerospace epoxy (M21): 224–340 min from the datasheet, the 282-min centre costed', () => {
    const c = autoclaveCure('epoxy-180');
    expect(c).toMatchObject({ hr: 4.7, lowHr: 3.73, highHr: 5.67 });
    expect(sugg(HAT, 'prepreg-cf').cureTimeHr).toBe(4.7);
    expect(run(HAT, 'prepreg-cf').provenance['comp-cure-time'].basis).toMatch(/resin system costed .*HexPly M21/s);
  });
  it('fast-cure (M77) answered: 23 min', () => {
    expect(autoclaveCure('fast-cure').hr).toBeCloseTo(23 / 60, 4);
    expect(sugg(HAT, 'prepreg-cf', 200_000, { [RESIN_SYSTEM_DECISION_ID]: 'fast-cure' }).cureTimeHr).toBeCloseTo(0.3833, 4);
  });
});

describe('4–5. cure cells implied and the autoclave volume alert', () => {
  it('the hat at 200k needs 15.3 autoclaves, printed with its arithmetic', () => {
    expect(run(HAT, 'prepreg-cf').provenance['comp-cure-batch'].basis)
      .toMatch(/autoclaves implied: 200,000\/yr × 4\.7 h ÷ 20 a load .* = 15\.3 autoclaves/);
  });
  it('autoclave prepreg above 25,000 a year carries the industry quote; below it, or on RTM, nothing', () => {
    expect(AUTOCLAVE_VOLUME_ALERT).toBe(25_000);
    expect(compositesAlert(ctx(HAT, 'prepreg-cf'))).toMatch(/ROUTE ALERT \(industry quote\).*Huntsman.*ACMA/);
    expect(run(HAT, 'prepreg-cf').provenance['comp-process'].basis).toMatch(/ROUTE ALERT/);
    expect(compositesAlert(ctx(HAT, 'prepreg-cf', 20_000))).toBeNull();
    expect(compositesAlert(ctx(LID, 'rtm-gf'))).toBeNull();
    expect(compositesRouteAlert(200_000, 'rtm-press-std', 'prepreg_compression')).toBeNull();
  });
});

describe('6. prepreg compression moulding (PCM)', () => {
  const pcm = { [COMPOSITES_PROCESS_CHOICE_ID]: 'pcm' };
  it('the rules cost it: 8-min press, 5-min preform, force from the measured plan, matched steel die', () => {
    const s = sugg(HAT, 'prepreg-cf', 200_000, pcm);
    expect(s.process).toBe('prepreg_compression');
    expect(s.cureTimeHr).toBe(0.1333);
    expect(s.cureMachineId).toBe(PCM.machineId);
    expect(s.partsPerCureCycle).toBe(1);
    expect(s.layupTimeHrPerPart).toBe(0.429);                            // 0.346 h stack + 5 min preform
    expect(s.toolsInService).toBe(9);                                    // 200k × 8 min ÷ (4,000 h × 0.8)
    expect(s.toolingLife).toBe(100_000);
    const p = run(HAT, 'prepreg-cf', 200_000, pcm).provenance;
    expect(p['comp-cure-mach'].basis).toMatch(/8 MPa .* = 384 kN \(39 t\) press force/);
    expect(p['comp-tool-cost'].basis).toMatch(/RTM matched-die build-up .*not sourced/s);
    expect(p['comp-cure-time'].basis).toMatch(/8 minutes at 140°C/);
    expect(sugg(HAT, 'prepreg-cf', 200_000, { ...pcm, [RESIN_SYSTEM_DECISION_ID]: 'fast-cure' }).cureTimeHr).toBe(0.05);
  });
  it('a dry-fabric laminate ignores the PCM answer (it is a prepreg process)', () => {
    expect(sugg(LID, 'rtm-gf', 200_000, pcm).process).toBe('rtm');
  });
  it('headless carries it: the module buys the whole laminate as prepreg and names the press', () => {
    const c = ctx(HAT, 'prepreg-cf', 200_000, pcm);
    const { analysis } = buildDeterministicAnalysis(COMPOSITES_RULES, c, 'hat');
    const params = toCostParams('composites', analysis.costInputSuggestions as never, 200_000, null, c.geo, 5)!.params as unknown as CompositeInputs;
    expect(params.process).toBe('prepreg_compression');
    const d = computeCompositeDrivers(params);
    expect(d.operations.map(o => o.operationName)).toEqual(['Prepreg Stack & Preform (PCM)', 'Cure (Compression Press)', 'Trim, Drill & Finish']);
    expect(d.rawMaterial.lines![0].description).toBe('Prepreg (fibre + resin)');
  });
  it('the route comparison offers PCM as a row of the prepreg part, costed and reconciling', async () => {
    const args = { geo: geoOf(HAT), filename: HAT, current: 'composites', answers: { [LAMINATE_DECISION_ID]: 'prepreg-cf', 'commodity.route': 'composites' },
      annualVolume: 200_000, baseBook: book };
    expect(processVariants('composites', args).map(v => v.process)).toEqual(['layup', 'pcm']);
    expect(processVariants('composites', { ...args, answers: { [LAMINATE_DECISION_ID]: 'rtm-gf' } })).toEqual([]);
    const cmp = await compareRoutes({ ...args, region: 'UK', programmeYears: 5, deliveryTerms: 'EXW', ladder: false, bands: false });
    const row = cmp.rows.find(r => r.process === 'pcm')!;
    expect(row.status).toBe('costed');
    expect(row.reconciles).toBe(true);
    expect(row.audit?.closes).toBe(true);
    expect(row.total!).toBeLessThan(cmp.rows[0].total!);
    expect(cmp.rows[0].process).toBe('layup');                           // the reference is the layup row
  }, 120_000);
});

const HAT_INPUTS: CompositeInputs = {
  fibrePricePerKg: 33.6, resinPricePerKg: 0, fibreWeightFraction: 0.65, partWeightKg: 0.3028, wasteFraction: 0.15,
  process: 'prepreg_layup', areaM2: 0.081, plies: 10, layupLabourId: 'lab-uk-skilled', layupTimeHrPerPart: 0.346,
  oee: 0.8, manning: 1, labourEfficiency: 0.92, cureMachineId: 'autoclave-1200mm', cureLabourId: 'lab-uk-semiskilled',
  cureTimeHr: 4.7, partsPerCureCycle: 20, trimMachineId: 'waterjet-5ax-composite', trimLabourId: 'lab-uk-semiskilled',
  trimTimeHr: 0.112, rejectRate: 0.04, toolingCost: 12_671, toolingLife: 500, amortizationVolume: 1_000_000,
};
