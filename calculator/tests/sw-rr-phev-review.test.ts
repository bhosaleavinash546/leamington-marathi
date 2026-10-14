/**
 * Range Rover L460 PHEV president review (14 Oct 2026, docs/review/rr-phev-software-costing-review-2026-10-14.md).
 * Pins the defects the live run and the line-by-line PDF / Excel review found, and the new report's content.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeSWProgram, swRateBasis, swLoadedRate, swRegionFor, SW_MODULES, type SWRegion } from '../src/engine/sw-should-cost.js';
import { swHubComparison } from '../src/engine/sw-cockpit.js';
import { swCostingSteps } from '../src/engine/sw-costing-steps.js';
import { SW_HUB_RATES } from '../src/engine/sw-country-rates.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { renderSWReportPdf, hubMedianNote, SW_CATALOGUE_GAPS } from '../src/export/sw-report-pdf.js';
import { buildSWReportModel } from '../src/engine/sw-report-model.js';
import { buildSWReportRequest, hubLabelOf } from '../src/export/sw-report-request.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const inputs = (region: SWRegion = 'UK') => ({ ...buildVehicleInputs(demo), region, annualProductionVolume: 200_000, programLifeYears: 6 });

describe('the Range Rover demo states only checked facts', () => {
  it('no unsourced software-cost figure, no unconfirmed digital key, Tier-1 called an assumption; every fact has a page', () => {
    expect(demo.desc).not.toMatch(/£\s?390|published/i);
    expect(demo.desc).toMatch(/Digital key is not confirmed/);
    expect(demo.desc).toMatch(/modelling assumption/);
    expect(demo.disabledModules).toContain('digital_key');
    expect(buildVehicleInputs(demo).modules.find(m => m.moduleId === 'digital_key')!.enabled).toBe(false);
    expect(demo.facts!.length).toBeGreaterThanOrEqual(6);
    for (const [, url] of demo.facts!) expect(url).toMatch(/^https:\/\//);
  });
});

describe('sensitivity moves around THIS programme', () => {
  const r = computeSWProgram(inputs());
  it('programme life and volume bracket the base and name the cases they ran', () => {
    const life = r.sensitivity.find(x => /^Programme life/.test(x.parameter))!;
    expect(life.parameter).toBe('Programme life (4 vs 9 years)');
    expect(life.low).toBeLessThan(life.base); expect(life.high).toBeGreaterThan(life.base);
    const vol = r.sensitivity.find(x => /^Production volume/.test(x.parameter))!;
    expect(vol.parameter).toBe('Production volume (300k vs 100k a year, per vehicle)');
    expect(vol.low).toBeLessThan(vol.base); expect(vol.high).toBeGreaterThan(vol.base);
  });
  it('every "(low vs high)" label is in the order of its low and high columns', () => {
    expect(r.sensitivity.some(x => x.parameter === 'ASIL level (all modules: B vs D)')).toBe(true);
    for (const x of r.sensitivity) if (x.unit === '£M') expect(x.low).toBeLessThanOrEqual(x.high);
  });
});

describe('report text carries no internals', () => {
  it('the development source is named in words with a 3-decimal factor; the cloud row states its £ / vehicle-year', () => {
    const rows = Object.fromEntries(swRateBasis(inputs()));
    expect(rows['Development source']).toMatch(/^Tier-1 supplier × 0\.997 = efficiency 0\.88 \(unsourced\) ÷ \(1 − supplier margin 11\.7 %\)$/);
    expect(rows['Cloud']).toMatch(/^£\d+\.\d\d per connected vehicle-year/);
  });
  it('a GBP hub\'s rate build-up has no "÷ 1"; a foreign hub keeps its FX step', () => {
    expect(SW_HUB_RATES.UK.build).not.toMatch(/÷ 1 =/);
    expect(SW_HUB_RATES.DE.build).toMatch(/÷ 1\.165 EUR per £ = £/);
  });
  it('the lifecycle step says the service years run past the last build', () => {
    const r = computeSWProgram(inputs());
    const steps = swCostingSteps(r, { perPMGBP: swLoadedRate(r.inputs), hubLabel: 'United Kingdom', build: 'x' }, { money: n => String(Math.round(n)), number: n => String(n) });
    expect(steps.find(s => s.id === 'lifecycle')!.detail).toMatch(/service years after the last build \(to programme year 16\)/);
  });
});

describe('every hub and every country', () => {
  const r = computeSWProgram(inputs());
  const hubs = swHubComparison(r);
  it('the same scope at all 23 hubs; this report\'s row is the result itself; non-labour lifecycle does not move', () => {
    expect(hubs).toHaveLength(Object.keys(SW_HUB_RATES).length);
    expect(hubs.find(h => h.selected)!.total).toBe(r.summary.grandTotal);
    for (const h of hubs.filter(x => !x.selected)) {
      const s = computeSWProgram(inputs(h.hub)).summary;
      expect(h.total).toBeCloseTo(s.grandTotal, 2);
      expect(s.totalCloud).toBeCloseTo(r.summary.totalCloud, 2);
      expect(s.totalLicensing).toBeCloseTo(r.summary.totalLicensing, 2);
    }
  });
  it('the hub book\'s mid salary is the median of its listed observations at every hub', () => {
    for (const h of Object.values(SW_HUB_RATES)) expect(hubMedianNote(h)).not.toBeNull();
  });
});

describe('the PDF report (headless, the screen\'s own model and renderer)', () => {
  const r = computeSWProgram(inputs());
  const texts: string[] = [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const orig = doc.text.bind(doc);
  (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (...a: unknown[]) => { texts.push(Array.isArray(a[0]) ? (a[0] as string[]).join(' ') : String(a[0])); return orig(...(a as Parameters<typeof orig>)); };
  const countries = Object.entries(REGIONAL_DATA).map(([code, x]) => { const h = swRegionFor(code); return { code, label: (x as { name: string }).name, hub: h.region, hubLabel: hubLabelOf(h.region), basis: h.basis ?? '' }; });
  const model = buildSWReportModel(r, buildSWReportRequest(r, { options: { profile: 'vehicle' }, title: demo.label, vehicleDesc: demo.desc, facts: demo.facts, countries, generatedAt: new Date(2026, 9, 14) }));
  renderSWReportPdf(doc, autoTable as never, model);
  const all = texts.join('\n');
  it('lists EVERY module in scope by its full name', () => {
    for (const m of r.modules) expect(all).toContain(m.moduleName);
  });
  it('the build-up includes homologation and its exact check agrees; every model check passes', () => {
    expect(all).toContain('Homologation');
    expect(all).toMatch(/Check, exact: NRE .* \(they agree\)/);
    expect(model.checks.filter(c => !c.ok)).toEqual([]);
  });
  it('prints no enum, no unverified "published" figure, no invented title', () => {
    expect(all).not.toMatch(/Tier1_Supplier|OEM_Internal|Startup_OSS/);
    expect(all).not.toMatch(/UNVERIFIED|Premium Luxury SUV|2024–2026|undefined|NaN/);
    expect(all).not.toMatch(/\d\.\d{6,}/);   // float noise
  });
  it('has every hub, every country, the catalogue gaps, the limitations and page numbers', () => {
    for (const h of Object.values(SW_HUB_RATES)) expect(all).toContain(h.label);
    expect(all).toContain(`Every manufacturing country and its software hub (${Object.keys(REGIONAL_DATA).length})`);
    for (const g of SW_CATALOGUE_GAPS) expect(all).toContain(g.slice(0, 30));
    expect(all).toMatch(/Accuracy has not been measured/);
    const pages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
    expect(pages).toBeGreaterThan(15);
    expect(all).toContain(`Page ${pages} of ${pages}`);
  });
});

describe('the independent trace reconciles the tool to the penny at every hub', () => {
  it('scripts/sw-review/rr-phev-trace.ts exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rr-trace-'));
    try {
      execFileSync(resolve('node_modules/.bin/tsx'), ['scripts/sw-review/rr-phev-trace.ts', dir, '200000', '6'], { stdio: 'pipe' });
      const t = JSON.parse(readFileSync(join(dir, 'rr-phev-trace.json'), 'utf8')) as { results: Array<{ fails: string[] }> };
      expect(t.results).toHaveLength(Object.keys(SW_HUB_RATES).length);
      expect(t.results.every(x => x.fails.length === 0)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});

void SW_MODULES;
