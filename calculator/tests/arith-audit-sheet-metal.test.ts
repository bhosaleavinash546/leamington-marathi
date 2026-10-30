/**
 * Arithmetic audit — SHEET METAL (30 Oct 2026). One test per fixed finding, each failing on the code before the
 * fix; and the independent shadow model (scripts/arith-audit/sheet-metal.ts) re-adding every real sheet part to
 * the penny. Write-up: docs/review/arith-audit/sheet-metal.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  SHEET_METAL_RULES, stampingPlan, fabPlan, routeChoice, holeCount,
} from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import { computeSheetMetalDrivers, type SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import { computeSheetMetalFabDrivers } from '../src/engine/modules/sheet-metal-fab.js';
import { estimateStampingDieCost } from '../src/engine/modules/sheet-metal-advisor.js';
import { stampingPressFacts } from '../src/engine/machine-sizing.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { runSheetMetalAudit } from '../scripts/arith-audit/sheet-metal.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, annualVolume = 50_000, commodity = 'sheet_metal'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', 'commodity.thinWallRoute': 'sheet_metal' },
  programmeYears: 5,
} as RuleContext);
const rules = (part: string, vol = 50_000) => runCostInputRules(SHEET_METAL_RULES, ctx(part, vol));
const sm = (part: string, vol = 50_000) => rules(part, vol).suggestions.sheetMetal as Record<string, number | string>;

describe('SM-1 holes measured on the developed blank are pierced', () => {
  it('seat bracket: 21 cut-outs on the unfold (982 mm of edge) — a pierce station, and 22 laser pierces', () => {
    const g = geoOf('Seat_Locking_Bracket.stp');
    expect(g.blank?.holeCount).toBe(21);
    expect(holeCount(ctx('Seat_Locking_Bracket.stp'))).toBe(21);          // was 0: the feature table lists no round holes
    expect(sm('Seat_Locking_Bracket.stp').numOps).toBe(8);                  // pierce + 5 forming + cut-off + restrike (was 7)
    expect(fabPlan(ctx('Seat_Locking_Bracket.stp'))!.laser.pierces).toBe(22);
  });
});

describe('SM-2 a press-blanked line carries its blanking die', () => {
  it('floor reinforcement (tandem, die-blanked at 50k): 5 line dies + 1 blanking die', () => {
    const p = stampingPlan(ctx('BIW_Floor_Reinforcement.stp'))!;
    const one = estimateStampingDieCost({ dieType: 'single_stage', stations: 1, blankAreaCm2: 644 * 497 / 100, shearStrengthMPa: 280 }).total;
    expect(p.dieCostGBP).toBe(6 * one);                                   // was 5 × one
    expect(p.dieBasis).toContain('blanking die');
  });
  it('a laser-blanked line (below 30,000/yr) has no blanking die', () => {
    const p = stampingPlan(ctx('BIW_Floor_Reinforcement.stp', 20_000))!;
    expect(p.dieBasis).not.toContain('blanking die');
  });
});

describe('SM-3 the blanking press is sized on the blank', () => {
  const BASE: SheetMetalInputs = {
    materialId: 'mat-dc04', netWeightKg: 9, blankLengthMm: 1428, blankWidthMm: 1045, thicknessMm: 0.9, perimeterMm: 4427,
    shearStrengthMPa: 280, stripWidthMm: 1433, pitchMm: 1051, partsPerStroke: 1, pressId: 'press-400t', labourId: 'lab-uk-semiskilled',
    strokesPerMin: 10, oee: 0.85, manning: 1, labourEfficiency: 0.95, numOperations: 5, dieType: 'single_stage', dieLife: 1_090_000,
    dieCostEstimate: 1, amortizationVolume: 250_000, pressLine: 'tandem', pressesInLine: 5, blanking: { method: 'die', blanksPerMin: 45 },
    setup: { hoursPerChange: 0.5, batchSize: 2500, setterLabourId: 'lab-uk-technician' },
  };
  it('inner panel: a 1,428 mm blanking die (+600) does not fit a 200 t press’s 1,800 mm bed — 400 t', () => {
    const d = computeSheetMetalDrivers(BASE);
    expect(stampingPressFacts('press-200t').bolsterMm).toBeLessThan(1428 + 600);
    expect(d.operations[0].machineId).toBe('press-400t');                // was press-200t whatever the blank
  });
  it('the blanking die is changed once a batch too', () => {
    const d = computeSheetMetalDrivers(BASE);
    const ch = d.operations.find(o => o.operationName === 'Blanking die change (amortised over the batch)')!;
    expect(ch.machineId).toBe('press-400t');
    expect(ch.cycleTimeHr).toBeCloseTo(0.5 / 2500, 12);
    expect(ch.oee).toBe(1);
  });
});

describe('SM-4 the route basis prints the £/part each route is costed at', () => {
  it('seat bracket at 50,000/yr: stamping £ = the costing’s process + labour + tooling (it printed £0.427 for £0.548)', async () => {
    const checks = await runSheetMetalAudit();
    const route = checks.filter(c => c.what.startsWith('route basis'));
    expect(route.length).toBeGreaterThanOrEqual(6);
    expect(route.filter(c => !c.pass)).toEqual([]);
  }, 60_000);
  it('the basis says what it compares', () => {
    expect(routeChoice(ctx('BIW_Reinf_Channel.stp'))!.basis).toContain('each as its module costs it');
  });
});

describe('SM-5 the press-brake set-up is its own op at OEE 1, not in the bend cycle', () => {
  it('bending time = bends × s a bend; set-up over the batch, not ÷ OEE, not uplifted for rejects', () => {
    const d = computeSheetMetalFabDrivers({
      materialId: 'mat-dc04', partWeightKg: 0.5, materialUtilization: 0.9, blankingMethod: 'laser', blankingMachineId: 'laser-trumpf-3030',
      blankingLabourId: 'lab-uk-semiskilled', blankingCycleTimeSec: 20, bendCount: 2, timePerBendSec: 17, toolChangeCount: 2,
      toolChangeTimeSec: 900, batchSize: 250, bendMachineId: 'brake-trumpf-trubend3100', bendLabourId: 'lab-uk-skilled',
      oee: 0.8, manning: 1, labourEfficiency: 0.92, rejectRate: 0.015, toolingCost: 1500, amortizationVolume: 25_000,
    });
    const bend = d.operations.find(o => o.operationName === 'Press Brake Bending')!;
    const setup = d.operations.find(o => o.operationName === 'Press brake set-up (amortised over the batch)')!;
    expect(bend.cycleTimeHr * 3600).toBeCloseTo(34 / 0.985, 9);
    expect(setup.cycleTimeHr * 3600).toBeCloseTo(7.2, 9);
    expect([setup.oee, setup.labourEfficiency]).toEqual([1, 1]);
  });
});

describe('SM-6 printed arithmetic is the arithmetic done', () => {
  it('die build-up: station hours are (70 + 0.11 × blank), steel 5 cm × 2 × 1.2 — as computed', () => {
    const e = estimateStampingDieCost({ dieType: 'progressive', stations: 8, blankAreaCm2: 687.7, shearStrengthMPa: 280 });
    const cnc = e.detail.lines.find(l => l.item.startsWith('Station CNC'))!;
    expect(cnc.hours).toBeCloseTo(Math.round(0.45 * (70 + 0.11 * 687.7) * 8 * 10) / 10, 6);
    expect(cnc.basis).toContain('(70 + 0.11 × 688 cm²)');
    expect(cnc.basis).not.toContain('45 + 0.075');                       // the old basis — not the arithmetic
    expect(e.detail.lines.find(l => l.item.startsWith('Punch + die'))!.basis).toContain('5 cm × 2 (punch + die) × 1.2');
  });
  it('the die-cost rule prints the build-up that adds to it', () => {
    const p = rules('Seat_Locking_Bracket.stp').provenance['sm-die-cost'];
    expect(p.basis).toContain(`= £${Number(p.value).toLocaleString('en-GB')}`);
  });
  it('force and stroke rate print every constant they use', () => {
    const pr = rules('Seat_Locking_Bracket.stp').provenance;
    expect(pr['sm-press'].basis).toContain('÷ 9,807 N/t');
    expect(pr['sm-press'].basis).toContain('shear ÷ 0.8');
    expect(pr['sm-spm'].basis).toContain('18,000 mm/min');
    expect(pr['sm-spm'].basis).toContain('× 0.8^3');
    expect(pr['sm-spm'].basis).toContain('= 20.5 → 20 SPM');
    expect(pr['sm-die-life'].basis).toContain('(300 ÷ 280 MPa)^1.3');
    expect(pr['sm-shear'].basis).toContain('engineering-typical');
  });
  it('thresholds that pick the press line are stated', () => {
    const pl = rules('BIW_Floor_Reinforcement.stp').provenance['sm-press-line'].basis;
    expect(pl).toContain('≥ 1,500 cm²');
    expect(pl).toContain('≥ 30,000/yr');
  });
  it('the soft-tool factor is labelled', () => {
    expect(rules('Seat_Locking_Bracket.stp', 2000).provenance['sm-die-cost'].basis).toContain('engineering-typical ~⅓, not sourced');
  });
});

describe('SM-7 the process prose states what is costed', () => {
  it('seat bracket at 50k is a progressive die (the advisor said "Progressive / Transfer Stamping")', () => {
    expect(sm('Seat_Locking_Bracket.stp').process).toBe('Progressive stamping (8 stations)');
  });
  it('the drawn panels name their tandem line', () => {
    expect(sm('BIW_Inner_Panel.stp').process).toBe('Tandem press line (draw, trim, pierce, flange, restrike)');
  });
});

describe('the shadow model re-adds every real sheet part', () => {
  it('all checks PASS (4 parts at 50k, the bracket at 5k, the channel on laser + brake)', async () => {
    const checks = await runSheetMetalAudit();
    expect(checks.length).toBeGreaterThan(300);
    expect(checks.filter(c => !c.pass)).toEqual([]);
  }, 60_000);
});
