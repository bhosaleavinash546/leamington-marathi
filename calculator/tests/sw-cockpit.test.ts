/**
 * Software costing cockpit (Oct 2026, docs/review/software-costing-cockpit-2026-10.md): the cockpit's views are read
 * off the engine result — the spend profile and unit economics must add back to the programme total, the quote check
 * reads the engine's own loaded rate, and the Monte Carlo histogram holds every trial. The supplier price carries a
 * margin, so a Tier-1 can never come out below the same work in-house.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, swLoadedRate, priceFactors, devSourceComparison } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-rate-library.js';
import { swSpendProfile, swUnitEconomics, swQuoteCheck, swRateCheck } from '../src/engine/sw-cockpit.js';
import { waterfallChart, treemapChart, tornadoChart, distributionChart, spendChart } from '../src/ui/panels/sw-charts.js';
import { COCKPIT_TABS, tabsHTML } from '../src/ui/panels/sw-cockpit-ui.js';

const prog = (f?: (p: SWProgramInputs) => void): SWProgramInputs => { const p = defaultSWProgramInputs(); f?.(p); return p; };
const money = (n: number) => `£${Math.round(n)}`;

describe('spend profile and unit economics reconcile to the programme total', () => {
  for (const [name, f] of [
    ['default', undefined],
    ['shared platform', (p: SWProgramInputs) => { p.platformAnnualVolume = 200_000; }],
    ['short life, India', (p: SWProgramInputs) => { p.programLifeYears = 4; p.region = 'IN' as SWProgramInputs['region']; }],
  ] as const) {
    it(`${name}: Σ years = grand total at 0 % discount; NRE + built + in-service + fixed = total`, () => {
      const r = computeSWProgram(prog(p => { f?.(p); p.discountRatePct = 0; }));
      const sp = swSpendProfile(r);
      expect(sp.nominalTotal).toBeCloseTo(r.summary.grandTotal, -1);
      expect(sp.years.at(-1)!.cumulative).toBeCloseTo(sp.nominalTotal, -1);
      expect(sp.years[sp.sopIndex].phase).toBe('production');
      expect(sp.years.slice(0, sp.sopIndex).reduce((a, y) => a + y.engineering, 0)).toBeCloseTo(r.summary.nreTotal, -1);

      const u = swUnitEconomics(r);
      const life = r.inputs.programLifeYears;
      const rebuilt = u.nre + u.perVehicleBuilt * u.vehiclesBuilt + u.perVehicleYear * u.vehicleYears + u.fixedPerYear * life;
      expect(rebuilt).toBeCloseTo(r.summary.grandTotal, -1);
    });
  }
});

describe('supplier price carries a margin (costing review #2)', () => {
  it('Tier-1 costs more than in-house in the same hub; the factor is efficiency ÷ (1 − margin)', () => {
    const rows = devSourceComparison(prog());
    const inHouse = rows.find(x => x.devSource === 'OEM_Internal')!, t1 = rows.find(x => x.devSource === 'Tier1_Supplier')!;
    expect(t1.grandTotal).toBeGreaterThan(inHouse.grandTotal);
    const m = DEFAULT_SW_RATE_LIBRARY.supplierMargin!.value;
    expect(m).toBe(0.18);
    expect(priceFactors({ OEM_Internal: 1, Tier1_Supplier: 0.88, Startup_OSS: 0.72 }, m).Tier1_Supplier).toBeCloseTo(0.88 / 0.82, 10);
    expect(DEFAULT_SW_RATE_LIBRARY.supplierMargin!.source).toMatch(/ALTEN.*LTTS.*KPIT.*Tata Elxsi/s);
  });
});

describe('quote check', () => {
  const r = computeSWProgram(prog());
  it('reads the engine\'s loaded rate and the NRE gap', () => {
    const q = swQuoteCheck(r, { nreGBP: r.summary.nreTotal * 1.5, perVehicleGBP: 60 });
    expect(q.loadedRatePerPM).toBeCloseTo(swLoadedRate(r.inputs), 6);
    expect(q.nre!.gapPct).toBeCloseTo(50, 6);
    const eng = r.summary.nreTotal * 1.5 - r.summary.totalToolchain - r.summary.totalHomologation;
    expect(q.impliedRatePerPM).toBeCloseTo(eng / r.summary.totalEffortPersonMonths, 6);
    expect(q.perVehicle!.quoted).toBe(60);
  });
  it('a domain quote compares with that domain\'s engineering only', () => {
    const q = swQuoteCheck(r, { byCategory: { A: 1_000_000 } });
    const shouldA = r.modules.filter(m => m.category === 'A').reduce((a, m) => a + m.totalNonRecurring, 0);
    expect(q.byCategory[0].should).toBeCloseTo(shouldA, 6);
    expect(q.nre).toBeUndefined();
  });
  it('rate check states the employment-cost evidence; it never changes the costing', () => {
    const c = swRateCheck(r);
    expect(c.perHour * 152).toBeCloseTo(c.loadedPerPM, 6);
    expect(c.contractDayGBP).toBe(600);
    expect(computeSWProgram(prog()).summary.grandTotal).toBe(r.summary.grandTotal);
  });
});

describe('Monte Carlo distribution', () => {
  const mc = computeSWProgram(prog()).monteCarlo;
  it('the histogram holds every trial; the S-curve is P5…P95 and rises', () => {
    expect(mc.histogram.reduce((a, b) => a + b.count, 0)).toBe(mc.iterations);
    expect(mc.curve).toHaveLength(19);
    for (let i = 1; i < mc.curve.length; i++) expect(mc.curve[i]).toBeGreaterThanOrEqual(mc.curve[i - 1]);
    expect(mc.curve[1]).toBeCloseTo(mc.p10, -3);
  });
});

describe('charts and tabs are accessible markup', () => {
  it('every chart is a named figure with a data table; text never takes the series colour', () => {
    const r = computeSWProgram(prog());
    const sp = swSpendProfile(r);
    const charts = [
      waterfallChart('w', [{ key: 'a', label: 'Development', value: 10, group: 'nre' }, { key: 'b', label: 'Cloud', value: 5, group: 'life' }], 15, money),
      treemapChart('t', r.modules.map(m => ({ key: m.moduleId, label: m.moduleName, value: m.totalLifecycle, group: m.category, groupLabel: m.categoryLabel })), money),
      tornadoChart('o', [{ label: 'Life', low: 8, base: 10, high: 13 }], money),
      distributionChart('d', r.monteCarlo.histogram, { p10: r.monteCarlo.p10, p50: r.monteCarlo.p50, p90: r.monteCarlo.p90, headline: r.summary.grandTotal, headlinePct: r.monteCarlo.headlinePercentile }, money),
      spendChart('s', sp.years.map(y => ({ label: y.label, parts: { engineering: y.engineering, cloud: y.cloud }, total: y.total })), [['engineering', 'Engineering'], ['cloud', 'Cloud']], sp.sopIndex, money),
    ];
    for (const h of charts) {
      expect(h).toMatch(/role="img"|role="figure"|<figure/);
      expect(h).toMatch(/aria-label="[^"]+"|aria-labelledby="([^"]+)"[^>]*><title id="\1">[^<]+</);
      expect(h).toMatch(/<details[^>]*>[\s\S]*Data table[\s\S]*<table/);
      expect(h).not.toMatch(/<text[^>]*fill="var\(--swc-\d\)"/);
    }
  });
  it('tabs follow the WAI-ARIA pattern', () => {
    const h = tabsHTML('overview');
    expect(h).toMatch(/role="tablist"/);
    expect((h.match(/role="tab"/g) ?? []).length).toBe(COCKPIT_TABS.length);
    expect(h).toMatch(/aria-selected="true"[^>]*data-swk-tab="overview"|data-swk-tab="overview"[^>]*aria-selected="true"/);
  });
  it('the cockpit CSS honours reduced motion and has no transition: all', () => {
    const css = readFileSync('src/ui/panels/sw-cockpit-ui.ts', 'utf8') + readFileSync('src/ui/panels/sw-charts.ts', 'utf8');
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
