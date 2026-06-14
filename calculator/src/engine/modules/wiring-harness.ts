import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export interface WireSpec {
  crossSectionMm2: number;      // 0.35 | 0.5 | 0.75 | 1.0 | 1.5 | 2.5 | 4.0
  lengthM: number;               // total harness length for this gauge m
  pricePerM: number;             // wire price £/m (inc. insulation)
}

export interface ConnectorSpec {
  count: number;
  costEach: number;              // connector + terminals cost each £
  circuitsPerConnector: number;  // number of pins/circuits
  terminationTimeSec?: number;   // crimp time per terminal s (default 10s)
}

export interface WiringHarnessInputs {
  // Purchased materials
  wires: WireSpec[];
  connectors: ConnectorSpec[];
  spliceCount: number;
  spliceCostEach: number;        // £ each (includes terminal)
  conduitLengthM: number;
  conduitCostPerM: number;
  tapeMetres: number;
  tapeCostPerM: number;

  // Assembly (primary operation)
  labourId: string;
  assemblyTimeHr: number;        // total manual assembly time hr (layout + crimping + splicing + taping)
  oee: number;
  manning: number;
  labourEfficiency: number;

  // Electrical test
  testMachineId?: string;        // harness-test-sys or omit
  testLabourId: string;
  testTimeHr: number;            // continuity + HiPot test time hr

  // Reject rate (0–1)
  rejectRate?: number;

  // Tooling (boarding board / routing jig)
  boardingBoardCost: number;
  boardingBoardLife: number;     // parts per board life (5000–50000 typical)
  amortizationVolume: number;
}

export function getWiringHarnessInputSchema(): Record<string, string> {
  return {
    'wires[].crossSectionMm2': 'number — wire gauge: 0.35, 0.5, 0.75, 1.0, 1.5, 2.5, 4.0 mm²',
    'wires[].lengthM': 'number — total harness length for this gauge m (measure all branches)',
    'wires[].pricePerM': 'number — GXL/TXL wire price £/m inc. insulation. 0.35mm²: £0.08, 0.5mm²: £0.10, 1.0mm²: £0.14, 2.5mm²: £0.25, 4.0mm²: £0.40',
    'connectors[].count': 'number — number of connector housings of this type',
    'connectors[].costEach': 'number — connector + terminals £ each. Molex/Aptiv 2–6 pin: £0.40–1.20; 12–18 pin: £1.80–4.50; sealed: 1.5–3× uplift',
    'connectors[].circuitsPerConnector': 'number — pins / circuits per connector (drives crimping labour)',
    'connectors[].terminationTimeSec': 'number? — crimp time per terminal s (default 10s semi-auto, 20s manual)',
    spliceCount: 'number — number of in-line splice connections',
    spliceCostEach: 'number — splice terminal cost £ each (0.04–0.15)',
    conduitLengthM: 'number — protective conduit/corrugated tubing total length m',
    conduitCostPerM: 'number — conduit £/m (0.25–1.20 depending on type)',
    tapeMetres: 'number — wiring loom tape total metres (typ. 0.5–2.0× wire length)',
    tapeCostPerM: 'number — loom tape £/m (0.08–0.25)',
    labourId: 'string — labour ID for assembly. lab-uk-semiskilled for harness assembly',
    assemblyTimeHr: 'number — total manual assembly time hr per harness (layout + crimp + splice + tape + label). Simple 5-cct: 0.1hr; complex 80+ cct: 2–6hr',
    oee: 'number 0–1 — line OEE (0.80–0.90 typical for harness)',
    manning: 'number — assembly operators per line',
    labourEfficiency: 'number 0–1',
    testMachineId: 'string? — harness-test-sys for automated electrical test; omit for manual check',
    testLabourId: 'string — labour ID for test operator',
    testTimeHr: 'number — continuity + HiPot test time hr per harness (0.02–0.15)',
    rejectRate: 'number 0–1? — harness scrap rate (0.01–0.04 typical with semi-auto crimping)',
    boardingBoardCost: 'number — routing/boarding board + jig cost £ (200–3000 typical)',
    boardingBoardLife: 'number — parts per board life (5000–50000)',
    amortizationVolume: 'number — parts over which to amortize boarding board cost',
  };
}

export function computeWiringHarnessDrivers(inputs: WiringHarnessInputs): CommodityDrivers {
  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1.0;

  // ── Material cost ────────────────────────────────────────────────────────
  const wireCost = inputs.wires.reduce((sum, w) => sum + w.lengthM * w.pricePerM, 0);
  const connectorCost = inputs.connectors.reduce((sum, c) => sum + c.count * c.costEach, 0);
  const spliceCost = inputs.spliceCount * inputs.spliceCostEach;
  const conduitCost = inputs.conduitLengthM * inputs.conduitCostPerM;
  const tapeCost = inputs.tapeMetres * inputs.tapeCostPerM;
  const totalMaterialCost = (wireCost + connectorCost + spliceCost + conduitCost + tapeCost) * rejectUplift;

  // Total terminals for labour calc reference (informational)
  const totalTerminals = inputs.connectors.reduce(
    (sum, c) => sum + c.count * c.circuitsPerConnector, 0
  );

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 0.97,
    directCost: totalMaterialCost,
    consumablesCostPerPart: undefined,
  };

  // ── Operations ───────────────────────────────────────────────────────────
  const operations: OperationInput[] = [];

  // 1. Assembly (manual)
  const assemblyCycleHr = inputs.assemblyTimeHr * rejectUplift;
  operations.push({
    operationName: `Harness Assembly (${totalTerminals} terminals)`,
    machineId: 'bench-assembly',
    labourId: inputs.labourId,
    cycleTimeHr: assemblyCycleHr,
    partsPerCycle: 1,
    oee: inputs.oee,
    manning: inputs.manning,
    labourTimeHr: assemblyCycleHr,
    labourEfficiency: inputs.labourEfficiency,
  });

  // 2. Electrical test
  if (inputs.testTimeHr > 0) {
    const testCycleHr = inputs.testTimeHr * rejectUplift;
    operations.push({
      operationName: 'Electrical Test (Continuity + HiPot)',
      machineId: inputs.testMachineId ?? 'bench-assembly',
      labourId: inputs.testLabourId,
      cycleTimeHr: testCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: 1,
      labourTimeHr: testCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // ── Tooling ──────────────────────────────────────────────────────────────
  const numBoards = inputs.boardingBoardLife > 0
    ? Math.ceil(inputs.amortizationVolume / inputs.boardingBoardLife)
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.boardingBoardCost * numBoards,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
