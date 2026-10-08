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

import { SW_PUBLISHED_PROGRAMMES, hasVerifiedBenchmark } from '../src/engine/sw-benchmarks.js';
import { SW_VALIDATION_CASES } from '../src/engine/sw-validation.js';

describe('#6 published benchmark figures: one list, labelled unverified, no peer claim', () => {
  it('the engine table and the validation read the same list and the same source names', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    const published = r.benchmarks.filter(b => b.vehicle !== 'This programme');
    expect(published.map(b => b.source)).toEqual(SW_PUBLISHED_PROGRAMMES.map(p => p.source));
    expect(SW_VALIDATION_CASES.map(c => c.source)).toEqual(SW_PUBLISHED_PROGRAMMES.map(p => p.source));
  });
  it('every published figure is marked unverified until it carries a link', () => {
    for (const p of SW_PUBLISHED_PROGRAMMES) expect(p.verified || !p.sourceUrl).toBe(!p.verified ? true : !!p.sourceUrl);
    expect(hasVerifiedBenchmark()).toBe(false);
    expect(computeSWProgram(defaultSWProgramInputs()).benchmarks.filter(b => b.vehicle !== 'This programme').every(b => !b.verified)).toBe(true);
  });
  it('the peer-median insight compares only verified figures, and the table says Unverified', () => {
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/b\.vehicle !== 'This programme' && b\.verified/);
    expect(ui).toMatch(/Unverified/);
    expect(ui).not.toMatch(/Figures are industry estimates ±20%/);
  });
});

import { SW_MODULES } from '../src/engine/sw-should-cost.js';

describe('#1 base effort is NOMINAL (QM, Medium, fresh) — one definition, no second ASIL / complexity', () => {
  it('at QM, Medium complexity and fresh code the costed effort is exactly the base person-months', () => {
    const p = defaultSWProgramInputs();
    p.modules = p.modules.map(m => ({ ...m, enabled: m.moduleId === 'bms_core', asil: 'QM' as const, complexity: 'Medium' as const, reuse: 'Fresh' as const }));
    const r = computeSWProgram(p);
    const m = r.modules[0];
    const ratePerPM = 28_000 * 1 * 1 * (0.5 * 1.2 + 0.5 * 0.75) * p.overheadMultiplier;
    expect(m.development.total / ratePerPM).toBeCloseTo(SW_MODULES.find(d => d.id === 'bms_core')!.basePersonMonths, 9);
  });
  it('the field definition says nominal, matching the engine and docs/auto-sw-cost.md', () => {
    expect(src('src/engine/sw-should-cost.ts')).not.toMatch(/at listed ASIL\/complexity$/m);
    expect(src('src/engine/sw-should-cost.ts')).toMatch(/NOMINAL effort, person-months: fresh development at QM and Medium complexity/);
    expect(src('docs/auto-sw-cost.md')).toMatch(/effortPM\s+= basePersonMonths × reuse/);
  });
});

import { ASIL_DEV_MULT, ASIL_TEST_MULT } from '../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY as LIB } from '../src/engine/sw-rate-library.js';

describe('#20 ASIL uplift: one sourced factor on total effort (×1.82 at D), not dev × test compounding', () => {
  const moduleCost = (asil: 'QM' | 'B' | 'D') => {
    const p = defaultSWProgramInputs();
    p.includeMaintenanceCost = false; p.includeCloudCost = false;
    p.modules = p.modules.map(m => ({ ...m, enabled: m.moduleId === 'bms_core', asil }));
    const m = computeSWProgram(p).modules[0];
    return m.development.total + m.testing.total + m.integrationCost + m.calibrationCost;   // effort-driven buckets
  };
  it('an ASIL-D module costs 1.82× its QM self (it was ~10×) and ASIL-B 1.40×', () => {
    expect(moduleCost('D') / moduleCost('QM')).toBeCloseTo(1.82, 6);
    expect(moduleCost('B') / moduleCost('QM')).toBeCloseTo(1.40, 6);
  });
  it('testing stays the module\'s own fraction of development at every ASIL', () => {
    expect(Object.values(ASIL_TEST_MULT).every(v => v === 1)).toBe(true);
  });
  it('every non-baseline factor names its source or says it is interpolated, with Low confidence', () => {
    for (const k of ['A', 'B', 'C', 'D'] as const) {
      const e = LIB.asilDevMultipliers[k];
      expect(e.source, k).toMatch(/solcept\.ch|Interpolated/);
      expect(e.confidence).toBe('Low');
    }
    expect(ASIL_DEV_MULT.D).toBe(1.82);
  });
});

describe('#4 ICE and hybrid powertrain software exists — as labelled estimates', () => {
  const NEW = ['engine_control', 'transmission_control', 'aftertreatment_obd', 'hybrid_supervisor', 'mhev_48v'];
  const FIELDS = ['basePersonMonths', 'testingFractionBase', 'integrationFractionBase', 'maintenancePctPerYear',
    'annualToolLicenceGBP', 'annualIPLicenceGBP', 'annualCloudCostGBP', 'calibrationFractionBase'] as const;
  it('each new module copies every number from the analogue it names, and is default-off', () => {
    for (const id of NEW) {
      const m = SW_MODULES.find(d => d.id === id)!;
      expect(m, id).toBeTruthy();
      expect(m.defaultEnabled).toBe(false);
      const analogueId = m.estimateBasis!.split(' ')[0];
      const a = SW_MODULES.find(d => d.id === analogueId)!;
      expect(a, `${id} → ${analogueId}`).toBeTruthy();
      for (const f of FIELDS) expect(m[f], `${id}.${f}`).toBe(a[f]);
    }
  });
  it('adding them does not move the default (BEV-scoped) programme', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    expect(r.modules.some(m => NEW.includes(m.moduleId))).toBe(false);
  });
  it('the screen labels them "estimate"', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/def\.estimateBasis \? .*estimate<\/span>/);
  });
});

import { applyPowertrainScope, SW_POWERTRAIN_SCOPE, SW_POWERTRAIN_MODULE_IDS, attributedShare } from '../src/engine/sw-should-cost.js';
import type { SWPowertrain } from '../src/engine/sw-should-cost.js';

describe('#5 powertrain is an engine input; shared software is apportioned across variants', () => {
  const on = (pt: SWPowertrain) => applyPowertrainScope(defaultSWProgramInputs().modules, pt)
    .filter(m => m.enabled && SW_POWERTRAIN_MODULE_IDS.has(m.moduleId)).map(m => m.moduleId).sort();
  it('each drivetrain carries its own powertrain software (ICE carried none)', () => {
    expect(on('ICE')).toEqual(['aftertreatment_obd', 'engine_control', 'transmission_control']);
    expect(on('MHEV')).toEqual(['aftertreatment_obd', 'engine_control', 'hybrid_supervisor', 'mhev_48v', 'regen_braking', 'thermal_mgmt', 'transmission_control']);
    expect(on('PHEV')).toContain('engine_control');
    expect(on('PHEV')).toContain('bms_core');
    expect(on('PHEV')).toContain('hybrid_supervisor');
    expect(on('BEV')).not.toContain('engine_control');
    expect(on('BEV')).toContain('inverter_ctrl');
  });
  it('the scope touches only powertrain modules — an engineer\'s other choices survive', () => {
    const base = defaultSWProgramInputs().modules.map(m => m.moduleId === 'ivi_os' ? { ...m, enabled: false } : m);
    expect(applyPowertrainScope(base, 'ICE').find(m => m.moduleId === 'ivi_os')!.enabled).toBe(false);
  });
  it('on one car, a PHEV (two powertrains + hybrid control) now costs more than the BEV, and ICE carries engine software', () => {
    const car = (pt: SWPowertrain) => {
      const b = defaultSWProgramInputs();
      return computeSWProgram({ ...b, region: 'UK', devSource: 'Tier1_Supplier', programLifeYears: 8, annualProductionVolume: 75_000,
        teamSeniorFraction: 0.55, powertrain: pt, modules: applyPowertrainScope(b.modules, pt) }).summary;
    };
    expect(car('ICE').byCategory.A).toBeGreaterThan(0);
    expect(car('PHEV').grandTotal).toBeGreaterThan(car('BEV').grandTotal);
  });
  it('with a platform volume, shared software is attributed by volume share; powertrain software is not', () => {
    const vol = 75_000;
    expect(attributedShare('ivi_os', { annualProductionVolume: vol, platformAnnualVolume: 4 * vol })).toBeCloseTo(0.25, 12);
    expect(attributedShare('engine_control', { annualProductionVolume: vol, platformAnnualVolume: 4 * vol })).toBe(1);
    expect(attributedShare('ivi_os', { annualProductionVolume: vol })).toBe(1);
    const p = { ...defaultSWProgramInputs(), annualProductionVolume: vol };
    const solo = computeSWProgram(p).modules.find(m => m.moduleId === 'ivi_os')!;
    const shared = computeSWProgram({ ...p, platformAnnualVolume: 4 * vol }).modules.find(m => m.moduleId === 'ivi_os')!;
    expect(shared.grandTotal / solo.grandTotal).toBeCloseTo(0.25, 12);
    // its £/vehicle is the whole module spread over the whole platform
    expect(shared.perVehicle).toBeCloseTo(solo.grandTotal / (4 * vol * p.programLifeYears), 6);
  });
  it('every vehicle demo declares its powertrain and is scoped by the engine', () => {
    for (const d of SW_VEHICLE_DEMOS) {
      const inp = buildVehicleInputs(d);
      expect(inp.powertrain, d.id).toBe(d.powertrain);
      for (const id of SW_POWERTRAIN_MODULE_IDS) {
        expect(inp.modules.find(m => m.moduleId === id)!.enabled, `${d.id}:${id}`).toBe(SW_POWERTRAIN_SCOPE[d.powertrain].on.includes(id));
      }
    }
  });
  it('the wizard and the report scripts use the engine scope (no private copies)', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/SW_POWERTRAIN_SCOPE\[_wizPowertrain\]\.on\.includes/);
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).not.toMatch(/MHEV_DISABLED|_ICE_OFF/);
    for (const f of ['scripts/gen-sw-report.ts', 'scripts/gen-l460-deepdive.ts', 'scripts/gen-allmodels-deepdive.ts']) {
      expect(src(f), f).toMatch(/applyPowertrainScope/);
      expect(src(f), f).not.toMatch(/MHEV_DISABLED|ICE_DISABLED|dis:MHEV/);
    }
    expect(src('scripts/gen-sw-report.ts')).not.toMatch(/D:3\.2/);
  });
});

describe('#5 follow-through: demos keep their premium-trim modules', () => {
  it('a demo still includes every non-powertrain module it does not disable (premium-trim included)', () => {
    for (const d of SW_VEHICLE_DEMOS) {
      const inp = buildVehicleInputs(d);
      for (const m of inp.modules) if (!SW_POWERTRAIN_MODULE_IDS.has(m.moduleId)) expect(m.enabled, `${d.id}:${m.moduleId}`).toBe(!d.disabledModules.includes(m.moduleId));
    }
  });
});

describe('static reports are labelled as pre-fix', () => {
  it('the panel says the report pages pre-date the October 2026 fixes', () => {
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/static reports generated before the\s+October 2026 model fixes/);
  });
});

describe('#5 switching powertrain re-scopes cleanly', () => {
  it('PHEV then BEV gives the same modules as BEV directly (the PHEV de-rating used to stick)', () => {
    const d = defaultSWProgramInputs().modules;
    const viaPhev = applyPowertrainScope(applyPowertrainScope(d, 'PHEV'), 'BEV');
    expect(viaPhev).toEqual(applyPowertrainScope(d, 'BEV'));
  });
});
