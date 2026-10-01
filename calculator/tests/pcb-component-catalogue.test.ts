/** The offline component catalogue: data with provenance, matched and interpolated deterministically. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalogueEntry, cataloguePrice, cataloguePriceAt, CATALOGUE_AS_OF, CATALOGUE_SIZE } from '../server/utils/pcb-price-catalogue.js';
import { offlineCataloguePrices, groundAndSplit } from '../server/utils/pcb-bom-grounding.js';

const raw = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')) as {
  asOf: string; parts: Array<{ mpn: string; gbp: { q1k: number; q10k: number; q100k: number }; confidence: string; source: string; asOf: string; category: string }> };

describe('catalogue data', () => {
  it('is large, dated and sourced on every line', () => {
    expect(CATALOGUE_SIZE).toBeGreaterThan(400);
    expect(CATALOGUE_AS_OF).toBe(raw.asOf);
    for (const p of raw.parts) {
      expect(p.source.length, p.mpn).toBeGreaterThan(10);
      expect(['distributor', 'estimate']).toContain(p.confidence);
      expect(p.gbp.q1k).toBeGreaterThanOrEqual(p.gbp.q10k);
      expect(p.gbp.q10k).toBeGreaterThanOrEqual(p.gbp.q100k);
      expect(p.gbp.q100k).toBeGreaterThan(0);
    }
    const researched = raw.parts.filter(p => p.confidence === 'distributor');
    expect(researched.length).toBeGreaterThanOrEqual(35);
    for (const p of researched) expect(p.source).toMatch(/Digi-Key|Mouser|LCSC|Farnell|Newark|Arrow|Avnet|TME|Rochester|Chip One|Heilind|ICC|FindChips|Spirit|Master|Comet|OMO|Component Stockers|XON|distributor/);
  });
  it('has no duplicate part numbers', () => {
    const seen = new Set<string>();
    for (const p of raw.parts) { expect(seen.has(p.mpn.toUpperCase()), p.mpn).toBe(false); seen.add(p.mpn.toUpperCase()); }
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
    expect(cataloguePriceAt('TJA1044GT', 250000)).toBeCloseTo(e.gbp.q100k, 4);
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
