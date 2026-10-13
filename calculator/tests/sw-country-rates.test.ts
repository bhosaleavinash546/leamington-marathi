/**
 * Software-engineering country rate book (Chief Engineer review, Oct 2026): each hub's OWN rate, no UK multiplier.
 * docs/rates/software-engineering-rates-2026-10.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SW_HUB_RATES, SW_PM_HOURS } from '../src/engine/sw-country-rates.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../src/engine/sw-rate-library.js';
import {
  computeSWProgram, defaultSWProgramInputs, swRegionFor, swLibraryBaseRate, normaliseSWRegion, SW_LEGACY_HUBS,
  type SWRegion,
} from '../src/engine/sw-should-cost.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';

const cfg = JSON.parse(readFileSync('scripts/rate-refresh/2026-10-sw-rates.json', 'utf8')) as {
  hubs: Array<{ id: string; country: string; mid: Array<{ value: number; annualFactor: number; url: string }>; senior: unknown[];
    onCost: { inSalary?: boolean; components: Array<{ pct: number; floorAnnual?: number; ceilingAnnual?: number }> };
    hours: { weeklyHours: number; leaveDays: number; publicHolidays: number; leaveIncludesHolidays?: boolean };
    evidence: Array<{ claim: string }> }>;
};

describe('software rate book — each hub priced from its own country', () => {
  it('the generated book is in sync with the config', () => {
    expect(execFileSync('npx', ['tsx', 'scripts/sw-rate-book.ts', '--check'], { encoding: 'utf8' })).toMatch(/up to date/);
  });

  it('23 hubs, each with evidence that automotive software is developed there and a sourced salary', () => {
    expect(Object.keys(SW_HUB_RATES)).toHaveLength(23);
    for (const h of cfg.hubs) {
      expect(h.evidence.length, h.id).toBeGreaterThan(0);
      expect(h.mid.length, h.id).toBeGreaterThan(0);
      for (const o of h.mid) expect(o.url, `${h.id} mid observation needs a URL`).toMatch(/^https?:\/\//);
    }
  });

  it('every £/PM is that hub\'s own arithmetic: median salary + on-cost ÷ productive hours × 152 h ÷ FX — no UK term', () => {
    const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    for (const h of cfg.hubs) {
      const s = median(h.mid.map(o => o.value * o.annualFactor));
      const on = h.onCost.inSalary ? 0 : h.onCost.components.reduce((a, c) =>
        a + c.pct / 100 * Math.max(0, Math.min(s, c.ceilingAnnual ?? Infinity) - (c.floorAnnual ?? 0)), 0);
      const hrs = (260 - h.hours.leaveDays - (h.hours.leaveIncludesHolidays ? 0 : h.hours.publicHolidays)) * h.hours.weeklyHours / 5;
      const fx = REGIONAL_DATA[h.country as keyof typeof REGIONAL_DATA].fxToGBP;
      const gbp = (s + on) / hrs * SW_PM_HOURS / fx;
      expect(SW_HUB_RATES[h.id as keyof typeof SW_HUB_RATES].midPerPMGBP, h.id).toBe(Math.round(gbp));
    }
  });

  it('the library has no UK base and no multiplier; the engine reads each hub\'s own rate', () => {
    const lib = DEFAULT_SW_RATE_LIBRARY as unknown as Record<string, unknown>;
    expect(lib.ukBaseRatePerPM).toBeUndefined();
    expect(lib.regionMultipliers).toBeUndefined();
    for (const id of Object.keys(SW_HUB_RATES) as SWRegion[]) {
      expect(DEFAULT_SW_RATE_LIBRARY.hubRates[id].mid.value).toBe(SW_HUB_RATES[id].midPerPMGBP);
    }
    // The UK hub is no longer £28,000 / PM (≈ £1,400 a day — 2.5× the UK automotive contract day rate).
    expect(SW_HUB_RATES.UK.midPerPMGBP).toBeLessThan(10_000);
  });

  it('the senior share blends the hub\'s mid and senior rates (the 1.20 / 0.75 fudge is gone)', () => {
    const d = defaultSWProgramInputs();
    expect(swLibraryBaseRate({ ...d, region: 'DE', teamSeniorFraction: 0 })).toBe(SW_HUB_RATES.DE.midPerPMGBP);
    expect(swLibraryBaseRate({ ...d, region: 'DE', teamSeniorFraction: 1 })).toBe(SW_HUB_RATES.DE.seniorPerPMGBP);
    expect(readFileSync('src/engine/sw-should-cost.ts', 'utf8')).not.toMatch(/\* 1\.20 \+/);
  });

  it('a typed rate is the hub\'s own figure — never scaled by a country (code review F4)', () => {
    const d = defaultSWProgramInputs();
    const inIndia = computeSWProgram({ ...d, region: 'IN', baseRateGBP: 6_000 }).summary.totalDevelopment;
    const inUK = computeSWProgram({ ...d, region: 'UK', baseRateGBP: 6_000 }).summary.totalDevelopment;
    expect(inIndia).toBeCloseTo(inUK, 6);
  });

  it('retired hub keys from saved configurations map to today\'s hubs', () => {
    expect(SW_LEGACY_HUBS).toMatchObject({ EU: 'DE', USA_Detroit: 'US-MI', USA_SV: 'US-CA', India: 'IN', China: 'CN' });
    expect(normaliseSWRegion('Eastern_Europe')).toBe('PL');
    const legacy = computeSWProgram({ ...defaultSWProgramInputs(), region: 'EU' as SWRegion }).summary.grandTotal;
    expect(legacy).toBe(computeSWProgram({ ...defaultSWProgramInputs(), region: 'DE' }).summary.grandTotal);
  });

  it('every app country maps to a hub; a country with its own book is its own hub', () => {
    for (const c of Object.keys(REGIONAL_DATA)) expect(swRegionFor(c).region in SW_HUB_RATES, c).toBe(true);
    for (const c of ['DE', 'FR', 'SE', 'CZ', 'RO', 'IN', 'CN', 'JP', 'KR', 'MX']) expect(swRegionFor(c).region).toBe(c);
  });

  it('isolation: no other commodity\'s rates read the software book, and the book reads no rate', () => {
    const book = readFileSync('src/engine/sw-country-rates.ts', 'utf8');
    expect(book).not.toMatch(/^import /m);
    for (const f of ['src/engine/regional-rates.ts', 'src/engine/rate-library.ts', 'src/engine/country-books.ts', 'src/engine/core.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/sw-country-rates|sw-rate-library/);
    }
  });

  it('a low-confidence hub says why; a disputed basis is stated in the book', () => {
    expect(SW_HUB_RATES.PL.notes).toMatch(/DISPUTED BASIS/);
    expect(SW_HUB_RATES.KR.onCostInSalary).toBe(true);    // KOSA's figure is already the employer's cost
    expect(SW_HUB_RATES.TR.notes).toMatch(/lower bound/);
  });
});
