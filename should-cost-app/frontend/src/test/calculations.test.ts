import { describe, it, expect } from 'vitest';

// Core CER calculation functions (replicated for testing)
function calcMaterialCost(weightKg: number, pricePerKg: number, buyToFly = 1.05): number {
  return weightKg * pricePerKg * buyToFly;
}

function calcLabourCost(cycleTimeSec: number, labourRatePerHr: number): number {
  return (cycleTimeSec / 3600) * labourRatePerHr;
}

function calcOverheadCost(labourCost: number, machineCost: number, overheadPct: number): number {
  return (labourCost + machineCost) * (overheadPct / 100);
}

function calcScrapCost(materialCost: number, scrapRatePct: number): number {
  return materialCost * (scrapRatePct / 100);
}

function calcPackagingCost(materialCost: number, labourCost: number, machineCost: number): number {
  return (materialCost + labourCost + machineCost) * 0.02;
}

function calcVariancePct(shouldCost: number, quotedPrice: number): number {
  if (shouldCost === 0) return 0;
  return ((quotedPrice - shouldCost) / shouldCost) * 100;
}

describe('CER Cost Calculation Functions', () => {
  describe('Material Cost', () => {
    it('calculates material cost with default buy-to-fly ratio', () => {
      expect(calcMaterialCost(1.5, 0.70)).toBeCloseTo(1.1025);
    });

    it('calculates material cost with custom buy-to-fly ratio', () => {
      expect(calcMaterialCost(2.0, 2.10, 1.10)).toBeCloseTo(4.62);
    });

    it('returns 0 for zero weight', () => {
      expect(calcMaterialCost(0, 0.70)).toBe(0);
    });
  });

  describe('Labour Cost', () => {
    it('calculates labour cost from cycle time', () => {
      expect(calcLabourCost(3600, 25)).toBeCloseTo(25);
    });

    it('calculates labour cost for 30-second cycle', () => {
      expect(calcLabourCost(30, 36)).toBeCloseTo(0.30);
    });
  });

  describe('Overhead Cost', () => {
    it('calculates overhead as percentage of labour + machine', () => {
      expect(calcOverheadCost(10, 5, 40)).toBeCloseTo(6);
    });
  });

  describe('Scrap Cost', () => {
    it('calculates scrap cost as percentage of material', () => {
      expect(calcScrapCost(100, 3)).toBeCloseTo(3);
    });
  });

  describe('Packaging Cost', () => {
    it('calculates packaging as 2% of material+labour+machine', () => {
      expect(calcPackagingCost(100, 20, 10)).toBeCloseTo(2.60);
    });
  });

  describe('Variance Percentage', () => {
    it('calculates positive variance when quoted > should-cost', () => {
      expect(calcVariancePct(100, 115)).toBeCloseTo(15);
    });

    it('calculates negative variance when quoted < should-cost', () => {
      expect(calcVariancePct(100, 85)).toBeCloseTo(-15);
    });

    it('returns 0 when should-cost is 0', () => {
      expect(calcVariancePct(0, 100)).toBe(0);
    });

    it('returns 0 variance for equal prices', () => {
      expect(calcVariancePct(100, 100)).toBe(0);
    });
  });
});

describe('Price Formatting', () => {
  function formatCurrency(value: number, currency = 'GBP'): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 4 }).format(value);
  }

  it('formats GBP with 4 decimal places', () => {
    expect(formatCurrency(1.2345)).toContain('1.2345');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toContain('0.0000');
  });
});
