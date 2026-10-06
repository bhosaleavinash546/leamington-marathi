/** The offline component catalogue: data with provenance, matched and interpolated deterministically. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalogueEntry, cataloguePrice, cataloguePriceAt, CATALOGUE_AS_OF, CATALOGUE_SIZE } from '../server/utils/pcb-price-catalogue.js';
import { offlineCataloguePrices, groundAndSplit } from '../server/utils/pcb-bom-grounding.js';

const raw = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')) as {
  asOf: string; parts: Array<{ mpn: string; gbp: { q1k: number; q10k: number; q100k: number; q200k?: number; q300k?: number }; confidence: string; source: string; asOf: string; category: string;
    observations?: Array<{ distributor: string; qty: number; price: number; currency: string; url: string; date: string; gbp: number }>; volumeModel?: { b: number; basis: string; derivedAbove: number } }> };

describe('catalogue data', () => {
  it('is large, dated and sourced on every line', () => {
    expect(CATALOGUE_SIZE).toBeGreaterThan(450);
    expect(CATALOGUE_AS_OF).toBe(raw.asOf);
    for (const p of raw.parts) {
      expect(p.source.length, p.mpn).toBeGreaterThan(10);
      expect(['distributor', 'estimate']).toContain(p.confidence);
      expect(p.gbp.q1k).toBeGreaterThanOrEqual(p.gbp.q10k);
      expect(p.gbp.q10k).toBeGreaterThanOrEqual(p.gbp.q100k);
      expect(p.gbp.q100k).toBeGreaterThan(0);
    }
    const researched = raw.parts.filter(p => p.confidence === 'distributor');
    expect(researched.length).toBeGreaterThanOrEqual(70);
    for (const p of researched) expect(p.source, p.mpn).toMatch(/Digi-Key|Mouser|LCSC|Farnell|Newark|Arrow|Avnet|TME|Rochester|Chip One|Heilind|ICC|FindChips|Spirit|Master|Comet|OMO|Component Stockers|XON|distributor|Future|JLCPCB|Jameco|JAK|GAM|Ersa|PCBX|SiTime|TTI|Verical|DigiPart/);
  });
  it('has no duplicate part numbers', () => {
    const seen = new Set<string>();
    for (const p of raw.parts) { expect(seen.has(p.mpn.toUpperCase()), p.mpn).toBe(false); seen.add(p.mpn.toUpperCase()); }
  });
});

describe('the October 2026 research (docs/pcb/component-database-2026-10.md)', () => {
  const researched = raw.parts.filter(p => p.asOf === '2026-10-06');
  it('every researched entry carries its distributor observations, URLs and volume model', () => {
    expect(researched.length).toBeGreaterThanOrEqual(100);
    for (const p of researched) {
      expect(p.confidence, p.mpn).toBe('distributor');
      expect(p.observations?.length, p.mpn).toBeGreaterThan(0);
      for (const o of p.observations!) {
        expect(o.url, p.mpn).toMatch(/^https?:\/\//);
        expect(o.qty, p.mpn).toBeGreaterThanOrEqual(100);           // one-off prices are not used
        expect(o.distributor, p.mpn).toMatch(/digi-?key|mouser|arrow|avnet|farnell|newark|element|rs|tme|rutronik|future|tti|lcsc|verical|rochester|heilind|allied|sager|master/i);
      }
      expect(p.volumeModel!.b, p.mpn).toBeGreaterThanOrEqual(0.02);
      expect(p.volumeModel!.b, p.mpn).toBeLessThanOrEqual(0.18);
    }
  });
  it('every entry has 1k ≥ 10k ≥ 100k ≥ 200k ≥ 300k', () => {
    for (const p of raw.parts) {
      expect(p.gbp.q200k, p.mpn).toBeDefined();
      expect(p.gbp.q100k, p.mpn).toBeGreaterThanOrEqual(p.gbp.q200k!);
      expect(p.gbp.q200k!, p.mpn).toBeGreaterThanOrEqual(p.gbp.q300k!);
      expect(p.gbp.q300k!, p.mpn).toBeGreaterThan(0);
    }
  });
});

describe('matching', () => {
  it('finds the radar board\'s named parts by marking, suffix or family', () => {
    expect(catalogueEntry('FS32R294KCMJD')?.family).toBe('S32R294');
    expect(catalogueEntry('TEF8105 TR7YC228')?.family).toBe('TEF8105');
    expect(catalogueEntry('TCAN1044AVDRQ1')?.family).toBe('TCAN1044');
    expect(catalogueEntry('W25Q32JWSSIM')?.family).toBe('W25Q32JW');
    expect(catalogueEntry('25Q32JWNSM')?.family).toBe('W25Q32JW');     // Winbond top mark drops the W
    expect(catalogueEntry('1044AV')?.family).toBe('TCAN1044');          // TI prints only 1044AV
    expect(catalogueEntry('MAX20431AATIF/V+')?.family).toBe('MAX20431');
    expect(catalogueEntry('TJA1044GT/3Z')?.family).toBe('TJA1044');
  });
  it('refuses guessed labels and descriptions', () => {
    expect(catalogueEntry('AT6AS70 (est. AURIX-class)')).toBeNull();
    expect(catalogueEntry('MX150-class')).toBeNull();
    expect(catalogueEntry('OBD-II DE9')).toBeNull();
    expect(catalogueEntry('')).toBeNull();
  });
  it('does not match on a short or digit-free prefix', () => {
    expect(catalogueEntry('TC')).toBeNull();
    expect(catalogueEntry('TPSX')).toBeNull();
  });
});

describe('price at quantity', () => {
  it('interpolates between the breaks and respects them at the ends', () => {
    const e = catalogueEntry('TJA1044GT')!;
    expect(cataloguePriceAt('TJA1044GT', 1000)).toBeCloseTo(e.gbp.q1k, 4);
    expect(cataloguePriceAt('TJA1044GT', 10000)).toBeCloseTo(e.gbp.q10k, 4);
    expect(cataloguePriceAt('TJA1044GT', 100000)).toBeCloseTo(e.gbp.q100k, 4);
    // Annual programme volumes have their own breaks (Oct 2026 research): 200k and 300k,
    // derived along the part's slope; flat above 300k.
    expect(cataloguePriceAt('TJA1044GT', 200000)).toBeCloseTo(e.gbp.q200k!, 4);
    expect(cataloguePriceAt('TJA1044GT', 300000)).toBeCloseTo(e.gbp.q300k!, 4);
    expect(cataloguePriceAt('TJA1044GT', 1_000_000)).toBeCloseTo(e.gbp.q300k!, 4);
    const q250 = cataloguePriceAt('TJA1044GT', 250000)!;
    expect(q250).toBeLessThan(e.gbp.q200k!); expect(q250).toBeGreaterThan(e.gbp.q300k!);
    const mid = cataloguePriceAt('TJA1044GT', 3000)!;
    expect(mid).toBeLessThan(e.gbp.q1k); expect(mid).toBeGreaterThan(e.gbp.q10k);
    expect(cataloguePriceAt('TJA1044GT', 100)!).toBeGreaterThan(e.gbp.q1k);
    expect(cataloguePrice('TJA1044GT')).toBe(e.gbp.q10k);
  });
  it('the researched S32R294 sits inside the tool\'s named-part range', () => {
    const p = cataloguePriceAt('S32R294', 100000)!;
    expect(p).toBeGreaterThan(15); expect(p).toBeLessThan(34);
  });
});

describe('grounding with the catalogue', () => {
  it('prices a named line from the catalogue with its source on the line', () => {
    const live = offlineCataloguePrices(['TJA1044GT/3Z', 'NOTAPART'], 250000);
    expect(live).toHaveLength(1);
    expect(live[0].sourceNote).toMatch(/Digi-Key/);
    const out = groundAndSplit([{ refDes: 'U8', partNumber: 'TJA1044GT/3Z', componentType: 'ic_soic', qty: 1, unitPriceGBP: 2.5, lineConf: 0.9 }], live);
    expect(out.bom[0].priceSource).toBe('catalogue');
    expect(out.bom[0].unitPriceGBP).toBeCloseTo(live[0].unitPriceGBP, 4);
    expect(String(out.bom[0].priceNote)).toMatch(/distributor price/);
    expect(out.bom[0].needsVerification).toBe(false);
  });
  it('a catalogue estimate on a £1+ line is priced but listed to verify', () => {
    const live = offlineCataloguePrices(['TEF8105'], 250000);
    const out = groundAndSplit([{ refDes: 'U2', partNumber: 'TEF8105', componentType: 'ic_qfn', qty: 1, unitPriceGBP: 4, lineConf: 0.9 }], live);
    expect(out.bom[0].priceSource).toBe('catalogue');
    expect(out.bom[0].needsVerification).toBe(true);
    expect(String(out.bom[0].priceNote)).toMatch(/engineering estimate/);
  });
});

import { priceFromObservations, DEFAULT_B } from '../scripts/pcb-catalogue-research-merge.js';
describe('the research merge rules', () => {
  const o = (distributor: string, qty: number, price: number, currency = 'USD') => ({ distributor, qty, price, currency, url: 'https://x', date: '2026-10-06' });
  it('uses the part\'s own slope from one distributor\'s two breaks', () => {
    const p = priceFromObservations([o('Digi-Key', 1000, 1.0), o('Digi-Key', 10000, 0.8)])!;
    expect(p.b).toBeCloseTo(Math.log(1 / 0.8) / Math.log(10), 3);
    expect(p.gbp.q10k).toBeCloseTo(0.8 * 0.7553, 3);
  });
  it('falls back to the franchise curve with a single break', () => {
    expect(priceFromObservations([o('Mouser', 1000, 2)])!.b).toBeCloseTo(DEFAULT_B, 3);
  });
  it('drops brokers, one-off quantities and unknown currencies; nothing left → no entry', () => {
    expect(priceFromObservations([o('Win Source', 1000, 1), o('Digi-Key', 1, 3), o('Digi-Key', 1000, 1, 'NOK')])).toBeNull();
  });
  it('drops a 2.5× outlier when three or more distributors agree', () => {
    const p = priceFromObservations([o('Digi-Key', 1000, 1.0), o('Mouser', 1000, 1.1), o('LCSC', 1000, 0.2)])!;
    expect(p.distributors).not.toContain('LCSC');
    expect(p.dropped.join(' ')).toMatch(/outlier/);
  });
});
