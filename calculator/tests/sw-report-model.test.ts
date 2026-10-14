/**
 * 360 software report model (plan docs/plans/sw-report-360-plan-2026-10-14.md): every section reconciles to the engine,
 * every module appears once, focused reports are slices that add up to the vehicle, and the report skeleton is a
 * self-contained picture of the same component map the screen uses.
 */
import { describe, it, expect } from 'vitest';
import { computeSWProgram, SW_MODULES, SW_DEV_SPLIT, type SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { buildSWReportModel, SW_REPORT_PROFILES, type SWReportProfile } from '../src/engine/sw-report-model.js';
import { buildSWReportRequest } from '../src/export/sw-report-request.js';
import { buildReportSkeletonSVG, reportImageSpecs, skeletonSVGFor } from '../src/export/sw-report-skeleton.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const prog = (id: string): SWProgramInputs => ({ ...buildVehicleInputs(SW_VEHICLE_DEMOS.find(d => d.id === id)!), annualProductionVolume: 200_000, programLifeYears: 6 });
const model = (p: SWProgramInputs, profile: SWReportProfile = 'vehicle', extra: Record<string, unknown> = {}) => {
  const r = computeSWProgram(p);
  return buildSWReportModel(r, buildSWReportRequest(r, { options: { profile, ...extra }, title: 'Test programme', generatedAt: new Date(2026, 9, 14) }));
};

describe('the engine carries each module\'s arithmetic (chain)', () => {
  it('Σ bucket PM × effort rate × share = development £, and the PM chain multiplies out, for every demo module', () => {
    for (const id of ['rr_l460', 'porsche_cayenne', 'porsche_cayenne_ice']) {
      for (const m of computeSWProgram(prog(id)).modules) {
        const c = m.chain;
        expect(Object.values(c.bucketPM).reduce((a, b) => a + b, 0) * c.effortRate * c.share).toBeCloseTo(m.development.total, 4);
        expect(c.nominalPM * c.effortCal * c.reuseFactor).toBeCloseTo(c.effectivePM, 9);
        expect(c.bucketPM.requirements).toBeCloseTo(c.devPM * SW_DEV_SPLIT.requirements, 9);
        expect(c.loadedRate).toBeCloseTo(c.engineerRate * c.devSourceMult * c.overhead, 6);
      }
    }
  });
});

describe('the vehicle report reconciles to the engine', () => {
  for (const id of ['rr_l460', 'porsche_cayenne', 'porsche_cayenne_ice', 'bmw_x7']) {
    it(`${id}: every check passes, every module appears once, every domain sums to its modules`, () => {
      const m = model(prog(id));
      expect(m.checks.length).toBeGreaterThan(m.modules.length * 5);
      expect(m.checks.filter(c => !c.ok)).toEqual([]);
      expect(m.modules.map(x => x.id).sort()).toEqual(m.result.modules.map(x => x.moduleId).sort());
      expect(new Set(m.modules.map(x => x.id)).size).toBe(m.modules.length);
      for (const d of m.domains) expect(d.total).toBeCloseTo(m.result.summary.byCategory[d.category], 4);
      expect(m.slice.isWhole).toBe(true);
      // every money line names its arithmetic; every lifecycle line has a basis and grade
      for (const x of m.modules) for (const l of x.lines) {
        expect(l.expr.length).toBeGreaterThan(0);
        expect(Number.isFinite(l.value)).toBe(true);
        if (l.group === 'lifecycle') { expect(l.grade).toBeTruthy(); expect(l.basis).toBeTruthy(); }
      }
    });
  }
  it('architecture: components numbered 1…n, drivetrain-correct (no engine on a BEV, no battery on an ICE)', () => {
    const bev = model(prog('porsche_cayenne')), ice = model(prog('porsche_cayenne_ice'));
    expect(bev.components.map(c => c.no)).toEqual(bev.components.map((_, i) => i + 1));
    expect(bev.components.some(c => c.id === 'engine')).toBe(false);
    expect(ice.components.some(c => c.id === 'battery_pack')).toBe(false);
    expect(ice.components.some(c => c.id === 'engine')).toBe(true);
  });
  it('nothing invented: no vehicle text → "Not provided"; metadata printed only when typed', () => {
    const m = model(prog('rr_l460'));
    expect(m.definition.find(([k]) => k === 'Vehicle')![1]).toMatch(/^Not provided/);
    expect(m.definition.some(([k]) => k === 'Prepared by')).toBe(false);
    const m2 = model(prog('rr_l460'), 'vehicle', { meta: { preparedBy: 'A. Engineer' } });
    expect(m2.definition.find(([k]) => k === 'Prepared by')![1]).toBe('A. Engineer');
  });
});

describe('focused reports are slices of the vehicle costing', () => {
  const p = prog('rr_l460');
  const whole = model(p);
  it('domain report: the chosen domains only, figures identical to the vehicle report, programme items left out', () => {
    const m = model(p, 'domain', { domains: ['B', 'C'] });
    expect(m.slice.isWhole).toBe(false);
    expect(m.domains.map(d => d.category)).toEqual(['B', 'C']);
    expect(m.slice.total).toBeCloseTo(whole.domains.filter(d => ['B', 'C'].includes(d.category)).reduce((a, d) => a + d.total, 0), 4);
    for (const x of m.modules) expect(x.result.grandTotal).toBe(whole.modules.find(w => w.id === x.id)!.result.grandTotal);
    expect(m.checks.filter(c => !c.ok)).toEqual([]);
    expect(m.programmeItems.length).toBeGreaterThan(0);
  });
  it('module report: the chosen modules, every line to the last bit', () => {
    const m = model(p, 'module', { moduleIds: ['bms_core', 'navigation'] });
    expect(m.modules.map(x => x.id).sort()).toEqual(['bms_core', 'navigation']);
    expect(m.sections.map(s => s.id)).toContain('modules');
    expect(m.checks.filter(c => !c.ok)).toEqual([]);
  });
  it('every profile builds, numbers its sections from 1 and lists its pictures', () => {
    for (const k of Object.keys(SW_REPORT_PROFILES) as SWReportProfile[]) {
      const m = model(p, k, k === 'domain' ? { domains: ['A'] } : k === 'module' ? { moduleIds: ['bms_core'] } : {});
      expect(m.sections[0].id).toBe('cover');
      expect(m.sections.slice(1).map(s => s.no)).toEqual(m.sections.slice(1).map((_, i) => i + 1));
      const keys = reportImageSpecs(m).map(s => s.key);
      expect(keys).toContain('cover');
      if (k === 'vehicle') expect(keys.filter(x => x.startsWith('module-')).length).toBe(m.modules.length);
      if (k === 'hubs') expect(keys.filter(x => x.startsWith('module-'))).toEqual([]);
    }
  });
});

describe('the report skeleton', () => {
  const m = model(prog('rr_l460'));
  it('is self-contained (no CSS variables, no external fonts or images) and carries every lit component\'s number', () => {
    const svg = skeletonSVGFor(m, m.skeletons[0]);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).not.toMatch(/var\(--|<link|<image|href="http/);
    for (const c of m.components.filter(c => c.id !== 'backbone')) expect(svg).toContain(`>${c.no}</text>`);
  });
  it('draws every body type, never prints money', () => {
    for (const body of ['suv', 'saloon', 'hatchback', 'pickup', 'van'] as const) {
      const svg = buildReportSkeletonSVG({ body, powertrain: 'PHEV', modules: m.result.modules.map(x => ({ id: x.moduleId, asil: x.asilUsed })),
        numbers: new Map(m.components.map(c => [c.id, c.no])), colourBy: 'asil' });
      expect(svg).toContain('schematic top view');
      expect(svg).not.toMatch(/£|€|\$/);
    }
  });
  it('the excluded view greys where out-of-scope catalogue software would run', () => {
    const v = m.skeletons.find(s => s.key === 'excluded')!;
    expect(v.excluded!.length).toBe(SW_MODULES.length - m.result.modules.length);
    expect(skeletonSVGFor(m, v)).toContain('url(#cv-hatch)');
  });
});
