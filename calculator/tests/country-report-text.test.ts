/**
 * Demo review (10 Oct 2026, docs/review/country-rates-demo-review-2026-10-10.md): what a China / India / UK costing
 * prints about its rates. Each case was a line in a live report: a China foundry note read "INR 32/h", the labour
 * notes cited "regional-rates.ts", a held material's note opened "UK …", machine capex was printed in £ only, and the
 * display converted at ¥8.8810/£ while the China book is ¥8.88/£.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { FX_TO_GBP } from '../src/engine/insights.js';
import { CHINA_BOOK } from '../src/engine/country-books/cn.js';

const CN = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN' as never);
const IN = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'IN' as never);

describe('rate notes in a China or India book name that country and its currency', () => {
  it('China labour is in CNY, never INR, and no note cites a source file', () => {
    for (const l of CN.labour) {
      expect(`${l.id} ${l.sourceNote ?? ''}`).not.toMatch(/INR|₹/);
      expect(l.sourceNote ?? '').not.toMatch(/regional-rates\.ts|country-book\.ts/);
    }
    const foundry = CN.labour.find(l => /foundry/i.test(`${l.id} ${l.skillLevel}`));
    expect(foundry?.sourceNote).toMatch(/CNY|¥/);
  });
  it('India labour is in INR and never CNY', () => {
    for (const l of IN.labour) expect(`${l.sourceNote ?? ''}`).not.toMatch(/CNY|¥/);
  });
  it('a material with no country price says so, country first', () => {
    for (const m of CN.materials) expect(m.sourceNote ?? '').not.toMatch(/^UK/);
    for (const m of IN.materials) expect(m.sourceNote ?? '').not.toMatch(/^UK/);
  });
  it('the energy entry keeps the book\'s own date and source', () => {
    const e = CN.energy.find(x => x.id === 'energy-cn')!;
    expect(e.effectiveDate).toBe(CHINA_BOOK.asOf);
    expect(e.sourceNote).toMatch(/^China rate book/);
    expect(e.sourceNote).not.toMatch(/benchmark 2026-09/);
  });
});

describe('display FX equals the books\' FX', () => {
  it('CNY and INR convert at exactly the country books\' rate', () => {
    expect(1 / FX_TO_GBP.CNY).toBeCloseTo(REGIONAL_DATA.CN.fxToGBP, 10);
    expect(1 / FX_TO_GBP.INR).toBeCloseTo(REGIONAL_DATA.IN.fxToGBP, 10);
  });
});
