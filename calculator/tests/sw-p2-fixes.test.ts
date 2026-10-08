/**
 * Software costing review — P2 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, validateSWInputs, SWInputError } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const prog = (mut: (p: SWProgramInputs) => void = () => {}) => { const p = defaultSWProgramInputs(); mut(p); return p; };

describe('#8 engine input validation — invalid inputs are refused with a reason', () => {
  const cases: Array<[string, (p: SWProgramInputs) => void, RegExp]> = [
    ['negative overhead', p => { p.overheadMultiplier = -1; }, /overhead/],
    ['overhead below 1', p => { p.overheadMultiplier = 0; }, /overhead/],
    ['blank life (NaN)', p => { p.programLifeYears = NaN; }, /programme life/],
    ['zero volume', p => { p.annualProductionVolume = 0; }, /annual volume/],
    ['senior share 5', p => { p.teamSeniorFraction = 5; }, /senior share/],
    ['unknown region', p => { (p as { region: string }).region = 'Brazil'; }, /region/],
    ['negative custom effort', p => { p.modules[0].customPersonMonths = -500; }, /custom effort/],
    ['absurd custom effort', p => { p.modules[0].customPersonMonths = 1e9; }, /custom effort/],
    ['unknown module', p => { p.modules.push({ moduleId: 'nope', enabled: true, asil: 'B', complexity: 'High', reuse: 'Medium', customPersonMonths: null }); }, /unknown module/],
    ['duplicate module', p => { p.modules.push({ ...p.modules[0] }); }, /appears twice/],
    ['negative discount', p => { p.discountRatePct = -50; }, /discount/],
    ['zero schedule compression', p => { p.scheduleCompression = 0; }, /schedule compression/],
    ['negative base rate', p => { p.baseRateGBP = -50_000; }, /base rate/],
  ];
  for (const [label, mut, re] of cases) {
    it(`refuses ${label}`, () => {
      expect(validateSWInputs(prog(mut)).join(' ')).toMatch(re);
      expect(() => computeSWProgram(prog(mut))).toThrow(SWInputError);
    });
  }
  it('the default programme and every limit-edge value are accepted', () => {
    expect(validateSWInputs(defaultSWProgramInputs())).toEqual([]);
    expect(validateSWInputs(prog(p => { p.programLifeYears = 1; p.annualProductionVolume = 1; p.teamSeniorFraction = 0; p.overheadMultiplier = 1; }))).toEqual([]);
  });
  it('the screen no longer replaces a 0 life / volume with 10 / 80,000', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).not.toMatch(/'sw-vol'\) as HTMLInputElement\)\?\.value\) \|\| 80_000/);
  });
});

describe('#9 reported person-months are the person-months costed', () => {
  it('module development £ = personMonths × the loaded rate (it reported effort before complexity / safety scaling)', () => {
    const p = defaultSWProgramInputs();
    const rate = 28_000 * 1 * 1 * (0.5 * 1.2 + 0.5 * 0.75) * p.overheadMultiplier;
    for (const m of computeSWProgram(p).modules) {
      expect(m.development.total / rate, m.moduleId).toBeCloseTo(m.personMonths, 0);
    }
  });
  it('engineering effort covers every effort-driven bucket, and the summary adds them', () => {
    const p = defaultSWProgramInputs();
    const rate = 28_000 * (0.5 * 1.2 + 0.5 * 0.75) * p.overheadMultiplier;
    const r = computeSWProgram(p);
    const m = r.modules.find(x => x.moduleId === 'bms_core')!;
    const effortGBP = m.development.total + m.testing.total + m.integrationCost + m.cybersecCost + m.calibrationCost + m.mlDataCost;
    expect(m.effortPersonMonths).toBeCloseTo(effortGBP / rate, 0);
    expect(r.summary.totalEffortPersonMonths).toBeCloseTo(r.modules.reduce((a, x) => a + x.effortPersonMonths, 0), 6);
    expect(r.summary.totalEffortPersonMonths).toBeGreaterThan(r.summary.totalPersonMonths);
  });
  it('the unsourced "peak headcount 1.4–1.7×" claim is gone', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).not.toMatch(/1\.4–1\.7/);
  });
});

describe('#10 uncertainty band and volume sensitivity follow the headline', () => {
  it('turning on ML data and homologation moves the band, not only the total', () => {
    const off = computeSWProgram(defaultSWProgramInputs());
    const on = computeSWProgram(prog(p => { p.includeMLDataCost = true; p.includeHomologation = true; }));
    expect(on.summary.grandTotal).toBeGreaterThan(off.summary.grandTotal);
    expect(on.monteCarlo.p50).toBeGreaterThan(off.monteCarlo.p50);
    expect(on.monteCarlo.mean - off.monteCarlo.mean).toBeGreaterThan(0.5 * (on.summary.grandTotal - off.summary.grandTotal));
  });
  it('with a 2-year recovery window the band\'s £/vehicle brackets the headline (it showed £639 against £2,043)', () => {
    const r = computeSWProgram(prog(p => { p.costRecoveryYears = 2; }));
    expect(r.monteCarlo.p10PerVehicle).toBeLessThan(r.summary.perVehicle * 1.05);
    expect(r.monteCarlo.p90PerVehicle).toBeGreaterThan(r.summary.perVehicle);
  });
  it('the volume sensitivity row brackets its own base under any recovery window', () => {
    for (const rec of [undefined, 2]) {
      const r = computeSWProgram(prog(p => { if (rec) p.costRecoveryYears = rec; }));
      const row = r.sensitivity.find(x => /Production Volume/.test(x.parameter))!;
      expect(row.low).toBeLessThan(row.base);
      expect(row.high).toBeGreaterThan(row.base);
    }
  });
});
