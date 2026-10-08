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
