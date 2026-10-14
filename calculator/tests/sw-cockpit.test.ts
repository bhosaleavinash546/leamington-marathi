/**
 * Software costing cockpit (Oct 2026, docs/review/software-costing-cockpit-2026-10.md): the cockpit's views are read
 * off the engine result — the spend profile and unit economics must add back to the programme total, the quote check
 * reads the engine's own loaded rate, and the Monte Carlo histogram holds every trial. The supplier price carries a
 * margin, so a Tier-1 can never come out below the same work in-house.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs, swLoadedRate, priceFactors, devSourceComparison, SW_DEFAULT_BURDEN, SW_DEFAULT_OVERHEAD, SW_BURDEN_BASIS, swOverhead, maintenanceWeights, SW_MODULES, SW_MC_RANGE_BY_GRADE, validateSWInputs, SW_POST_EOP_YEARS, SW_POST_EOP_SHARE, SW_DEFAULT_SERVICE_YEARS, SW_DEFAULT_DEVELOPMENT_MONTHS } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-rate-library.js';
import { swSpendProfile, swUnitEconomics, swQuoteCheck, swRateCheck, swMakeBuy, swEvidence } from '../src/engine/sw-cockpit.js';
import { waterfallChart, treemapChart, tornadoChart, distributionChart, spendChart, setChartWidth } from '../src/ui/panels/sw-charts.js';
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
      const rebuilt = u.nre + u.perVehicleBuilt * u.vehiclesBuilt + u.subscriptionPerYear * u.subscriptionVehicleYears
        + u.cloudPerYear * u.serviceVehicleYears + u.fixedPerYear * life;
      expect(rebuilt).toBeCloseTo(r.summary.grandTotal, -1);
    });
  }
});

describe('supplier price carries a margin (costing review #2)', () => {
  it('a bought source is priced at its effort ÷ (1 − margin); the margin is the median of six published ESP margins', () => {
    const m = DEFAULT_SW_RATE_LIBRARY.supplierMargin!.value;
    // Open-items round (14 Oct 2026): median of Bertrandt −3.7, EDAG −1.8, ALTEN 8.5, LTTS 14.9, KPIT 21.0, Tata Elxsi 26.3.
    const published = [-3.7, -1.8, 8.5, 14.9, 21.0, 26.3];
    expect(m * 100).toBeCloseTo((published[2] + published[3]) / 2, 6);
    expect(DEFAULT_SW_RATE_LIBRARY.supplierMargin!.source).toMatch(/Bertrandt.*EDAG.*ALTEN.*LTTS.*KPIT.*Tata Elxsi/s);
    expect(priceFactors({ OEM_Internal: 1, Tier1_Supplier: 0.88, Startup_OSS: 0.72 }, m).Tier1_Supplier).toBeCloseTo(0.88 / (1 - m), 10);
    // At the sourced median a Tier-1 lands at about the in-house price (× 0.997) — the efficiency (× 0.88) is unsourced,
    // so the comparison is near break-even, and the re-costed table says so rather than a rule forcing Tier-1 above.
    const rows = devSourceComparison(prog());
    const inHouse = rows.find(x => x.devSource === 'OEM_Internal')!, t1 = rows.find(x => x.devSource === 'Tier1_Supplier')!;
    expect(Math.abs(t1.grandTotal / inHouse.grandTotal - 1)).toBeLessThan(0.01);
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
    expect(c.contractDayGBP).toBe(525);
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

describe('gaps round (Oct 2026): costing structure, burden, evidence, quote', () => {
  it('burden is three stated layers; the overhead is their product; an old saved overhead is honoured', () => {
    const d = prog();
    expect(d.burden).toEqual(SW_DEFAULT_BURDEN);
    expect(swOverhead(d)).toBeCloseTo(1.15 * 1.40, 10);
    expect(SW_DEFAULT_OVERHEAD).toBeCloseTo(1.61, 3);
    const legacy = prog(p => { delete p.burden; p.overheadMultiplier = 1.15; });
    expect(swOverhead(legacy)).toBe(1.15);
    // engineering effort £ scales with the burden; lifecycle royalties do not
    const a = computeSWProgram(legacy).summary, b = computeSWProgram(d).summary;
    expect(b.totalDevelopment / a.totalDevelopment).toBeCloseTo(1.61 / 1.15, 6);
    expect(b.totalLicensing).toBeCloseTo(a.totalLicensing, 0);
    expect(SW_BURDEN_BASIS.employment).toMatch(/Hadzima/);
  });
  it('the quote check compares like with like: £ per vehicle built against the royalty in the piece price', () => {
    const r = computeSWProgram(prog());
    const u = swUnitEconomics(r);
    const q = swQuoteCheck(r, { perVehicleGBP: 25, perVehicleYearGBP: 30, fixedPerYearGBP: 5_000_000 });
    expect(q.perVehicle!.should).toBeCloseTo(u.perVehicleBuilt, 10);
    expect(q.perVehicleYear!.should).toBeCloseTo(u.perVehicleYear, 10);
    expect(q.fixedPerYear!.should).toBeCloseTo(u.fixedPerYear, 10);
  });
  it('target price = should-cost re-costed as a Tier-1; with the supplier PM the gap splits exactly', () => {
    const r = computeSWProgram(prog());
    const q = swQuoteCheck(r, { nreGBP: r.summary.nreTotal * 1.6, quotedPM: r.summary.totalEffortPersonMonths * 1.2 });
    const t1 = computeSWProgram({ ...prog(), devSource: 'Tier1_Supplier' }).summary.nreTotal;
    expect(q.target.nre).toBeCloseTo(t1, 0);
    const g = q.gapSplit!;
    expect(g.effortGap + g.rateGap + g.other).toBeCloseTo(r.summary.nreTotal * 1.6 - q.target.nre, 0);
    expect(Math.abs(g.other)).toBeLessThan(q.target.nre * 1e-6);   // effort PM is rounded to 0.1 per module
    expect(g.effortGap).toBeGreaterThan(0);
  });
  it('make v buy: per domain each source re-costed; buying pays only below (1 − margin) of the in-house effort', () => {
    const mb = swMakeBuy(computeSWProgram(prog()));
    expect(mb.breakEvenEffortShare).toBeCloseTo(1 - DEFAULT_SW_RATE_LIBRARY.supplierMargin!.value, 10);
    // Each domain's Tier-1 figure is the in-house effort × efficiency ÷ (1 − margin) on the hub's rate.
    const f = 0.88 / (1 - DEFAULT_SW_RATE_LIBRARY.supplierMargin!.value);
    for (const row of mb.rows) expect(row.tier1 / row.make).toBeCloseTo(f, 1);
  });
  it('maintenance: development + verification + integration, full for 3 years then the tail, escalated', () => {
    const w = maintenanceWeights({ programLifeYears: 6, postProductionSupportYears: 0 });
    expect(w).toEqual([1, 1, 1, 0.5, 0.5, 0.5]);
    // Post-production security support: the tail × the share, for its years after the last build (R155 post-production).
    const p = maintenanceWeights({ programLifeYears: 6 });
    expect(p).toHaveLength(6 + SW_POST_EOP_YEARS);
    expect(p[6]).toBeCloseTo(0.5 * SW_POST_EOP_SHARE, 10);
    expect(p[6 + SW_POST_EOP_YEARS - 1]).toBeCloseTo(0.5 * SW_POST_EOP_SHARE, 10);
    const e = maintenanceWeights({ programLifeYears: 3, wageEscalationPct: 10 });
    expect(e[2]).toBeCloseTo(1.21, 10);
    expect(e).toHaveLength(3 + SW_POST_EOP_YEARS);
    const r = computeSWProgram(prog());
    const m = r.modules[0];
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    const base = (m.development.total + m.testing.total + m.integrationCost) * def.maintenancePctPerYear / 100;
    expect(m.maintenanceCost).toBeCloseTo(base * maintenanceWeights(r.inputs).reduce((a, b) => a + b, 0), 2);
  });
  it('every £ carries an evidence grade; the lines add to the total; the band widens with unsourced money', () => {
    const r = computeSWProgram(prog());
    const ev = swEvidence(r);
    expect(ev.total).toBeCloseTo(r.summary.grandTotal, 0);
    expect(ev.unsourcedShare).toBeGreaterThan(0.3);                  // the effort catalogue, map £, cloud £, IP licences
    expect(ev.topUnsourced[0].kind).toBeDefined();
    expect(ev.reuse.modulesAtMedium).toBe(ev.reuse.modules);         // the default reuse is stated, not silent
    expect(ev.reuse.removedNRE).toBeGreaterThan(0);
    // entering every module's own PM narrows the band
    const entered = computeSWProgram(prog(p => { p.modules = p.modules.map(m => ({ ...m, customPersonMonths: 50 })); }));
    const spread = (x: typeof r) => (x.monteCarlo.p90 - x.monteCarlo.p10) / x.summary.grandTotal;
    expect(spread(entered)).toBeLessThan(spread(r));
    expect(SW_MC_RANGE_BY_GRADE.unsourced[2]).toBeGreaterThan(SW_MC_RANGE_BY_GRADE.sourced[2]);
  });
  it('the spend profile runs into the service tail and still adds to the total', () => {
    const r = computeSWProgram(prog(p => { p.discountRatePct = 0; }));
    const sp = swSpendProfile(r);
    expect(sp.years.some(y => y.phase === 'service')).toBe(true);
    expect(sp.nominalTotal).toBeCloseTo(r.summary.grandTotal, -1);
  });
  it('map subscription years, service years, fixed cloud and seat price are validated inputs', () => {
    expect(validateSWInputs(prog(p => { p.connectedServiceYears = 0; })).join(' ')).toMatch(/connected-service/);
    expect(validateSWInputs(prog(p => { p.burden = { employmentPct: -5, companyPct: 40, capitalPct: 0 }; })).join(' ')).toMatch(/burden/);
    const a = computeSWProgram(prog()).summary.totalCloud;
    const b = computeSWProgram(prog(p => { p.cloudFixedPerYearGBP = 1_000_000; })).summary.totalCloud;
    expect(b - a).toBeCloseTo(1_000_000 * computeSWProgram(prog()).summary.horizonYears, 0);
  });
});

describe('gaps round (Oct 2026): the UI rules the independent review asked for', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const panels = ['src/ui/panels/sw-should-cost-ui.ts', 'src/ui/panels/sw-cockpit-ui.ts', 'src/ui/panels/sw-charts.ts', 'src/ui/panels/sw-cockpit-views.ts'];
  it('cockpit motion runs on the one system (animations.ts), never a second WAAPI path', () => {
    for (const p of panels) expect(read(p), p).not.toMatch(/\.animate\(/);
    const anim = read('src/ui/animations.ts');
    for (const f of ['swEnter', 'swValueChanged', 'swRevealMarks', 'swMorphMark']) expect(anim).toContain(`export function ${f}`);
  });
  it('one vocabulary: domain names come from the engine; colours from the chart slots', () => {
    const ui = read('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/label: SW_MODULES\.find\(m => m\.category === c\)\?\.categoryLabel/);
    expect(ui).not.toMatch(/'ADAS L2\/L2\+'|'Infotainment & UX'/);
  });
  it('the AI card is hidden when AI is unavailable; legacy sections and the purple button are gone', () => {
    const views = read('src/ui/panels/sw-cockpit-views.ts');
    expect(views).toMatch(/class="swk-card ai-only" id="sw-ai-analysis"/);
    const ui = read('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).not.toMatch(/linear-gradient\(135deg,#7c3aed|sw-cat-breakdown|sw-cost-composition|id="sw-monte-carlo"/);
  });
  it('unverified benchmarks carry no good / bad colour; the rate badge no longer says every rate is sourced', () => {
    const views = read('src/ui/panels/sw-cockpit-views.ts');
    expect(views.slice(views.indexOf('export function benchmarksHTML'), views.indexOf('// ── Insights'))).not.toMatch(/sw-good|sw-bad|is-good|is-bad/);
    expect(read('src/ui/panels/sw-should-cost-ui.ts')).not.toMatch(/every rate sourced &amp;/);
  });
  it('the rail states the unsourced share and speaks a change; the baseline survives a reload; edits are marked', () => {
    const ck = read('src/ui/panels/sw-cockpit-ui.ts');
    expect(ck).toMatch(/rests on unsourced catalogue figures/);
    expect(ck).toMatch(/id="swk-rail-say" aria-live="polite"/);
    const ui = read('src/ui/panels/sw-should-cost-ui.ts');
    // The pinned baseline is a saved project (server for a signed-in user, this browser otherwise), not a browser-only key.
    expect(ui).toMatch(/projectStore\.save\(\{ id, kind: BASELINE_KIND/);
    expect(ui).toMatch(/data-default="\$\{def\.defaultAsil\}"/);
    expect(ui).toMatch(/class="sw-mod-pick"/);
  });
});

describe('independent re-score (Oct 2026): the headline never sits outside its own band', () => {
  for (const region of ['UK', 'IN', 'DE', 'US-CA', 'CN'] as const) it(`${region}: P10 ≤ headline ≤ P90, total and per vehicle`, () => {
    const r = computeSWProgram(prog(p => { p.region = region as SWProgramInputs['region']; }));
    const mc = r.monteCarlo;
    expect(mc.p10).toBeLessThanOrEqual(r.summary.grandTotal);
    expect(mc.p90).toBeGreaterThanOrEqual(r.summary.grandTotal);
    expect(mc.p10PerVehicle).toBeLessThanOrEqual(r.summary.perVehicle);
    expect(mc.headlinePercentile).toBeGreaterThanOrEqual(10);
  });
});

describe('open-items round (14 Oct 2026): sourced defaults, post-production support, reflowing charts', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('defaults follow the re-checked sources: 8-year connected service, 54-month development', () => {
    expect(SW_DEFAULT_SERVICE_YEARS).toBe(8);                   // GM OnStar Basics 8, Tesla 8, Toyota ≤10, Mercedes US 5
    expect(SW_DEFAULT_DEVELOPMENT_MONTHS).toBe(54);             // Volkswagen's stated cycle (IAA 2023)
    const basis = read('src/engine/sw-should-cost.ts');
    expect(basis).toMatch(/OnStar Basics 8 yr/);
    expect(basis).toMatch(/AWS IoT FleetWise/);                // the only priced cloud anchor, and its closure
    expect(basis).toMatch(/closed to new customers 30 Apr 2026/);
  });
  it('security support runs after the last build, graded unsourced, and moves the total by exactly its stream', () => {
    const p = prog();
    const r = computeSWProgram(p);
    const none = computeSWProgram({ ...p, postProductionSupportYears: 0 });
    expect(r.summary.horizonYears).toBeGreaterThanOrEqual(p.programLifeYears + SW_POST_EOP_YEARS);
    const post = r.modules.reduce((a, m) => a + m.yearly.maintenance.slice(p.programLifeYears).reduce((x, v) => x + v, 0), 0);
    expect(post).toBeGreaterThan(0);
    expect(r.summary.grandTotal - none.summary.grandTotal).toBeCloseTo(post, 0);
    const ev = swEvidence(r);
    const lines = ev.lines.filter(l => l.kind === 'postSupport');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(l => l.grade === 'unsourced' && /R155/.test(l.basis))).toBe(true);
    expect(Object.values(ev.byGrade).reduce((a, b) => a + b, 0)).toBeCloseTo(r.summary.grandTotal, 0);
    expect(ev.topUnsourced.some(t => t.kind === 'postSupport' && /after the last build/.test(t.label))).toBe(true);
    // A typed share is the user's figure; maintenance off = no post-production stream either.
    expect(swEvidence(computeSWProgram({ ...p, postProductionSupportShare: 0.4 })).lines.find(l => l.kind === 'postSupport')!.grade).toBe('entered');
    const off = computeSWProgram({ ...p, includeMaintenanceCost: false });
    expect(off.modules.every(m => m.yearly.maintenance.every(v => v === 0))).toBe(true);
    expect(validateSWInputs({ ...p, postProductionSupportYears: 40 }).join(' ')).toMatch(/after the last build/);
    expect(r.sensitivity.some(x => /Security support after the last build/.test(x.parameter))).toBe(true);
  });
  it('the spend profile and unit economics still reconcile to the total with the post-production years', () => {
    const r = computeSWProgram(prog());
    const sp = swSpendProfile(r);
    expect(sp.years.reduce((a, y) => a + y.total, 0)).toBeCloseTo(r.summary.grandTotal, 0);
  });
  it('charts redraw at the card width on a narrow screen; labels move above the bars, nothing is cut', () => {
    const money = (n: number) => `£${(n / 1e6).toFixed(1)}M`;
    const items = [{ key: 'a', label: 'Testing (SIL / MIL / HIL)', value: 10, group: 'nre' as const }, { key: 'b', label: 'Licences & royalties', value: 20, group: 'life' as const }];
    setChartWidth(340);
    const wf = waterfallChart('wf', items, 30, money);
    expect(wf).toMatch(/viewBox="0 0 340 /);
    expect(wf).toContain('Testing (SIL / MIL / HIL)</text>');        // full label on its own line
    const tor = tornadoChart('t', [{ label: 'Connected-service life', low: 1, base: 2, high: 3 }], money);
    expect(tor).toMatch(/viewBox="0 0 340 /);
    expect(tor).toContain('Connected-service life</text>');
    setChartWidth(null);
    expect(waterfallChart('wf', items, 30, money)).toMatch(/viewBox="0 0 640 /);
    // A wide card keeps the desktop drawing (scaled up), never a stretched layout.
    setChartWidth(1400);
    expect(spendChart('s', [{ label: 'Dev 1', parts: { e: 1 }, total: 1 }], [['e', 'Engineering']], 0, money)).toMatch(/viewBox="0 0 1000 /);
    setChartWidth(null);
    expect(read('src/ui/panels/sw-charts.ts')).not.toMatch(/min-width:520px/);
  });
  it('the engineer-rate field shows the book rate as a placeholder, never as a typed value', () => {
    const ui = read('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/id="sw-base-rate"[^>]*value="\$\{inputs\.baseRateGBP \?\? ''\}" placeholder=/);
    expect(ui).toMatch(/if \(f\.dataset\.typed !== '1'\) f\.value = ''/);
  });
});
