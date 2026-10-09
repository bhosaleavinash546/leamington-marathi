/**
 * Software costing review — P3 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES, unitCloudGBP, SW_CLOUD_REFERENCE_FLEET, SW_DEFAULT_DEVELOPMENT_MONTHS, validateSWInputs, cocomoNominalPM, SW_COCOMO_EXPONENT, swRateBasis } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';
import * as XLSX from 'xlsx';
import { setSWCurrency, swMoney, swMoneyM, swUnitM } from '../src/ui/panels/sw-currency.js';
import { parseSWRateWorkbook, buildSWRateWorkbook } from '../server/utils/sw-rate-library-xlsx.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-rate-library.js';
import { calibrateSWEffort, modelledEffortPM } from '../src/engine/sw-calibration.js';

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

describe('#18 company SW rate workbook: keys checked, 0 refused, every book versioned', () => {
  const sheet = (rows: unknown[][], name = 'Regions') => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['key', 'value', 'source', 'asOf', 'confidence', 'note'], ...rows]), name);
    return parseSWRateWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  };
  it('a misspelt key is refused and the known keys are named', () => {
    const r = sheet([['Indai', 0.3, 's', '2026-10', 'Low', '']]);
    expect(r.library).toBeNull();
    expect(r.errors.join(' ')).toMatch(/"Indai" is not a known key.*India/);
  });
  it('a 0 multiplier, a £ figure in a multiplier cell and a duplicate are refused', () => {
    expect(sheet([['India', 0, 's', '', 'Low', '']]).errors.join(' ')).toMatch(/greater than 0/);
    expect(sheet([['India', 28000, 's', '', 'Low', '']]).errors.join(' ')).toMatch(/not a £ figure/);
    expect(sheet([['India', 0.3, 's', '', 'Low', ''], ['India', 0.4, 's', '', 'Low', '']]).errors.join(' ')).toMatch(/listed twice/);
  });
  it('a base rate outside the engine\'s range is refused; the built-in book round-trips', () => {
    expect(sheet([['ukBaseRatePerPM', 28, 's', '', 'Low', '']], 'Base').errors.join(' ')).toMatch(/ukBaseRatePerPM must be/);
    expect(validateSWInputs(prog(p => { p.baseRateGBP = 28; })).join(' ')).toMatch(/base rate must be £1,000/);   // engine, same range
    const rt = parseSWRateWorkbook(buildSWRateWorkbook(DEFAULT_SW_RATE_LIBRARY));
    expect(rt.errors).toEqual([]);
  });
  it('upload, source switch and reset record the resolved SW book; versions can be listed and read back', () => {
    const r = src('server/routes/rate-library.ts');
    expect(r.match(/snapshotSWActive\(/g)!.length).toBe(4);            // definition + upload + source + reset
    expect(r).toMatch(/router\.get\('\/sw\/versions'/);
    expect(r).toMatch(/router\.get\('\/sw\/versions\/:id'/);
  });
});

describe('#15 the software results follow the page\'s display currency', () => {
  it('converts £ at the page\'s rate and symbol', () => {
    setSWCurrency('EUR', '€', 1.17);
    expect(swMoney(1000, 0)).toBe('€1,170');
    expect(swMoneyM(393_300_000)).toBe('€460.2M');
    expect(swUnitM()).toBe('€M');
    setSWCurrency('GBP', '£', 1);
    expect(swMoneyM(393_300_000)).toBe('£393.3M');
  });
  it('no result or export in the panel prints a literal £; only inputs and the AI brief (engine £) do', () => {
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    const lines = ui.split('\n');
    const aiStart = lines.findIndex(l => /Per Vehicle: £\$\{Math\.round/.test(l)) - 15;
    const offenders = lines.map((l, i) => [i + 1, l] as const).filter(([i, l]) =>
      /£/.test(l) && !/^\s*(\/\/|\*|\/\*\*)/.test(l)                // comments
      && !/UK base rate £\/PM|UK Base Rate \(£\/PM\)/.test(l)          // inputs hold £ (money rule)
      && !/unit === '£M'|unit\.replace\('£'/.test(l)                  // engine unit key / its conversion
      && !/per £ \(the engine prices in £/.test(l)                       // the Excel's own currency note
      && !(i > aiStart && i < aiStart + 40)                              // AI brief: engine figures in £
      && !/desc: '/.test(l));                                            // demo prose
    expect(offenders.map(([i, l]) => `${i}: ${l.trim().slice(0, 80)}`)).toEqual([]);
  });
  it('the page currency picker drives it', () => {
    expect(src('src/ui/main.ts')).toMatch(/applySWCurrency\(cur, sym, _displayFxRate\)/);
  });
});

describe('#16 optional size-based effort (COCOMO II.2000, nominal)', () => {
  const one = (id: string, mut: (m: SWProgramInputs['modules'][number]) => void = () => {}, pm: (p: SWProgramInputs) => void = () => {}) => {
    const p = prog(q => { q.modules = q.modules.map(m => ({ ...m, enabled: m.moduleId === id })); pm(q); });
    mut(p.modules.find(m => m.moduleId === id)!);
    return computeSWProgram(p).modules.find(m => m.moduleId === id)!;
  };
  it('the published nominal equation: PM = 2.94 × KSLOC^1.0997', () => {
    expect(SW_COCOMO_EXPONENT).toBeCloseTo(1.0997, 10);
    expect(cocomoNominalPM(1)).toBeCloseTo(2.94, 10);
    expect(cocomoNominalPM(100)).toBeCloseTo(2.94 * Math.pow(100, 1.0997), 8);   // ≈ 465.3 PM
  });
  it('a size replaces the catalogue\'s nominal PM, and ASIL / complexity / reuse act on it exactly as before', () => {
    // At QM, Medium, Fresh the costed development PM is the nominal PM × the dev-bucket mix, the same for both paths.
    const nominal = (m: ReturnType<typeof one>) => m.personMonths;
    const cat = one('gateway_ecu', m => { m.asil = 'QM'; m.complexity = 'Medium'; m.reuse = 'Fresh'; });
    const sized = one('gateway_ecu', m => { m.asil = 'QM'; m.complexity = 'Medium'; m.reuse = 'Fresh'; m.sizeKSLOC = 40; });
    const def = SW_MODULES.find(d => d.id === 'gateway_ecu')!;
    expect(nominal(sized) / nominal(cat)).toBeCloseTo(cocomoNominalPM(40) / def.basePersonMonths, 1);
    expect(sized.effortBasis).toBe('size');
    expect(cat.effortBasis).toBe('catalogue');
    const sizedD = one('gateway_ecu', m => { m.asil = 'D'; m.complexity = 'Medium'; m.reuse = 'Fresh'; m.sizeKSLOC = 40; });
    const catD = one('gateway_ecu', m => { m.asil = 'D'; m.complexity = 'Medium'; m.reuse = 'Fresh'; });
    expect(sizedD.development.total / sized.development.total).toBeCloseTo(catD.development.total / cat.development.total, 6);
  });
  it('a custom PM still wins; the calibration factor scales the size path too', () => {
    expect(one('gateway_ecu', m => { m.sizeKSLOC = 40; m.customPersonMonths = 10; }).effortBasis).toBe('custom');
    const a = one('gateway_ecu', m => { m.sizeKSLOC = 40; });
    const b = one('gateway_ecu', m => { m.sizeKSLOC = 40; }, p => { p.effortCalibration = 1.25; });
    expect(b.development.total / a.development.total).toBeCloseTo(1.25, 10);
  });
  it('calibration compares sized actuals against the size path', () => {
    const m = modelledEffortPM({ moduleId: 'rtos', asil: 'B', complexity: 'Medium', reuse: 'Fresh', sizeKSLOC: 20 });
    const fit = calibrateSWEffort([{ moduleId: 'rtos', asil: 'B', complexity: 'Medium', reuse: 'Fresh', sizeKSLOC: 20, actualPersonMonths: m * 1.3 }]);
    expect(fit.factor).toBeCloseTo(1.3, 10);
    expect(m).not.toBeCloseTo(modelledEffortPM({ moduleId: 'rtos', asil: 'B', complexity: 'Medium', reuse: 'Fresh' }), 0);
  });
  it('a bad size is refused; the screen and the rate basis show the path', () => {
    expect(validateSWInputs(prog(p => { p.modules[0].sizeKSLOC = -5; })).join(' ')).toMatch(/size must be/);
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/class="sw-ksloc-input"/);
    const rows = swRateBasis(prog(p => { p.modules[0].sizeKSLOC = 30; }));
    expect(rows.find(([k]) => /Nominal effort basis/.test(k))![1]).toMatch(/1 COCOMO II size/);
  });
});

describe('B19 the AI "no key" notice is not cached as an answer', () => {
  it('the route flags the notice; the panel caches only real replies', async () => {
    const saved = { key: process.env.ANTHROPIC_API_KEY, gap: process.env.AIR_GAPPED };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.AIR_GAPPED;
    try {
      const express = (await import('express')).default;
      const router = (await import('../server/routes/aichat.js')).default;
      const app = express(); app.use(express.json()); app.use('/api/aichat', router);
      const srv = app.listen(0);
      const port = (srv.address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${port}/api/aichat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
      const b = await r.json() as { reply?: string; aiUnavailable?: boolean };
      srv.close();
      expect(b.reply).toMatch(/requires an Anthropic API key/);
      expect(b.aiUnavailable).toBe(true);
    } finally {
      if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.gap !== undefined) process.env.AIR_GAPPED = saved.gap;
    }
    expect(src('src/ui/panels/sw-should-cost-ui.ts')).toMatch(/if \(data\.reply && !data\.aiUnavailable\) _aiCache\.set/);
  }, 30_000);
});
