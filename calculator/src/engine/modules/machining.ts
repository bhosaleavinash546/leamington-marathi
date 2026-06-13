import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type MachiningOpType = 'turning' | 'milling_3ax' | 'milling_5ax' | 'drilling' | 'grinding' | 'tapping' | 'boring';

export interface MachiningOperation {
  name: string;
  type: MachiningOpType;
  machineId: string;
  labourId: string;
  cycleTimeHr: number;
  partsPerCycle: number;
  oee: number;
  manning: number;
  labourTimeHr: number;
  labourEfficiency: number;
}

export interface MachiningSetup {
  setupTimeHr: number;
  batchSize: number;
  machineId: string;
  labourId: string;
}

export interface MachiningInputs {
  materialId: string;
  netWeightKg: number;
  stockWeightKg: number;
  materialUtilization: number;
  rejectRate?: number;           // 0–1 fraction of parts scrapped; uplifts material and cycle time
  operations: MachiningOperation[];
  setup: MachiningSetup;
  programmingNRE: number;
  toolingCost: number;
  amortizationVolume: number;
}

export function getMachiningInputSchema(): Record<string, string> {
  return {
    materialId: 'string — ID from rate library materials',
    netWeightKg: 'number — finished part weight kg',
    stockWeightKg: 'number — incoming stock weight kg',
    materialUtilization: 'number — netWeightKg / stockWeightKg (auto-computed if 0)',
    'operations[].name': 'string',
    'operations[].type': 'turning | milling_3ax | milling_5ax | drilling | grinding | tapping | boring',
    'operations[].machineId': 'string — ID from rate library machines',
    'operations[].labourId': 'string — ID from rate library labour',
    'operations[].cycleTimeHr': 'number',
    'operations[].partsPerCycle': 'number',
    'operations[].oee': 'number 0–1',
    'operations[].manning': 'number',
    'operations[].labourTimeHr': 'number',
    'operations[].labourEfficiency': 'number 0–1',
    'setup.setupTimeHr': 'number — setup time per batch',
    'setup.batchSize': 'number — parts per batch',
    'setup.machineId': 'string',
    'setup.labourId': 'string',
    programmingNRE: 'number — one-off CNC programming cost £',
    toolingCost: 'number — total fixture + tooling cost £',
    amortizationVolume: 'number — parts over which to amortize tooling',
  };
}

export function computeMachiningDrivers(inputs: MachiningInputs): CommodityDrivers {
  const utilization =
    inputs.materialUtilization > 0
      ? inputs.materialUtilization
      : inputs.netWeightKg / inputs.stockWeightKg;

  // Reject uplift: must machine more parts (and consume more material) to yield one good part
  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.netWeightKg * rejectUplift,
    materialUtilization: utilization,
  };

  const setupPerPart = inputs.setup.setupTimeHr / inputs.setup.batchSize;

  const operations: OperationInput[] = [
    // Setup amortised as a pseudo-operation on the primary machine
    {
      operationName: 'Setup (amortised)',
      machineId: inputs.setup.machineId,
      labourId: inputs.setup.labourId,
      cycleTimeHr: setupPerPart,
      partsPerCycle: 1,
      oee: 1.0,
      manning: 1,
      labourTimeHr: setupPerPart,
      labourEfficiency: 1.0,
    },
    // Main machining operations (reject uplift applied to cycle/labour time)
    ...inputs.operations.map(op => ({
      operationName: op.name,
      machineId: op.machineId,
      labourId: op.labourId,
      cycleTimeHr: op.cycleTimeHr * rejectUplift,
      partsPerCycle: op.partsPerCycle,
      oee: op.oee,
      manning: op.manning,
      labourTimeHr: op.labourTimeHr * rejectUplift,
      labourEfficiency: op.labourEfficiency,
    })),
  ];

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolingCost + inputs.programmingNRE,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
