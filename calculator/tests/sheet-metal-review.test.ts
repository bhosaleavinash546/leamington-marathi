/**
 * The sheet-metal & BIW review, 2 Oct 2026 — one test per finding.
 *
 * Traced on the real seat bracket and three BIW pressings modelled in OCP
 * (cad-audit/parts/BIW_modelled_parts.py — not customer parts). Before the fixes
 * the seat bracket at 2,000/yr was announced as "Laser Cutting" and costed with a
 * £94k die (£57.95 a part); a 1.1 m drawn inner panel was never unfolded and was
 * costed as a flat part from its bounding box; the die type, press line, die cost
 * and press came from four rules that disagreed. docs/sheet-metal/
 * sheet-metal-biw-review-2026-10.md has the trace.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  SHEET_METAL_RULES, stampingPlan, routeChoice, fabPlan, dieClassFor, SOFT_TOOL, BINDER_PRESSURE_MPA,
} from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { computeSheetMetalDrivers } from '../src/engine/modules/sheet-metal.js';
import { stampingPressFacts, pickStampingPressId } from '../src/engine/machine-sizing.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, annualVolume = 50_000, commodity = 'sheet_metal'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', 'commodity.thinWallRoute': 'sheet_metal' },
} as RuleContext);
const sm = (part: string, vol = 50_000) =>
  runCostInputRules(SHEET_METAL_RULES, ctx(part, vol)).suggestions.sheetMetal as Record<string, number | string>;

describe('1. one stamping plan: die type, press line, stations, die cost and press agree', () => {
  it('seat bracket: a coil-fed PROGRESSIVE die (it was a "transfer" die fed from coil)', () => {
    const s = sm('Seat_Locking_Bracket.stp');
    expect(s.pressLine).toBe('coil-fed');
    expect(s.dieType).toBe('progressive');
  });
  it('stations from forming content: 15 bends at ~3 a station + pierce + cut-off + restrike = 7 (was 12)', () => {
    expect(sm('Seat_Locking_Bracket.stp').numOps).toBe(7);
  });
  it('a tandem line is priced as its dies, not as a progressive die', () => {
    const p = stampingPlan(ctx('BIW_Floor_Reinforcement.stp'))!;
    expect(p.pressLine).toBe('tandem');
    expect(p.dieType).toBe('single_stage');
    expect(p.dieBasis).toContain('5 single-stage dies');
  });
});

describe('2. the press must take the die, and pull the draw', () => {
  it('seat bracket: a 7-station die 2.0 m long needs a 400 t bed, not the 200 t blanking force picked', () => {
    const p = stampingPlan(ctx('Seat_Locking_Bracket.stp'))!;
    expect(p.bolsterMm).toBeGreaterThan(stampingPressFacts('press-200t').bolsterMm);
    expect(p.pressId).toBe('press-400t');
  });
  it('drawn panel: punch force + blank-holder force on the binder', () => {
    const p = stampingPlan(ctx('BIW_Inner_Panel.stp'))!;
    expect(p.forceBasis).toContain(`blank holder ${BINDER_PRESSURE_MPA} MPa`);
    expect(p.tonnes).toBeGreaterThan(250);
  });
  it('the press ladder honours the bolster', () => {
    expect(pickStampingPressId(50, 1.25)).toBe('press-100t');
    expect(pickStampingPressId(50, 1.25, { bolsterMm: 2400 })).toBe('press-400t');
  });
});

describe('3. stroke rate follows the press line', () => {
  it('tandem 10 SPM, transfer ≤ 20, coil-fed by feed and press', () => {
    expect(sm('BIW_Floor_Reinforcement.stp').strokesPerMin).toBe(10);       // was 28 "feed-limited from coil"
    expect(sm('BIW_Reinf_Channel.stp').strokesPerMin).toBe(80);             // 100 t max
  });
  it('the module no longer caps every progressive die at 20 SPM', () => {
    const d = computeSheetMetalDrivers({
      materialId: 'mat-dc04', netWeightKg: 0.5, blankLengthMm: 140, blankWidthMm: 240, thicknessMm: 2, perimeterMm: 830,
      shearStrengthMPa: 280, stripWidthMm: 248, pitchMm: 140, partsPerStroke: 1, pressId: 'press-100t', labourId: 'lab-uk-semiskilled',
      strokesPerMin: 80, oee: 0.8, manning: 0.5, labourEfficiency: 0.92, numOperations: 3, dieType: 'progressive',
      dieLife: 800_000, dieCostEstimate: 38_504, amortizationVolume: 50_000,
    });
    expect(d.operations[0].cycleTimeHr * 3600).toBeCloseTo(0.75, 3);       // 80 SPM, was floored to 3 s
  });
});

describe('4. the route is priced: stamping or laser + press brake', () => {
  it('channel at 2,000/yr goes laser + brake (it carried a £31k die: £19.32 a part)', () => {
    const rc = routeChoice(ctx('BIW_Reinf_Channel.stp', 2000))!;
    expect(rc.route).toBe('fab');
    expect(rc.fab!.perPartGBP).toBeLessThan(rc.stampGBP!);
  });
  it('channel at 50,000/yr stamps', () => {
    expect(routeChoice(ctx('BIW_Reinf_Channel.stp', 50_000))!.route).toBe('stamping');
  });
  it('a stretch-formed or drawn part cannot go to a press brake', () => {
    const f = fabPlan(ctx('Seat_Locking_Bracket.stp', 2000))!;
    expect(f.feasible).toBe(false);
    expect(routeChoice(ctx('Seat_Locking_Bracket.stp', 2000))!.route).toBe('stamping');
  });
  it('the fab route is costed by the fabrication module on both paths', () => {
    const c = ctx('BIW_Reinf_Channel.stp', 2000);
    const { analysis } = buildDeterministicAnalysis(SHEET_METAL_RULES, c, 'channel');
    expect(analysis.costInputSuggestions.recommendedCommodity).toBe('sheet_metal_fab');   // the screen opens the fab form
    const m = toCostParams('sheet_metal', analysis.costInputSuggestions as never, 2000, 'steel', c.geo)!;
    expect(m.commodity).toBe('sheet_metal_fab');
    expect(m.params.toolingCost).toBe(1500);                                              // not the die cost
  });
});

describe('5. a BIW panel with large radii is unfolded', () => {
  it('inner panel: developed 1,430 × 1,047 mm blank, drawn — not the bounding box × 1.05', () => {
    const g = geoOf('BIW_Inner_Panel.stp');
    expect(g.blank?.developedFrom).toBe('solid');
    expect(g.blank?.developable).toBe(false);
    expect(sm('BIW_Inner_Panel.stp').pressLine).toBe('tandem');
  });
});

describe('6. soft tooling for a short programme', () => {
  it('2,000/yr × 5 years = 10,000 parts → soft dies at ~⅓ the cost, 25k-hit life', () => {
    expect(dieClassFor(ctx('BIW_Floor_Reinforcement.stp', 2000)).soft).toBe(true);
    const lo = sm('BIW_Floor_Reinforcement.stp', 2000);
    const hi = sm('BIW_Floor_Reinforcement.stp', 50_000);
    expect(Number(lo.dieCostGBP)).toBeCloseTo(Number(hi.dieCostGBP) * SOFT_TOOL.costFactor, -2);
    expect(lo.dieLife).toBe(SOFT_TOOL.life);
  });
});

describe('7. crew, scrap, die change and die maintenance are rules, the same on both paths', () => {
  it('seat bracket: 0.5 operator (coil ≤ 400 t), 1.5% scrap, 1 h die change over 2,500, 5% maintenance', () => {
    const s = sm('Seat_Locking_Bracket.stp');
    expect(s.manning).toBe(0.5);
    expect(s.rejectRate).toBe(0.015);
    expect(s.setupHoursPerChange).toBe(1);
    expect(s.batchSize).toBe(2500);
    expect(s.dieMaintenanceFraction).toBe(0.05);
  });
  it('headless takes them', () => {
    const c = ctx('Seat_Locking_Bracket.stp');
    const { analysis } = buildDeterministicAnalysis(SHEET_METAL_RULES, c, 'seat');
    const m = toCostParams('sheet_metal', analysis.costInputSuggestions as never, 50_000, 'steel', c.geo)!;
    expect(m.params).toMatchObject({ manning: 0.5, rejectRate: 0.015, dieMaintenanceFraction: 0.05,
      setup: { hoursPerChange: 1, batchSize: 2500 } });
  });
});
