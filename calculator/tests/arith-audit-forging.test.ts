/**
 * Arithmetic audit — forging (30 Oct 2026, docs/review/arith-audit/forging.md). Each test failed before its fix.
 * The shadow model that re-adds the three real forgings is scripts/arith-audit/forging.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeForgingDrivers, type ForgingInputs } from '../src/engine/modules/forging.js';
import { adviseForgingProcess, estimateForgingDieCost } from '../src/engine/modules/forging-advisor.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { FORGING_RULES } from '../src/engine/cost-input-rules/commodities/forging.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const BASE: ForgingInputs = {
  materialId: 'mat-steel-38mnvs6', partWeightKg: 2.0, flashAndScaleKg: 0.2, yieldFraction: 0.743,
  forgeId: 'forge-press-1600t', labourId: 'lab-uk-forge', strokesToForm: 2, cycleTimeHr: 11 / 3600,
  oee: 0.8, manning: 2, labourEfficiency: 0.92, heatingEnergyKwhPerKg: 0.35,
  dieLife: 40_000, dieCost: 25_000, amortizationVolume: 250_000,
};
const item = (d: ReturnType<typeof computeForgingDrivers>, label: string) =>
  d.rawMaterial.consumablesItems?.find(i => i.label === label)?.gbp ?? 0;

describe('F2 — descale is charged on the forging, not the billet', () => {
  it('£/kg × the as-forged weight (the flash is trimmed before the blast)', () => {
    const d = computeForgingDrivers({ ...BASE, descaleCostPerKg: 0.12 });
    // billet would be (2.0 + 0.2) / 0.743 = 2.961 kg → £0.355; the forging is 2.0 kg → £0.24
    expect(item(d, 'descale')).toBeCloseTo(0.12 * 2.0, 10);
  });
});

describe('F5 — the scrap forgings were heated, blasted and inspected too', () => {
  it('heating, descale, heat treat and NDT carry the same reject uplift as the material and the press', () => {
    const d = computeForgingDrivers({ ...BASE, rejectRate: 0.02, descaleCostPerKg: 0.12, heatTreatCostPerKg: 0.3, ndtCostPerPart: 2.5 });
    const u = 1 / 0.98, billet = 2.2 / 0.743;
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(2.0 * u, 10);
    expect(d.rawMaterial.energyKwh?.electricity).toBeCloseTo(0.35 * billet * u, 10);
    expect(item(d, 'descale')).toBeCloseTo(0.12 * 2.0 * u, 10);
    expect(item(d, 'heat treatment')).toBeCloseTo(0.3 * 2.0 * u, 10);
    expect(item(d, 'NDT')).toBeCloseTo(2.5 * u, 10);
  });
});

// The three real forgings, through the rules as the baseline answers them.
const base = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/real-parts-baseline.json'), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const ANSWERS = { 'material.family': 'steel', 'commodity.route': 'forging', 'service.toleranceClass': 'standard' };
const run = (part: string, safety: 'yes' | 'no') => {
  const geo = base.find(p => p.part === part)!.geometry;
  const ctx: RuleContext = { geo, geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer',
    annualVolume: 50_000, filename: part, answers: { ...ANSWERS, 'service.safetyCritical': safety } } as RuleContext;
  return runCostInputRules(FORGING_RULES, ctx);
};
const yoke = run('FORGE_Control_Arm_Yoke.stp', 'yes');
const hub = run('FORGE_Hub_Flange.stp', 'no');
const knuckle = run('steering_knuckle_RH.stp', 'yes');

describe('F1 — the press basis prints Kt and σflow, and its arithmetic gives the tonnage', () => {
  it('yoke: 3 × 105 MPa × A ÷ 9,806.65 = 324 t × 1.2 = 389 t → the 500 t press', () => {
    const b = yoke.provenance['forge-mach'].basis;
    expect(b).toMatch(/Kt 3 for a simple shape, σflow 105 MPa/);
    const m = b.match(/= (\d+) × (\d+) MPa × ([\d,]+) mm² ÷ 9,806.65 N\/t = (\d+) t × 1\.2 safety = (\d+) t/)!;
    expect(m).not.toBeNull();
    const [, kt, flow, mm2, t, t12] = m;
    expect(Math.round(+kt * +flow * +mm2.replace(/,/g, '') / 9806.65)).toBe(+t);
    expect(+t).toBe(324);
    expect(Math.round(+t * 1.2)).toBe(+t12);
    expect(b).toMatch(/the 500 t press/);
  });
  it('the trim basis prints its margin and the press it picks', () => {
    expect(hub.provenance['forge-trim-mach'].basis).toMatch(/= 8\.2 t × 1\.25 margin = 10\.25 t → the 100 t press/);
  });
});

describe('F3 — the die-cost basis lists the toolmaker lines and re-adds to the die set', () => {
  it('no "£… block" residual; the lines + overhead equal the value', () => {
    const b = hub.provenance['forge-die-cost'].basis;
    expect(b).not.toMatch(/£\d+ block/);
    const sub = +b.match(/= £([\d,]+); toolmaker/)![1].replace(/,/g, '');
    const lines = [...b.split(' = £')[0].matchAll(/£([\d,]+)/g)].map(x => +x[1].replace(/,/g, ''));
    expect(lines.reduce((s, v) => s + v, 0)).toBe(sub);
    const ohp = +b.match(/of it = £([\d,]+)/)![1].replace(/,/g, '');
    expect(sub + ohp).toBe(hub.provenance['forge-die-cost'].value);
    expect(b).toMatch(/Die blocks .* £1,514/);          // the H13 itself, not £6,713
    const est = estimateForgingDieCost({ projectedAreaCm2: 116, partWeightKg: 2.842, dieSteel: 'h13', impressions: 2, complexity: 'simple' });
    expect(hub.provenance['forge-die-cost'].value).toBe(est.total);
  });
});

describe('F4 — die life prints its factors', () => {
  it('hub: 38,000 × 1.3 × (100/116)^0.2 = 47,955', () => {
    expect(hub.provenance['forge-die-life'].basis).toMatch(/38,000 forgings a die set for microalloyed steel × 1\.3 simple impression × 0\.970752 size = 47,955/);
    expect(hub.provenance['forge-die-life'].value).toBe(47_955);
  });
});

describe('F16 — the shape basis prints the score that gives the value', () => {
  it('knuckle: score 3 → complex, demoted to moderate on its revolution share — both printed', () => {
    const b = knuckle.provenance['forge-shape'].basis;
    expect(knuckle.provenance['forge-shape'].value).toBe('moderate');
    expect(b).toMatch(/score 2 \+ 0 \+ 1 = 3 → complex/);
    expect(b).toMatch(/181 of 310 faces are cylinders, cones or tori \(58%, ≥ 55%\) — formed in round dies, so moderate/);
  });
});

describe('F7 / F8 — yield and flash print the billet they build', () => {
  it('billet = forging + flash ÷ yield, and finished ÷ billet beside it', () => {
    const b = hub.provenance['forge-yield'].basis;
    expect(b).toMatch(/as-forged weight ÷ billet/);
    expect(b).toMatch(/billet = 2\.842 kg forging \+ 0\.284 kg flash = 3\.126 kg ÷ 0\.743 = 4\.207 kg/);
    expect(b).toMatch(/finished ÷ billet = 2\.198 kg ÷ 4\.207 kg = 0\.52/);
    expect(hub.provenance['forge-flash'].basis).toMatch(/cost-neutral/);
  });
});

describe('F6 / F9 / F10 — services and exclusions say what they are', () => {
  it('heating, descale and NDT print their £ / kWh basis and that they are not sourced', () => {
    expect(hub.provenance['forge-heat-energy'].basis).toMatch(/0\.35 kWh\/kg × 4\.207 kg billet ÷ 0\.98 .* = 1\.503 kWh/);
    expect(hub.provenance['forge-descale'].basis).toMatch(/£0\.12\/kg × the 2\.842 kg forging/);
    expect(hub.provenance['forge-descale'].basis).not.toMatch(/pickled off/);
    // Lead's merge (arithmetic audit F14): MPI is the casting route's station — 75 s × (inspector + bench), not a flat £2.50.
    expect(knuckle.provenance['forge-ndt'].basis).toMatch(/magnetic-particle .*75 s a part × \(inspector £[\d.]+\/h × 1 \+ bench £4\.00\/h\) = £0\.67 a part .*not sourced/);
  });
  it('the cycle says the billet cut-off and the heater capital are not costed', () => {
    expect(hub.provenance['forge-ct'].basis).toMatch(/takt = 3 s billet from the heater \+ 2 × 4 s .* = 11 s/);
    expect(hub.provenance['forge-ct'].basis).toMatch(/Not costed: billet cut-off \(saw \/ shear\)/);
  });
});

describe('F12 — the advisor route matches the costing', () => {
  it('a microalloyed closed-die forging is controlled-cooled, not heat treated; MPI when safety-critical', () => {
    const r = adviseForgingProcess({ annualVolume: 50_000, partWeightKg: 3, complexity: 'medium', alloyFamily: 'microalloyed-steel', safetyCritical: true });
    expect(r.process).toBe('closed-die');
    expect(r.processRoute).not.toContain('Heat treat');
    expect(r.processRoute.join(' ')).toMatch(/Controlled cool.*Shot blast.*MPI/);
    const c = adviseForgingProcess({ annualVolume: 50_000, partWeightKg: 3, complexity: 'medium', alloyFamily: 'alloy-steel' });
    expect(c.processRoute).toContain('Heat treat');
  });
});
