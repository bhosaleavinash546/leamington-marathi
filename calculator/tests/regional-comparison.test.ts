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

  it('re-bases to the source region: that row reproduces the headline exactly', () => {
    // A breakdown COMPUTED for China must not be read as a UK breakdown — the
    // China row has to equal the input total, not be discounted a second time.
    const headline = 10 + 8 + 6 + 2 + 3 + 0.5 + 1 + 2; // 32.5
    const rows = computeRegionalComparison(bkd, { sourceRegion: 'CN' });
    const cn = rows.find(r => r.code === 'CN')!;
    expect(cn.isBase).toBe(true);
    expect(cn.vsBasePct).toBe(0);
    expect(cn.total).toBeCloseTo(headline, 5);
    expect(cn.material).toBeCloseTo(bkd.rawMaterial, 5);
  });

  it('with a China source, the UK row is MORE expensive (proper re-basing, no double discount)', () => {
    const rows = computeRegionalComparison(bkd, { sourceRegion: 'CN' });
    const cn = rows.find(r => r.code === 'CN')!;
    const uk = rows.find(r => r.code === 'UK')!;
    expect(uk.total).toBeGreaterThan(cn.total);       // UK dearer than China
    expect(uk.vsBasePct).toBeLessThan(0);             // "+% vs China" (more expensive)
  });

  it('default source (UK) is unchanged — full back-compat', () => {
    const rows = computeRegionalComparison(bkd);
    const uk = rows.find(r => r.code === 'UK')!;
    expect(uk.isBase).toBe(true);
    expect(uk.total).toBeCloseTo(32.5, 5);
  });
});
