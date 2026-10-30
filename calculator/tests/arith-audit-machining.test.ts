/**
 * Arithmetic audit — machining (30 Oct 2026). One test per fixed finding; each failed before its fix.
 * Write-up: docs/review/arith-audit/machining.md; shadow model: scripts/arith-audit/machining.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  solidCut, stockFacts, nearNetCut, routingFor, buildOperationPlan, cuttingMinutesOf, machiningOperationPlan, machiningNRE,
} from '../src/engine/cost-input-rules/commodities/machining.js';
import {
  fromSolidMillingTime, fromBarTurningTime, holeVolumeCm3, secondaryMachiningCell, fixtureCostGBP, FIXTURE_GBP,
  CUTTING_DATA_STATUS, TURN_FINISH_STATUS, nearNetTurningTime,
} from '../src/engine/machining-time.js';
import { computeFeatureMachining } from '../src/engine/feature-machining.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, family: string, commodity = 'machining', annualVolume = 50_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.family': family, 'commodity.route': commodity },
} as RuleContext);

const hole = (diaMm: number, depthMm: number, count = 1, through: boolean | null = true): FeatureRow =>
  ({ kind: 'hole', diaMm, depthMm, through, count } as FeatureRow);

describe('M1 — the metal in the holes is cut once (by the hole time), not roughed as well', () => {
  it('fromSolidMillingTime roughs stock − part − hole volume', () => {
    const rows = [hole(20, 50, 2)];                                   // 2 × π/4 × 20² × 50 = 31.4 cm³
    const t = fromSolidMillingTime({ family: 'aluminium', partCm3: 500, stockCm3: 1000, totalAreaCm2: 0, planarAreaCm2: 0,
      areaByTypeCm2: {}, rows });
    expect(holeVolumeCm3(rows)).toBeCloseTo(31.416, 2);
    expect(t.roughMin).toBeCloseTo((500 - 31.416) / 120, 2);         // was 500 / 120
    expect(t.basis).toContain('cm³ in the holes (cut by the hole time)');
  });
  it('a land (Ø ≥ 30, shallower than ¼ Ø) is skimmed, so its metal stays in the roughing', () => {
    expect(holeVolumeCm3([hole(50, 5)])).toBe(0);
  });
  it('the turned route does the same', () => {
    const r = fromBarTurningTime({ family: 'steel', partCm3: 100, stockCm3: 300, totalAreaCm2: 200, turnedFraction: 0.9,
      rows: [hole(10, 100)] });                                      // 7.85 cm³ in the hole
    expect(r.lathe.roughMin).toBeCloseTo((200 - 7.854) / 80, 2);
  });
  it('Part1: 209 cm³ of its 1,649 cm³ removed are in the holes', () => {
    const c = solidCut(ctx('Part1.stp', 'aluminium'), 'aluminium')!;
    expect(c.detail.roughMin).toBeCloseTo((2078.1 - 429.434 - holeVolumeCm3(geoOf('Part1.stp').featureTable as FeatureRow[])) / 120, 1);
    expect(c.detail.roughMin).toBeLessThan(12.1);                     // was 13.7
  });
});

describe('L1 — the utilisation buys the stock weight its basis prints', () => {
  it.each([['Part1.stp', 'aluminium'], ['MACH_Stepped_Shaft.stp', 'steel'], ['MACH_Hydraulic_Manifold.stp', 'aluminium']])(
    '%s: net ÷ utilisation = stock kg to 0.05 %%', (part, fam) => {
      const c = ctx(part, fam);
      const net = Math.round((c.geo.volume!.cm3 * (fam === 'steel' ? 0.00785 : 0.0027)) * 1000) / 1000;
      const s = stockFacts(c, fam as 'steel', net)!;
      expect(Math.abs(net / s.utilisation - s.stockKg) / s.stockKg).toBeLessThan(0.0005);   // was 0.21 % on Part1
    });
});

describe('M3 — loading a near-net part into the lathe fixture is a whole operator and not cutting', () => {
  const c = ctx('PRCR002.stp', 'cast iron', 'cast_and_machine');
  const cut = nearNetCut(c, 'cast iron', 'sand');
  const ops = buildOperationPlan(c, cut, routingFor(c, cut));
  const turn = ops.find(o => o.name.startsWith('Turning — spindle'))!;
  const load = ops.find(o => o.name.startsWith('Load / clamp / unload — lathe'))!;
  it('the turning op is the spindle cut only', () => {
    expect(turn.cycleTimeHr).toBeCloseTo(cut.spindle!.totalMin / 60, 4);   // was spindle + 1.2 min handling
    expect(turn.manning).toBe(0.5);
  });
  it('the load is its own op at a whole operator on the lathe', () => {
    expect(load).toMatchObject({ machineId: 'mach-lathe-cnc', manning: 1 });
    expect(load.cycleTimeHr).toBeCloseTo(cut.handlingMin / 60, 4);
  });
  it('tool wear is not charged on the handling minutes', () => {
    const cutting = cuttingMinutesOf(ops);
    expect(cutting).toBeCloseTo(ops.filter(o => !o.benchOperation && !/^(Load|Pallet)/.test(o.name)).reduce((s, o) => s + o.cycleTimeHr * 60, 0), 6);
    expect(ops.filter(o => /^Load \/ clamp/.test(o.name)).length).toBe(1);
  });
});

describe('L3 — a turned near-net part\'s lathe chuckings are soft jaws, not dedicated mill fixtures', () => {
  it('2 chuckings + 1 drill fixture', () => {
    const c = secondaryMachiningCell({ fixturings: 3, weightKg: 2.8, annualVolume: 50_000, family: 'steel', featureRows: 5,
      cuttingMin: 11, engineerRatePerHr: 33.27, turned: true });
    expect(c.toolingGBP - Math.round(5.75 * 33.27)).toBe(FIXTURE_GBP.dedicated + 2 * FIXTURE_GBP.softJaws);   // was 3 × 2,500
    expect(c.basis).toContain('2 set(s) of soft jaws');
  });
});

describe('L4 — on the twin-pallet cell the batch change-over is machine time (the pallet masks the load only)', () => {
  const rows = [hole(10, 20, 4), { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: 2000 } as FeatureRow];
  const cell = { fixturings: 1, handlingMin: 0.6, setupMinPerFixturing: 45, batchSize: 2500, masked: true, palletChangeSec: 10 };
  const r = computeFeatureMachining(rows, { machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', manning: 0.5, cell });
  it('the load is labour only and handling only', () => {
    // M4 (lead's merge): only the load the operator's share of the cut (0.5 × the cut) does not cover is charged; when the
    // cut covers it all, no load step is listed (a zero-time labour step fails the core's validation)
    const cutMin = r.operations.find(o => o.operationName.startsWith('CNC Machining'))!.cycleTimeHr * 60;
    const extra = Math.max(0, 0.6 - 0.5 * cutMin);
    const load = r.operations.find(o => o.operationName.startsWith('Machining load / unload on the pallet'));
    if (extra > 0) { expect(load!.cycleTimeHr).toBe(0); expect(load!.labourTimeHr).toBeCloseTo(extra / 60, 8); }
    else expect(load).toBeUndefined();
  });
  it('the change-over charges the machine', () => {
    const co = r.operations.find(o => o.operationName.startsWith('Machining change-over'))!;
    expect(co.cycleTimeHr).toBeCloseTo(45 / 2500 / 60, 8);
    expect(co.machineId).toBe('mach-hmc-400');
  });
});

describe('T — every printed basis states what its constants are and itemises its arithmetic', () => {
  it('the cutting bases carry their status', () => {
    const c = solidCut(ctx('Part1.stp', 'aluminium'), 'aluminium')!;
    expect(c.detail.basis).toContain(CUTTING_DATA_STATUS);
    expect(nearNetTurningTime(100, 'steel', 2, 80).basis).toContain(TURN_FINISH_STATUS);
    expect(TURN_FINISH_STATUS).toMatch(/not sourced/);
  });
  it('the drilling op itemises each row and states an inferred tapping', () => {
    const ops = machiningOperationPlan(ctx('MACH_Hydraulic_Manifold.stp', 'aluminium'), 'aluminium');
    const drill = ops.find(o => o.type === 'drilling')!;
    expect(drill.basis).toContain('4×Ø5.0×12 drill + tap M6 (inferred from the tapping-drill size)');
    // the per-row minutes add up to the op's time
    const rowsText = drill.basis.split(' min: ')[1].split(' (drill feed')[0].split('; ');
    const sum = rowsText.reduce((s, t) => s + Number(/^(\d+)×/.exec(t)![1]) * Number(/ ([0-9.]+) min$/.exec(t)![1]), 0);
    expect(rowsText).toHaveLength(4);
    expect(Math.abs(sum - drill.cycleTimeHr * 60)).toBeLessThan(0.05);   // 2-dp rows v the 4-dp hour
  });
  it('a hydraulic fixture does not print the modular / dedicated volume rule', () => {
    const f = fixtureCostGBP(1, 0, 50_000, 'hydraulic');
    expect(f.basis).not.toContain('parts over 5 years');
    expect(f.basis).toContain('engineering-typical');
  });
  it('the programming and set-up bases say their hours are not sourced', () => {
    const c = ctx('Part1.stp', 'aluminium');
    const cut = solidCut(c, 'aluminium')!;
    expect(machiningNRE(c, cut, routingFor(c, cut)).programmingBasis).toContain('not sourced');
  });
});
