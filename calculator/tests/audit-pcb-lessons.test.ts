/**
 * The Bosch IPB2.0 ECU lessons, encoded as pre-flight checks.
 *
 * The uploaded tool report for that board costed a populated brake ECU as
 * `pcb_fab` — a bare board — and published it: Process £0.00, Labour £0.00,
 * "Operations: 0", one `mat-virtual` material line at 84% of the part, and
 * tooling amortised over 5,000 against a stated 150,000/yr. It under-stated by
 * 88%.
 *
 * Everything else fixed afterwards improved the REPORT. These checks are what
 * stops the same costing being produced again, on any commodity — the audit
 * module's whole premise is that a lesson learned on one part runs against
 * every estimate after it.
 */
import { describe, it, expect } from 'vitest';
import { runShouldCostAudit } from '../src/engine/should-cost-audit.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput, PartCostResult } from '../src/engine/types.js';

/** The uploaded report, reconstructed: bare-board commodity, no routing, no BOM. */
const AS_SHIPPED: UniversalStackInput = {
  partName: 'Bosch IPB2.0 ECU PCB',
  rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 82.43 },
  operations: [],
  tooling: { totalToolingCost: 46_000, amortizationVolume: 5_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.09, marginPct: 0.08,
  annualVolume: 150_000,
};

const audit = (input: UniversalStackInput, commodity = 'pcb_fab') => {
  const result: PartCostResult = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
  return {
    result,
    findings: runShouldCostAudit({
      commodity, input, result, library: DEFAULT_RATE_LIBRARY,
      annualVolume: input.annualVolume ?? null,
    }),
  };
};

describe('the as-shipped ECU costing is caught before anyone sees it', () => {
  it('raises at least one HIGH finding — it must not pass silently', () => {
    const { findings } = audit(AS_SHIPPED);
    expect(findings.some(f => f.severity === 'high')).toBe(true);
  });

  it('flags the missing conversion cost', () => {
    const { findings } = audit(AS_SHIPPED);
    const f = findings.find(x => x.id === 'zero-conversion-cost');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.message).toMatch(/commodity is wrong|no routing/i);
  });

  it('flags the unauditable material bucket', () => {
    const { findings } = audit(AS_SHIPPED);
    const f = findings.find(x => x.id === 'unitemised-direct-material');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
  });

  it('escalates the amortisation error — 30x out is not a "low" note', () => {
    const { findings } = audit(AS_SHIPPED);
    const f = findings.find(x => x.id === 'amort-not-annual');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
  });
});

describe('the corrected costing passes', () => {
  const CORRECTED: UniversalStackInput = {
    ...AS_SHIPPED,
    partName: 'Bosch IPB2.0 ECU PCBA',
    rawMaterial: {
      materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 133.56,
      lines: [
        { ref: 'U-MCU', description: 'Renesas R7F702300B RH850/U2A', qty: 1, unitCost: 15.0, pkg: 'BGA-292' },
        { ref: 'R/C-SMD', description: 'MLCC and thick-film resistors', qty: 620, unitCost: 0.009, pkg: '0402' },
      ],
    },
    operations: [{
      operationName: 'SMT Placement & Reflow', machineId: 'smt-high-speed-line',
      labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.0918, partsPerCycle: 1,
      oee: 0.82, manning: 1, labourTimeHr: 0.0918, labourEfficiency: 1,
    }],
    tooling: { totalToolingCost: 46_000, amortizationVolume: 150_000, mode: 'amortized' },
  };

  it('raises none of the three lessons once it is costed properly', () => {
    const { findings } = audit(CORRECTED, 'pcba');
    for (const id of ['zero-conversion-cost', 'unitemised-direct-material', 'amort-not-annual']) {
      expect(findings.find(f => f.id === id), id).toBeUndefined();
    }
  });
});

describe('the checks are commodity-agnostic, not PCB-specific', () => {
  it('catches a machined part with no routing too', () => {
    const noRouting: UniversalStackInput = {
      partName: 'Bracket',
      rawMaterial: { materialId: 'mat-al6061', netWeightKg: 1.2, materialUtilization: 0.62 },
      operations: [],
      tooling: { totalToolingCost: 0, amortizationVolume: 100_000, mode: 'amortized' },
      packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
    };
    const { findings } = audit(noRouting, 'machining');
    expect(findings.find(f => f.id === 'zero-conversion-cost')).toBeDefined();
  });

  it('does not fire the itemisation check on weight-based material', () => {
    // A weight-based bucket is already traceable through the material rate, so
    // demanding line items there would be noise on every casting and machining.
    const weightBased: UniversalStackInput = {
      partName: 'Bracket',
      rawMaterial: { materialId: 'mat-al6061', netWeightKg: 1.2, materialUtilization: 0.62 },
      operations: [{
        operationName: 'CNC Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.35, partsPerCycle: 1, oee: 0.8, manning: 1,
        labourTimeHr: 0.35, labourEfficiency: 0.92,
      }],
      tooling: { totalToolingCost: 0, amortizationVolume: 100_000, mode: 'amortized' },
      packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
    };
    const { findings } = audit(weightBased, 'machining');
    expect(findings.find(f => f.id === 'unitemised-direct-material')).toBeUndefined();
  });

  it('stays quiet on a small pass-through bucket', () => {
    // Paint on a big assembly is a directCost but nowhere near dominant.
    const smallDirect: UniversalStackInput = {
      partName: 'Painted panel',
      rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 2.0 },
      operations: [{
        operationName: 'Spray', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.6, partsPerCycle: 1, oee: 0.8, manning: 1,
        labourTimeHr: 0.6, labourEfficiency: 0.92,
      }],
      tooling: { totalToolingCost: 0, amortizationVolume: 100_000, mode: 'amortized' },
      packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
    };
    const { findings } = audit(smallDirect, 'painting');
    expect(findings.find(f => f.id === 'unitemised-direct-material')).toBeUndefined();
  });
});
