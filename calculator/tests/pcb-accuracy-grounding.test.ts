import { describe, it, expect } from 'vitest';
import {
  offlineCataloguePrices, groundAndSplit, groundingCandidates, type BomLine,
} from '../server/utils/pcb-bom-grounding.js';
import { cataloguePrice, classMedianCap, normaliseMPN } from '../server/utils/pcb-price-catalogue.js';

// A representative slice of the LIVE ECU extraction (China, 10k) — AI prices as
// they came out of the model, incl. the two dominant over-priced guesses (U1, J1).
function bom(): BomLine[] {
  return [
    { refDes: 'U1', componentType: 'ic_bga', partNumber: 'AT6AS70 (est. AURIX-class)', unitPriceGBP: 60.75, qty: 1, lineTotalGBP: 60.75, ocrExtracted: false, unconfirmedHighValue: true, lineConf: 0.55 },
    { refDes: 'U2', componentType: 'ic_soic', partNumber: 'NXP TJA1145', unitPriceGBP: 6.08, qty: 1, lineTotalGBP: 6.08, ocrExtracted: true, lineConf: 0.9 },
    { refDes: 'U3', componentType: 'ic_tqfp', partNumber: 'NXP TLE9263', unitPriceGBP: 8.10, qty: 1, lineTotalGBP: 8.10, ocrExtracted: true, lineConf: 0.9 },
    { refDes: 'U6,U7', componentType: 'ic_tqfp', partNumber: 'TI DRV8305', unitPriceGBP: 6.075, qty: 2, lineTotalGBP: 12.15, ocrExtracted: true, lineConf: 0.85 },
    { refDes: 'U9', componentType: 'ic_soic', partNumber: 'TJA1044', unitPriceGBP: 2.43, qty: 1, lineTotalGBP: 2.43, ocrExtracted: true, lineConf: 0.9 },
    { refDes: 'J1', componentType: 'connector_smt', partNumber: 'Kostal/TE MX150-class', unitPriceGBP: 24.30, qty: 1, lineTotalGBP: 24.30, ocrExtracted: false, unconfirmedHighValue: true, lineConf: 0.5 },
    { refDes: 'C1-C24', componentType: 'passive_0402', partNumber: '', unitPriceGBP: 0.016, qty: 24, lineTotalGBP: 0.39, ocrExtracted: false, lineConf: 0.9 },
  ];
}
const aiTotal = () => bom().reduce((s, l) => s + Number(l.lineTotalGBP), 0);

describe('offline catalogue matching', () => {
  it('normalises manufacturer-prefixed MPNs to the orderable part', () => {
    expect(normaliseMPN('NXP TJA1145')).toBe('NXPTJA1145');
    expect(cataloguePrice('NXP TJA1145')).toBe(2.80);      // token match
    expect(cataloguePrice('TJA1044GT/3')).toBe(0.95);       // family/prefix match
    expect(cataloguePrice('S25FL256S')).toBe(2.20);
  });
  it('refuses to price a guessed / family label (stays flagged)', () => {
    expect(cataloguePrice('AT6AS70 (est. AURIX-class)')).toBeNull();
    expect(cataloguePrice('Kostal/TE MX150-class')).toBeNull();
    expect(cataloguePrice('OBD-II DE9')).toBeNull();
  });
});

describe('class-median cap', () => {
  it('caps an over-priced unconfirmed part to its class median, never raises', () => {
    expect(classMedianCap('ic_bga', 60.75)).toBe(18.00);   // AURIX guess → BGA median
    expect(classMedianCap('connector_smt', 24.30)).toBe(6.00);
    expect(classMedianCap('passive_0402', 0.016)).toBe(0.016); // already below cap → unchanged
  });
});

describe('groundAndSplit — end-to-end on the ECU slice', () => {
  const cands = groundingCandidates(bom(), 20);
  const live = offlineCataloguePrices(cands, 10000);
  const out = groundAndSplit(bom(), live);

  it('catalogue-grounds the confirmed ICs', () => {
    expect(out.matched).toBeGreaterThanOrEqual(3);          // TJA1145, TLE9263, DRV8305, TJA1044…
    const u2 = out.bom.find(l => l.refDes === 'U2')!;
    expect(u2.priceSource).toBe('catalogue');
    expect(u2.unitPriceGBP).toBe(2.80);
  });
  it('caps the two unconfirmed high-value guesses', () => {
    expect(out.capped).toBe(2);                             // U1 + J1
    const u1 = out.bom.find(l => l.refDes === 'U1')!;
    expect(u1.unitPriceGBP).toBe(18.00);
    expect(u1.needsVerification).toBe(true);
    const j1 = out.bom.find(l => l.refDes === 'J1')!;
    expect(j1.unitPriceGBP).toBe(6.00);
  });
  it('drops the BOM total far below the raw AI total', () => {
    expect(aiTotal()).toBeGreaterThan(110);                 // ~114 for this slice
    expect(out.bomTotal).toBeLessThan(0.6 * aiTotal());     // grounded+capped well under
    expect(out.confirmedTotal + out.unverifiedTotal).toBeCloseTo(out.bomTotal, 2);
  });
  it('routes the guesses into the needs-verification bucket, keeping the headline clean', () => {
    // U1 (18) + J1 (6) = 24 in the unverified bucket
    expect(out.unverifiedTotal).toBeGreaterThan(20);
    expect(out.confirmedTotal).toBeLessThan(out.unverifiedTotal + 20);
  });
});
