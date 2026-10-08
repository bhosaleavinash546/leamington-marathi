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
