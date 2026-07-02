import { computeUniversalStack } from './core.js';
import type { UniversalStackInput, PartCostResult, RateLibrary } from './types.js';

export interface SensitivityDriver {
  driver: string;
  parameter: string;
  baseValue: number;
  unit: string;
  plusPct: number;     // % change in total cost when driver +variationPct%
  minusPct: number;    // % change in total cost when driver -variationPct%
  plusCost: number;
  minusCost: number;
  range: number;       // plusCost - minusCost (absolute span, always ≥ 0)
}

export interface SensitivityResult {
  variationPct: number;
  baseline: PartCostResult;
  drivers: SensitivityDriver[];
}

export function runSensitivity(
  input: UniversalStackInput,
  library: RateLibrary,
  variationPct = 10
): SensitivityResult {
  const baseline = computeUniversalStack(input, library);
  const f = variationPct / 100;

  const drivers: SensitivityDriver[] = [];

  function tryDriver(
    driver: string,
    parameter: string,
    baseValue: number,
    unit: string,
    makeVariant: (factor: number) => UniversalStackInput
  ): void {
    try {
      const plus = computeUniversalStack(makeVariant(1 + f), library);
      const minus = computeUniversalStack(makeVariant(1 - f), library);
      const pctBase = baseline.total > 0 ? baseline.total : 1;
      const plusPct = ((plus.total - baseline.total) / pctBase) * 100;
      const minusPct = ((minus.total - baseline.total) / pctBase) * 100;
      drivers.push({
        driver,
        parameter,
        baseValue,
        unit,
        plusPct,
        minusPct,
        plusCost: plus.total,
        minusCost: minus.total,
        range: Math.abs(plus.total - minus.total),
      });
    } catch (e) {
      // Driver produced an invalid state (e.g. zero cycle time at -100% variation) — log and skip
      console.warn(`[sensitivity] Skipped driver "${driver}" (${parameter}):`, e instanceof Error ? e.message : e);
    }
  }

  // ── Material price (weight-based only) ──────────────────────────────────
  if (input.rawMaterial.directCost === undefined) {
    const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
    if (mat) {
      try {
        const pctBase = baseline.total > 0 ? baseline.total : 1;
        const modLib = (factor: number): RateLibrary => ({
          ...library,
          materials: library.materials.map(m =>
            m.id === input.rawMaterial.materialId
              ? { ...m, pricePerKg: m.pricePerKg * factor }
              : m
          ),
        });
        const plus = computeUniversalStack(input, modLib(1 + f));
        const minus = computeUniversalStack(input, modLib(1 - f));
        drivers.push({
          driver: `Material: ${mat.grade}`,
          parameter: 'rawMaterial → pricePerKg',
          baseValue: mat.pricePerKg,
          unit: '£/kg',
          plusPct: ((plus.total - baseline.total) / pctBase) * 100,
          minusPct: ((minus.total - baseline.total) / pctBase) * 100,
          plusCost: plus.total,
          minusCost: minus.total,
          range: Math.abs(plus.total - minus.total),
        });
      } catch (e) { console.warn('[sensitivity] Material price driver skipped:', e instanceof Error ? e.message : e); }
    }

    // Material utilization
    tryDriver(
      'Material utilisation',
      'rawMaterial.materialUtilization',
      input.rawMaterial.materialUtilization,
      '',
      factor => ({
        ...input,
        rawMaterial: {
          ...input.rawMaterial,
          materialUtilization: Math.min(input.rawMaterial.materialUtilization * factor, 1.0),
        },
      })
    );
  } else {
    // directCost mode — vary the direct cost itself
    tryDriver(
      'Direct material cost',
      'rawMaterial.directCost',
      input.rawMaterial.directCost,
      '£',
      factor => ({
        ...input,
        rawMaterial: { ...input.rawMaterial, directCost: input.rawMaterial.directCost! * factor },
      })
    );
  }

  // ── Per-operation drivers ────────────────────────────────────────────────
  for (let i = 0; i < input.operations.length; i++) {
    const op = input.operations[i];

    // Machine rate
    const machine = library.machines.find(m => m.id === op.machineId);
    if (machine) {
      try {
        const modLib = (factor: number): RateLibrary => ({
          ...library,
          machines: library.machines.map(m =>
            m.id === op.machineId
              ? { ...m, computedRatePerHr: m.computedRatePerHr * factor }
              : m
          ),
        });
        const plus = computeUniversalStack(input, modLib(1 + f));
        const minus = computeUniversalStack(input, modLib(1 - f));
        const plusPct = ((plus.total - baseline.total) / (baseline.total > 0 ? baseline.total : 1)) * 100;
        const minusPct = ((minus.total - baseline.total) / (baseline.total > 0 ? baseline.total : 1)) * 100;
        drivers.push({
          driver: `${op.operationName}: Machine Rate`,
          parameter: `operations[${i}].machineId → computedRatePerHr`,
          baseValue: machine.computedRatePerHr,
          unit: '£/hr',
          plusPct,
          minusPct,
          plusCost: plus.total,
          minusCost: minus.total,
          range: Math.abs(plus.total - minus.total),
        });
      } catch (e) { console.warn('[sensitivity] Machine rate driver skipped:', e instanceof Error ? e.message : e); }
    }

    // Labour rate
    const labour = library.labour.find(l => l.id === op.labourId);
    if (labour) {
      try {
        const modLib = (factor: number): RateLibrary => ({
          ...library,
          labour: library.labour.map(l =>
            l.id === op.labourId
              ? { ...l, fullyLoadedRatePerHr: l.fullyLoadedRatePerHr * factor }
              : l
          ),
        });
        const plus = computeUniversalStack(input, modLib(1 + f));
        const minus = computeUniversalStack(input, modLib(1 - f));
        const plusPct = ((plus.total - baseline.total) / (baseline.total > 0 ? baseline.total : 1)) * 100;
        const minusPct = ((minus.total - baseline.total) / (baseline.total > 0 ? baseline.total : 1)) * 100;
        drivers.push({
          driver: `${op.operationName}: Labour Rate`,
          parameter: `operations[${i}].labourId → fullyLoadedRatePerHr`,
          baseValue: labour.fullyLoadedRatePerHr,
          unit: '£/hr',
          plusPct,
          minusPct,
          plusCost: plus.total,
          minusCost: minus.total,
          range: Math.abs(plus.total - minus.total),
        });
      } catch (e) { console.warn('[sensitivity] Labour rate driver skipped:', e instanceof Error ? e.message : e); }
    }

    // Cycle time
    tryDriver(
      `${op.operationName}: Cycle Time`,
      `operations[${i}].cycleTimeHr`,
      op.cycleTimeHr,
      'hr',
      factor => ({
        ...input,
        operations: input.operations.map((o, j) =>
          j === i
            ? { ...o, cycleTimeHr: o.cycleTimeHr * factor, labourTimeHr: o.labourTimeHr * factor }
            : o
        ),
      })
    );
  }

  // ── Overhead & Margin ────────────────────────────────────────────────────
  tryDriver(
    'Overhead %',
    'overheadPct',
    input.overheadPct * 100,
    '%',
    factor => ({ ...input, overheadPct: input.overheadPct * factor })
  );

  tryDriver(
    'Supplier Margin %',
    'marginPct',
    input.marginPct * 100,
    '%',
    factor => ({ ...input, marginPct: input.marginPct * factor })
  );

  // ── Tooling (amortized) ──────────────────────────────────────────────────
  if (input.tooling.mode === 'amortized' && input.tooling.totalToolingCost > 0) {
    tryDriver(
      'Tooling Cost',
      'tooling.totalToolingCost',
      input.tooling.totalToolingCost,
      '£',
      factor => ({
        ...input,
        tooling: { ...input.tooling, totalToolingCost: input.tooling.totalToolingCost * factor },
      })
    );
    tryDriver(
      'Amortisation Volume',
      'tooling.amortizationVolume',
      input.tooling.amortizationVolume,
      'parts',
      factor => ({
        ...input,
        tooling: { ...input.tooling, amortizationVolume: input.tooling.amortizationVolume * factor },
      })
    );
  }

  // Sort by range descending (biggest impact at top — tornado chart)
  drivers.sort((a, b) => b.range - a.range);

  return { variationPct, baseline, drivers };
}
