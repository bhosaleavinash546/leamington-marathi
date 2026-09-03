/**
 * Face ids end to end: the B-rep face indices the viewer picks with are the
 * same ids the feature table, the setup directions, the operation plan and
 * the feature cost lines carry. The viewer used to be a dead end for cost —
 * no cost-bearing structure carried a face id.
 *
 * Also pinned: a mesh upload asks for the hole count instead of costing "zero
 * holes" as if measured, and a part no machine holds is a DECISION, not a
 * parenthetical in a detail string.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { RULE_PATH_MAP } from '../src/engine/cost-input-rules/apply.js';
import { holeRows } from '../src/engine/cost-input-rules/derive/facts.js';
import { MACHINE_ENVELOPE_DECISION_ID } from '../src/engine/cost-input-rules/commodities/machining.js';
import { computeFeatureMachining } from '../src/engine/feature-machining.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
let flange: OCCTGeometry | null = null;
let kernel = false;
beforeAll(async () => {
  process.env.AIR_GAPPED = '1';
  try { flange = await analyzeGeometry(readFileSync(join(DIR, 'flange-6holes-boss.step')), 'flange-6holes-boss.step', 90_000); kernel = flange.status === 'success'; }
  catch { kernel = false; }
}, 120_000);

const ctxOf = (geo: OCCTGeometry, answers: Record<string, unknown> = {}, quality: RuleContext['geometryQuality'] = 'occt'): RuleContext => ({
  geo, geometryQuality: quality, commodity: 'machining', commoditySource: 'engineer',
  annualVolume: 50_000, filename: 'x.step', answers: { 'material.family': 'aluminium', ...answers },
});

describe('face ids from the kernel', () => {
  it('every feature-table row and every setup direction carries its B-rep face ids', () => {
    if (!kernel) return;
    const rows = flange!.featureTable ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) { expect(Array.isArray(r.faceIds), r.kind).toBe(true); expect(r.faceIds!.length).toBeGreaterThan(0); }
    const holes = rows.find(r => r.kind === 'hole')!;
    expect(holes.count).toBe(6);
    expect(holes.faceIds!.length).toBe(6);          // one cylindrical face per through hole
    for (const d of flange!.setupAnalysis!.principalDirections) expect(d.faceIds!.length).toBe(d.faceCount);
  });

  it('the machining operation plan carries the faces each operation is spent on', () => {
    if (!kernel) return;
    const res = runCostInputRules(specForCommodity('machining')!, ctxOf(flange!));
    const ops = res.byRule['machining.operations']?.value as Array<{ name: string; faceIds?: number[] }> | undefined;
    expect(ops?.length).toBeGreaterThan(0);
    const drill = ops!.find(o => /drill/i.test(o.name));
    expect(drill?.faceIds?.length).toBe(6);
    expect(ops!.some(o => /mill|turn/i.test(o.name) && (o.faceIds?.length ?? 0) > 0)).toBe(true);
  });

  it('the apply transform keeps faceIds on the way to estimatedOperations', () => {
    const t = RULE_PATH_MAP['machining.operations'].transform!;
    const out = t([{ name: 'Drill', machineId: 'mach-drill', cycleTimeHr: 0.1, faceIds: [4, 5, 'x'] }]) as Array<{ faceIds?: number[] }>;
    expect(out[0].faceIds).toEqual([4, 5]);
    const bare = t([{ name: 'Mill', machineId: 'mach-vmc3', cycleTimeHr: 0.2 }]) as Array<{ faceIds?: number[] }>;
    expect(bare[0].faceIds).toBeUndefined();
  });

  it('feature cost lines carry the row face ids', () => {
    const r = computeFeatureMachining([{ kind: 'hole', diaMm: 8, depthMm: 20, through: true, count: 2, faceIds: [7, 9] }],
      { machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', stockCondition: 'near_net' });
    expect(r.lines[0].faceIds).toEqual([7, 9]);
  });
});

describe('a mesh asks instead of assuming', () => {
  const mesh = { status: 'success', boundingBox: { xMm: 80, yMm: 80, zMm: 20 }, volume: { mm3: 63938, cm3: 63.938 },
    surfaceArea: { mm2: 14841, cm2: 148.4 }, fillRatio: 0.5,
    wallThickness: { minMm: 5, maxMm: 20, meanMm: 10, stdDevMm: 3, sampleCount: 0, method: 'stl_heuristic', uniformity: 'unknown' } } as unknown as OCCTGeometry;
  it('holeRows returns a blocking geometry_gap decision on an STL with no typed count', () => {
    const h = holeRows(ctxOf(mesh, {}, 'stl'));
    expect('decision' in h).toBe(true);
    if ('decision' in h) { expect(h.decision.id).toBe('geometry.holeCount'); expect(h.decision.severity).toBe('blocking'); expect(h.decision.entry?.kind).toBe('number'); }
  });
  it('and the typed count is used, attributed to the engineer', () => {
    const h = holeRows(ctxOf(mesh, { 'geometry.holeCount': '4' }, 'stl'));
    expect('fact' in h && h.fact.value).toBe(4);
    expect('fact' in h && h.fact.source).toBe('engineer');
  });
  it('an exact B-rep never asks', () => {
    if (!kernel) return;
    const h = holeRows(ctxOf(flange!));
    expect('fact' in h && h.fact.value).toBe(6);
  });
});

describe('a part no machine holds is a decision', () => {
  it('blocks with machine.oversize, and proceeds once accepted or a machine is named', () => {
    if (!kernel) return;
    // Scale the flange's bounding box to 1.5 m — larger than any envelope in the catalogue.
    const huge = { ...flange!, boundingBox: { xMm: 1500, yMm: 1200, zMm: 700 } } as OCCTGeometry;
    const spec = specForCommodity('machining')!;
    const blocked = runCostInputRules(spec, ctxOf(huge));
    const d = blocked.decisions.find(x => x.id === MACHINE_ENVELOPE_DECISION_ID);
    expect(d).toBeTruthy();
    expect(d!.kind).toBe('machine_envelope');
    expect(d!.severity).toBe('blocking');
    expect(d!.why).toMatch(/× .* mm/);
    const accepted = runCostInputRules(spec, ctxOf(huge, { [MACHINE_ENVELOPE_DECISION_ID]: 'accept_largest' }));
    expect(accepted.decisions.some(x => x.id === MACHINE_ENVELOPE_DECISION_ID)).toBe(false);
    expect(accepted.byRule['machining.operations']).toBeTruthy();
  });
  it('a part that fits never raises it', () => {
    if (!kernel) return;
    const res = runCostInputRules(specForCommodity('machining')!, ctxOf(flange!));
    expect(res.decisions.some(x => x.id === MACHINE_ENVELOPE_DECISION_ID)).toBe(false);
  });
});
