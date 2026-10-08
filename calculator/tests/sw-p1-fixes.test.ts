/**
 * Software costing review — P1 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix; each pins the behaviour the fix established.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, SW_DEFAULT_OVERHEAD } from '../src/engine/sw-should-cost.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('#3 one overhead default (1.15 — the 1.55–1.62 demos counted benefits twice)', () => {
  it('the engine default, every vehicle demo and the screen fallback are the same constant', () => {
    expect(defaultSWProgramInputs().overheadMultiplier).toBe(SW_DEFAULT_OVERHEAD);
    for (const d of SW_VEHICLE_DEMOS) expect(buildVehicleInputs(d).overheadMultiplier, d.id).toBe(SW_DEFAULT_OVERHEAD);
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).not.toMatch(/\|\|\s*1\.6/);
    expect(ui).not.toMatch(/1\.6 is typical/);
  });
  it('the report scripts use it too', () => {
    for (const f of ['scripts/gen-sw-report.ts', 'scripts/gen-l460-deepdive.ts', 'scripts/gen-allmodels-deepdive.ts']) {
      expect(src(f), f).not.toMatch(/(overhead|oh):\s*1\.(55|58|6)/);
    }
  });
});

import { baseRateOverride } from '../src/ui/panels/sw-rate-field.js';
import { swLibraryBaseRate, DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-should-cost.js';

describe('#2 a company rate book is honoured (base rate and vehicle demos)', () => {
  const company = { ukBaseRatePerPM: { ...DEFAULT_SW_RATE_LIBRARY.ukBaseRatePerPM, value: 35_000, source: 'company book' } };
  it('an untyped base-rate field is not an override; a typed one is', () => {
    expect(baseRateOverride('28000', false)).toBeUndefined();
    expect(baseRateOverride('31000', true)).toBe(31_000);
    expect(baseRateOverride('', true)).toBeUndefined();
    expect(baseRateOverride('-5', true)).toBeUndefined();
  });
  it('with no override the company base rate drives the cost', () => {
    const p = { ...defaultSWProgramInputs(), rateLibrary: company };
    expect(swLibraryBaseRate(p)).toBe(35_000);
    const builtIn = computeSWProgram(defaultSWProgramInputs()).summary.totalDevelopment;
    expect(computeSWProgram(p).summary.totalDevelopment / builtIn).toBeCloseTo(35_000 / 28_000, 6);
  });
  it('a vehicle demo keeps the active rate book (it was dropped)', () => {
    const d = SW_VEHICLE_DEMOS[0];
    expect(buildVehicleInputs(d, company).rateLibrary).toBe(company);
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/buildVehicleInputs\(v, _swInputs\.rateLibrary\)/);
  });
});

describe('#7 no invented savings on the software screen', () => {
  const ui = src('src/ui/panels/sw-should-cost-ui.ts');
  it('no rule-of-thumb saving percentages in the insights', () => {
    for (const s of ['30–50%', '25–35%', '+15%', '~40%', 'is the main driver', 'is healthy', 'Typical for an OEM']) expect(ui, s).not.toContain(s);
  });
  it('the lifecycle insight names the bucket that actually leads', () => {
    expect(ui).toMatch(/The largest lifecycle bucket is \$\{lifeTop\.name\}/);
  });
  it('the AI narrative is told not to add numbers and is no longer asked for savings', () => {
    expect(ui).not.toMatch(/with estimated savings/);
    expect(ui).toMatch(/Do NOT state any saving, percentage or amount that is not in the data above/);
  });
});
