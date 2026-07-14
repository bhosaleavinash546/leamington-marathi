import { describe, it, expect } from 'vitest';
import { normalizePCBAnalysis } from '../server/utils/pcb-normalize.js';

describe('normalizePCBAnalysis', () => {
  it('fills a completely missing assembly section (the a.smtPlacements crash)', () => {
    const a: Record<string, unknown> = {
      partName: 'Board',
      bom: [{ refDes: 'U1', qty: 2, unitPriceGBP: 3 }, { refDes: 'C1', qty: 10, unitPriceGBP: 0.01 }],
    };
    normalizePCBAnalysis(a);
    const asm = a.assembly as Record<string, number>;
    expect(asm.smtPlacements).toBe(12); // derived from BOM quantities
    expect(asm.reflowSides).toBe(1);
    expect(typeof asm.ictTimeSec).toBe('number');
  });

  it('fills missing costEstimates numerics (the toFixed crash)', () => {
    const a: Record<string, unknown> = {
      bom: [{ qty: 4, unitPriceGBP: 2.5 }],
      costEstimates: {}, // present but empty — totalBOMCostGBP.toFixed() crashed
    };
    normalizePCBAnalysis(a);
    const ce = a.costEstimates as { totalBOMCostGBP: number; pcbFabGBP: { min: number; mid: number; max: number }; smtAssemblyCostGBP: number };
    expect(ce.totalBOMCostGBP).toBe(10);           // derived: 4 × £2.50
    expect(Number.isFinite(ce.pcbFabGBP.min)).toBe(true);
    expect(Number.isFinite(ce.pcbFabGBP.mid)).toBe(true);
    expect(Number.isFinite(ce.pcbFabGBP.max)).toBe(true);
    expect(ce.pcbFabGBP.max).toBeGreaterThan(ce.pcbFabGBP.min);
    expect(ce.smtAssemblyCostGBP).toBe(0);
  });

  it('coerces non-numeric BOM fields instead of letting NaN through', () => {
    const a: Record<string, unknown> = {
      bom: [{ refDes: 'R1', qty: 'two', unitPriceGBP: null }],
    };
    normalizePCBAnalysis(a);
    const line = (a.bom as Array<Record<string, unknown>>)[0];
    expect(line.qty).toBe(1);
    expect(line.unitPriceGBP).toBe(0);
  });

  it('preserves valid values untouched', () => {
    const a: Record<string, unknown> = {
      partName: 'ECU Main Board',
      bom: [{ qty: 5, unitPriceGBP: 1.2 }],
      assembly: { smtPlacements: 290, throughHoleJoints: 30, manualJoints: 4, bgaCount: 5, complexity: 'High', reflowSides: 2, aoiRequired: true, ictTimeSec: 45 },
      boardSpec: { estimatedLayers: 8, widthMm: 120, heightMm: 90 },
      costEstimates: { pcbFabGBP: { min: 4, mid: 5, max: 7 }, totalBOMCostGBP: 42.5, smtAssemblyCostGBP: 1.8 },
      confidenceLevel: 'High',
      aiInsights: ['x'],
    };
    normalizePCBAnalysis(a);
    expect((a.assembly as Record<string, unknown>).smtPlacements).toBe(290);
    expect((a.costEstimates as Record<string, { mid: number }>).pcbFabGBP.mid).toBe(5);
    expect((a.costEstimates as Record<string, unknown>).totalBOMCostGBP).toBe(42.5);
    expect((a.boardSpec as Record<string, unknown>).estimatedLayers).toBe(8);
    expect(a.confidenceLevel).toBe('High');
    expect(a.aiInsights).toEqual(['x']);
  });

  it('handles the fully-empty pathological payload', () => {
    const a: Record<string, unknown> = {};
    normalizePCBAnalysis(a);
    expect(Array.isArray(a.bom)).toBe(true);
    expect(a.partName).toBe('PCB Assembly');
    expect((a.assembly as Record<string, unknown>).smtPlacements).toBe(0);
    expect(Number.isFinite((a.costEstimates as { totalBOMCostGBP: number }).totalBOMCostGBP)).toBe(true);
    expect((a.boardSpec as Record<string, unknown>).widthMm).toBe(100);
  });
});
