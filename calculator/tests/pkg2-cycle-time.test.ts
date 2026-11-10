/**
 * Correction package PKG-2 — the cycle-time model (castforge audit, 10 Nov 2026): CF-19 non-cutting time per operation,
 * CF-20 tool wear on cutting time only, CF-06 passes from the stock, CF-16 / CF-22 set-up constants labelled and the
 * forge-line die setting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FeatureRow } from '../src/engine/feature-ops.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { featureTime, featureMinutesEach, holeWork } from '../src/engine/feature-machining.js';
import { drillFeed, boreFeed, facePassPlan, faceMillCutMinutes, borePasses, CATALOGUE } from '../src/engine/cutting-catalogue.js';
import * as NC from '../src/engine/non-cut-time.js';
import { nearNetMachiningTime, toolWearPerPart, TOOL_CHANGE_SEC, cuttingDataFor } from '../src/engine/machining-time.js';
import {
  nearNetCut, routingFor, buildOperationPlan, cuttingMinutesOf, spindleMinutesOf, MACHINING_RULES,
} from '../src/engine/cost-input-rules/commodities/machining.js';
import { optimiseMachiningRouting } from '../src/engine/routing-optimiser.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { FORGING_RULES, FORGE_DIE_SETTING_HR } from '../src/engine/cost-input-rules/commodities/forging.js';
import { computeForgingDrivers } from '../src/engine/modules/forging.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctxOf = (part: string, commodity = 'cast_and_machine', annualVolume = 50_000, answers: Record<string, string> = {}): RuleContext =>
  ({ geo: geoOf(part), geometryQuality: 'occt', commodity, annualVolume, filename: part, answers } as RuleContext);
const hole = (d: number, L: number, through: boolean | null = true, extra: Partial<FeatureRow> = {}): FeatureRow =>
  ({ kind: 'hole', diaMm: d, depthMm: L, through, count: 1, ...extra });
const face = (area: number): FeatureRow => ({ kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: area });

describe('CF-19: no fixed allowance per feature — a feature is its cutting + its own feed-in', () => {
  it('a Ø10 × 30 drilled hole in steel is 30 ÷ vf cutting + 2 mm R-plane ÷ vf (the 0.15 min approach is gone)', () => {
    const vf = drillFeed('steel', 10).vf;
    const t = featureTime(hole(10, 30), 'steel');
    expect(t.cutMin).toBeCloseTo(30 / vf, 9);
    expect(t.nonCutMin).toBeCloseTo(NC.R_PLANE_MM / vf, 9);
    expect(featureMinutesEach(hole(10, 30), 'steel')).toBeCloseTo(32 / vf, 9);
    expect(t.visits).toEqual([{ tool: 'drill Ø10.0', feedInMin: NC.R_PLANE_MM / vf, rapidMm: 30 }]);
  });
  it('a tapped hole visits with a tap too (a tool change of its own); a blind Ø13–26 with a boring bar', () => {
    expect(featureTime(hole(5, 12, false), 'steel').visits.map(v => v.tool)).toEqual(['drill Ø5.0', 'tap M6']);
    expect(featureTime(hole(16, 30, false), 'steel').visits.map(v => v.tool)).toEqual(['drill Ø16.0', 'bore Ø16.0']);
  });
  it('the rapid is each machine\'s own, sourced; a machine with no figure takes the slowest sourced and says so', () => {
    expect(NC.rapidMinutes(60_000, 'mach-hmc-400').min).toBeCloseTo(1, 9);             // Okuma MA-4000H 60 m/min
    expect(NC.rapidMinutes(25_400, 'mach-haas-vf2').min).toBeCloseTo(1, 9);            // Haas VF-2 1,000 ipm
    expect(NC.rapidMinutes(42_000, 'mach-dmg-dmu50').min).toBeCloseTo(1, 9);           // DMU 50 42 m/min
    expect(NC.rapidMinutes(30_000, 'mach-lathe-cnc').min).toBeCloseTo(1, 9);           // Mazak QUICK TURN X 30 m/min
    expect(NC.rapidMinutes(1000, 'mach-hmc-400').text).toMatch(/sourced: Okuma MA-4000H/);
    const u = NC.rapidMinutes(22_900, 'mach-unknown');
    expect(u.min).toBeCloseTo(1, 9);
    expect(u.text).toMatch(/no rapid read/);
  });
  it('traverse: the measured hole centres in nearest-neighbour order, else the envelope estimate, stated', () => {
    const at = (x: number, y: number): NC.Visit => ({ tool: 'drill Ø10.0', feedInMin: 0, pos: [x, y, 0] });
    const m = NC.planNonCut([at(0, 0), at(100, 0), at(10, 0)], [200, 100, 50]);
    expect(m.traverseMm).toBeCloseTo(100, 9);                                          // 0 → 10 → 100
    expect(m.measured).toBe(3);
    expect(m.rapidMm).toBeCloseTo(100 + 3 * 2 * NC.CLEARANCE_PLANE_MM, 9);
    expect(m.tools).toBe(1);
    expect(m.toolChangeMin).toBeCloseTo(TOOL_CHANGE_SEC / 60, 9);
    const e = NC.planNonCut([{ tool: 'face mill', feedInMin: 0 }, { tool: 'face mill', feedInMin: 0 }], [200, 100, 50]);
    expect(e.traverseMm).toBeCloseTo(Math.sqrt(200 * 100 / 2), 9);
    expect(e.text).toMatch(/engineering estimate, not sourced/);
  });
  it('a near-net cut pays one tool change a distinct tool and one datum probe — not an allowance a feature', () => {
    const rows = [hole(8.5, 20, false, { count: 3 }), hole(8.5, 20, true), face(4000)];
    const nn = nearNetMachiningTime(rows, 'steel', 'sand', { stockMm: 3 });
    // face mill + chamfer (milling); drill Ø8.5 + tap M10 (drilling)
    expect(nn.groups.mill.tools).toBe(2);
    expect(nn.groups.hole.tools).toBe(2);
    expect(nn.groups.mill.toolChangeMin + nn.groups.hole.toolChangeMin).toBeCloseTo(4 * TOOL_CHANGE_SEC / 60, 9);
    const probe = NC.PROBE_DATUM_SEC / 60;
    expect(nn.groups.mill.min - nn.groups.mill.cutMin).toBeGreaterThanOrEqual(2 * TOOL_CHANGE_SEC / 60 + probe - 1e-9);
    expect(nn.basis).toMatch(/datum probe/);
  });
  it('the HMC cell pays its B-axis indexes (Okuma MA-4000H 0.8 s / 90°), the split VMC routing none', () => {
    const r = optimiseMachiningRouting({ millingHr: 0.05, drillHr: 0.01, principalDirections: 3, axisymmetric: false,
      bboxSortedMm: [150, 120, 100], batchSize: 2500, annualVolume: 200_000, rapidMm: { mill: 1000, drill: 500 } });
    const cell = r.alternatives.find(c => c.label === 'volume-cell')!;
    expect(cell.indexes).toBe(2);
    expect(r.alternatives.find(c => c.label === 'split-3axis')!.indexes).toBeUndefined();
    expect(NC.indexMinutes(2, 'mach-hmc-400').min).toBeCloseTo(2 * 0.8 / 60, 9);
  });
});

describe('CF-20: tool wear on cutting minutes only', () => {
  it('the casting bracket: wear minutes are the cut\'s chip-making minutes, below the spindle time', () => {
    const ctx = ctxOf('Casting_Braket.stp');
    const cut = nearNetCut(ctx, 'steel', 'sand');
    const ops = buildOperationPlan(ctx, cut, routingFor(ctx, cut));
    const cutting = cuttingMinutesOf(ops);
    const fromCut = cut.cutOf!.mill + cut.cutOf!.hole + cut.cutOf!.bore + cut.cutOf!.slit + (cut.spindle?.cutMin ?? 0);
    expect(cutting).toBeCloseTo(fromCut, 6);
    expect(spindleMinutesOf(ops)).toBeGreaterThan(cutting + 0.2);
    expect(toolWearPerPart(cutting, 'steel')).toBeCloseTo(Math.round(cutting * cuttingDataFor('steel').toolCostPerCutMin * 10_000) / 10_000, 9);
  });
  it('the wear is the same whatever machine runs the cut (rapids and indexes never carry wear)', () => {
    const ctx = ctxOf('Casting_Braket.stp');
    const cut = nearNetCut(ctx, 'steel', 'sand');
    const atVolume = buildOperationPlan(ctx, cut, routingFor(ctx, cut));
    const lowVol = { ...ctx, annualVolume: 2_000 };
    const atJobShop = buildOperationPlan(lowVol, cut, routingFor(lowVol, cut));
    expect(routingFor(ctx, cut).chosen.primaryMachineId).not.toBe(routingFor(lowVol, cut).chosen.primaryMachineId);
    expect(cuttingMinutesOf(atVolume)).toBeCloseTo(cuttingMinutesOf(atJobShop), 6);
    // …while the spindle time differs: the rapids are each machine's own (HMC 60 m/min v the VMC / drill 25.4 m/min)
    expect(Math.abs(spindleMinutesOf(atVolume) - spindleMinutesOf(atJobShop))).toBeGreaterThan(1e-4);
  });
  it('the rule prints that the minutes are chip-making only', () => {
    const r = runCostInputRules(MACHINING_RULES, ctxOf('MACH_Hydraulic_Manifold.stp', 'machining', 50_000, { 'material.family': 'aluminium' }));
    expect(String(r.provenance['mach-tool-wear']?.basis)).toMatch(/chip-making only/);
  });
});

describe('CF-06: passes from the stock and the catalogue ap', () => {
  it('a face: rough at ap ≤ 3 mm then finish at ≤ 1 mm (WSX445) in steel / iron; aluminium ⌈stock ÷ 2 mm⌉ at one row', () => {
    expect(facePassPlan('steel', 3)).toMatchObject({ rough: 1, finish: 1 });
    expect(facePassPlan('cast iron', 5)).toMatchObject({ rough: 2, finish: 1 });          // ⌈(5 − 1) ÷ 3⌉ = 2
    expect(facePassPlan('steel', 0.8)).toMatchObject({ rough: 0, finish: 1 });
    expect(facePassPlan('aluminium', 1.5)).toMatchObject({ rough: 0, finish: 1 });
    expect(facePassPlan('aluminium', 3)).toMatchObject({ rough: 0, finish: 2 });
    expect(facePassPlan('steel', undefined)).toMatchObject({ rough: 0, finish: 1 });
    expect(CATALOGUE.steel.faceFinish.apMm).toBe(1.0);
    expect(CATALOGUE.aluminium.faceFinish.apMm).toBeNull();
  });
  it('machining minutes rise with the stock — the face and the cored bore', () => {
    const f1 = faceMillCutMinutes('steel', 4385, 1).min, f3 = faceMillCutMinutes('steel', 4385, 3).min;
    expect(f3).toBeGreaterThan(f1);
    // rough pass at the WSX445 medium fz 0.2 on the Ø100 z7 body, then the finish pass at fz 0.15
    const n = 1000 * 220 / (Math.PI * 100);
    expect(f3).toBeCloseTo((Math.sqrt(4385) + 100) / (n * 7 * 0.2) + (Math.sqrt(4385) + 100) / (n * 7 * 0.15), 9);
    const b1 = borePasses('cast iron', 60, 50, 1), b3 = borePasses('cast iron', 60, 50, 3), b8 = borePasses('cast iron', 60, 50, 8);
    expect(b1.passes.map(p => p.kind)).toEqual(['finish']);
    expect(b3.passes.map(p => p.kind)).toEqual(['rough', 'finish']);                      // ⌈(3 − 1) ÷ 5⌉ = 1 (T515 CM ap ≤ 5)
    expect(b8.passes.map(p => p.kind)).toEqual(['rough', 'rough', 'finish']);
    expect(b3.passes[1].vf).toBeCloseTo(boreFeed('cast iron', 60).vf, 9);
    const k = ctxOf('PRCR002.stp');
    const thin = nearNetCut(k, 'cast iron', 'sand', { faceStockMm: 1 });
    const thick = nearNetCut(k, 'cast iron', 'sand', { faceStockMm: 4 });
    expect(thick.cutOf!.mill + thick.cutOf!.bore).toBeGreaterThan(thin.cutOf!.mill + thin.cutOf!.bore);
  });
  it('through holes stay drilled whatever the stock', () => {
    expect(featureTime(hole(12, 40), 'steel', 20, 3).cutMin).toBeCloseTo(featureTime(hole(12, 40), 'steel').cutMin, 9);
    expect(holeWork([hole(12, 40)], 'steel', 20, 3)[0].bored).toBe(false);
  });
  it('the near-net cut takes the route\'s own stock: a sand casting 3 mm (ferrous), a closed-die forging IS 3469', () => {
    expect(nearNetCut(ctxOf('Casting_Braket.stp'), 'steel', 'sand').stock!.mm).toBe(3);
    expect(nearNetCut(ctxOf('FORGE_Hub_Flange.stp', 'forging'), 'steel', 'forging', { coredAboveMm: 25 }).stock!.basis).toMatch(/IS 3469/);
  });
});

describe('CF-16 / CF-22: set-up constants labelled; the forge line pays its die setting', () => {
  it('the change-over and the batch rule print their class', () => {
    const r = runCostInputRules(MACHINING_RULES, ctxOf('MACH_Hydraulic_Manifold.stp', 'machining', 50_000, { 'material.family': 'aluminium' }));
    expect(String(r.provenance['mach-setup-time']?.basis)).toMatch(/45 min change-over.*engineering-typical, not sourced/);
    expect(String(r.provenance['mach-batch-size']?.basis)).toMatch(/engineering-typical, not sourced/);
  });
  it('a closed-die forging: 141 min a die setting (METU 2008), once a batch of annual ÷ 20', () => {
    const ctx = { ...ctxOf('FORGE_Hub_Flange.stp', 'forging'), commoditySource: 'engineer',
      answers: { 'material.family': 'steel', 'commodity.route': 'forging', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' } } as RuleContext;
    const r = runCostInputRules(FORGING_RULES, ctx);
    const f = r.suggestions.forging as Record<string, number>;
    expect(f.dieSettingHr).toBe(FORGE_DIE_SETTING_HR);
    expect(FORGE_DIE_SETTING_HR).toBeCloseTo(141 / 60, 3);
    expect(f.dieSettingBatch).toBe(2500);
    expect(String(r.provenance['forge-die-set-hr'].basis)).toMatch(/sourced: Cavbozar.*METU \(2008\)/);
  });
  it('the module charges the press + crew, and the trim press and heater idle beside it, per forging', () => {
    const base = {
      materialId: 'mat-steel-38mnvs6', partWeightKg: 3, flashAndScaleKg: 0.3, yieldFraction: 0.743,
      forgeId: 'forge-press-1600t', labourId: 'lab-uk-forge', strokesToForm: 3, cycleTimeHr: 0.004,
      oee: 0.8, manning: 2, labourEfficiency: 0.92, heatingEnergyKwhPerKg: 0.35, dieLife: 40_000, dieCost: 25_000,
      amortizationVolume: 250_000, trimmingMachineId: 'press-100t', trimmingLabourId: 'lab-uk-forge', trimmingCycleHr: 0.001,
    };
    const none = computeForgingDrivers(base);
    const d = computeForgingDrivers({ ...base, dieSettingHr: 2.35, dieSettingBatch: 2500 });
    const set = d.operations.filter(o => /^Forge-line die setting/.test(o.operationName));
    expect(none.operations.some(o => /die setting/.test(o.operationName))).toBe(false);
    expect(set).toHaveLength(2);
    expect(set[0]).toMatchObject({ machineId: 'forge-press-1600t', manning: 2, oee: 1 });
    expect(set[0].cycleTimeHr).toBeCloseTo(2.35 / 2500, 12);
    expect(set[1]).toMatchObject({ machineId: 'press-100t', untended: true, labourTimeHr: 0 });
  });
});
