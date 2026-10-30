/**
 * Pilot rule pack (30 Oct 2026) — the three rule changes the readiness assessment asked for before the wider team
 * uses CAD to COST (docs/review/cad2c-readiness-2026-10-29.md §5):
 *
 *   1. a VOLUME machining cell: a twin-pallet HMC with a dedicated hydraulic fixture on a 4th-axis tombstone, ranked
 *      with the operator, chosen at production volume — the machining model was a job-shop VMC with several fixturings;
 *   2. a turned near-net part (a hub flange) is turned, faces included, on the lathe — it was face-milled on a VMC;
 *   3. casting safety rules: iron is supplied as-cast (no stress relief), NDT is a station — 100% MPI with a sample
 *      radiograph on ferrous, in-line real-time X-ray on light alloys — not a £5 radiograph on every part.
 *
 * Every figure is read off the real parts' recorded geometry (tests/fixtures/real-parts-baseline.json).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  optimiseMachiningRouting, VOLUME_CELL_MIN_ANNUAL, PALLET_CHANGE_SEC, HMC_MACHINE_ID, CUTTING_MANNING,
} from '../src/engine/routing-optimiser.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { MACHINING_RULES, machiningOperationPlan, routingFor, solidCut } from '../src/engine/cost-input-rules/commodities/machining.js';
import { FORGING_RULES } from '../src/engine/cost-input-rules/commodities/forging.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { turnedPartFacts, secondaryMachiningCell, fixtureCostGBP, FIXTURE_GBP } from '../src/engine/machining-time.js';
import { NDT_STATION, ndtStationCostPerPart, ndtStepFor, estimateCastingSecondaryAdders } from '../src/engine/modules/casting-advisor.js';
import { safetyConsequence } from '../src/engine/cost-input-rules/derive/service-context.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

const BASELINE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
  Array<{ part: string; answers: Record<string, string>; geometry: OCCTGeometry }>;
const geoOf = (part: string) => BASELINE.find(p => p.part === part)!.geometry;
const ctx = (part: string, commodity: string, annualVolume: number, answers: Record<string, string>): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: part, answers,
} as RuleContext);
const R = (id: string) => DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id)!.computedRatePerHr;
const INSPECTOR = DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-inspector')!.fullyLoadedRatePerHr;

describe('1. the volume machining cell', () => {
  it('the HMC is a library machine with a machine-only build-up and a stated (estimated) capex', () => {
    const m = DEFAULT_RATE_LIBRARY.machines.find(x => x.id === HMC_MACHINE_ID)!;
    expect(m).toBeDefined();
    expect(m.buildup.annualAvailableHours).toBe(6000);
    expect(m.sourceNote).toMatch(/ESTIMATE/);
    expect(m.sourceNote).toMatch(/machine only/);
    // £52,165 / (6,000 h × 0.80) — three shifts is the economics of the cell
    expect(m.computedRatePerHr).toBeCloseTo(52_165 / 4800, 2);
  });

  it('is a candidate only at volume, for a prismatic part, and the ranking carries the operator', () => {
    const p = { millingHr: 0.30, drillHr: 0.10, principalDirections: 3, axisymmetric: false,
      bboxSortedMm: [274, 222, 177] as const, batchSize: 2500, fromSolid: false, labourRatePerHr: 27.95 };
    const low = optimiseMachiningRouting({ ...p, annualVolume: VOLUME_CELL_MIN_ANNUAL - 1 });
    expect(low.alternatives.some(a => a.label === 'volume-cell')).toBe(false);
    const high = optimiseMachiningRouting({ ...p, annualVolume: VOLUME_CELL_MIN_ANNUAL });
    const cell = high.alternatives.find(a => a.label === 'volume-cell')!;
    expect(cell).toBeDefined();
    expect(cell.primaryMachineId).toBe(HMC_MACHINE_ID);
    expect(cell.drillMachineId).toBe(HMC_MACHINE_ID);          // drilled in the same clamping
    expect(cell.setups).toBe(1);                                // 3 directions ≤ 4 sides of the tombstone
    expect(cell.masked).toBe(true);
    // machine: cutting + set-up / batch + pallet change; operator: cutting at the shared manning + handling at one
    const hmc = R(HMC_MACHINE_ID);
    expect(cell.costPerPart).toBeCloseTo(0.40 * hmc + 0.75 * hmc / 2500 + PALLET_CHANGE_SEC / 3600 * hmc, 3);
    // the load happens during the cut, inside the operator's share of it — only what the cut cannot cover is extra (M4)
    expect(cell.labourPerPart).toBeCloseTo(27.95 * (0.40 * CUTTING_MANNING + Math.max(0, 0.8 / 60 - 0.40 * CUTTING_MANNING)), 3);
    for (const a of high.alternatives) expect(a.labourPerPart).toBeGreaterThan(0);
    expect(high.basis).toMatch(/machine \+ operator/);
    // a turned part stays on the lathe
    const turned = optimiseMachiningRouting({ ...p, annualVolume: 100_000, turned: { latheHr: 0.2, millHr: 0, drillHr: 0.02, chuckings: 2 } });
    expect(turned.alternatives.some(a => a.label === 'volume-cell')).toBe(false);
  });

  it('five and six directions need a second clamping; from solid the clamped face is a further one', () => {
    const p = { millingHr: 0.2, drillHr: 0, principalDirections: 5, axisymmetric: false, bboxSortedMm: [200, 100, 50] as const,
      batchSize: 2500, annualVolume: 100_000, labourRatePerHr: 27.95 };
    expect(optimiseMachiningRouting({ ...p, fromSolid: false }).alternatives.find(a => a.label === 'volume-cell')!.setups).toBe(2);
    expect(optimiseMachiningRouting({ ...p, fromSolid: true }).alternatives.find(a => a.label === 'volume-cell')!.setups).toBe(3);
  });

  it('the stub axle at 100,000/yr: one clamping on the cell + the lathe, pallet change + masked load, hydraulic fixture', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx('PRCR002.stp', 'cast_and_machine', 100_000,
      { 'material.family': 'cast iron', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' }));
    expect(r.status).toBe('complete');
    const m = r.suggestions.machining as { operations: Array<{ name: string; machineId: string; manning?: number; benchOperation?: boolean; cycleTimeHr: number }>; setupCount: number; machineId: string; toolingCost: number };
    expect(m.machineId).toBe(HMC_MACHINE_ID);
    expect(m.setupCount).toBe(2);
    const names = m.operations.map(o => o.name);
    expect(names.some(n => n.startsWith('Pallet change — 1 fixturing'))).toBe(true);
    // the load is paid inside the operator's half of the cut (arithmetic audit M4) — no extra labour step
    expect(m.operations.some(o => o.name.startsWith('Load / unload on the pallet'))).toBe(false);
    expect(m.operations.find(o => o.name.startsWith('Drilling'))!.machineId).toBe(HMC_MACHINE_ID);
    expect(m.operations.find(o => o.name.startsWith('Turning — spindle'))!.machineId).toBe('mach-lathe-cnc');
    expect(m.toolingCost).toBe(FIXTURE_GBP.hydraulic + FIXTURE_GBP.dedicated);   // 1 hydraulic tombstone fixture + the lathe's dedicated fixture
  });

  it('the stub axle at 10,000/yr keeps the job-shop split routing', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx('PRCR002.stp', 'cast_and_machine', 10_000,
      { 'material.family': 'cast iron', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' }));
    const m = r.suggestions.machining as { machineId: string; setupCount: number };
    expect(m.machineId).not.toBe(HMC_MACHINE_ID);
    expect(m.setupCount).toBe(5);
  });

  it('the manifold from solid at 50,000/yr: two clampings (four sides + the clamped face), the drilling in the clamping', () => {
    const c = ctx('MACH_Hydraulic_Manifold.stp', 'machining', 50_000, { 'material.family': 'aluminium' });
    const routing = routingFor(c, solidCut(c, 'aluminium')!);
    expect(routing.chosen.label).toBe('volume-cell');
    expect(routing.chosen.setups).toBe(2);
    const ops = machiningOperationPlan(c, 'aluminium');
    expect(ops.find(o => o.name.startsWith('Drilling'))!.machineId).toBe(HMC_MACHINE_ID);
    expect(ops.some(o => o.name.startsWith('Load / clamp / unload'))).toBe(false);
    const r = runCostInputRules(MACHINING_RULES, c);
    expect((r.suggestions.machining as { toolingCost: number }).toolingCost).toBe(2 * FIXTURE_GBP.hydraulic);
  });

  it('the feature path (forgings): the same cell, the same two operations, screen = headless helper', () => {
    const c = secondaryMachiningCell({ fixturings: 3, weightKg: 2.8, annualVolume: 50_000, family: 'steel',
      featureRows: 10, cuttingMin: 10, engineerRatePerHr: 42.8, milled: true });
    expect(c.volumeCell).toBe(true);
    expect(c.machineId).toBe(HMC_MACHINE_ID);
    expect(c.cell).toMatchObject({ fixturings: 1, masked: true, palletChangeSec: PALLET_CHANGE_SEC });
    expect(c.toolingGBP).toBe(FIXTURE_GBP.hydraulic + Math.round((1.5 * 1 + 0.25 * 10) * 42.8));
    const holesOnly = secondaryMachiningCell({ fixturings: 3, weightKg: 2.8, annualVolume: 50_000, family: 'steel',
      featureRows: 10, cuttingMin: 10, engineerRatePerHr: 42.8, milled: false });
    expect(holesOnly.volumeCell).toBe(false);
    expect(holesOnly.cell.fixturings).toBe(3);
    // the knuckle forging headless
    const k = ctx('steering_knuckle_RH.stp', 'forging', 50_000, { 'material.family': 'steel', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' });
    const { analysis } = buildDeterministicAnalysis(FORGING_RULES, k, 'knuckle');
    const p = toCostParams('forging', analysis.costInputSuggestions as never, 50_000, 'steel', k.geo)!.params as Record<string, unknown>;
    const ops = p.secondaryMachiningOps as Array<{ operationName: string; machineId: string; benchOperation?: boolean; untended?: boolean; manning: number; labourTimeHr: number }>;
    expect(ops[0].machineId).toBe(HMC_MACHINE_ID);
    expect(ops[1]).toMatchObject({ untended: true, labourTimeHr: 0 });
    // the masked load is covered by the operator's share of the 12-minute cut (arithmetic audit M4): no load step
    expect(ops.some(o => /load \/ unload on the pallet/.test(o.operationName))).toBe(false);
  });

  it('a hydraulic fixture is a stated toolroom build', () => {
    expect(fixtureCostGBP(1, 0, 100_000, 'hydraulic')).toMatchObject({ gbp: FIXTURE_GBP.hydraulic });
    expect(fixtureCostGBP(1, 0, 100_000, 'hydraulic').basis).toMatch(/hydraulic \(tombstone\)/);
  });
});

describe('2. a turned near-net part is turned, faces included', () => {
  it('the hub flange is a turned part; the stub axle and the control-arm yoke are not', () => {
    expect(turnedPartFacts(geoOf('FORGE_Hub_Flange.stp'))).toMatchObject({ maxDiaMm: 140 });
    expect(turnedPartFacts(geoOf('FORGE_Hub_Flange.stp'))!.externalCm2).toBeCloseTo(159.6, 1);
    expect(turnedPartFacts(geoOf('PRCR002.stp'))).toBeNull();                  // fraction 0.35 — a spindle on a knuckle
    expect(turnedPartFacts(geoOf('FORGE_Control_Arm_Yoke.stp'))).toBeNull();   // Ø50 boss on a 250 mm part
  });

  it('the hub flange headless: outside + 3 faces on the lathe, 7 holes on the drill centre, 2 chuckings + 1 fixturing', () => {
    const c = ctx('FORGE_Hub_Flange.stp', 'forging', 100_000, { 'material.family': 'steel', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' });
    const { analysis } = buildDeterministicAnalysis(FORGING_RULES, c, 'hub');
    const p = toCostParams('forging', analysis.costInputSuggestions as never, 100_000, 'steel', c.geo)!.params as Record<string, unknown>;
    const ops = p.secondaryMachiningOps as Array<{ operationName: string; machineId: string; cycleTimeHr: number }>;
    expect(ops[0].operationName).toMatch(/^Turning — outside and faces on the CNC lathe/);
    expect(ops[0].machineId).toBe('mach-lathe-cnc');
    expect(ops[1].operationName).toMatch(/^CNC Machining — 7 features \(6×Ø14\.0×18, 1×Ø60\.0×50\)/);   // no faces in the drill op
    expect(ops[1].machineId).toBe('mach-drill');
    expect(ops[2].operationName).toMatch(/3 fixturing\(s\)/);
    // never the HMC cell, whatever the volume
    expect(ops.some(o => o.machineId === HMC_MACHINE_ID)).toBe(false);
  });
});

describe('3. casting safety rules', () => {
  const stub = (answers: Record<string, string>) => runCostInputRules(CASTING_RULES, ctx('PRCR002.stp', 'casting', 100_000, answers));
  const IRON = { 'material.family': 'cast iron', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' };

  it('a safety-critical ductile iron casting is supplied as-cast — no stress relief (it charged £0.35/kg)', () => {
    const c = stub(IRON).suggestions.casting as Record<string, number>;
    expect(c.heatTreatCostPerKg).toBe(0);
    const basis = String(stub(IRON).provenance['cast-ht-cost'].basis);
    expect(basis).toMatch(/as-cast/);
    expect(basis).toMatch(/EN 1563/);
  });

  it('cast steel is still normalised', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx('Casting_Braket.stp', 'cast_and_machine', 50_000,
      { 'material.family': 'steel', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' }));
    expect((r.suggestions.casting as Record<string, number>).heatTreatCostPerKg).toBe(0.35);
  });

  it('NDT on a safety-critical iron casting is 100% MPI with a sample radiograph — a station, with its arithmetic', () => {
    const r = stub(IRON);
    const c = r.suggestions.casting as Record<string, number>;
    const st = ndtStationCostPerPart('mpi');
    expect(c.ndtCostPerPart).toBe(st.gbp);
    // 75 s × (inspector £28.03 + bench £4) + 1 in 50 × £5
    expect(st.gbp).toBeCloseTo(75 / 3600 * (INSPECTOR + 4) + 0.02 * 5, 2);
    expect(st.gbp).toBeLessThan(1);
    expect(String(r.provenance['cast-ndt'].basis)).toMatch(/100% magnetic-particle inspection/);
    expect(String(r.provenance['cast-ndt'].basis)).toMatch(/1 in 50 radiographed/);
    expect(String(r.provenance['cast-ndt'].basis)).toMatch(/engineering-typical/);
  });

  it('a light-alloy safety-critical casting is 100% X-rayed in line; a superalloy one is CT scanned; non-critical none', () => {
    const al = runCostInputRules(CASTING_RULES, ctx('PRCR002.stp', 'casting', 100_000,
      { 'material.family': 'aluminium', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' }));
    expect((al.suggestions.casting as Record<string, number>).ndtCostPerPart).toBe(ndtStationCostPerPart('rtr').gbp);
    expect(String(al.provenance['cast-ndt'].basis)).toMatch(/in-line real-time X-ray/);
    const none = runCostInputRules(CASTING_RULES, ctx('PRCR002.stp', 'casting', 100_000,
      { 'material.family': 'aluminium', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' }));
    expect((none.suggestions.casting as Record<string, number>).ndtCostPerPart).toBe(0);
    expect(ndtStepFor('superalloy')).toBe('CT NDT');
    expect(ndtStepFor('ductile-iron')).toMatch(/MPI/);
    expect(ndtStepFor('aluminium')).toMatch(/In-line X-ray/);
  });

  it('the station constants are labelled and the question states the check', () => {
    expect(NDT_STATION.mpi.sampleXrayFraction).toBe(0.02);
    expect(NDT_STATION.rtr.manning).toBe(0.5);
    expect(safetyConsequence('casting')).toMatch(/MPI/);
    expect(safetyConsequence('casting')).not.toMatch(/heat treat/);
    // the adder model the forms use is unchanged (a typed £ still goes through)
    expect(estimateCastingSecondaryAdders({ alloyFamily: 'ductile-iron', partWeightKg: 1, ndt: 'xray' }).totalPerPartGbp).toBe(5);
  });
});
