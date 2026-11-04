/**
 * Stepped bores and shallow "holes" (fresh review, 4 Nov 2026 — scratchpad review/fresh-numbers.md §1.1, §1.2, §1.3):
 *  - coaxial cylinders of different Ø that touch along one axis are ONE stepped bore — one approach, one tool a step Ø —
 *    never one bore a step (the stub axle's two kingpin bores were "10 cored bores", the knuckle's hub bore was 4);
 *  - a cylinder shallower than ¼ Ø is a land / chamfer step, never a drilled hole (the bracket's four 1 mm "holes").
 * The kernel's feature table carries each instance's axis line and span (`axes`); the rows below are the kernel's own
 * reading of the real parts (cad-audit/parts), with the axes it now reports.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  steppedBoreGroups, steppedBoreTime, holeWork, isLandRow, featureTime, computeFeatureMachining, ALLOWANCE_MIN,
} from '../src/engine/feature-machining.js';
import { holeTimes } from '../src/engine/machining-time.js';
import { boreFeed, drillFeed } from '../src/engine/cutting-catalogue.js';
import { nearNetCut, routingFor, buildOperationPlan } from '../src/engine/cost-input-rules/commodities/machining.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

type Ax = { line: string; s0: number; s1: number };
const KNUCKLE_AXES: Record<string, Ax[]> = {
  '10|11.7': [{ line: '-64.5,-68.5,0.0,0.000,0.000,1.000', s0: -18.5, s1: -6.79 }],
  '11|20.5': [{ line: '-64.5,-68.5,0.0,0.000,0.000,1.000', s0: -6.5, s1: 17 }],
  '12|2': [{ line: '-89.5,0.0,120.0,0.000,1.000,0.000', s0: 5.5, s1: 7.5 }],
  '12.5|16': [{ line: '0.0,-70.0,-59.0,1.000,0.000,0.000', s0: -47, s1: -31 }, { line: '0.0,70.0,-59.0,1.000,0.000,0.000', s0: -47, s1: -31 }],
  '12.5|25': [{ line: '-91.0,84.0,0.0,0.000,0.000,1.000', s0: -12, s1: 13 }],
  '15|18.9': [{ line: '-61.3,-8.6,0.0,0.139,-0.990,0.000', s0: 48.19, s1: 67.12 }],
  '15|25': [{ line: '-98.9,138.4,0.0,0.000,0.000,1.000', s0: -12, s1: 13 }],
  '63|3': [{ line: '0.0,0.0,0.0,1.000,0.000,0.000', s0: -3, s1: 0 }],
  '68|40.3': [{ line: '0.0,0.0,0.0,1.000,0.000,0.000', s0: -46.5, s1: -3.5 }],
  '71|2.7': [{ line: '0.0,0.0,0.0,1.000,0.000,0.000', s0: -42.7, s1: -40.05 }],
  '75|6': [{ line: '0.0,0.0,0.0,1.000,0.000,0.000', s0: -55, s1: -49 }],
};
const BRACKET_AXES: Record<string, Ax[]> = {
  '4|6.5': [{ line: '-122.5,15.6,0.0,0.000,0.000,1.000', s0: 101, s1: 107.5 }],
  '4.92|14.5': [{ line: '-64.0,20.0,0.0,0.000,0.000,1.000', s0: 110, s1: 124.46 }],
  '13|8': [{ line: '-109.0,12.0,0.0,0.000,0.000,1.000', s0: 101, s1: 109 }],
  '13|19': [{ line: '-14.0,0.0,0.0,0.000,0.000,1.000', s0: 0, s1: 19 }, { line: '-31.0,35.0,0.0,0.000,0.000,1.000', s0: 0, s1: 19 }],
  '13|41': [{ line: '-31.0,-35.0,0.0,0.000,0.000,1.000', s0: 0, s1: 41 }],
  '14|1': [{ line: '-14.0,0.0,0.0,0.000,0.000,1.000', s0: 19, s1: 20 }, { line: '-31.0,-35.0,0.0,0.000,0.000,1.000', s0: 41, s1: 42 },
    { line: '-31.0,35.0,0.0,0.000,0.000,1.000', s0: 19, s1: 20 }],
  '20|1': [{ line: '-109.0,12.0,0.0,0.000,0.000,1.000', s0: 109, s1: 110 }],
};

const BASE = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: Record<string, any> }>;
/** The recorded geometry of a real part with the axes the kernel now reports on its hole rows. */
function geoWithAxes(part: string, axes: Record<string, Ax[]>) {
  const g = structuredClone(BASE.find(b => b.part === part)!.geometry);
  g.featureTable = (g.featureTable as FeatureRow[]).map(r => (r.kind === 'hole' ? { ...r, axes: axes[`${r.diaMm}|${r.depthMm}`] } : r));
  return g;
}
const holesOf = (g: Record<string, any>) => (g.featureTable as FeatureRow[]).filter(r => r.kind === 'hole');

describe('a stepped bore is one piece of work', () => {
  const knuckle = holesOf(geoWithAxes('steering_knuckle_RH.stp', KNUCKLE_AXES));

  it('groups coaxial touching steps on one axis line, and nothing else', () => {
    const { groups, leftover } = steppedBoreGroups(knuckle);
    const ds = groups.map(g => g.map(h => h.row.diaMm).sort((a, b) => a - b));
    expect(ds).toEqual(expect.arrayContaining([[63, 68, 71, 75], [10, 11]]));
    expect(groups).toHaveLength(2);
    // the two Ø12.5×16 holes are on two lines: never grouped
    expect(leftover[knuckle.findIndex(r => r.diaMm === 12.5 && r.depthMm === 16)]).toBe(2);
  });

  it('times the knuckle hub bore with ONE approach: 0.25 + the bored step + land skims (not 4 × an approach)', () => {
    const g = steppedBoreGroups(knuckle).groups.find(x => x.some(h => h.row.diaMm === 68))!;
    const t = steppedBoreTime(g, 'steel', 25);
    const expected = ALLOWANCE_MIN.borePass + 40.3 / boreFeed('steel', 68).vf + 0.004 * (63 + 71 + 75);
    expect(t.min).toBeCloseTo(expected, 6);
    expect(t.bored).toBe(true);
    expect(t.stepMin.reduce((s, x) => s + x, 0)).toBeCloseTo(t.min, 9);
    // each step on its own (the old reading) paid an approach a step
    const separate = g.reduce((s, h) => s + featureTime(h.row, 'steel', 25).min, 0);
    expect(separate - t.min).toBeGreaterThan(3 * 0.2 - 1e-9);
  });

  it('holeTimes and the feature table read the same minutes', () => {
    const tot = holeTimes(knuckle, 'steel', 25).min;
    const work = holeWork(knuckle, 'steel', 25);
    expect(work.reduce((s, w) => s + w.minEach * w.count, 0)).toBeCloseTo(tot, 9);
    const fm = computeFeatureMachining(knuckle, { machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', family: 'steel', coredAboveMm: 25 });
    expect(fm.lines.reduce((s, l) => s + l.minutesEach * l.count, 0)).toBeCloseTo(tot, 2);
  });

  it('rows without axes (older recorded geometry, meshes) are never grouped', () => {
    const bare = knuckle.map(({ axes: _a, ...r }) => r);
    expect(steppedBoreGroups(bare).groups).toHaveLength(0);
  });

  it('a gap longer than the radial step (material between) keeps two bores', () => {
    const line = '0.0,0.0,0.0,1.000,0.000,0.000';
    const rows: FeatureRow[] = [
      { kind: 'hole', diaMm: 40, depthMm: 10, through: true, count: 1, axes: [{ line, s0: 0, s1: 10 }] },
      { kind: 'hole', diaMm: 42, depthMm: 10, through: true, count: 1, axes: [{ line, s0: 15, s1: 25 }] },
    ];
    expect(steppedBoreGroups(rows).groups).toHaveLength(0);
    rows[1].axes = [{ line, s0: 10.9, s1: 20.9 }];   // within the 1 mm radial step + 0.1
    expect(steppedBoreGroups(rows).groups).toHaveLength(1);
  });
});

describe('a cylinder shallower than ¼ Ø is a land, not a drilled hole', () => {
  it('at every Ø (the bracket\'s Ø14 × 1 and Ø20 × 1, the stub axle\'s Ø16 × 3.2)', () => {
    for (const [d, L] of [[14, 1], [20, 1], [16, 3.2], [12, 2]]) {
      const row: FeatureRow = { kind: 'hole', diaMm: d, depthMm: L, through: true, count: 1 };
      expect(isLandRow(row)).toBe(true);
      expect(featureTime(row, 'steel').text).toMatch(/land/);
      expect(featureTime(row, 'steel').text).not.toMatch(/mm\/min \(n/);   // no drilling feed
    }
    expect(isLandRow({ kind: 'hole', diaMm: 6.3, depthMm: 3.7, through: false, count: 1 })).toBe(false);
  });

  it('the bracket\'s 1 mm steps ride their holes: no drilled 1 mm hole and no approach of their own', () => {
    const bracket = holesOf(geoWithAxes('Casting_Braket.stp', BRACKET_AXES));
    const work = holeWork(bracket, 'steel', 20);
    expect(work.filter(w => w.kind === 'hole' && w.label.endsWith('×1'))).toHaveLength(0);
    const stepped = work.filter(w => w.kind === 'stepped');
    expect(stepped.reduce((s, w) => s + w.count, 0)).toBe(4);
    // Ø13 × 19 + Ø14 × 1: one drill approach + the drilled length + the land skim
    const w = stepped.find(x => x.label === 'stepped bore Ø13.0×19 / Ø14.0×1.0')!;
    expect(w.count).toBe(2);
    expect(w.minEach).toBeCloseTo(ALLOWANCE_MIN.drill + 19 / drillFeed('steel', 13).vf + 0.004 * 14, 6);
  });
});

describe('the near-net plan on the knuckle', () => {
  it('prints ONE stepped cored bore, and the boring minutes fall', () => {
    const geo = geoWithAxes('steering_knuckle_RH.stp', KNUCKLE_AXES);
    const ctx = { geo, geometryQuality: 'occt', commodity: 'forging', annualVolume: 200_000, filename: 'k', answers: {} } as unknown as RuleContext;
    const cut = nearNetCut(ctx, 'steel', 'forging');
    const plan = buildOperationPlan(ctx, cut, routingFor(ctx, cut));
    const bore = plan.find(p => /^Finish boring/.test(p.name))!;
    expect(bore.name).toMatch(/^Finish boring — 1 cored bore\(s\), 1 stepped/);
    const without = { ...geo, featureTable: (geo.featureTable as FeatureRow[]).map(({ axes: _a, ...r }) => r) };
    const ctx0 = { ...ctx, geo: without } as RuleContext;
    const cut0 = nearNetCut(ctx0, 'steel', 'forging');
    expect(cut.boreMin!).toBeLessThan(cut0.boreMin! - 0.5);
    expect(plan.find(p => /^Drilling/.test(p.name))!.name).toMatch(/stepped bore Ø10\.0×12 \/ Ø11\.0×21/);
  });
});
