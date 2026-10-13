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
import { compareScenarios, diffInputs, devSourceSet, hubSet, reuseSet } from '../src/engine/sw-scenarios.js';

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

describe('scenarios (cockpit round 2): every row is the engine on its own inputs', () => {
  const base = prog();
  it('the change against the baseline is the difference of two independent costings', () => {
    const india = { ...prog(), region: 'IN' as SWProgramInputs['region'] };
    const rows = compareScenarios([
      { id: 'b', name: 'UK', kind: 'baseline', inputs: base },
      { id: 'i', name: 'India', kind: 'saved', inputs: india },
    ]);
    const a = computeSWProgram(base).summary, b = computeSWProgram(india).summary;
    expect(rows[0].delta).toBeUndefined();
    expect(rows[1].figures!.total).toBeCloseTo(b.grandTotal, 6);
    expect(rows[1].delta!.total).toBeCloseTo(b.grandTotal - a.grandTotal, 6);
    expect(rows[1].delta!.perVehicle).toBeCloseTo(b.perVehicle - a.perVehicle, 6);
    expect(rows[1].differs).toEqual(['hub United Kingdom → India']);
  });
  it('what differs names inputs and counts module changes', () => {
    const p = prog(q => { q.annualProductionVolume = 120_000; q.devSource = 'Tier1_Supplier'; });
    p.modules[0] = { ...p.modules[0], enabled: !p.modules[0].enabled };
    p.modules[1] = { ...p.modules[1], reuse: p.modules[1].reuse === 'Heavy' ? 'Light' : 'Heavy' };
    const d = diffInputs(base, p);
    expect(d).toContain('source in-house → Tier-1 supplier');
    expect(d).toContain('volume 80,000 / yr → 120,000 / yr');
    expect(d.some(x => /^[+−]1 module/.test(x))).toBe(true);
    expect(d).toContain('reuse changed on 1 module');
    expect(diffInputs(base, prog())).toEqual([]);
  });
  it('a scenario the engine refuses keeps its row with the reason', () => {
    const rows = compareScenarios([{ id: 'b', name: 'b', kind: 'baseline', inputs: base }, { id: 'x', name: 'bad', kind: 'saved', inputs: prog(q => { q.annualProductionVolume = 0; }) }]);
    expect(rows[1].figures).toBeUndefined();
    expect(rows[1].error).toMatch(/volume/);
  });
  it('generated sets: three sources, the current hub first, a typed rate never travels to another hub', () => {
    expect(devSourceSet(base).map(x => x.inputs.devSource)).toEqual(['OEM_Internal', 'Tier1_Supplier', 'Startup_OSS']);
    const typed = prog(q => { q.baseRateGBP = 9000; });
    const hubs = hubSet(typed);
    expect(hubs[0].inputs.region).toBe(typed.region);
    expect(hubs[0].inputs.baseRateGBP).toBe(9000);
    expect(hubs.slice(1).every(h => h.inputs.baseRateGBP === undefined && h.inputs.region !== typed.region)).toBe(true);
    expect(new Set(hubs.map(h => h.inputs.region)).size).toBe(hubs.length);
    const reuse = reuseSet(base);
    expect(reuse.map(r => new Set(r.inputs.modules.map(m => m.reuse)).size)).toEqual([1, 1, 1, 1, 1]);
    expect(reuse[0].inputs.modules).not.toBe(base.modules);
  });
});

describe('one input pane, history and shortcuts (cockpit round 2)', () => {
  const ui = readFileSync('src/ui/panels/sw-should-cost-ui.ts', 'utf8');
  const ck = readFileSync('src/ui/panels/sw-cockpit-ui.ts', 'utf8');
  it('the guided wizard is merged into Setup: no second form, no mode switch, one hub picker', () => {
    expect(ui).not.toMatch(/_swMode|sw-guided-body|wiz-region|readWizStep|syncAdvancedFields/);
    expect(ui).toMatch(/domainChipsHTML\(\)/);
  });
  it('scenarios are named inline (no window.prompt) and costed on the current rate book', () => {
    expect(ui).not.toMatch(/\bprompt\(/);
    expect(ui).toMatch(/rateLibrary: _swInputs\.rateLibrary/);
  });
  it('undo restores the inputs into the form and recosts; the rate book is never part of history', () => {
    expect(ui).toMatch(/function snapshotOf[\s\S]{0,120}rateLibrary: _drop/);
    expect(ui).toMatch(/function restoreHistory[\s\S]{0,400}writeInputsToForm\(_swInputs\)[\s\S]{0,120}computeSWProgram/);
    expect(ck).toMatch(/aria-keyshortcuts="Control\+Z Meta\+Z"/);
  });
  it('the shortcuts sheet is a native modal dialog listing every shortcut wired', () => {
    expect(ck).toMatch(/<dialog class="swk-dialog" id="swk-keys" aria-labelledby="swk-keys-h">/);
    for (const k of ['Z', 'Alt+1', '/', 'B', '?', 'Esc']) expect(ck).toContain(k);
    expect(ui).toMatch(/e\.key === '\/'/);
    expect(ui).toMatch(/k === 'b'/);
  });
  it('the vehicle map never sums module £ per component', () => {
    const sk = readFileSync('src/ui/panels/sw-vehicle-skeleton.ts', 'utf8');
    expect(sk).not.toMatch(/money\(l\.cost\)|fmt\(l\.cost\)/);
    expect(ui).not.toMatch(/fM\(l\.cost\)/);
  });
});
