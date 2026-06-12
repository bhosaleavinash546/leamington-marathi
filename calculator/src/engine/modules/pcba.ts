import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

// ─── Component types and placement rates ──────────────────────────────────────

export type ComponentType =
  | 'passive_0402'
  | 'passive_0603'
  | 'passive_0805'
  | 'ic_soic'
  | 'ic_qfn'
  | 'ic_bga'
  | 'ic_tqfp'
  | 'connector_smt'
  | 'through_hole'
  | 'manual_solder';

/**
 * SMT pick-and-place rates in components per hour (CPH).
 * through_hole and manual_solder are not placed by SMT machines.
 */
export const CPH_BY_TYPE: Record<ComponentType, number> = {
  passive_0402: 25000,
  passive_0603: 20000,
  passive_0805: 18000,
  ic_soic: 8000,
  ic_qfn: 5000,
  ic_bga: 2000,
  ic_tqfp: 6000,
  connector_smt: 3000,
  through_hole: 0,     // not placed by SMT
  manual_solder: 0,    // hand-soldered, not SMT
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BOMLine {
  refDes: string;
  componentType: ComponentType;
  description: string;
  qty: number;
  unitPriceGBP: number;
  moq: number;
}

export interface PCBAInputs {
  pcbCostPerBoard: number;          // from PCB Fab module output (directCost result)
  bom: BOMLine[];
  smtMachineId: string;             // SMT pick-and-place machine ID
  smtLabourId: string;
  smtLines: number;                 // parallel SMT lines
  smtLineRatePerHr: number;         // machine rate £/hr (overridden by library; informational)
  smtOee: number;
  throughHoleCount: number;         // total TH pads/joints per board
  manualSolderCount: number;        // hand-solder joints per board
  thLabourId: string;
  thLabourTimeSecPerJoint: number;  // default 12 s/joint for TH insertion
  manualLabourTimeSecPerJoint: number; // default 20 s/joint for hand soldering
  testCostPerBoard?: number;        // externally supplied test cost per board £
  conformalCoatAreaCm2?: number;    // area to be conformal coated cm²
  conformalCoatPricePerCm2?: number; // conformal coat material cost £/cm²
  assemblyYield: number;            // 0–1 first-pass yield
  reworkCostPerFailure: number;     // rework cost per failed board £
  amortizationVolume: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function getPCBAInputSchema(): Record<string, string> {
  return {
    pcbCostPerBoard:
      'number — bare PCB cost per board £ (from PCB Fab module or supplier quote)',
    'bom[].refDes': 'string — reference designator (e.g. R1, U5)',
    'bom[].componentType':
      'passive_0402 | passive_0603 | passive_0805 | ic_soic | ic_qfn | ic_bga | ic_tqfp | connector_smt | through_hole | manual_solder',
    'bom[].description': 'string — component description',
    'bom[].qty': 'number — quantity per board',
    'bom[].unitPriceGBP': 'number — unit price £ at volume (above MOQ)',
    'bom[].moq': 'number — minimum order quantity (informational)',
    smtMachineId: 'string — SMT pick-and-place machine ID from rate library',
    smtLabourId: 'string — SMT operator labour rate ID',
    smtLines: 'number — parallel SMT lines running this product',
    smtLineRatePerHr:
      'number — informational machine rate £/hr; actual rate read from library via smtMachineId',
    smtOee: 'number 0–1 — SMT line OEE',
    throughHoleCount: 'number — total through-hole pads/joints per board',
    manualSolderCount: 'number — hand-solder joints per board',
    thLabourId: 'string — TH insertion / manual solder labour rate ID',
    thLabourTimeSecPerJoint: 'number — time per TH joint s (default 12)',
    manualLabourTimeSecPerJoint: 'number — time per hand-solder joint s (default 20)',
    testCostPerBoard: 'number? — external test cost per board £ (ICT/FCT outsourced)',
    conformalCoatAreaCm2: 'number? — conformal coat area cm²',
    conformalCoatPricePerCm2: 'number? — conformal coat material + application cost £/cm²',
    assemblyYield: 'number 0–1 — first-pass assembly yield',
    reworkCostPerFailure: 'number — rework cost per failed board £',
    amortizationVolume: 'number — build volume (informational for tooling amortization)',
  };
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computePCBADrivers(inputs: PCBAInputs): CommodityDrivers {
  // 1. Bill-of-materials cost
  const componentCost = inputs.bom.reduce((acc, line) => acc + line.qty * line.unitPriceGBP, 0);

  // 2. Ancillary material costs
  const conformalCoatCost =
    (inputs.conformalCoatAreaCm2 ?? 0) * (inputs.conformalCoatPricePerCm2 ?? 0);
  const externalTestCost = inputs.testCostPerBoard ?? 0;

  // 3. Rework / yield adjustment
  //    Expected rework events per board = (1 / assemblyYield - 1)
  const reworkCostPerBoard =
    (1 / inputs.assemblyYield - 1) * inputs.reworkCostPerFailure;

  const totalDirectCost =
    inputs.pcbCostPerBoard +
    componentCost +
    conformalCoatCost +
    externalTestCost +
    reworkCostPerBoard;

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: totalDirectCost,
  };

  // 4. SMT placement time
  //    placementTimeHr = Σ( qty_i / CPH_i ) / smtLines  [hours per board]
  let smtPlacementTimeHr = 0;
  for (const line of inputs.bom) {
    const cph = CPH_BY_TYPE[line.componentType];
    if (cph > 0) {
      smtPlacementTimeHr += line.qty / cph;
    }
  }
  smtPlacementTimeHr /= inputs.smtLines;

  // 5. Through-hole + manual solder time
  const thAndManualTimeHr =
    (inputs.throughHoleCount * inputs.thLabourTimeSecPerJoint +
      inputs.manualSolderCount * inputs.manualLabourTimeSecPerJoint) /
    3600;

  const operations: OperationInput[] = [];

  // SMT placement operation (only if any SMT components exist)
  if (smtPlacementTimeHr > 0) {
    operations.push({
      operationName: 'SMT Placement & Reflow',
      machineId: inputs.smtMachineId,
      labourId: inputs.smtLabourId,
      cycleTimeHr: smtPlacementTimeHr,
      partsPerCycle: 1,
      oee: inputs.smtOee,
      manning: 1,
      labourTimeHr: smtPlacementTimeHr,
      labourEfficiency: 1.0,
    });
  }

  // Through-hole / hand-solder operation (bench-assembly machine; labour-dominated)
  if (thAndManualTimeHr > 0) {
    operations.push({
      operationName: 'TH Insertion & Hand Soldering',
      machineId: 'bench-assembly',
      labourId: inputs.thLabourId,
      cycleTimeHr: thAndManualTimeHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: 1,
      labourTimeHr: thAndManualTimeHr,
      labourEfficiency: 1.0,
    });
  }

  // No PCBA-level NRE tooling (covered by PCB Fab module)
  const tooling: ToolingInput = {
    totalToolingCost: 0,
    amortizationVolume: 1,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
