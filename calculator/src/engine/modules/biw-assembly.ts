import type { CommodityDrivers, MaterialLineItem, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

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
  /** Material handling / procurement on the bought-in sub-parts (default 0.03, typical 0.02–0.05). */
  subPartHandlingPct?: number;
}

/** The handling charge on bought-in sub-parts when none is typed — engineering-typical (2–5 %), not sourced. */
export const BIW_SUBPART_HANDLING_DEFAULT = 0.03;

const JOIN_LABEL: Record<JoiningType, { label: string; unit: string }> = {
  spot_weld: { label: 'Spot welds — electrode wear, energy', unit: 'each' },
  spr_rivet: { label: 'Self-piercing rivets', unit: 'each' },
  adhesive_m: { label: 'Structural adhesive bead', unit: 'm' },
  sealer_m: { label: 'Sealer bead', unit: 'm' },
  mig_weld_m: { label: 'MIG weld — wire and gas', unit: 'm' },
  clinch: { label: 'Clinch joints — tool wear', unit: 'each' },
};

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

  // Joining consumables are the assembler's own material; the stamped sub-parts
  // are bought in at their should-cost, which already carries their makers'
  // overhead and margin — so they pass through with a handling charge only.
  const handlingPct = inputs.subPartHandlingPct ?? BIW_SUBPART_HANDLING_DEFAULT;
  // What the material bucket is made of — display only, adds up to it (arithmetic audit B1, 30 Oct 2026).
  const lines: MaterialLineItem[] = [];
  if (inputs.subPartTotalCost > 0) {
    lines.push({ ref: 'SUB', description: 'Stamped / formed sub-parts, bought in at their should-cost (their makers\' overhead and margin included)',
      qty: 1, unitCost: inputs.subPartTotalCost,
      note: `handling ${(handlingPct * 100).toFixed(1)} % charged as overhead, no second overhead or margin`
        + (inputs.subPartHandlingPct === undefined ? ' — engineering-typical 2–5 %, not sourced' : '') });
  }
  inputs.joining.forEach((j, i) => {
    if (j.count > 0 && j.costPerJoint > 0) {
      const t = JOIN_LABEL[j.type] ?? { label: j.type, unit: 'each' };
      lines.push({ ref: `J${i + 1}`, description: `${t.label} (${t.unit})`, qty: j.count, unitCost: j.costPerJoint });
    }
  });
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: joiningCostPerPart,
    ...(inputs.subPartTotalCost > 0
      ? { boughtIn: { cost: inputs.subPartTotalCost, handlingPct } } : {}),
    lines,
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
