/**
 * Phase 5 feature tests — Sensitivity analysis and Scenario management.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runSensitivity } from '../src/engine/sensitivity.js';
import {
  saveScenario,
  listScenarios,
  getScenario,
  deleteScenario,
  clearScenarios,
  compareScenarios,
  importScenarios,
  exportScenarios,
} from '../src/engine/scenario.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const BASE_INPUT: UniversalStackInput = {
  partName: 'Sensitivity Test Part',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
  operations: [
    {
      operationName: 'CNC Turning',
      machineId: 'mach-lathe-cnc',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.05,
      partsPerCycle: 1,
      oee: 0.85,
      manning: 1,
      labourTimeHr: 0.05,
      labourEfficiency: 0.92,
    },
    {
      operationName: 'CNC Milling',
      machineId: 'mach-vmc3',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.12,
      partsPerCycle: 1,
      oee: 0.85,
      manning: 1,
      labourTimeHr: 0.12,
      labourEfficiency: 0.92,
    },
  ],
  tooling: { totalToolingCost: 15000, amortizationVolume: 50000, mode: 'amortized' },
  packagingPerPart: 0.15,
  logisticsPerPart: 0.25,
  overheadPct: 0.12,
  marginPct: 0.08,
};

// ─── Sensitivity ─────────────────────────────────────────────────────────────

describe('runSensitivity', () => {
  it('returns baseline matching computeUniversalStack', () => {
    const baseline = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    expect(sens.baseline.total).toBeCloseTo(baseline.total, 6);
  });

  it('produces at least one driver', () => {
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    expect(sens.drivers.length).toBeGreaterThan(0);
  });

  it('drivers sorted by range descending (tornado order)', () => {
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    for (let i = 0; i < sens.drivers.length - 1; i++) {
      expect(sens.drivers[i].range).toBeGreaterThanOrEqual(sens.drivers[i + 1].range);
    }
  });

  it('range ≥ 0 for all drivers', () => {
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    for (const d of sens.drivers) {
      expect(d.range).toBeGreaterThanOrEqual(0);
    }
  });

  it('+10% material price gives positive plusPct', () => {
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    const mat = sens.drivers.find(d => d.parameter.includes('pricePerKg'));
    expect(mat).toBeDefined();
    expect(mat!.plusPct).toBeGreaterThan(0);
    expect(mat!.minusPct).toBeLessThan(0);
  });

  it('variationPct is reflected in result', () => {
    const sens = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 20);
    expect(sens.variationPct).toBe(20);
  });

  it('larger variation → larger range per driver', () => {
    const s10 = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 10);
    const s20 = runSensitivity(BASE_INPUT, DEFAULT_RATE_LIBRARY, 20);
    const top10 = s10.drivers[0].range;
    const top20 = s20.drivers[0].range;
    expect(top20).toBeGreaterThan(top10);
  });
});

// ─── Scenario Store ───────────────────────────────────────────────────────────

describe('Scenario store', () => {
  beforeEach(() => clearScenarios());

  it('saveScenario stores and retrieves', () => {
    const result = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    const sc = saveScenario('Baseline', 'Initial estimate', BASE_INPUT, result);
    expect(getScenario(sc.id)).toBeDefined();
    expect(listScenarios()).toHaveLength(1);
  });

  it('deleteScenario removes entry', () => {
    const result = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    const sc = saveScenario('To delete', '', BASE_INPUT, result);
    deleteScenario(sc.id);
    expect(getScenario(sc.id)).toBeUndefined();
  });

  it('clearScenarios empties the store', () => {
    const r = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    saveScenario('A', '', BASE_INPUT, r);
    saveScenario('B', '', BASE_INPUT, r);
    clearScenarios();
    expect(listScenarios()).toHaveLength(0);
  });

  it('compareScenarios returns delta', () => {
    const rBase = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    const cheaperInput: UniversalStackInput = {
      ...BASE_INPUT,
      partName: 'Cheaper variant',
      overheadPct: 0.10,
      marginPct: 0.06,
    };
    const rTarget = computeUniversalStack(cheaperInput, DEFAULT_RATE_LIBRARY);
    const sc1 = saveScenario('Baseline', '', BASE_INPUT, rBase);
    const sc2 = saveScenario('Target', '', cheaperInput, rTarget);

    const comp = compareScenarios(sc1.id, sc2.id, DEFAULT_RATE_LIBRARY);
    expect(comp.delta.total).toBeLessThan(0); // cheaper
    expect(comp.delta.totalPct).toBeLessThan(0);
  });

  it('export / import round-trip', () => {
    const r = computeUniversalStack(BASE_INPUT, DEFAULT_RATE_LIBRARY);
    const sc = saveScenario('Export test', '', BASE_INPUT, r);
    const json = exportScenarios();
    clearScenarios();
    const { imported, errors } = importScenarios(json);
    expect(errors).toHaveLength(0);
    expect(imported).toBe(1);
    expect(getScenario(sc.id)).toBeDefined();
  });
});
