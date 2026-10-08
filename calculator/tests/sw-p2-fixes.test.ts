/**
 * Software costing review — P2 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, validateSWInputs, SWInputError, SW_MODULES, unitRoyaltyGBP, CYBER_UPLIFT_BY_CAL, calFor, devSourceComparison } from '../src/engine/sw-should-cost.js';
import { USD_PER_GBP } from '../src/engine/gear-heat-treat-data.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { runValidation } from '../src/engine/sw-validation.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-rate-library.js';

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

describe('#11 per-vehicle royalties scale with volume', () => {
  const def = (id: string) => SW_MODULES.find(m => m.id === id)!;
  const only = (id: string, vol: number, life = 10) => prog(p => {
    p.modules = p.modules.map(m => ({ ...m, enabled: m.moduleId === id }));
    if (!p.modules.some(m => m.moduleId === id)) p.modules.push({ moduleId: id, enabled: true } as SWProgramInputs['modules'][number]);
    p.annualProductionVolume = vol; p.programLifeYears = life; p.discountRatePct = 0;
  });
  const lic = (id: string, vol: number, life = 10) =>
    computeSWProgram(only(id, vol, life)).modules.find(m => m.moduleId === id)!.licensingCost;

  it('the three royalty modules carry a per-unit figure, no flat IP fee, and a stated basis', () => {
    expect(def('ivi_os').perVehicleRoyaltyGBP).toBeCloseTo(25 / USD_PER_GBP, 2);
    expect(def('voice_assistant').perVehicleRoyaltyGBP).toBe(15);
    expect(def('navigation').perVehiclePerYearGBP).toBe(11.5);
    for (const id of ['ivi_os', 'voice_assistant', 'navigation']) {
      expect(def(id).annualIPLicenceGBP).toBe(0);
      expect(def(id).royaltyBasis).toMatch(/Unsourced estimate/);
    }
  });

  it('a built-vehicle royalty is volume × life × rate (no discount)', () => {
    expect(lic('voice_assistant', 80_000)).toBeCloseTo(80_000 * 10 * 15, 0);
    expect(lic('voice_assistant', 160_000)).toBeCloseTo(2 * lic('voice_assistant', 80_000), 0);
  });

  it('map data is paid on the fleet in service: volume × Σt × rate', () => {
    // 3 years: fleet 1×, 2×, 3× the annual volume → 6 vehicle-years per annual vehicle
    expect(lic('navigation', 10_000, 3)).toBeCloseTo(10_000 * 6 * 11.5, 0);
  });

  it('a royalty is per vehicle — not apportioned by the platform volume', () => {
    const base = only('voice_assistant', 50_000);
    const shared = { ...base, platformAnnualVolume: 200_000 };
    const a = computeSWProgram(base).modules.find(m => m.moduleId === 'voice_assistant')!;
    const b = computeSWProgram(shared).modules.find(m => m.moduleId === 'voice_assistant')!;
    expect(b.licensingCost).toBeCloseTo(a.licensingCost, 0);           // royalty only; whole licence is per-unit
    expect(b.totalNonRecurring).toBeLessThan(a.totalNonRecurring);                       // the engineering is still shared
  });

  it('discounting applies year by year', () => {
    const d = def('voice_assistant');
    const v = unitRoyaltyGBP(d, { annualProductionVolume: 1000, programLifeYears: 2, discountRatePct: 10 });
    expect(v).toBeCloseTo(1000 * 15 / 1.1 + 1000 * 15 / 1.21, 4);
  });
});

describe('#12 cybersecurity uplift follows the ISO/SAE 21434 CAL, not the ASIL', () => {
  const one = (id: string, mut: (m: SWProgramInputs['modules'][number]) => void = () => {}) => {
    const p = prog(q => { q.modules = q.modules.map(m => ({ ...m, enabled: m.moduleId === id })); });
    mut(p.modules.find(m => m.moduleId === id)!);
    return computeSWProgram(p).modules.find(m => m.moduleId === id)!;
  };
  const devTotal = (r: ReturnType<typeof one>) => r.development.total;

  it('the QM infotainment OS (network attack vector) now gets the top uplift', () => {
    const r = one('ivi_os');
    expect(r.asilUsed).toBe('QM');
    expect(r.calUsed).toBe('CAL4');
    expect(r.cybersecCost / devTotal(r)).toBeCloseTo(0.14, 10);     // was 8 % (keyed on QM)
  });

  it('changing the ASIL no longer changes the cyber share; changing the CAL does', () => {
    const qm = one('tcu_software', m => { m.asil = 'QM'; });
    const d  = one('tcu_software', m => { m.asil = 'D'; });
    expect(qm.cybersecCost / devTotal(qm)).toBeCloseTo(d.cybersecCost / devTotal(d), 10);
    const c1 = one('tcu_software', m => { m.cal = 'CAL1'; });
    expect(c1.cybersecCost / devTotal(c1)).toBeCloseTo(CYBER_UPLIFT_BY_CAL.CAL1, 10);
  });

  it('a module with no cyber goal can be given a CAL, and gains the uplift and a pen-test slice', () => {
    const none = one('navigation');
    expect(none.calUsed).toBe('none');
    expect(none.cybersecCost).toBe(0);
    expect(none.testing.penTest).toBe(0);
    const c3 = one('navigation', m => { m.cal = 'CAL3'; });
    expect(c3.cybersecCost / devTotal(c3)).toBeCloseTo(0.10, 10);
    expect(c3.testing.penTest).toBeGreaterThan(0);
  });

  it('every cyber module has a CAL; an unknown CAL is refused', () => {
    for (const d of SW_MODULES) expect(calFor(d, {}) !== 'none', d.id).toBe(d.hasCybersecRequirement);
    expect(validateSWInputs(prog(p => { (p.modules[0] as { cal?: string }).cal = 'CAL5'; })).join(' ')).toMatch(/CAL/);
  });

  it('the advanced table offers a CAL per module', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/sw-cal-sel/);
  });
});

describe('#13 the screen shows what was costed — active book, country, dev-source table', () => {
  const company = {
    version: 'ACME-1',
    devSourceMultipliers: { ...DEFAULT_SW_RATE_LIBRARY.devSourceMultipliers,
      Tier1_Supplier: { ...DEFAULT_SW_RATE_LIBRARY.devSourceMultipliers.Tier1_Supplier, value: 0.5 } },
  } as SWProgramInputs['rateLibrary'];

  it('dev-source rows are the programme re-costed with each source, exactly', () => {
    const p = prog();
    for (const row of devSourceComparison(p)) {
      const direct = computeSWProgram({ ...p, devSource: row.devSource }).summary;
      expect(row.grandTotal).toBeCloseTo(direct.grandTotal, 4);
      expect(row.perVehicle).toBeCloseTo(direct.perVehicle, 8);
    }
  });

  it('dev-source rows follow a company book\'s multiplier (the screen had 0.88 hard-coded)', () => {
    const rows = devSourceComparison(prog(p => { p.rateLibrary = company; }));
    expect(rows.find(r => r.devSource === 'Tier1_Supplier')!.multiplier).toBe(0.5);
    const builtIn = devSourceComparison(prog()).find(r => r.devSource === 'Tier1_Supplier')!;
    expect(rows.find(r => r.devSource === 'Tier1_Supplier')!.grandTotal).toBeLessThan(builtIn.grandTotal);
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).not.toMatch(/srcMult: 0\.88|=== 'Tier1_Supplier' \? 0\.88/);
  });

  it('validation runs in the book it is given', () => {
    const a = runValidation();
    const b = runValidation(undefined, undefined, company);
    const t1 = (r: typeof a) => r.cases.map(c => c.modelledTotalGBP);
    expect(t1(b)).not.toEqual(t1(a));     // the cases include Tier-1 programmes, so the company multiplier shows
  });

  it('the page country moves the inputs and both hub pickers (not just the advanced drop-down)', () => {
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/export function applySWCountry/);
    expect(ui).toMatch(/\['sw-region', 'wiz-region'\]/);
    expect(src('src/ui/main.ts')).toMatch(/applySWCountry\(region\)/);
    expect(ui).toMatch(/runValidation\(undefined, undefined, _swInputs\.rateLibrary\)/);
    expect(ui).toMatch(/resolveRateLibrary\(_swInputs\.rateLibrary\)/);
  });
});
