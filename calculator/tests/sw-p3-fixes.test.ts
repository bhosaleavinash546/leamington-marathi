/**
 * Software costing review — P3 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES, unitCloudGBP, SW_CLOUD_REFERENCE_FLEET, SW_DEFAULT_DEVELOPMENT_MONTHS, validateSWInputs } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const prog = (mut: (p: SWProgramInputs) => void = () => {}) => { const p = defaultSWProgramInputs(); mut(p); return p; };

describe('#19 the headline states where it sits in its own band', () => {
  it('headlinePercentile is the share of trials at or below the headline', () => {
    const r = computeSWProgram(prog());
    const mc = r.monteCarlo;
    expect(mc.headlinePercentile).toBeGreaterThan(0);
    expect(mc.headlinePercentile).toBeLessThan(50);                      // skewed-up ranges → below the median
    expect(r.summary.grandTotal).toBeLessThan(mc.p50);
    if (mc.headlinePercentile > 10) expect(r.summary.grandTotal).toBeGreaterThanOrEqual(mc.p10);
  });
  it('screen, PDF and Excel print it', () => {
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/id="sw-headline-pct"/);
    expect(ui.match(/headlinePercentile/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('#17 cloud per connected vehicle; tool licences over the development years', () => {
  const mod = (r: ReturnType<typeof computeSWProgram>, id: string) => r.modules.find(m => m.moduleId === id)!;
  const def = (id: string) => SW_MODULES.find(m => m.id === id)!;

  it('the default programme\'s cloud is unchanged (the reference fleet is its average fleet)', () => {
    expect(SW_CLOUD_REFERENCE_FLEET).toBe(80_000 * 55 / 10);
    const r = computeSWProgram(prog());
    const flat = r.modules.reduce((t, m) => t + def(m.moduleId).annualCloudCostGBP * 10, 0);
    expect(r.summary.totalCloud).toBeCloseTo(flat, 2);
  });

  it('cloud scales with the fleet in service and the connected share', () => {
    const at = (vol: number, share?: number) => computeSWProgram(prog(p => { p.annualProductionVolume = vol; p.connectedVehicleShare = share; })).summary.totalCloud;
    expect(at(160_000) / at(80_000)).toBeCloseTo(2, 10);
    expect(at(80_000, 0.5) / at(80_000)).toBeCloseTo(0.5, 10);
    // fleet grows by the annual volume each year: 3 years → 1 + 2 + 3 = 6 vehicle-years per annual vehicle
    expect(unitCloudGBP(def('cloud_backend'), { annualProductionVolume: 1000, programLifeYears: 3 }))
      .toBeCloseTo(def('cloud_backend').annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * 6000, 6);
  });

  it('cloud is per vehicle — not apportioned by the platform volume', () => {
    const a = computeSWProgram(prog(p => { p.annualProductionVolume = 50_000; }));
    const b = computeSWProgram(prog(p => { p.annualProductionVolume = 50_000; p.platformAnnualVolume = 200_000; }));
    expect(mod(b, 'cloud_backend').cloudCost).toBeCloseTo(mod(a, 'cloud_backend').cloudCost, 2);
    expect(mod(b, 'cloud_backend').totalNonRecurring).toBeLessThan(mod(a, 'cloud_backend').totalNonRecurring);
  });

  it('tool licences follow the development duration, not the production life', () => {
    const tool = (mut: (p: SWProgramInputs) => void) => computeSWProgram(prog(mut)).summary.totalToolchain;
    const base = tool(() => {});
    expect(base).toBeCloseTo(computeSWProgram(prog()).modules.reduce((t, m) => t + def(m.moduleId).annualToolLicenceGBP * SW_DEFAULT_DEVELOPMENT_MONTHS / 12, 0), 2);
    expect(tool(p => { p.programLifeYears = 20; })).toBeCloseTo(base, 6);
    expect(tool(p => { p.developmentMonths = 45; })).toBeCloseTo(base / 2, 6);
  });

  it('the phase timeline follows the development duration; bad values are refused', () => {
    expect(computeSWProgram(prog()).phases.map(p => p.months)).toEqual(['M1–M6', 'M7–M18', 'M19–M54', 'M55–M78', 'M79–M90']);
    expect(computeSWProgram(prog(p => { p.developmentMonths = 45; })).phases.at(-1)!.months).toBe('M40–M45');
    expect(validateSWInputs(prog(p => { p.developmentMonths = 2; })).join(' ')).toMatch(/development duration/);
    expect(validateSWInputs(prog(p => { p.connectedVehicleShare = 1.5; })).join(' ')).toMatch(/connected/);
  });
});
