/**
 * Phase 4 commodity module tests — PCB Fab + PCBA/SMD.
 */
import { describe, it, expect } from 'vitest';
import { computePCBFabDrivers } from '../src/engine/modules/pcb-fab.js';
import { computePCBADrivers, CPH_BY_TYPE } from '../src/engine/modules/pcba.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { PCBFabInputs } from '../src/engine/modules/pcb-fab.js';
import type { PCBAInputs, BOMLine } from '../src/engine/modules/pcba.js';

const STACK_DEFAULTS = { packagingPerPart: 0.00, logisticsPerPart: 0.00, overheadPct: 0.08, marginPct: 0.10 };

// ─── PCB Fabrication ─────────────────────────────────────────────────────────

const PCB_INPUTS: PCBFabInputs = {
  layers: 4,
  boardAreaCm2: 50,
  panelUtilization: 0.72,
  panelAreaCm2: 3000,
  baseMaterialTg: 130,
  copperWeightOz: 1,
  viaCount: 200,
  microViaCount: 0,
  surfaceFinish: 'enig',
  minTraceSpaceMm: 0.15,
  fabYield: 0.96,
  testablePct: 0.50,
  nreCost: 800,
  amortizationVolume: 10000,
  basePanelPriceGBP: 18.00,
};

describe('PCB Fab module', () => {
  it('uses directCost (not weight-based)', () => {
    const d = computePCBFabDrivers(PCB_INPUTS);
    expect(d.rawMaterial.directCost).toBeDefined();
    expect(d.rawMaterial.directCost).toBeGreaterThan(0);
  });

  it('more layers → higher cost', () => {
    const four = computePCBFabDrivers(PCB_INPUTS);
    const eight = computePCBFabDrivers({ ...PCB_INPUTS, layers: 8 });
    expect(eight.rawMaterial.directCost!).toBeGreaterThan(four.rawMaterial.directCost!);
  });

  it('ENIG finish more expensive than HASL', () => {
    const enig = computePCBFabDrivers(PCB_INPUTS);
    const hasl = computePCBFabDrivers({ ...PCB_INPUTS, surfaceFinish: 'hasl' });
    expect(enig.rawMaterial.directCost!).toBeGreaterThan(hasl.rawMaterial.directCost!);
  });

  it('NRE amortized into tooling', () => {
    const d = computePCBFabDrivers(PCB_INPUTS);
    const r = computeUniversalStack({ partName: 'PCB Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    const expectedTooling = PCB_INPUTS.nreCost / PCB_INPUTS.amortizationVolume;
    expect(r.breakdown.tooling).toBeCloseTo(expectedTooling, 4);
  });

  it('drivers pass validation', () => {
    const d = computePCBFabDrivers(PCB_INPUTS);
    const v = validateStackInput({ partName: 'PCB Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computePCBFabDrivers(PCB_INPUTS);
    const r = computeUniversalStack({ partName: 'PCB Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ─── PCBA / SMD ──────────────────────────────────────────────────────────────

const TEST_BOM: BOMLine[] = [
  { refDes: 'R1-R10', componentType: 'passive_0402', description: '10k resistor 0402', qty: 10, unitPriceGBP: 0.008, moq: 1000 },
  { refDes: 'C1-C5',  componentType: 'passive_0603', description: '100nF cap 0603',    qty: 5,  unitPriceGBP: 0.012, moq: 1000 },
  { refDes: 'U1',     componentType: 'ic_qfn',       description: 'MCU QFN-32',         qty: 1,  unitPriceGBP: 2.80,  moq: 10   },
  { refDes: 'J1',     componentType: 'connector_smt', description: 'USB-C SMT',         qty: 1,  unitPriceGBP: 0.45,  moq: 100  },
  { refDes: 'X1',     componentType: 'through_hole',  description: 'Crystal TH',        qty: 1,  unitPriceGBP: 0.35,  moq: 100  },
];

const PCBA_INPUTS: PCBAInputs = {
  pcbCostPerBoard: 2.50,
  bom: TEST_BOM,
  smtMachineId: 'smt-line',
  smtLabourId: 'lab-uk-semiskilled',
  smtLines: 1,
  smtLineRatePerHr: 120,
  smtOee: 0.85,
  throughHoleCount: 2,
  manualSolderCount: 0,
  thLabourId: 'lab-uk-semiskilled',
  thLabourTimeSecPerJoint: 12,
  manualLabourTimeSecPerJoint: 20,
  assemblyYield: 0.98,
  reworkCostPerFailure: 8.00,
  amortizationVolume: 5000,
};

describe('PCBA module', () => {
  it('CPH_BY_TYPE exports expected rates', () => {
    expect(CPH_BY_TYPE['passive_0402']).toBe(25000);
    expect(CPH_BY_TYPE['ic_bga']).toBe(2000);
    expect(CPH_BY_TYPE['through_hole']).toBe(0);
  });

  it('component cost = sum of qty × unitPrice', () => {
    const expected = 10 * 0.008 + 5 * 0.012 + 1 * 2.80 + 1 * 0.45 + 1 * 0.35;
    const d = computePCBADrivers(PCBA_INPUTS);
    const pcbCost = PCBA_INPUTS.pcbCostPerBoard;
    const rework = (1 / 0.98 - 1) * 8.00;
    expect(d.rawMaterial.directCost).toBeCloseTo(pcbCost + expected + rework, 3);
  });

  it('TH through-hole creates a bench-assembly operation', () => {
    const d = computePCBADrivers(PCBA_INPUTS);
    const thOp = d.operations.find(o => o.machineId === 'bench-assembly');
    expect(thOp).toBeDefined();
  });

  it('SMT placement operation exists when BOM has SMT parts', () => {
    const d = computePCBADrivers(PCBA_INPUTS);
    const smtOp = d.operations.find(o => o.machineId === 'smt-line');
    expect(smtOp).toBeDefined();
  });

  it('SMT placement time = sum(qty/CPH) / smtLines', () => {
    const d = computePCBADrivers(PCBA_INPUTS);
    const smtOp = d.operations.find(o => o.machineId === 'smt-line')!;
    const expected =
      (10 / 25000 + 5 / 20000 + 1 / 5000 + 1 / 3000) / 1; // lines=1, TH excluded
    expect(smtOp.cycleTimeHr).toBeCloseTo(expected, 6);
  });

  it('drivers pass validation', () => {
    const d = computePCBADrivers(PCBA_INPUTS);
    const v = validateStackInput({ partName: 'PCBA Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(true);
  });

  it('full stack produces positive total', () => {
    const d = computePCBADrivers(PCBA_INPUTS);
    const r = computeUniversalStack({ partName: 'PCBA Test', ...d, ...STACK_DEFAULTS }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });
});
