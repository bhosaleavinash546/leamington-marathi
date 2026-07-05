import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

// ─── Component types and placement rates ──────────────────────────────────────

export type ComponentType =
  | 'passive_0402'
  | 'passive_0603'
  | 'passive_0805'
  | 'crystal_osc'
  | 'power_module'
  | 'transformer'
  | 'led'
  | 'relay_switch'
  | 'fuse_tvs'
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
  crystal_osc: 8000,
  power_module: 1500,
  transformer: 2000,
  led: 15000,
  relay_switch: 3000,
  fuse_tvs: 20000,
  ic_soic: 8000,
  ic_qfn: 5000,
  ic_bga: 2000,
  ic_tqfp: 6000,
  connector_smt: 3000,
  through_hole: 0,
  manual_solder: 0,
};

// ─── Assembly complexity & quality ───────────────────────────────────────────

/** Assembly complexity level — scales SMT placement time per the dataset formula. */
export type AssemblyComplexityLevel = 'low' | 'medium' | 'high' | 'very_high';

/**
 * Multiplier applied to SMT placement cycle time.
 * low: ≤100 components, no BGAs.
 * medium: 100–300, some fine-pitch.
 * high: >300, BGAs, double-sided.
 * very_high: ADAS / domain controller level.
 */
export const ASSEMBLY_COMPLEXITY_MULTIPLIER: Record<AssemblyComplexityLevel, number> = {
  low:       1.0,
  medium:    1.3,
  high:      1.7,
  very_high: 2.0,
};

/** Quality / reliability grade — scales test and inspection operations. */
export type PCBAQualityGrade =
  | 'consumer'
  | 'industrial'
  | 'auto_grade2'
  | 'auto_grade1'
  | 'aerospace';

export const PCBA_QUALITY_MULTIPLIER: Record<PCBAQualityGrade, number> = {
  consumer:    1.0,
  industrial:  1.2,
  auto_grade2: 1.5,
  auto_grade1: 1.8,
  aerospace:   2.2,
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
  pcbCostPerBoard: number;            // from PCB Fab module output (directCost result)
  bom: BOMLine[];
  smtMachineId: string;
  smtLabourId: string;
  smtLines: number;
  smtLineRatePerHr: number;           // informational; actual rate read from library
  smtOee: number;
  throughHoleCount: number;
  manualSolderCount: number;
  thLabourId: string;
  thLabourTimeSecPerJoint: number;    // default 12 s/joint
  manualLabourTimeSecPerJoint: number; // default 20 s/joint
  smtSides?: 1 | 2;                   // 1 = single-sided (default), 2 = double-sided
  testCostPerBoard?: number;           // externally supplied test cost £
  conformalCoatAreaCm2?: number;
  conformalCoatPricePerCm2?: number;
  assemblyYield: number;              // 0–1 first-pass yield
  reworkCostPerFailure: number;       // rework cost per failed board £
  amortizationVolume: number;
  /** Assembly complexity level — multiplies SMT placement cycle time. Default: low. */
  assemblyComplexity?: AssemblyComplexityLevel;
  /** Quality / reliability grade — multiplies test/inspection cycle times. Default: consumer. */
  qualityGrade?: PCBAQualityGrade;
  /** Number of BGA packages — enables X-ray inspection operation when > 0. */
  bgaCount?: number;
  /** Machine ID for BGA X-ray inspection (e.g. 'xray-bga-inspection'). */
  xrayMachineId?: string;
  /** Labour rate ID for X-ray operator. Falls back to smtLabourId if omitted. */
  xrayLabourId?: string;
  /** Machine ID for ICT / functional test (e.g. 'ict-automotive'). */
  ictMachineId?: string;
  /** Labour rate ID for ICT operator. Falls back to thLabourId if omitted. */
  ictLabourId?: string;
  /** ICT fixture test time per board in seconds. Default: 120 s. */
  ictCycleTimeSec?: number;
  /** NRE: solder paste stencil + ICT fixture + programming cost £. Default 0. */
  nreCost?: number;
  /** Volume over which to amortize NRE. Required if nreCost > 0. */
  nreAmortizationVolume?: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function getPCBAInputSchema(): Record<string, string> {
  return {
    pcbCostPerBoard: 'number — bare PCB cost per board £',
    'bom[].refDes': 'string — reference designator',
    'bom[].componentType': 'passive_0402 | passive_0603 | passive_0805 | crystal_osc | power_module | transformer | led | relay_switch | fuse_tvs | ic_soic | ic_qfn | ic_bga | ic_tqfp | connector_smt | through_hole | manual_solder',
    'bom[].qty': 'number — quantity per board',
    'bom[].unitPriceGBP': 'number — unit price £ at volume',
    smtMachineId: 'string — SMT pick-and-place machine ID',
    smtLabourId: 'string — SMT operator labour rate ID',
    smtLines: 'number — parallel SMT lines',
    smtOee: 'number 0–1 — SMT line OEE',
    smtSides: '1 | 2 — single or double-sided assembly',
    throughHoleCount: 'number — TH pads/joints per board',
    manualSolderCount: 'number — hand-solder joints per board',
    thLabourId: 'string — TH insertion / manual solder labour rate ID',
    thLabourTimeSecPerJoint: 'number — time per TH joint s (default 12)',
    manualLabourTimeSecPerJoint: 'number — time per hand-solder joint s (default 20)',
    assemblyYield: 'number 0–1 — first-pass assembly yield',
    reworkCostPerFailure: 'number — rework cost per failed board £',
    amortizationVolume: 'number — build volume',
    assemblyComplexity: 'low | medium | high | very_high — multiplies SMT placement time',
    qualityGrade: 'consumer | industrial | auto_grade2 | auto_grade1 | aerospace — multiplies test/inspection time',
    bgaCount: 'number? — BGA package count; triggers X-ray inspection operation',
    xrayMachineId: 'string? — X-ray BGA inspection machine ID',
    ictMachineId: 'string? — ICT / functional test machine ID',
    ictCycleTimeSec: 'number? — ICT test time per board s (default 120)',
    nreCost: 'number? — NRE cost £ (solder paste stencil + ICT fixture + programming). Default 0.',
    nreAmortizationVolume: 'number? — volume over which to amortize NRE. Required if nreCost > 0.',
  };
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computePCBADrivers(inputs: PCBAInputs): CommodityDrivers {
  // 1. Bill-of-materials cost
  const componentCost = inputs.bom.reduce((acc, line) => acc + line.qty * line.unitPriceGBP, 0);

  // 2. Ancillary costs
  const conformalCoatCost =
    (inputs.conformalCoatAreaCm2 ?? 0) * (inputs.conformalCoatPricePerCm2 ?? 0);
  const externalTestCost = inputs.testCostPerBoard ?? 0;

  // 3. Rework / yield adjustment.
  // Guard against a zero/invalid yield producing Infinity (or a negative from
  // yield > 1). Clamp into (0,1]; a non-positive yield is treated as perfect
  // (no rework) rather than crashing the whole cost with Infinity.
  const safeYield = inputs.assemblyYield > 0 ? Math.min(1, inputs.assemblyYield) : 1;
  const reworkCostPerBoard =
    (1 / safeYield - 1) * inputs.reworkCostPerFailure;

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

  // 4. Assembly complexity & quality multipliers
  const complexityMult = ASSEMBLY_COMPLEXITY_MULTIPLIER[inputs.assemblyComplexity ?? 'low'];
  const qualityMult = PCBA_QUALITY_MULTIPLIER[inputs.qualityGrade ?? 'consumer'];

  // 5. SMT placement time (scaled by complexity)
  let smtPlacementTimeHr = 0;
  for (const line of inputs.bom) {
    const cph = CPH_BY_TYPE[line.componentType];
    if (cph > 0) {
      smtPlacementTimeHr += line.qty / cph;
    }
  }
  smtPlacementTimeHr /= inputs.smtLines;
  smtPlacementTimeHr *= (inputs.smtSides ?? 1);
  smtPlacementTimeHr *= complexityMult;

  // 6. Through-hole + manual solder time
  const thAndManualTimeHr =
    (inputs.throughHoleCount * inputs.thLabourTimeSecPerJoint +
      inputs.manualSolderCount * inputs.manualLabourTimeSecPerJoint) /
    3600;

  const operations: OperationInput[] = [];

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

  // 7. BGA X-ray inspection (quality-scaled)
  if ((inputs.bgaCount ?? 0) > 0 && inputs.xrayMachineId) {
    // X-ray cycle time scales with BGA count: 2min base + 0.8min per BGA, capped at 20min
    const xrayBaseMin = Math.min(2 + (inputs.bgaCount ?? 1) * 0.8, 20);
    const xrayCycleHr = (xrayBaseMin / 60) * qualityMult;
    operations.push({
      operationName: 'BGA X-Ray Inspection',
      machineId: inputs.xrayMachineId,
      labourId: inputs.xrayLabourId ?? inputs.smtLabourId,
      cycleTimeHr: xrayCycleHr,
      partsPerCycle: 1,
      oee: 0.90,
      manning: 1,
      labourTimeHr: xrayCycleHr,
      labourEfficiency: 1.0,
    });
  }

  // 8. ICT / functional test (quality-scaled)
  if (inputs.ictMachineId) {
    const ictCycleHr = ((inputs.ictCycleTimeSec ?? 120) / 3600) * qualityMult;
    operations.push({
      operationName: 'ICT / Functional Test',
      machineId: inputs.ictMachineId,
      labourId: inputs.ictLabourId ?? inputs.thLabourId,
      cycleTimeHr: ictCycleHr,
      partsPerCycle: 1,
      oee: 0.95,
      manning: 1,
      labourTimeHr: ictCycleHr,
      labourEfficiency: 1.0,
    });
  }

  const tooling: ToolingInput = {
    totalToolingCost: inputs.nreCost ?? 0,
    amortizationVolume: inputs.nreAmortizationVolume ?? inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
