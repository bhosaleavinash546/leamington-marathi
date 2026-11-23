/**
 * Round 6 (23 Nov 2026) — merge rules 5b / 6a: a part whose observations say how each row is sold.
 * A cut-tape row is a sampling price. Read as a volume break, the cut-tape → reel step put the 200k figure 20–39 % too
 * low on 15 of 444 parts read live. With a full-packaging row (reel / tray / tube) the slope comes only from rows of the
 * same full packaging of one distributor, and 10k–300k follow the published ladder (derived beyond its largest row).
 * Observations WITHOUT `packing` (every entry before round 6) are priced exactly as before.
 */
import { describe, it, expect } from 'vitest';
import { priceFromObservations, DEFAULT_B } from '../scripts/pcb-catalogue-research-merge';
import { FX_TO_GBP_TABLE as FX } from '../src/engine/insights';

const dk = (qty: number, price: number, packing?: string) => ({ distributor: 'Digi-Key', qty, price, currency: 'USD',
  url: 'https://www.digikey.com/en/products/detail/x/1', date: '2026-11-23', ...(packing ? { packing, evidence: 'page-read' } : {}) });
const tme = (qty: number, price: number, packing?: string) => ({ ...dk(qty, price, packing), distributor: 'TME', url: 'https://www.tme.eu/en/details/x/' });
const usd = FX.USD;

describe('packing-aware ladder (rules 5b / 6a)', () => {
  it('the cut-tape → reel step is not a volume slope: reel to reel only (NVMFWS0D9N04XMT1G as read)', () => {
    const tagged = priceFromObservations([dk(500, 1.21288, 'cut tape'), dk(1500, 0.97463, 'reel'), dk(3000, 0.96237, 'reel')])!;
    const untagged = priceFromObservations([dk(500, 1.21288), dk(1500, 0.97463), dk(3000, 0.96237)])!;
    expect(untagged.b).toBeGreaterThan(0.12);                         // the old reading: three mixed pairs
    expect(tagged.b).toBe(0.02);                                      // ln(0.97463 / 0.96237) / ln 2 = 0.018 → the 0.02 floor
    expect(tagged.basis).toMatch(/1 pair of the same full packaging/);
    // 200k = the largest reel row moved along b
    expect(tagged.gbp.q200k).toBeCloseTo(0.96237 * usd * Math.pow(200000 / 3000, -0.02), 3);
    expect(tagged.gbp.q200k! / untagged.gbp.q200k!).toBeGreaterThan(1.4);
  });

  it('a published reel row is reproduced exactly, and a break between two rows is log-log between them', () => {
    // CRCW0402 as read: cut tape 1,000; reel 10,000 and 100,000
    const p = priceFromObservations([dk(1000, 0.00882, 'cut tape'), dk(10000, 0.00551, 'reel'), dk(100000, 0.00414, 'reel')])!;
    expect(p.gbp.q10k).toBeCloseTo(0.00551 * usd, 4);
    expect(p.gbp.q100k).toBeCloseTo(0.00414 * usd, 4);
    const b = Math.log(0.00551 / 0.00414) / Math.log(10);             // 0.124, the reel's own slope
    expect(p.b).toBeCloseTo(b, 3);
    expect(p.gbp.q200k).toBeCloseTo(0.00414 * usd * Math.pow(2, -b), 4);   // derived beyond the largest row
    expect(p.gbp.q1k).toBeCloseTo(0.00882 * usd, 4);                  // what a 1,000-piece buyer pays (rule 4)
    const mid = priceFromObservations([dk(500, 0.05, 'cut tape'), dk(4000, 0.02, 'reel'), dk(40000, 0.016, 'reel')])!;
    expect(mid.gbp.q10k).toBeCloseTo(0.02 * usd * Math.pow(10000 / 4000, Math.log(0.016 / 0.02) / Math.log(10)), 4);
  });

  it('one reel row and a cut-tape row: no same-packing pair, so the franchise curve from the reel row — and it says so', () => {
    const p = priceFromObservations([dk(500, 2.0502, 'cut tape'), dk(4000, 1.42673, 'reel')])!;
    expect(p.b).toBeCloseTo(DEFAULT_B, 4);
    expect(p.basis).toMatch(/franchise curve \(no two rows of the same full packaging\)/);
    expect(p.gbp.q200k).toBeCloseTo(1.42673 * usd * Math.pow(200000 / 4000, -DEFAULT_B), 3);
  });

  it('a reel printed dearer than cut tape never makes a larger break dearer than a smaller one', () => {
    const p = priceFromObservations([dk(500, 1.3963, 'cut tape'), dk(4000, 1.42736, 'reel')])!;
    const g = p.gbp;
    expect(g.q10k).toBeLessThanOrEqual(g.q1k); expect(g.q100k).toBeLessThanOrEqual(g.q10k);
    expect(g.q200k!).toBeLessThanOrEqual(g.q100k); expect(g.q300k!).toBeLessThanOrEqual(g.q200k!);
  });

  it('two distributors: each on its own ladder, the median at every break; a cut-tape-only distributor moves from its 1k level', () => {
    const p = priceFromObservations([dk(1000, 0.60, 'cut tape'), dk(3000, 0.50, 'reel'), dk(30000, 0.40, 'reel'), tme(1000, 0.30, 'cut tape')])!;
    const b = Math.log(0.50 / 0.40) / Math.log(10);
    const dkAt100k = 0.40 * Math.pow(100000 / 30000, -b), tmeAt100k = 0.30 * Math.pow(100, -b);
    expect(p.gbp.q100k).toBeCloseTo(((dkAt100k + tmeAt100k) / 2) * usd, 3);
    expect(p.distributors).toEqual(['Digi-Key', 'TME']);
  });

  it('observations without packing are priced exactly as before round 6', () => {
    const a = priceFromObservations([dk(1000, 0.62), dk(3000, 0.55)])!;
    const b = Math.log(0.62 / 0.55) / Math.log(3);
    expect(a.b).toBeCloseTo(b, 3);
    expect(a.gbp.q200k).toBeCloseTo(0.62 * usd * Math.pow(200, -b), 3);
    expect(a.basis).toBe("slope from the part's own breaks (1 pair)");
  });
});
