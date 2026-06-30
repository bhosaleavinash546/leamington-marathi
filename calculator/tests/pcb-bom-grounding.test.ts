import { describe, it, expect } from 'vitest';
import {
  reconcileBomWithCatalogue,
  flagBomConfidence,
  groundingCandidates,
  VERIFY_CONFIDENCE_THRESHOLD,
} from '../server/utils/pcb-bom-grounding.js';
import type { LivePriceResult } from '../server/utils/pcb-live-pricing.js';

const price = (mpn: string, gbp: number, over: Partial<LivePriceResult> = {}): LivePriceResult => ({
  mpn, description: '', manufacturer: '', unitPriceGBP: gbp, priceBreakQty: 100,
  stockQty: 5000, leadTimeWeeks: null, provider: 'rs', automotiveGrade: false,
  distPartNumber: '', rawCurrency: 'GBP', rawUnitPrice: gbp, ...over,
});

describe('reconcileBomWithCatalogue', () => {
  it('replaces the AI price with the catalogue price and preserves the estimate', () => {
    const bom = [{ refDes: 'U1', partNumber: 'STM32F407', qty: 1, unitPriceGBP: 3.2, lineConf: 0.8 }];
    const { bom: out, matched } = reconcileBomWithCatalogue(bom, [price('STM32F407', 5.10)]);
    expect(matched).toBe(1);
    expect(out[0].unitPriceGBP).toBe(5.10);
    expect(out[0].aiEstimatedPriceGBP).toBe(3.2);
    expect(out[0].priceSource).toBe('catalogue');
    expect(out[0].needsVerification).toBe(false);
    expect(out[0].lineConf).toBeGreaterThanOrEqual(0.95);
    expect(out[0].lineTotalGBP).toBe(5.10);
  });

  it('matches MPNs case-insensitively and recomputes the line total by qty', () => {
    const bom = [{ refDes: 'C1', partNumber: 'grm188r61a', qty: 10, unitPriceGBP: 0.02, lineConf: 0.9 }];
    const { bom: out } = reconcileBomWithCatalogue(bom, [price('GRM188R61A', 0.013)]);
    expect(out[0].unitPriceGBP).toBe(0.013);
    expect(out[0].lineTotalGBP).toBe(0.13);
  });

  it('flags an unmatched low-confidence line for verification but keeps its price', () => {
    const bom = [{ refDes: 'R5', partNumber: 'UNKNOWN123', qty: 1, unitPriceGBP: 0.05, lineConf: 0.4 }];
    const { bom: out, matched, needsVerification } = reconcileBomWithCatalogue(bom, []);
    expect(matched).toBe(0);
    expect(needsVerification).toBe(1);
    expect(out[0].unitPriceGBP).toBe(0.05);          // price untouched
    expect(out[0].priceSource).toBe('ai-estimate');
    expect(out[0].needsVerification).toBe(true);
  });

  it('does NOT flag an unmatched high-confidence line', () => {
    const bom = [{ refDes: 'R6', partNumber: 'RC0402', qty: 1, unitPriceGBP: 0.01, lineConf: 0.9 }];
    const { needsVerification } = reconcileBomWithCatalogue(bom, []);
    expect(needsVerification).toBe(0);
  });

  it('flags a line with no part number regardless of confidence', () => {
    const bom = [{ refDes: 'C9', partNumber: '', qty: 1, unitPriceGBP: 0.02, lineConf: 0.99 }];
    const { needsVerification, bom: out } = reconcileBomWithCatalogue(bom, []);
    expect(needsVerification).toBe(1);
    expect(out[0].needsVerification).toBe(true);
  });

  it('carries through stock, lead time and automotive grade from the catalogue', () => {
    const bom = [{ refDes: 'U2', partNumber: 'TJA1051', qty: 1, unitPriceGBP: 0.5, lineConf: 0.7 }];
    const { bom: out } = reconcileBomWithCatalogue(bom, [
      price('TJA1051', 0.62, { stockQty: 0, leadTimeWeeks: 12, automotiveGrade: true, provider: 'octopart' }),
    ]);
    expect(out[0].stockQty).toBe(0);
    expect(out[0].leadTimeWeeks).toBe(12);
    expect(out[0].automotiveGrade).toBe(true);
    expect(out[0].liveProvider).toBe('octopart');
  });

  it('is deterministic — same inputs give identical output', () => {
    const bom = [{ refDes: 'U1', partNumber: 'X', qty: 2, unitPriceGBP: 1, lineConf: 0.5 }];
    const a = JSON.stringify(reconcileBomWithCatalogue(bom, [price('X', 2)]).bom);
    const b = JSON.stringify(reconcileBomWithCatalogue(bom, [price('X', 2)]).bom);
    expect(a).toBe(b);
  });
});

describe('flagBomConfidence (offline, no catalogue)', () => {
  it('flags only the low-confidence / unidentified lines', () => {
    const bom = [
      { refDes: 'U1', partNumber: 'STM32', qty: 1, unitPriceGBP: 3, lineConf: 0.9 },
      { refDes: 'R1', partNumber: '',      qty: 1, unitPriceGBP: 0.01, lineConf: 0.9 },
      { refDes: 'C1', partNumber: 'CAP',   qty: 1, unitPriceGBP: 0.02, lineConf: 0.3 },
    ];
    const { needsVerification } = flagBomConfidence(bom);
    expect(needsVerification).toBe(2);
  });
});

describe('groundingCandidates', () => {
  it('returns unique plausible part numbers, capped', () => {
    const bom = [
      { partNumber: 'STM32F407' }, { partNumber: 'STM32F407' }, // dup
      { partNumber: 'no' },                                     // too short
      { partNumber: '' },                                       // empty
      { partNumber: 'TJA1051T' },
    ];
    expect(groundingCandidates(bom)).toEqual(['STM32F407', 'TJA1051T']);
    expect(groundingCandidates([{ partNumber: 'AAAA' }, { partNumber: 'BBBB' }], 1)).toHaveLength(1);
  });
});

describe('threshold', () => {
  it('is a sane fraction', () => {
    expect(VERIFY_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(VERIFY_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});
