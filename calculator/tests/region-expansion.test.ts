/**
 * Country expansion, Oct 2026 — 20 → 39 manufacturing countries from published statistics.
 * docs/rates/2026-10-country-expansion.md has the method and every figure's source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  REGIONAL_DATA, REGION_NAMES, SURFACE_REGIONAL_FACTORS, buildRegionalLibrary, resolveManufacturingRegion,
  computeRegionalComparison, type ManufacturingRegion,
} from '../src/engine/regional-rates.js';
import { BILLET_PREMIUM_USD_PER_T, billetPriceGbpPerKg } from '../src/engine/al-extrusion-data.js';
import { FX_TO_GBP, CURRENCY_SYMBOL } from '../src/engine/insights.js';
import { ORIGIN_PREFERENCES } from '../src/engine/landed-cost-data.js';
import { gridCarbon } from '../src/engine/carbon.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { regionOptionsHtml, currencyOptionsHtml, REGION_GROUP } from '../src/ui/region-options.js';

const CFG = JSON.parse(readFileSync('scripts/rate-refresh/2026-10-countries.json', 'utf8'));
const ALL = Object.keys(REGION_NAMES) as ManufacturingRegion[];
const NEW: string[] = CFG.countries.map((c: { code: string }) => c.code);

describe('1. 39 countries, each complete in every table', () => {
  it('19 new countries on top of the 20', () => {
    expect(NEW).toHaveLength(19);
    expect(ALL).toHaveLength(39);
    for (const c of NEW) expect(ALL).toContain(c);
  });
  it('every country has rates, a billet premium, surface factors, a currency the screen can show, a trade entry and a grid factor', () => {
    for (const c of ALL) {
      const rd = REGIONAL_DATA[c];
      expect(rd, c).toBeDefined();
      expect(BILLET_PREMIUM_USD_PER_T[c], c).toBeDefined();
      expect(SURFACE_REGIONAL_FACTORS[c], c).toBeDefined();
      expect(FX_TO_GBP[rd.currency], `${c} ${rd.currency}`).toBeGreaterThan(0);
      expect(CURRENCY_SYMBOL[rd.currency], rd.currency).toBeDefined();
      if (c !== 'UK') expect(ORIGIN_PREFERENCES.some(p => p.region === c), `${c} origin entry`).toBe(true);
      expect(gridCarbon(c) === 0.40 && c !== 'UK', `${c} grid factor`).toBe(false);
    }
  });
  it('FX_TO_GBP and fxToGBP agree (one is the inverse of the other) for every country', () => {
    for (const c of ALL) {
      const rd = REGIONAL_DATA[c];
      expect(FX_TO_GBP[rd.currency] * rd.fxToGBP, c).toBeCloseTo(1, 2);
    }
  });
});

describe('2. the arithmetic is the config\'s, and nothing else', () => {
  const fx = (ccy?: string) => (ccy ? CFG.fx[ccy] : 1);
  it('labour = analogue × (measure ÷ analogue measure), every category', () => {
    for (const c of CFG.countries) {
      const k = (c.labour.value / fx(c.labour.valueCcy)) / (c.labour.analogueValue / fx(c.labour.analogueCcy));
      const an = REGIONAL_DATA[c.analogue as ManufacturingRegion].labour;
      const me = REGIONAL_DATA[c.code as ManufacturingRegion].labour;
      for (const g of Object.keys(an) as (keyof typeof an)[]) expect(me[g], `${c.code} ${g}`).toBeCloseTo(an[g] * k, 1);
    }
  });
  it('electricity is the published tariff in £', () => {
    for (const c of CFG.countries) {
      const e = c.electricity;
      const gbp = e.unit === 'EUR c/kWh' ? e.value / 100 / CFG.fx.EUR : e.unit === 'USD/kWh' ? e.value / CFG.fx.USD : e.value / CFG.fx[e.unit.slice(0, 3)];
      expect(REGIONAL_DATA[c.code as ManufacturingRegion].energy.electricityPerKwh, c.code).toBeCloseTo(gbp, 3);
    }
  });
  it('the multipliers are the analogue\'s, held', () => {
    for (const c of CFG.countries) {
      const a = REGIONAL_DATA[c.analogue as ManufacturingRegion], me = REGIONAL_DATA[c.code as ManufacturingRegion];
      expect(me.machineRateMultiplier).toBe(a.machineRateMultiplier);
      expect(me.materialMultiplier).toBe(a.materialMultiplier);
      expect(me.overheadMultiplier).toBe(a.overheadMultiplier);
    }
  });
  it('the generated blocks match the config (scripts/region-expand.ts --check)', () => {
    const src = readFileSync('src/engine/regional-rates.ts', 'utf8');
    for (const c of NEW) expect(src, c).toMatch(new RegExp(`\\n  ${c}: \\{\\n    name: `));
    expect(src).toContain('⟪region-expand 2026-10');
  });
  it('a few anchors a reviewer can check by hand', () => {
    // Austria = Germany × 44.5 / 43.4 (Eurostat 2024): 40.77 × 1.0253 = 41.80
    expect(REGIONAL_DATA.AT.labour.skilled).toBeCloseTo(41.80, 2);
    // Malaysia = Thailand × 490 / 437 (JETRO): 4.15 × 1.1213 = 4.65
    expect(REGIONAL_DATA.MY.labour.semiskilled).toBeCloseTo(4.65, 2);
    // Portugal electricity: €11.33 / 100 / 1.16526 = £0.097
    expect(REGIONAL_DATA.PT.energy.electricityPerKwh).toBe(0.097);
  });
});

describe('3. the new countries cost', () => {
  it('buildRegionalLibrary gives each its own labour, energy and billet', () => {
    for (const c of NEW as ManufacturingRegion[]) {
      const lib = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, c);
      expect(lib.energy[0].electricityPerKwh).toBe(REGIONAL_DATA[c].energy.electricityPerKwh);
      expect(lib.labour.find(l => l.id.endsWith('-skilled'))!.fullyLoadedRatePerHr).toBe(REGIONAL_DATA[c].labour.skilled);
      expect(lib.machines.every(m => Number.isFinite(m.computedRatePerHr) && m.computedRatePerHr > 0)).toBe(true);
      expect(billetPriceGbpPerKg('6063', c)).toBeGreaterThan(2);
    }
  });
  it('an EU member in the landed comparison pays no duty (the 5% fallback is gone)', () => {
    const bkd = { rawMaterial: 10, process: 10, labour: 10, tooling: 1, overhead: 3, packaging: 0.15, logistics: 0.25, margin: 3 };
    const ex = computeRegionalComparison(bkd, { regions: ['UK', 'AT'], landed: false }).find(r => r.code === 'AT')!;
    const ld = computeRegionalComparison(bkd, { regions: ['UK', 'AT'], landed: true }).find(r => r.code === 'AT')!;
    expect(ld.total - ex.total).toBeCloseTo(ex.exWorks * 0.028, 6);   // shipping only
  });
  it('a part list may name them', () => {
    expect(resolveManufacturingRegion('Slovak Republic')).toBe('SK');
    expect(resolveManufacturingRegion('Japan')).toBe('JP');
    expect(resolveManufacturingRegion('maroc')).toBe('MA');
  });
});

describe('4. the screen offers every country and currency', () => {
  it('both country pickers list every region, grouped', () => {
    const html = regionOptionsHtml();
    for (const c of ALL) expect(html, c).toContain(`value="${c}"`);
    for (const c of ALL) expect(REGION_GROUP[c], c).toBeDefined();
  });
  it('the currency picker lists every currency a country is priced in', () => {
    const html = currencyOptionsHtml();
    for (const c of ALL) expect(html, c).toContain(`value="${REGIONAL_DATA[c].currency}"`);
  });
  it('index.html no longer hand-lists them', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toContain('<option value="DE">');
    expect(html).not.toContain('<option value="CZK">');
  });
  it('the next rate refresh must move every country (rate-refresh.ts knows each currency)', () => {
    const src = readFileSync('scripts/rate-refresh.ts', 'utf8');
    const block = src.slice(src.indexOf('const ccyOf'), src.indexOf('};', src.indexOf('const ccyOf')));
    for (const c of ALL) expect(block, c).toMatch(new RegExp(`\\b${c}: '${REGIONAL_DATA[c].currency}'`));
  });
});
