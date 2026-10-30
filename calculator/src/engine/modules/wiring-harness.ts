import type { CommodityDrivers, MaterialLineItem, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

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
    'connectors[].circuitsPerConnector': 'number — pins / circuits per connector (counted on the assembly operation; the assembly TIME is assemblyTimeHr)',
    'connectors[].terminationTimeSec': 'number? — crimp time per terminal s (10s semi-auto, 20s manual) — a cross-check only: the crimping is inside assemblyTimeHr, which must cover it',
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

/**
 * The crimping the connector schedule implies (terminals × s a terminal) against the typed assembly time it is part of.
 * `terminationTimeSec` does not cost anything on its own — the assembly time is the typed figure — so a schedule whose
 * crimping alone exceeds the assembly time is a contradiction the reader must see (arithmetic audit A2, 30 Oct 2026).
 */
export function harnessCrimpCheck(inputs: Pick<WiringHarnessInputs, 'connectors' | 'assemblyTimeHr'>): string | null {
  const terminals = inputs.connectors.reduce((t, c) => t + c.count * c.circuitsPerConnector, 0);
  const crimpSec = inputs.connectors.reduce((t, c) => t + c.count * c.circuitsPerConnector * (c.terminationTimeSec ?? 10), 0);
  const asmSec = inputs.assemblyTimeHr * 3600;
  return crimpSec > asmSec
    ? `Harness: ${terminals} terminals × their crimp times = ${crimpSec.toFixed(0)} s, more than the ${asmSec.toFixed(0)} s `
      + 'assembly time typed — the assembly time is what is costed and the crimping is part of it. Raise the assembly time.'
    : null;
}

export function computeWiringHarnessDrivers(inputs: WiringHarnessInputs): CommodityDrivers {
  const reject = inputs.rejectRate && inputs.rejectRate > 0 ? inputs.rejectRate : 0;
  const rejectUplift = reject > 0 ? 1 / (1 - reject) : 1.0;

  // ── Material cost ────────────────────────────────────────────────────────
  const wireCost = inputs.wires.reduce((sum, w) => sum + w.lengthM * w.pricePerM, 0);
  const connectorCost = inputs.connectors.reduce((sum, c) => sum + c.count * c.costEach, 0);
  const spliceCost = inputs.spliceCount * inputs.spliceCostEach;
  const conduitCost = inputs.conduitLengthM * inputs.conduitCostPerM;
  const tapeCost = inputs.tapeMetres * inputs.tapeCostPerM;
  const purchased = wireCost + connectorCost + spliceCost + conduitCost + tapeCost;
  const totalMaterialCost = purchased * rejectUplift;

  // Total terminals for labour calc reference (informational)
  const totalTerminals = inputs.connectors.reduce(
    (sum, c) => sum + c.count * c.circuitsPerConnector, 0
  );

  // The wire and connector schedule behind the material bucket — display only, adds up to it (audit A1).
  const lines: MaterialLineItem[] = [];
  inputs.wires.forEach((w, i) => {
    if (w.lengthM > 0) lines.push({ ref: `W${i + 1}`, description: `Wire ${w.crossSectionMm2} mm² (m)`, qty: w.lengthM, unitCost: w.pricePerM, value: `${w.crossSectionMm2} mm²` });
  });
  inputs.connectors.forEach((c, i) => {
    if (c.count > 0) lines.push({ ref: `X${i + 1}`, description: `Connector + terminals, ${c.circuitsPerConnector} circuits (each)`, qty: c.count, unitCost: c.costEach, value: `${c.circuitsPerConnector}-way` });
  });
  if (inputs.spliceCount > 0) lines.push({ ref: 'SPL', description: 'In-line splices (each)', qty: inputs.spliceCount, unitCost: inputs.spliceCostEach });
  if (inputs.conduitLengthM > 0) lines.push({ ref: 'CND', description: 'Conduit / sleeving (m)', qty: inputs.conduitLengthM, unitCost: inputs.conduitCostPerM });
  if (inputs.tapeMetres > 0) lines.push({ ref: 'TAPE', description: 'Loom tape (m)', qty: inputs.tapeMetres, unitCost: inputs.tapeCostPerM });
  if (reject > 0) lines.push({ ref: 'REJ', description: `Reject allowance ${(reject * 100).toFixed(1)} % — the schedule × 1 ÷ (1 − ${reject}) − 1`, qty: 1, unitCost: purchased * (rejectUplift - 1) });

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 0.97,
    directCost: totalMaterialCost,
    consumablesCostPerPart: undefined,
    lines,
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
  // Whole boards: one board per board life over the amortisation volume, rounded up.
  const numBoards = inputs.boardingBoardLife > 0
    ? Math.ceil(inputs.amortizationVolume / inputs.boardingBoardLife)
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.boardingBoardCost * numBoards,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
    items: [{
      label: `Boarding boards: ${numBoards} (one a ${inputs.boardingBoardLife.toLocaleString('en-GB')} harnesses, whole boards over ${inputs.amortizationVolume.toLocaleString('en-GB')})`,
      gbp: inputs.boardingBoardCost * numBoards,
    }],
  };

  return { rawMaterial, operations, tooling };
}
