/**
 * The extrusion build, 3 Oct 2026 — polymer extrusion costed from CAD.
 *
 * Built on three extrusions modelled in OCP (cad-audit/parts/EXT_modelled_parts.py —
 * not customer parts): a Ø8 × 1 mm PA12 fuel line, a Ø32 × 3 mm HDPE vent pipe and
 * a 40 × 25 mm twin-chamber rigid PVC profile. docs/cad/extrusion-build-2026-10.md
 * has the derivation and the hand reconciliation of the vent pipe (£1.06).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { EXTRUSION_RULES, EXTRUSION_LINES } from '../src/engine/cost-input-rules/commodities/extrusion.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { RESIN_DECISION_ID } from '../src/engine/cost-input-rules/derive/resin.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams, COSTABLE_COMMODITIES } from '../src/engine/cost-input-rules/to-cost-params.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const TUBE = 'EXT_Fuel_Line_Tube.stp', PIPE = 'EXT_Vent_Pipe.stp', PROF = 'EXT_Twin_Chamber_Profile.stp';
const ans = (resin: string) => ({ [RESIN_DECISION_ID]: resin, 'commodity.route': 'extrusion' });
const ctx = (part: string, resin: string, annualVolume = 50_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'extrusion', commoditySource: 'engineer', annualVolume,
  filename: part, answers: ans(resin),
} as RuleContext);
const ext = (part: string, resin: string, v = 50_000) => {
  const r = runCostInputRules(EXTRUSION_RULES, ctx(part, resin, v));
  return { r, s: r.suggestions.extrusion as Record<string, number | string | boolean> };
};

describe('1. extrusion has rules, a route and headless costing', () => {
  it('the registry, the route and the cost mapping all know it', () => {
    expect(specForCommodity('extrusion')).toBe(EXTRUSION_RULES);
    expect(COSTABLE_COMMODITIES).toContain('extrusion');
  });
  it('a constant section is offered extrusion first — before the hollow and bend tests (the pipe was asked blow / roto)', () => {
    for (const p of [TUBE, PIPE, PROF]) {
      const r = inferCommodity({ geo: geoOf(p), geometryQuality: 'occt', annualVolume: 50_000, filename: p, answers: {} } as never) as
        { decision: { options: Array<{ value: string; leaning?: boolean }> } };
      expect(r.decision.options.find(o => o.leaning)!.value).toBe('extrusion');
    }
  });
  it('a rubber profile named as one still leans rubber', () => {
    const r = inferCommodity({ geo: geoOf('RUB_Door_Seal.stp'), geometryQuality: 'occt', annualVolume: 50_000,
      filename: 'RUB_Door_Seal.stp', answers: {} } as never) as { decision: { options: Array<{ value: string; leaning?: boolean }> } };
    expect(r.decision.options.find(o => o.leaning)!.value).toBe('rubber');
  });
});

describe('2. the section, measured', () => {
  it('kg/m = volume ÷ length × density; wall = 2·V/S', () => {
    const t = ext(TUBE, 'mat-pa12-ext-tube').s;
    expect(t).toMatchObject({ partLengthM: 0.6, wallThicknessMm: 1, process: 'tube-medical' });
    expect(Number(t.profileWeightKgPerM)).toBeCloseTo(22.0 * 1e-6 * 1010, 4);
  });
  it('round hollow → tube (≤ Ø16) or pipe; anything else a profile, complex when its outline is long', () => {
    expect(ext(PIPE, 'mat-pe100-pipe').s.process).toBe('pipe');
    expect(ext(PROF, 'mat-upvc-pipe').s.process).toBe('profile-complex');
  });
});

describe('3. the line, its rate and its scrap', () => {
  it('the line follows the process; the rate is the lesser of screw and cooling', () => {
    const p = ext(PIPE, 'mat-pe100-pipe').s;
    expect(p.machineId).toBe(EXTRUSION_LINES.pipe.machineId);
    expect(p.lineRateKgPerHr).toBe(95);                         // cooling-limited at a 3 mm wall
    expect(ext(PROF, 'mat-upvc-pipe').s.lineRateKgPerHr).toBe(156);   // screw-limited, rigid PVC
  });
  it('start-up scrap: a quarter-hour of the screw\'s output over a run of at least a shift', () => {
    expect(ext(TUBE, 'mat-pa12-ext-tube').s.startupScrapFraction).toBeCloseTo(23 / 333, 2);
  });
});

describe('4. aluminium is refused, not priced on a polymer line', () => {
  it('a metal grade answered into extrusion is asked to re-route, with the reason', () => {
    const r = runCostInputRules(EXTRUSION_RULES, { ...ctx(PROF, 'mat-al6082-bar') } as RuleContext);
    // Asked AS the process question (extrusion review, Oct 2026), so the answer
    // re-routes — 'extrusion.metal' was a dead end that suggested machining.
    const q = r.decisions.find(d => d.id === 'commodity.route')!;
    expect(q).toBeDefined();
    expect(q.options.find(o => o.leaning)?.value).toBe('aluminium_extrusion');
  });
});

describe('5. screen and headless take the same values', () => {
  it('headless params carry every rule', () => {
    const c = ctx(PIPE, 'mat-pe100-pipe');
    const { analysis } = buildDeterministicAnalysis(EXTRUSION_RULES, c, 'pipe');
    const p = toCostParams('extrusion', analysis.costInputSuggestions as never, 50_000, 'plastic', c.geo)!.params;
    expect(p).toMatchObject({ extruderId: 'extruder-pipe-line', lineRateKgPerHr: 95, screwDiameterMm: 90, cooling: 'vacuum-tank',
      manning: 0.5, oee: 0.8, labourEfficiency: 0.92, labourId: 'lab-uk-semiskilled', steadyScrapFraction: 0.02 });
  });
  it('the parts cost headless', async () => {
    const r = await costMeasuredPart(geoOf(PIPE), PIPE, { partNumber: PIPE, file: PIPE, annualVolume: 50_000, commodity: 'extrusion' } as never,
      ans('mat-pe100-pipe'), 'UK', { annualVolume: 50_000 } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
      { partNumber: PIPE, file: PIPE, status: 'error' } as never) as { status: string; total: number };
    expect(r.total).toBeCloseTo(1.06, 2);
  });
});

describe('6. baseline', () => {
  it('records all three at 50,000/yr', () => {
    expect(baseline.find(b => b.part === TUBE)!.outcome.total).toBe(0.41);
    expect(baseline.find(b => b.part === PIPE)!.outcome.total).toBe(1.06);
    expect(baseline.find(b => b.part === PROF)!.outcome.total).toBe(2.02);
  });
});
