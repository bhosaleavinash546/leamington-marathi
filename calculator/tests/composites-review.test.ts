/**
 * The composites review, 3 Oct 2026 — one test per finding.
 *
 * Traced on three laminates modelled in OCP (cad-audit/parts/COMP_modelled_parts.py —
 * not customer parts): a carbon-prepreg roof panel, a glass RTM battery-enclosure
 * lid and a carbon hat-section stiffener. docs/cad/composites-review-2026-10.md
 * has the trace and the hand reconciliation of the lid at 5,000/yr (£91.17).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { COMPOSITES_RULES, partsPerCure, CURE_CELLS } from '../src/engine/cost-input-rules/commodities/composites.js';
import { LAMINATE_DECISION_ID } from '../src/engine/cost-input-rules/derive/laminate.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { processFromNames } from '../src/engine/cost-input-rules/derive/part-evidence.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams, COSTABLE_COMMODITIES } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeCompositeDrivers } from '../src/engine/modules/composites.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const ROOF = 'COMP_Roof_Panel.stp', LID = 'COMP_Battery_Lid.stp', HAT = 'COMP_Hat_Stiffener.stp';
const ans = (sys: string) => ({ [LAMINATE_DECISION_ID]: sys, 'commodity.route': 'composites' });
const ctx = (part: string, sys: string, annualVolume = 5_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'composites', commoditySource: 'engineer', annualVolume,
  filename: part, answers: ans(sys),
} as RuleContext);
const comp = (part: string, sys: string, v = 5_000) =>
  runCostInputRules(COMPOSITES_RULES, ctx(part, sys, v)).suggestions.composites as Record<string, number | string>;
const headless = async (part: string, sys: string, v: number) =>
  await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: v, commodity: 'composites' } as never,
    ans(sys), 'UK', { annualVolume: v } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
    { partNumber: part, file: part, status: 'error' } as never) as { status: string; total: number; code?: string };

describe('1. a laminate can be routed to composites', () => {
  it('composites is a route, and the name reader knows a laminate', () => {
    expect(processFromNames([{ text: 'ROOF PANEL CFRP PREPREG', where: 'STEP product' }] as never).route).toBe('composites');
    expect(processFromNames([{ text: 'BATTERY ENCLOSURE LID GFRP RTM', where: 'STEP product' }] as never).route).toBe('composites');
    expect(processFromNames([{ text: 'BRACKET CARBON STEEL', where: 'STEP product' }] as never).route).not.toBe('composites');
  });
  it('all three are offered composites, leaning on it (the lid and stiffener went to sheet metal; the roof was asked blow / roto)', () => {
    for (const p of [ROOF, LID, HAT]) {
      const r = inferCommodity({ geo: geoOf(p), geometryQuality: 'occt', annualVolume: 5_000, filename: p, answers: {} } as never) as
        { decision: { options: Array<{ value: string; leaning?: boolean }> } };
      expect(r.decision.options.find(o => o.leaning)!.value).toBe('composites');
    }
  });
  it('a measured open shell is not told it encloses a sealed void (the probe outranks the fill test)', () => {
    const r = inferCommodity({ geo: geoOf('BIW_Inner_Panel.stp'), geometryQuality: 'occt', annualVolume: 50_000,
      filename: 'BIW_Inner_Panel.stp', answers: {} } as never) as { decision: { options: Array<{ value: string }> } };
    expect(r.decision.options.map(o => o.value)).not.toContain('blow_moulding');
    expect(r.decision.options.map(o => o.value)).toContain('sheet_metal');
  });
});

describe('2. headless costs a composite at all', () => {
  it('composites is costable, and all three parts cost (it returned null: "no cost mapping")', async () => {
    expect(COSTABLE_COMMODITIES).toContain('composites');
    expect((await headless(LID, 'rtm-gf', 5_000)).total).toBeCloseTo(91.17, 2);
    expect((await headless(ROOF, 'prepreg-cf', 5_000)).status).toBe('costed');
    expect((await headless(HAT, 'prepreg-cf', 5_000)).status).toBe('costed');
  });
});

describe('3. the laminate thickness is 2·V/S', () => {
  it('roof 1.92 mm → 8 plies of 0.25 mm carbon prepreg', () => {
    expect(comp(ROOF, 'prepreg-cf').plies).toBe(8);
  });
});

describe('4. a cure load is what fits the bed', () => {
  it('2 roof tools on the 2.8 × 1 m autoclave bed, 20 stiffeners; an RTM part cures in its die', () => {
    expect(partsPerCure(1.2, 0.9, CURE_CELLS['prepreg-cf'].bedM).n).toBe(2);
    expect(comp(HAT, 'prepreg-cf').partsPerCureCycle).toBe(20);
    expect(comp(LID, 'rtm-gf')).toMatchObject({ cureMachineId: 'rtm-press-std', partsPerCureCycle: 1 });
  });
  it('a tool that does not fit is costed one to a load and says a larger cell is needed', () => {
    expect(partsPerCure(1.5, 1.2, CURE_CELLS['prepreg-cf'].bedM).basis).toContain('larger cure cell');
  });
});

describe('5. layup tools: what the volume needs, worn out fractionally', () => {
  it('roof at 5,000/yr: 7 tools in service (each tied up 4.2 h)', () => {
    expect(comp(ROOF, 'prepreg-cf').toolsInService).toBe(7);
  });
  it('tools are the greater of throughput and wear, not ceil(volume ÷ life)', () => {
    const base = {
      fibrePricePerKg: 3.99, resinPricePerKg: 5.46, fibreWeightFraction: 0.5, partWeightKg: 2.6, wasteFraction: 0.12,
      process: 'rtm' as const, areaM2: 0.5, plies: 6, layupLabourId: 'lab-uk-skilled', layupTimeHrPerPart: 0.1, oee: 0.8,
      manning: 1, labourEfficiency: 0.92, cureMachineId: 'rtm-press-std', cureLabourId: 'lab-uk-semiskilled', cureTimeHr: 0.8,
      trimLabourId: 'lab-uk-semiskilled', trimTimeHr: 0, toolingCost: 10_000, toolingLife: 4_000, amortizationVolume: 5_000,
    };
    expect(computeCompositeDrivers({ ...base, toolsInService: 3 }).tooling.totalToolingCost).toBe(30_000);
    expect(computeCompositeDrivers(base).tooling.totalToolingCost).toBe(12_500);   // 1.25 sets, not 2
  });
});

describe('6. the rest of the cell is ruled, the same on both paths', () => {
  it('trim on the 5-axis waterjet, crew 1, OEE 0.80, efficiency 0.92, scrap 4%, NDI on structural carbon only', async () => {
    const c = ctx(LID, 'rtm-gf');
    const { analysis } = buildDeterministicAnalysis(COMPOSITES_RULES, c, 'lid');
    const p = toCostParams('composites', analysis.costInputSuggestions as never, 5_000, null, c.geo)!.params;
    expect(p).toMatchObject({ trimMachineId: 'waterjet-5ax-composite', manning: 1, oee: 0.8, labourEfficiency: 0.92,
      rejectRate: 0.04, ndiCostPerPart: 0, cureMachineId: 'rtm-press-std', toolsInService: 3 });
    expect(comp(HAT, 'prepreg-cf').ndiCostPerPart).toBe(25);
  });
});

describe('7. baseline', () => {
  it('records all three at 50,000/yr', () => {
    expect(baseline.find(b => b.part === ROOF)!.outcome.total).toBe(443.36);
    expect(baseline.find(b => b.part === LID)!.outcome.total).toBe(84.3);
    expect(baseline.find(b => b.part === HAT)!.outcome.total).toBe(99.63);
  });
});
