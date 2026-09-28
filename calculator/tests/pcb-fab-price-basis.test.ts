/**
 * PCB fabrication is a price, and gets no overhead or margin on top (H8).
 *
 * Every table in pcb-fab.ts is what a fabricator charges — "base panel price"
 * by region, price-list adders for finish and test. The stack then added 12%
 * overhead and 8% margin, so a default board read ×1.22 of its own price
 * (£82.43 → £100.75). The module now declares the figure a price, and both
 * callers (the form and the server's cost executor) add nothing to it.
 */
import { describe, it, expect } from 'vitest';
import { computePCBFabDrivers, type PCBFabInputs } from '../src/engine/modules/pcb-fab.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { runShouldCostAudit } from '../src/engine/should-cost-audit.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const FAB: PCBFabInputs = {
  layers: 4, boardWidthMm: 100, boardHeightMm: 50, panelWidthMm: 500, panelHeightMm: 600, panelUtilization: 0.72,
  technology: 'FR4_STD', baseMaterialTg: 130, copperWeightOz: 1, outerCopperWeightOz: 1,
  viaType: 'through_only', throughViaCount: 200, blindViaCount: 0, buriedViaCount: 0, microViaCount: 0,
  hdiStructure: 'none', minTraceSpaceMm: 0.15, impedanceControlled: false, hasFinePitchBGA: false,
  solderMaskColor: 'green', silkscreenSides: 2, surfaceFinish: 'enig', testMethod: 'flying_probe',
  qualityGrade: 'consumer', region: 'uk', nreCost: 800, amortizationVolume: 10000, fabYieldOverride: 0.96,
};

describe('a PCB fab figure is a price', () => {
  it('the module says so', () => {
    expect(computePCBFabDrivers(FAB).priceBasis).toBe('market_price');
  });

  it('the server executor adds no overhead or margin to it', () => {
    const d = computePCBFabDrivers(FAB);
    const r = executeCalculateCost({ commodity: 'pcb_fab', params: FAB as unknown as Record<string, unknown> });
    expect(r.success).toBe(true);
    expect(r.breakdown.overhead).toBe(0);
    expect(r.breakdown.margin).toBe(0);
    // Price + amortised NRE + packaging + logistics, and nothing else.
    expect(r.total).toBeCloseTo(d.rawMaterial.directCost! + 800 / 10000 + 0.15 + 0.25, 3);   // executor rounds to 4 dp
  });

  it('other commodities still get their overhead and margin', () => {
    const r = executeCalculateCost({ commodity: 'machining', params: {
      materialId: 'mat-al6061', netWeightKg: 0.5, stockWeightKg: 0.77, materialUtilization: 0.65,
      operations: [{ operationName: 'Mill', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.12,
        partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 }],
      setup: { setupTimeHr: 1.5, batchSize: 500, machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' },
      programmingNRE: 2000, toolingCost: 15000, amortizationVolume: 50000,
    } });
    expect(r.success).toBe(true);
    expect(r.breakdown.overhead).toBeGreaterThan(0);
    expect(r.breakdown.margin).toBeGreaterThan(0);
  });
});

describe('the audit still asks whether it is really a bare board', () => {
  const run = (input: UniversalStackInput) => runShouldCostAudit({
    commodity: 'pcb_fab', input, result: computeUniversalStack(input, DEFAULT_RATE_LIBRARY),
    library: DEFAULT_RATE_LIBRARY, annualVolume: null,
  }).find(f => f.id === 'zero-conversion-cost');
  const d = computePCBFabDrivers(FAB);
  const input: UniversalStackInput = {
    partName: 'Board', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0, marginPct: 0,
  };

  it('a declared price is named as one, and points a populated board at PCBA', () => {
    const f = run({ ...input, priceBasis: 'market_price' })!;
    expect(f.severity).toBe('medium');
    expect(f.message).toMatch(/fabricator's price/);
    expect(f.message).toMatch(/PCBA/);
  });

  it('without the declaration, material-only is still the HIGH error it was (the ECU lesson)', () => {
    expect(run(input)!.severity).toBe('high');
  });
});
