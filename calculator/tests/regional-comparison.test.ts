import { describe, it, expect } from 'vitest';
import { computeRegionalComparison } from '../src/engine/regional-rates.js';
import type { Breakdown8Bucket } from '../src/engine/types.js';

const bkd: Breakdown8Bucket = { rawMaterial: 10, process: 8, labour: 6, tooling: 2, overhead: 3, packaging: 0.5, logistics: 1, margin: 2 };

describe('regional cost comparison', () => {
  it('uses UK as the base with ex-works = material+process+labour+tooling+overhead', () => {
    const rows = computeRegionalComparison(bkd);
    const uk = rows.find(r => r.code === 'UK')!;
    expect(uk.isBase).toBe(true);
    expect(uk.vsBasePct).toBe(0);
    expect(uk.exWorks).toBeCloseTo(29, 5);          // 10+8+6+2+3
    expect(uk.total).toBeCloseTo(32.5, 5);          // exWorks + pkg 0.5 + log 1 + margin 2
  });

  it('reports a cheaper low-cost region as a positive vs-base saving', () => {
    const rows = computeRegionalComparison(bkd);
    const pl = rows.find(r => r.code === 'PL')!;
    expect(pl.total).toBeLessThan(rows.find(r => r.code === 'UK')!.total);
    expect(pl.vsBasePct).toBeGreaterThan(0);        // cheaper than UK
  });

  it('landed cost adds duty + freight for offshore regions', () => {
    const exw = computeRegionalComparison(bkd, { landed: false }).find(r => r.code === 'CN')!;
    const landed = computeRegionalComparison(bkd, { landed: true }).find(r => r.code === 'CN')!;
    expect(landed.total).toBeGreaterThan(exw.total); // duty + shipping applied
    expect(landed.exWorks).toBeCloseTo(exw.exWorks, 5); // ex-works unchanged
  });

  it('returns all default regions', () => {
    expect(computeRegionalComparison(bkd).length).toBe(10);
  });
});
