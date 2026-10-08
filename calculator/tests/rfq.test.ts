import { describe, it, expect } from 'vitest';
import { analyzeRfq, type RfqLineItem } from '../src/engine/rfq.js';

const items: RfqLineItem[] = [
  { partName: 'Housing', commodity: 'casting', quantity: 1000, shouldCostPerPart: 40, targetPricePerPart: 48, supplierCount: 2 },     // headroom
  { partName: 'Bracket', commodity: 'machining', quantity: 5000, shouldCostPerPart: 8, targetPricePerPart: 7, supplierCount: 1, toleranceClass: 'tight' }, // aggressive + single + tight
  { partName: 'Seal', commodity: 'rubber', quantity: 20000, netWeightKg: 0.02, materialPricePerKg: 2.0 },  // no should-cost → estimated
];

describe('agentic RFQ analysis', () => {
  it('costs every line and rolls up the portfolio', () => {
    const a = analyzeRfq(items);
    expect(a.lines).toHaveLength(3);
    expect(a.totalShouldCost).toBeGreaterThan(0);
    // extended = per-part × qty
    const housing = a.lines.find(l => l.partName === 'Housing')!;
    expect(housing.extendedShouldCost).toBeCloseTo(40 * 1000, 0);
    // Seal has no engine should-cost → NOT costed (it was material × a rule-of-thumb "conversion" factor), in no total
    const seal = a.lines.find(l => l.partName === 'Seal')!;
    expect(seal.costed).toBe(false);
    expect(seal.shouldCostPerPart).toBe(0);
    expect(a.totalShouldCost).toBeCloseTo(40 * 1000 + 8 * 5000, 2);
    expect(seal.risks[0]).toMatch(/Not should-costed.*Material content alone: £0\.04/);
    expect(a.negotiationBrief.some(b => /no should-cost yet \(Seal\)/.test(b))).toBe(true);
  });

  it('flags headroom vs aggressive targets correctly', () => {
    const a = analyzeRfq(items);
    const housing = a.lines.find(l => l.partName === 'Housing')!;
    const bracket = a.lines.find(l => l.partName === 'Bracket')!;
    expect(housing.gapVsTargetPct).toBeGreaterThan(0);            // 48 vs 40 = +20%
    expect(bracket.gapVsTargetPct).toBeLessThan(0);              // 7 vs 8 = -12.5%
    expect(a.headroomOpportunity).toBeGreaterThan(0);
    expect(a.aggressiveExposure).toBeGreaterThan(0);
  });

  it('detects single-source and tight-tolerance risks with levers', () => {
    const a = analyzeRfq(items);
    const bracket = a.lines.find(l => l.partName === 'Bracket')!;
    expect(bracket.risks.some(r => r.startsWith('Single-source'))).toBe(true);
    expect(bracket.risks.some(r => r.toLowerCase().includes('tolerance'))).toBe(true);
    expect(bracket.lever.length).toBeGreaterThan(0);
  });

  it('builds a Pareto high-value set and a negotiation brief', () => {
    const a = analyzeRfq(items);
    expect(a.highValueLines.length).toBeGreaterThan(0);
    expect(a.highValueLines.length).toBeLessThanOrEqual(items.length);
    expect(a.negotiationBrief.length).toBeGreaterThan(2);
    expect(a.negotiationBrief.join(' ')).toMatch(/headroom|dual-source|Pareto|tolerance/i);
  });
});

import { groundRfqItems } from '../server/routes/rfq.js';
describe('RFQ lines read by the model keep only numbers in the RFQ text', () => {
  it('drops an invented weight and any model should-cost, keeps what the text states', () => {
    const text = 'Line 1: Bracket, steel, 5,000 off, target £7.20 each, 0.35 kg';
    const [l] = groundRfqItems([{ partName: 'Bracket', commodity: 'sheet_metal', quantity: 5000, targetPricePerPart: 7.2,
      netWeightKg: 0.35, materialPricePerKg: 0.9, shouldCostPerPart: 6.1 }], text);
    expect(l.quantity).toBe(5000);
    expect(l.targetPricePerPart).toBe(7.2);
    expect(l.netWeightKg).toBe(0.35);
    expect(l.materialPricePerKg).toBeUndefined();
    expect(l.shouldCostPerPart).toBeUndefined();
    expect(l.droppedByGrounding?.length).toBe(2);
  });
});
