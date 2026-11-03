/**
 * Cost-reduction levers keep only PHYSICALLY DEFINED changes the stack re-costs correctly (report-standard review,
 * 3 Nov 2026 — README §1 rows 3–4; director #2 #10 #11 #45, cost-engineer #4 #5 #14 #15 #40, dfm #1–#3 #8 #11 #12,
 * manufacturing #8 #9 #28 #29, quality #1).
 *
 *  1  multi-cavity acted on EVERY operation (casting bracket £5.93 = 34 %: machining, fettling and melt shop halved; a
 *     pattern already 4-up) and doubled a blow moulder the rules sized for one cavity — now the forming op only, by the
 *     rules' own step, the machine re-sized where it depends on cavities, or not priced;
 *  2  rule-of-thumb levers (bottleneck −20 %, lights-out ×0.6 with no capex, consumables ×0.8, packaging ×0.5, …) and
 *     £0.00 levers are no longer listed;
 *  3  a safety-critical part is not offered a lever that takes people off a special-characteristic check;
 *  4  what survives (scrap credit at index) is still re-costed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart, regionalBook } from '../server/services/bulk-run.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { rankOpportunities } from '../src/engine/opportunity-ranking.js';
import { formingOperationIndex, MIN_LEVER_SAVING_GBP } from '../src/engine/idea-levers.js';
import { ANSWERS } from '../scripts/real-parts-baseline.js';
import type { FormingCavityStep, SuggestionContext } from '../src/engine/insights.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { PartCostResult, UniversalStackInput, CommodityType, RateLibrary } from '../src/engine/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

interface Costed { input: UniversalStackInput; result: PartCostResult; lib: RateLibrary; commodity: CommodityType }

/** A real part costed headless as the reports were: UK, 200k / yr, 5-year programme, ex-works. */
async function costed(part: string): Promise<Costed> {
  const geo = structuredClone(baseline.find(b => b.part === part)!.geometry);
  const spec = ANSWERS[part];
  const r = await costMeasuredPart(geo, part,
    { partNumber: part, file: part, annualVolume: 200_000, ...(spec.commodity ? { commodity: spec.commodity } : {}) } as never,
    { ...spec.answers }, 'UK', { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
    { partNumber: part, file: part, status: 'error' } as never) as unknown as {
      status: string; commodity: CommodityType; trace: { stackInput: UniversalStackInput; result: PartCostResult } };
  expect(r.status).toBe('costed');
  return { input: r.trace.stackInput, result: r.trace.result, lib: regionalBook(book, 'UK', new Map()), commodity: r.commodity };
}

const ctxOf = (c: Costed, over: Partial<SuggestionContext> = {}): SuggestionContext =>
  ({ region: 'UK', volumeProvided: true, pkgLogisticsEstimated: true, library: c.lib, ...over });
const levers = (c: Costed, commodity: CommodityType, over: Partial<SuggestionContext> = {}) =>
  rankOpportunities(generateDFMDFA(c.result, c.input, commodity, ctxOf(c, over)), c.result.total);

const parts: Record<string, Costed> = {};
beforeAll(async () => {
  for (const p of ['Casting_Braket.stp', 'BM_Air_Duct.stp', 'PRCR002.stp', 'MACH_Hydraulic_Manifold.stp',
    'TF_Trim_Cover.stp', 'IM_ECU_Cover.stp', 'COMP_Hat_Stiffener.stp', 'Seat_Locking_Bracket.stp']) parts[p] = await costed(p);
}, 240_000);

// ─── 1 · multi-cavity ────────────────────────────────────────────────────────

describe('1 — multi-cavity acts on the forming operation only, by the rules\' own step', () => {
  it('the forming operation is the moulding line / blow moulder / former — never machining, melt, fettling or trim', () => {
    const br = parts['Casting_Braket.stp'].input.operations;
    expect(br[formingOperationIndex(parts['Casting_Braket.stp'].input)].operationName).toMatch(/Sand Casting — Moulding/);
    const bm = parts['BM_Air_Duct.stp'].input;
    expect(bm.operations[formingOperationIndex(bm)].operationName).toMatch(/Blow Moulding/);
    expect(formingOperationIndex(parts['Casting_Braket.stp'].input, 'Fettling (gate / riser removal, grind)')).toBe(-1);
    expect(formingOperationIndex(parts['Casting_Braket.stp'].input, br.find(o => /^Finish machining/.test(o.operationName))!.operationName)).toBe(-1);
  });

  it('the bracket (pattern already 4-up, the flask full) gets no multi-cavity lever — as casting or cast + machine', () => {
    const c = parts['Casting_Braket.stp'];
    for (const commodity of ['casting', 'cast_and_machine'] as CommodityType[]) {
      const r = generateDFMDFA(c.result, c.input, commodity, ctxOf(c));
      expect(r.costOptimisations.some(o => /Multi-Cavity/.test(o.title))).toBe(false);
      expect(JSON.stringify(levers(c, commodity).all)).not.toMatch(/Multi-Cavity|parts per cycle ×2/);
    }
  });

  it('given a further impression by the rules, only the moulding line divides: ≤ £0.5 — not the £5.9 of halving every op', () => {
    const c = parts['Casting_Braket.stp'];
    const tool = 8012;   // the bracket's pattern build-up (provenance cam-hpdc-die-cost); the step keeps it, to isolate the op
    const cavitation: FormingCavityStep = { current: 4, next: 5, unit: 'impressions', formingToolGBP: { current: tool, next: tool },
      basis: 'a hypothetical 5th impression, for this test' };
    const lever = levers(c, 'casting', { cavitation }).all.find(o => /Multi-Cavity/.test(o.action))!;
    expect(lever).toBeDefined();
    const k = formingOperationIndex(c.input);
    const ops = c.input.operations.map((o, i) => (i === k ? { ...o, partsPerCycle: o.partsPerCycle * 5 / 4 } : o));
    const base = computeUniversalStack(c.input, c.lib).total;
    const mine = base - computeUniversalStack({ ...c.input, operations: ops }, c.lib).total;
    expect(lever.savingPerPart).toBeCloseTo(mine, 3);
    expect(lever.savingPerPart).toBeLessThanOrEqual(0.5);
    // the withdrawn transform: every operation ×2, tooling ×1.7
    const old = base - computeUniversalStack({ ...c.input,
      operations: c.input.operations.map(o => ({ ...o, partsPerCycle: Math.max(2, o.partsPerCycle * 2) })),
      tooling: { ...c.input.tooling, totalToolingCost: c.input.tooling.totalToolingCost * 1.7 } }, c.lib).total;
    expect(old).toBeGreaterThan(5);
    expect(lever.recostBasis).toMatch(/Sand Casting — Moulding only: 4 → 5 impressions/);
    expect(lever.recostBasis).toMatch(/no other operation changed/);
  });

  it('the forming tooling is the rules\' figure for the next step — a dearer pattern takes its amortised £ off the saving', () => {
    const c = parts['Casting_Braket.stp'];
    const step = (next: number): FormingCavityStep => ({ current: 4, next: 5, formingToolGBP: { current: 8012, next }, basis: 't' });
    const same = levers(c, 'casting', { cavitation: step(8012) }).all.find(o => /Multi-Cavity/.test(o.action))!;
    const dearer = levers(c, 'casting', { cavitation: step(8012 + 20_000) }).all.find(o => /Multi-Cavity/.test(o.action));
    const extraPerPart = 20_000 / c.input.tooling.amortizationVolume * (1 + c.input.overheadPct) * (1 + c.input.marginPct);
    expect((dearer?.savingPerPart ?? 0)).toBeCloseTo(Math.max(0, same.savingPerPart - extraPerPart), 2);
  });

  it('the air duct: the blow moulder is sized by its cavities — no machine for the next step, no £', () => {
    const c = parts['BM_Air_Duct.stp'];
    const noRules = generateDFMDFA(c.result, c.input, 'blow_moulding', ctxOf(c));
    expect(noRules.costOptimisations.some(o => /Multi-Cavity/.test(o.title))).toBe(false);   // was £0.18 (19.5 %)
    const cavitation: FormingCavityStep = { current: 1, next: 2, formingToolGBP: { current: 30_000, next: 51_000 }, basis: 't' };
    const unsized = generateDFMDFA(c.result, c.input, 'blow_moulding', ctxOf(c, { cavitation }));
    const lev = unsized.costOptimisations.find(o => /Multi-Cavity/.test(o.title));
    expect(lev?.savingBasis).not.toBe('recosted');
    expect(levers(c, 'blow_moulding', { cavitation }).all.some(o => /Multi-Cavity/.test(o.action))).toBe(false);
    // with the rules' machine for 2 cavities it is re-costed on the blow moulder alone; the deflash station is per part
    const k = formingOperationIndex(c.input);
    const sized = { ...cavitation, machineIdForNext: c.input.operations[k].machineId };
    const r = generateDFMDFA(c.result, c.input, 'blow_moulding', ctxOf(c, { cavitation: sized }));
    const priced = r.costOptimisations.find(o => /Multi-Cavity/.test(o.title));
    expect(priced?.savingBasis).toBe('recosted');
    const ops = c.input.operations.map((o, i) => (i === k ? { ...o, partsPerCycle: o.partsPerCycle * 2 } : o));
    const tooling = { ...c.input.tooling, totalToolingCost: c.input.tooling.totalToolingCost + 21_000 };
    const mine = computeUniversalStack(c.input, c.lib).total - computeUniversalStack({ ...c.input, operations: ops, tooling }, c.lib).total;
    expect(priced?.savingGBP ?? NaN).toBeCloseTo(mine, 3);
    expect(c.input.operations[k + 1]?.operationName ?? '').toMatch(/Deflash/);   // the trim station is not the forming op
  });
});

// ─── 2 · rule-of-thumb and £0.00 levers ──────────────────────────────────────

const WITHDRAWN = /Bottleneck|Lights-Out|Unmanned|Consumables Rationalisation|Returnable|Packaging Cost|Pack Density|Freight Mode|Lightweighting|Closed-Loop Regrind|Soft \/ Bridge|Tool-Life Extension|Multi-Machine Manning/;
const RULE_OF_THUMB = /−20%|×0\.6|×0\.8|×0\.5|×0\.7|×1\.25|×1\.7|1:2 manning|net weight −10%|parts per cycle ×2/;

describe('2 — only physically defined levers are listed; never a £0.00 lever', () => {
  it('no listed lever on the eight real parts is a rule-of-thumb multiplier, and each is worth at least a penny', () => {
    for (const [p, c] of Object.entries(parts)) {
      const all = levers(c, c.commodity).all;
      for (const o of all) {
        expect(o.action, p).not.toMatch(WITHDRAWN);
        expect(o.recostBasis ?? '', p).not.toMatch(RULE_OF_THUMB);
        expect(o.savingPerPart, p).toBeGreaterThanOrEqual(MIN_LEVER_SAVING_GBP);
      }
    }
  });

  it('the stub axle: no lights-out £3.44 and no consumables ×0.8 £0.78; the manifold: no lights-out £2.41', () => {
    expect(levers(parts['PRCR002.stp'], 'cast_and_machine').all.map(o => o.action).join('|')).not.toMatch(/Lights-Out|Consumables/);
    expect(levers(parts['MACH_Hydraulic_Manifold.stp'], 'machining').all.map(o => o.action).join('|')).not.toMatch(/Lights-Out/);
    // nor offered as an unpriced suggestion
    const d = generateDFMDFA(parts['PRCR002.stp'].result, parts['PRCR002.stp'].input, 'cast_and_machine', ctxOf(parts['PRCR002.stp']));
    expect(d.costOptimisations.some(o => /Lights-Out|Bottleneck/.test(o.title))).toBe(false);
  });

  it('the thermoformed trim cover: no 1:2 manning on a hand-loaded former, no "runners and sprues", no −20 %', () => {
    const t = levers(parts['TF_Trim_Cover.stp'], 'thermoforming').all.map(o => `${o.action} ${o.recostBasis}`).join('|');
    expect(t).not.toMatch(/Multi-Machine|Regrind|Bottleneck/);
  });
});

// ─── 3 · safety-critical ─────────────────────────────────────────────────────

describe('3 — a safety-critical part keeps people on the special-characteristic checks', () => {
  const op = (operationName: string, over: Record<string, unknown> = {}) =>
    ({ operationName, machineId: 'mach-vmc3', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85,
      manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9, labourId: 'lab-uk-skilled', ...over });
  const result = {
    total: 100, breakdown: { rawMaterial: 30, process: 30, labour: 15, tooling: 8, packaging: 2, logistics: 3, overhead: 8, margin: 4 },
    operationDetails: [{ operationName: 'CNC Machining', processCost: 20, labourCost: 5 }, { operationName: 'Final inspection (CMM)', processCost: 6, labourCost: 4 }],
  } as unknown as PartCostResult;
  const input = { operations: [op('CNC Machining'), op('Final inspection (CMM)')], rawMaterial: { materialUtilization: 0.75 },
    tooling: { amortizationVolume: 100_000, totalToolingCost: 40_000 }, overheadPct: 0.09 } as unknown as UniversalStackInput;

  it('reduced inspection is offered on an ordinary part, not on a safety-critical one', () => {
    const plain = generateDFMDFA(result, input, 'machining', { region: 'UK' });
    const safety = generateDFMDFA(result, input, 'machining', { region: 'UK', safetyCritical: true });
    expect(plain.costOptimisations.some(o => /Right-Size Inspection/.test(o.title))).toBe(true);
    expect(safety.costOptimisations.some(o => /Right-Size Inspection/.test(o.title))).toBe(false);
    expect(JSON.stringify(safety)).not.toMatch(/SPC-based skip-lot/);
    expect(safety.dfa.issues.find(i => /Inspection is a separate/.test(i.title))?.recommendation).toMatch(/100 % check of the special characteristics/);
    expect(plain.dfa.issues.find(i => /Inspection is a separate/.test(i.title))?.recommendation).toMatch(/skip-lot/);
  });

  it('the stub axle answered safety-critical has no unattended-running or reduced-inspection lever', () => {
    const c = parts['PRCR002.stp'];
    const d = generateDFMDFA(c.result, c.input, 'cast_and_machine', ctxOf(c, { safetyCritical: true }));
    expect(d.costOptimisations.some(o => /Lights-Out|Unmanned|Right-Size Inspection/.test(o.title))).toBe(false);
  });
});

// ─── 4 · what survives ───────────────────────────────────────────────────────

describe('4 — the scrap credit at index survives, re-costed, its 30 % labelled', () => {
  it('the manifold\'s chips credited at 30 % of prime: the £ is the stack re-run of that one override', () => {
    const c = parts['MACH_Hydraulic_Manifold.stp'];
    const lever = levers(c, 'machining').all.find(o => /Scrap Revenue/.test(o.action))!;
    expect(lever).toBeDefined();
    expect(lever.recostBasis).toMatch(/30% is engineering-typical, not sourced/);
    const price = c.result.traceability.find(t => t.field === 'material.pricePerKg')!.value;
    const next = computeUniversalStack({ ...c.input, rawMaterial: { ...c.input.rawMaterial, scrapRecoveryPricePerKgOverride: 0.3 * price } }, c.lib).total;
    expect(lever.savingPerPart).toBeCloseTo(c.result.total - next, 3);
  });
});
