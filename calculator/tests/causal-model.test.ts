import { describe, it, expect } from 'vitest';
import {
  buildCausalModel, counterfactual, impliedIndexPremiumPct, coachSentence,
  indexCategoryForFamily, scenarioPortfolioDrift, type CommodityIndexRef, type PortfolioCase,
} from '../src/engine/causal-model.js';

const fmt = (n: number) => `£${n.toFixed(2)}`;
const indices: CommodityIndexRef[] = [
  { category: 'Aluminium', currentPrice: 2400, unit: '£/t' },
  { category: 'Steel', currentPrice: 720, unit: '£/t' },
];

describe('causal cost model', () => {
  it('maps material families to commodity indices', () => {
    expect(indexCategoryForFamily('Aluminium 6061-T6')).toBe('Aluminium');
    expect(indexCategoryForFamily('stainless steel')).toBe('Steel');
    expect(indexCategoryForFamily('Brass CZ121')).toBe('Copper');
    expect(indexCategoryForFamily('PEEK')).toBeNull();     // no metal index
  });

  it('builds a driver with the correct pass-through amplifier', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'Aluminium', overheadPct: 0.12, marginPct: 0.08, indices });
    expect(m.driver).not.toBeNull();
    // passthrough = 1.12 * 1.08 = 1.2096; £/1% = 40/100 * 1.2096 ≈ 0.48
    expect(m.driver!.passThrough).toBeCloseTo(1.21, 2);
    expect(m.driver!.gbpPer1pctIndex).toBeCloseTo(0.48, 2);
  });

  it('returns no driver for unmapped materials', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'PEEK', overheadPct: 0.12, marginPct: 0.08, indices });
    expect(m.driver).toBeNull();
    expect(counterfactual(m, -10)).toBeNull();
  });

  it('counterfactual scales linearly and signs correctly', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'Aluminium', overheadPct: 0.12, marginPct: 0.08, indices });
    const down = counterfactual(m, -10)!;
    const up = counterfactual(m, +10)!;
    expect(down.deltaGBP).toBeLessThan(0);
    expect(up.deltaGBP).toBeGreaterThan(0);
    expect(down.deltaGBP).toBeCloseTo(-up.deltaGBP, 4);
    expect(down.newTotal).toBeLessThan(100);
    // -10% aluminium → material -£4 → total -£4.84
    expect(down.deltaGBP).toBeCloseTo(-4.84, 2);
  });

  it('implied index premium diagnoses an inflated quote', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'Aluminium', overheadPct: 0.12, marginPct: 0.08, indices });
    // quote £110 → gap £10 → material gap 10/1.2096 ≈ 8.27 → vs £40 material ≈ 20.7%
    const prem = impliedIndexPremiumPct(m, 110);
    expect(prem).toBeCloseTo(20.7, 0);
    expect(impliedIndexPremiumPct(m, 95)).toBeNull();   // below should-cost → no premium
  });

  it('coach sentence names the driver and the counter', () => {
    const m = buildCausalModel({ partTotal: 100, materialCostGBP: 40, materialFamily: 'Aluminium', overheadPct: 0.12, marginPct: 0.08, indices });
    const s = coachSentence(m, 110, fmt)!;
    expect(s).toContain('Aluminium');
    expect(s).toContain('above today');
    expect(coachSentence(m, null, fmt)).toContain('Every 1% move');
  });

  it('portfolio what-if flags parts that cross underwater / open a gap', () => {
    const cases: PortfolioCase[] = [
      // supplier at £105 vs should-cost £100 (a gap). Steel +10% raises should-cost above 105 → gap closes; not new.
      { partName: 'Steel Bracket', commodity: 'stamping', materialFamily: 'Steel', totalCost: 100, actualCost: 95, materialCostGBP: 50 },
    ];
    // Steel +20% → material +£10 × 1.2096 ≈ +£12.1 → scenarioTotal ≈ 112.1; actual 95 < 112.1 and 95 < 100 → was & now under (not new)
    const impacts = scenarioPortfolioDrift(cases, { Steel: 20 });
    expect(impacts.length).toBe(1);
    expect(impacts[0].scenarioTotal).toBeGreaterThan(100);
  });

  it('portfolio what-if newly makes a supplier underwater', () => {
    const cases: PortfolioCase[] = [
      // supplier £103 vs should-cost £100 (gap today). Steel +10% → should-cost ~106 > 103 → newly underwater.
      { partName: 'Steel Beam', commodity: 'stamping', materialFamily: 'Steel', totalCost: 100, actualCost: 103, materialCostGBP: 60 },
    ];
    const impacts = scenarioPortfolioDrift(cases, { Steel: 10 });
    expect(impacts[0].crossesUnderwater).toBe(true);
  });
});
