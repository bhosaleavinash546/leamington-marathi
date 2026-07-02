import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type JoiningType =
  | 'spot_weld'
  | 'spr_rivet'
  | 'adhesive_m'   // adhesive — cost per metre
  | 'sealer_m'     // sealer bead — cost per metre
  | 'mig_weld_m'   // MIG weld — cost per metre
  | 'clinch';

export interface JoiningCount {
  type: JoiningType;
  count: number;           // number of joints, or metres for adhesive/sealer/weld variants
  costPerJoint: number;    // direct consumable cost per joint or per metre £
}

export interface BIWStation {
  stationName: string;
  machineId: string;       // robot / fixture station machine ID
  labourId: string;
  cycleTimeHr: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
}

export interface BIWAssemblyInputs {
  subPartTotalCost: number;   // sum of all stamped/formed sub-part should-costs £
  joining: JoiningCount[];
  stations: BIWStation[];
  fixturingToolingCost: number;
  amortizationVolume: number;
}

export function getBIWAssemblyInputSchema(): Record<string, string> {
  return {
    subPartTotalCost:
      'number — sum of should-costs for all sub-parts brought into BIW assembly £',
    'joining[].type':
      'spot_weld | spr_rivet | adhesive_m | sealer_m | mig_weld_m | clinch',
    'joining[].count':
      'number — joints count (or metres for adhesive_m / sealer_m / mig_weld_m)',
    'joining[].costPerJoint':
      'number — consumable cost per joint or per metre £ (electrode wear, rivet, adhesive bead, wire)',
    'stations[].stationName': 'string — descriptive name for the assembly station',
    'stations[].machineId': 'string — robot / fixture station machine ID from rate library',
    'stations[].labourId': 'string — labour rate ID',
    'stations[].cycleTimeHr': 'number — station cycle time hr (takt-limited)',
    'stations[].oee': 'number 0–1',
    'stations[].manning': 'number — operators at this station',
    'stations[].labourEfficiency': 'number 0–1',
    fixturingToolingCost: 'number — total fixturing and welding tooling cost £',
    amortizationVolume: 'number — volume over which to amortize tooling',
  };
}

export function computeBIWDrivers(inputs: BIWAssemblyInputs): CommodityDrivers {
  const joiningCostPerPart = inputs.joining.reduce(
    (acc, j) => acc + j.count * j.costPerJoint,
    0
  );

  // Sub-part cost + joining consumables form the material/parts bucket for BIW
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: inputs.subPartTotalCost + joiningCostPerPart, // joining consumables included in material bucket
  };

  const operations: OperationInput[] = inputs.stations.map(s => ({
    operationName: s.stationName,
    machineId: s.machineId,
    labourId: s.labourId,
    cycleTimeHr: s.cycleTimeHr,
    partsPerCycle: 1,
    oee: s.oee,
    manning: s.manning,
    labourTimeHr: s.cycleTimeHr,
    labourEfficiency: s.labourEfficiency,
  }));

  const tooling: ToolingInput = {
    totalToolingCost: inputs.fixturingToolingCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
