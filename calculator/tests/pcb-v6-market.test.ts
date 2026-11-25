/**
 * EDU v6 — the build country's component market (China: szlcsc own-stock reel prices), the engineer's choice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classRange, classRowByKey, classDefaultPrice } from '../server/utils/pcb-class-pricing.js';
import { componentMarketFor, marketRow, marketPart } from '../server/data/pcb-component-market.js';
import { offlineCataloguePrices } from '../server/utils/pcb-bom-grounding.js';
import { runStage4 } from '../server/routes/pcb.js';

const data = JSON.parse(readFileSync('server/data/pcb-component-market.json', 'utf8'));

describe('market data', () => {
  it('every China row maps to a class the tool has, from ≥ 8 sourced parts, with its median inside the range', () => {
    const rows = data.markets.cn.rows as Record<string, { lo: number; hi: number; p50: number; n: number }>;
    expect(Object.keys(rows).length).toBeGreaterThanOrEqual(20);
    for (const [k, r] of Object.entries(rows)) {
      expect(classRowByKey(`${k}.automotive`), k).not.toBeNull();
      expect(r.n, k).toBeGreaterThanOrEqual(8);
      expect(r.lo <= r.p50 && r.p50 <= r.hi, k).toBe(true);
    }
    for (const p of Object.values(data.markets.cn.parts) as Array<{ url: string; date: string; gbp: number }>) {
      expect(p.url).toMatch(/^https:\/\/item\.szlcsc\.com\//); expect(p.date).toBe('2026-11-25'); expect(p.gbp).toBeGreaterThan(0);
    }
  });
});

describe('the market is the engineer\'s choice', () => {
  it('global by default; the build country\'s market only when set and sourced', () => {
    expect(componentMarketFor({}, 'cn')).toBeUndefined();
    expect(componentMarketFor({ componentMarket: 'local' }, 'cn')).toBe('cn');
    expect(componentMarketFor({ componentMarket: 'local' }, 'de')).toBeUndefined();   // no sourced German market
  });
  it('an automotive class line takes the market row, keyed @cn, its point at most the market median', () => {
    const g = classRange({ componentType: 'capacitor', description: 'MLCC X7R', pkg: '0603' }, true);
    const m = classRange({ componentType: 'capacitor', description: 'MLCC X7R', pkg: '0603' }, true, 'cn');
    expect(m.key).toBe('passive_0603.cap.automotive@cn');
    expect(m.label).toMatch(/China market/);
    expect(classDefaultPrice(m)).toBeLessThan(classDefaultPrice(g));
    expect(classDefaultPrice(m)).toBeLessThanOrEqual(marketRow('cn', 'passive_0603.cap')!.p50);
    expect(classRowByKey(m.key)!.lo).toBe(m.lo);
    // a non-automotive line, or a class with no market row, is unchanged
    expect(classRange({ componentType: 'capacitor', description: 'MLCC', pkg: '0603' }, false, 'cn').key).toBe('passive_0603.cap');
    expect(classRange({ componentType: 'ic_bga', description: 'MCU in BGA' }, true, 'cn').key).not.toMatch(/@cn/);
  });
  it('a named part takes its own reel price when lower than the catalogue, and says so', () => {
    const hit = Object.values(data.markets.cn.parts as Record<string, { part: string; gbp: number }>).find(p => offlineCataloguePrices([p.part], 10_000).length > 0);
    if (!hit) return;
    const [glob] = offlineCataloguePrices([hit.part], 10_000);
    const [loc] = offlineCataloguePrices([hit.part], 10_000, 'cn');
    expect(loc.unitPriceGBP).toBeLessThanOrEqual(glob.unitPriceGBP + 1e-9);
    if (hit.gbp < glob.unitPriceGBP) expect(loc.sourceNote).toMatch(/China market: .* own-stock whole reel/);
    expect(marketPart('cn', hit.part)).not.toBeNull();
  });
});

describe('Stage 4 with the China market', () => {
  const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
  const run = (market?: string) => {
    const a = JSON.parse(JSON.stringify(src.analysis));
    if (market) a.boardSpec.componentMarket = market;
    return runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' });
  };
  it('China takes the market; every other country in the comparison stays at global prices', async () => {
    const g = await run(), l = await run('local');
    expect(g.componentMarket).toBeNull();
    expect(l.componentMarket!.componentsGBP).toBeLessThan(l.componentMarket!.globalComponentsGBP);
    expect(l.componentMarket!.globalComponentsGBP).toBeCloseTo(g.selectedCountryBreakdown!.bomCostPerBoard / (1 + g.selectedCountryBreakdown!.breakdown.materialBurdenPct!), 1);
    expect(l.selectedCountryBreakdown!.totalPerBoard).toBeLessThan(g.selectedCountryBreakdown!.totalPerBoard);
    const de = (s: typeof g) => s.countryComparison.find(c => c.countryId === 'de')!.totalPerBoard;
    expect(de(l)).toBeCloseTo(de(g), 2);
    expect(l.volumeCurves.gb.find(p => p.qty === 10_000)!.totalPerBoard).toBeCloseTo(g.volumeCurves.gb.find(p => p.qty === 10_000)!.totalPerBoard, 2);
  }, 90_000);
});
