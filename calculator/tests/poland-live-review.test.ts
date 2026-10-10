/**
 * Poland live review (10 Oct 2026, docs/review/poland-live-review-2026-10-10.md): three parts run live in Poland
 * (stub axle cast + machine, ECU cover moulding, seat bracket stamping), every line of the PDF and Excel read. The
 * defects below changed numbers or told a buyer something false.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { recostLevers } from '../src/engine/idea-levers.js';
import { computeSheetMetalDrivers } from '../src/engine/modules/sheet-metal.js';
import { computeInjectionMouldingDrivers } from '../src/engine/modules/injection-moulding.js';
import { amortisationParts } from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import { smProgrammeParts } from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import type { CostOptimisation } from '../src/engine/dfm-dfa.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

describe('tooling maintenance is charged for every year of the amortisation', () => {
  it('a stamping die on a 5-year programme carries 5 years of its 5% a year (it carried one: the seat bracket was 2.4% low)', () => {
    const base = { materialId: 'mat-dc04', partWeightKg: 0.56, blankLengthMm: 233, blankWidthMm: 292, thicknessMm: 1.6,
      shearStrengthMPa: 280, pressId: 'press-400t', labourId: 'lab-uk-semiskilled', strokesPerMinute: 20, oee: 0.85,
      manning: 0.5, labourEfficiency: 0.95, numOperations: 7, dieType: 'progressive', dieLife: 1_000_000,
      dieCostEstimate: 272_264 / 5.096, amortizationVolume: 500_000, dieMaintenanceFraction: 0.05 } as never;
    const one = computeSheetMetalDrivers({ ...(base as object), maintenanceYears: 1 } as never).tooling.totalToolingCost;
    const five = computeSheetMetalDrivers({ ...(base as object), maintenanceYears: 5 } as never).tooling.totalToolingCost;
    expect(five / one).toBeCloseTo(1.25 / 1.05, 6);
  });
  it('a mould likewise (3% a year × the years covered)', () => {
    const base = { materialId: 'mat-pa66gf30', partWeightKg: 0.159, projectedAreaCm2: 216, wallThicknessMm: 2.5, cavities: 1,
      machineId: 'imm-200t', labourId: 'lab-uk-semiskilled', cycleTimeSec: 19.5, oee: 0.85, manning: 0.5, labourEfficiency: 0.95,
      mouldLife: 1_000_000, mouldCostEstimate: 110_767 / 5.096, amortizationVolume: 500_000, mouldMaintenanceFraction: 0.03 } as never;
    const one = computeInjectionMouldingDrivers({ ...(base as object), maintenanceYears: 1 } as never).tooling.totalToolingCost;
    const five = computeInjectionMouldingDrivers({ ...(base as object), maintenanceYears: 5 } as never).tooling.totalToolingCost;
    expect(five / one).toBeCloseTo(1.15 / 1.03, 6);
  });
});

describe('a tool decision ranks on the amortisation the costing carries', () => {
  it('annual × the typed programme years; one year when the programme is blank (as CAD Apply writes the amort field)', () => {
    const ctx = (y?: number) => ({ annualVolume: 100_000, programmeYears: y }) as never;
    expect(amortisationParts(ctx(5))).toBe(500_000);
    expect(amortisationParts(ctx())).toBe(100_000);
    expect(smProgrammeParts(ctx(5))).toBe(500_000);
    expect(smProgrammeParts(ctx())).toBe(100_000);
  });
});

describe('the scrap-credit lever is the gap to 30% of prime — not a second credit', () => {
  it('a part already crediting scrap at 26% of prime saves only the 4-point gap', () => {
    const PL = buildRegionalLibrary(UK, 'PL');
    const input: UniversalStackInput = {
      rawMaterial: { materialId: 'mat-dc04', netWeightKg: 0.5665, materialUtilization: 0.653 },
      operations: [], tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' },
      packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.10, marginPct: 0.08,
    } as never;
    const result = computeUniversalStack(input, PL);
    const mat = PL.materials.find(m => m.id === 'mat-dc04')!;
    const scrapKg = 0.5665 / 0.653 - 0.5665;
    const levers: CostOptimisation[] = [{ title: 'Scrap Revenue Recovery at Index Prices', description: '', expectedSavingPct: 5,
      technicalJustification: '', risk: 'Low', timeframe: 'Quick Win' }];
    recostLevers(levers, result, input, PL);
    const expected = scrapKg * (0.30 * mat.pricePerKg - mat.scrapRecoveryPricePerKg) * 1.10 * 1.08;
    if (expected > 0.0005) {
      expect(levers[0].savingGBP).toBeCloseTo(expected, 4);
      // the old transform (utilisation +30% of the scrap) bought less metal AND kept the credit: ~8× this
      expect(levers[0].savingGBP!).toBeLessThan(0.03);
    } else {
      expect(levers.length).toBe(0);
    }
  });
});

describe('a held grade in a book country is Low confidence', () => {
  it('Poland has no PA66-GF30 price: UK × factor, graded Low (it printed Medium on 53% of a part)', () => {
    const PL = buildRegionalLibrary(UK, 'PL');
    const m = PL.materials.find(x => x.id === 'mat-pa66gf30')!;
    expect(m.sourceNote).toMatch(/^Poland: no Poland price/);
    expect(m.confidence).toBe('Low');
  });
  it('a country with no book keeps the grading it had (everything there is UK × factor)', () => {
    const TR = buildRegionalLibrary(UK, 'TR' as never);
    const uk = UK.materials.find(x => x.id === 'mat-pa66gf30')!;
    expect(TR.materials.find(x => x.id === 'mat-pa66gf30')!.confidence).toBe(uk.confidence);
  });
});

describe('held machine capital reads plainly', () => {
  it('one line, Low, no research remarks and no "3.5% of capex" maintenance clause', () => {
    const PL = buildRegionalLibrary(UK, 'PL');
    const p = PL.machines.find(m => m.id === 'press-400t')!;
    expect(p.sourceNote).toMatch(/capital HELD — no Poland capex was sourced for this machine/);
    expect(p.sourceNote).not.toMatch(/round-2|press brakes ~4×|3\.5% of capex|h hours/);
  });
});
