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

// ─── Double-sided assembly ────────────────────────────────────────────────────

/**
 * Extra line time (seconds/board) for a second SMT pass on a double-sided board.
 *
 * This used to be modelled as `placementTime × smtSides`, which double-charged
 * every placement: a component is placed ONCE, on whichever side it lives on,
 * and the BOM already counts it once. On a 755-placement ECU that inflated
 * conversion cost by roughly £8/board for work nobody does.
 *
 * What a second side actually costs is a second pass down the line, not a second
 * set of placements:
 *   second stencil print cycle          ~12 s
 *   board flip + re-load / re-fiducial  ~10 s
 *   second reflow entry/exit handling    ~8 s
 * Reflow dwell itself is conveyor time absorbed by OEE, not added per board.
 *
 * Note the bottom side normally also needs adhesive or a higher-temperature
 * first-pass alloy; that is a consumable, not line time, and belongs in the BOM.
 */
export const SECOND_SIDE_PASS_OVERHEAD_SEC = 30;

// ─── BGA inspection strategy ──────────────────────────────────────────────────

/**
 * How BGA solder joints are inspected.
 *
 * `offline_100pct` is the conservative default and what every estimate before
 * this option was built on, so it stays the default. Be aware what it implies:
 * at 475 s/board and 150,000 boards/yr it needs three dedicated X-ray machines.
 * Real automotive EMS lines run inline AXI at conveyor speed. Quote `offline_100pct`
 * when you are setting a negotiating floor; quote `inline_axi` when you are
 * modelling how the supplier actually builds it.
 */
export type XrayInspectionMode = 'offline_100pct' | 'inline_axi' | 'sample';

/** Inline AXI runs at line takt, independent of BGA count. Seconds/board. */
export const INLINE_AXI_CYCLE_TIME_SEC = 45;

// ─── Packaging & logistics ────────────────────────────────────────────────────

/**
 * ESD packaging cost per board (£). A populated board is not a stamping: it
 * needs a moisture-barrier bag with desiccant and a humidity card, an ESD tray
 * or clamshell, and an antistatic carton. The generic £0.15 mechanical-part
 * default under-charges this by roughly 3×.
 *
 * Buildup at automotive volumes: MBB + desiccant + HIC ≈ £0.11, share of a
 * returnable/one-way ESD tray ≈ £0.02/cm² of board footprint, carton and
 * labelling ≈ £0.06.
 */
export function estimatePCBAPackagingPerPart(
  boardAreaCm2: number,
  qualityGrade: PCBAQualityGrade = 'consumer',
): number {
  const area = Math.max(0, boardAreaCm2);
  // Automotive and above ship in dedicated trays with traceability labelling.
  const gradeUplift = qualityGrade === 'consumer' ? 1.0
    : qualityGrade === 'industrial' ? 1.15
      : qualityGrade === 'aerospace' ? 1.6 : 1.35;
  const pkg = (0.11 + area * 0.002 + 0.06) * gradeUplift;
  return Math.round(Math.min(4, Math.max(0.08, pkg)) * 100) / 100;
}

/**
 * Inbound freight per board (£). Boards are light and bulky, so freight is
 * volumetric, driven by the tray footprint rather than by mass. Assumes air
 * freight on an overseas lane, which is how automotive electronics actually
 * move; sea freight would be roughly a third of this.
 */
export function estimatePCBALogisticsPerPart(boardAreaCm2: number): number {
  const area = Math.max(0, boardAreaCm2);
  const log = 0.12 + area * 0.0024;
  return Math.round(Math.min(3, Math.max(0.05, log)) * 100) / 100;
}

/**
 * Bare boards ship stacked and vacuum-sealed, far cheaper per board than a
 * populated assembly — no tray, one bag per stack of ~50.
 */
export function estimatePCBFabPackagingPerPart(boardAreaCm2: number): number {
  const pkg = 0.02 + Math.max(0, boardAreaCm2) * 0.0004;
  return Math.round(Math.min(1, Math.max(0.02, pkg)) * 100) / 100;
}

/** Inbound freight for bare boards — dense stacks, so cheaper than populated. */
export function estimatePCBFabLogisticsPerPart(boardAreaCm2: number): number {
  const log = 0.04 + Math.max(0, boardAreaCm2) * 0.0008;
  return Math.round(Math.min(2, Math.max(0.03, log)) * 100) / 100;
}

// ─── Component price vs volume ───────────────────────────────────────────────

/**
 * How far a component price falls per 10x increase in annual quantity.
 *
 * Fitted to a real published distributor ladder (onsemi NCV8461DR2G, Aug 2026):
 *   1 -> $1.4420   100 -> $0.9780   500 -> $0.8320   1,000 -> $0.6610
 * Least squares on log(price) vs log(qty) gives a slope of -0.111, i.e. the
 * price falls 22.5% for every 10x of volume. That is the decay used here.
 */
export const PRICE_DECAY_PER_DECADE = 0.775;

/**
 * Quantity beyond which price stops falling.
 *
 * The fitted curve decays forever; real semiconductor pricing approaches die +
 * test + package cost and flattens. Modelling that as a floor on the cumulative
 * FACTOR was wrong — a 0.55 factor floor binds after only three decades, so
 * extrapolating a qty-1 price to 1,000 returned 0.55 instead of the 0.466 the
 * published ladder actually shows, a 20% error at the anchor. Saturation is a
 * property of absolute volume, not of the ratio, so it is expressed that way:
 * past this quantity the curve simply stops.
 */
export const PRICE_SATURATION_QTY = 500_000;

/**
 * Scale a component price from the quantity it was quoted at to the quantity
 * actually being built.
 *
 * This exists because the PCBA module used `unitPriceGBP` verbatim and applied
 * `amortizationVolume` to tooling ONLY. On a board where components are ~70% of
 * cost, that meant annual volume — the single biggest commercial lever there is
 * — moved pennies of tooling and nothing else. A 150k and a 200k costing came
 * out within GBP 0.08 of each other on a GBP 115 part.
 */
export function bomVolumePriceFactor(refQty: number, targetQty: number): number {
  if (!(refQty > 0) || !(targetQty > 0)) return 1;
  // Saturate on the way UP only. Going DOWN in volume genuinely costs more and
  // is not capped — a 100-off build really does pay a premium.
  const scalingUp = targetQty > refQty;
  const effective = scalingUp ? Math.min(targetQty, PRICE_SATURATION_QTY) : targetQty;
  // Guard only the upward case: saturation can pull `effective` back below the
  // reference (a price already quoted past saturation), and that must be a
  // no-op rather than an inflation. It must NOT swallow the downward case,
  // where target < ref legitimately produces a factor above 1.
  if (scalingUp && effective <= refQty) return 1;
  return Math.pow(PRICE_DECAY_PER_DECADE, Math.log10(effective / refQty));
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BOMLine {
  refDes: string;
  componentType: ComponentType;
  description: string;
  qty: number;
  unitPriceGBP: number;
  moq: number;
  /**
   * Quantity this unit price was quoted at. Lines sourced from a published
   * distributor break carry that break (commonly 1,000); a line already stated
   * at programme volume carries the programme volume and is left alone.
   * Falls back to `PCBAInputs.bomPriceRefQty` when absent.
   */
  priceRefQty?: number;
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
  /**
   * 1 = single-sided (default), 2 = double-sided. Adds a second line pass
   * (SECOND_SIDE_PASS_OVERHEAD_SEC), NOT a second set of placements — the BOM
   * already counts every component once whichever side it sits on.
   */
  smtSides?: 1 | 2;
  testCostPerBoard?: number;           // externally supplied test cost £
  conformalCoatAreaCm2?: number;
  conformalCoatPricePerCm2?: number;
  assemblyYield: number;              // 0–1 first-pass yield
  reworkCostPerFailure: number;       // rework cost per failed board £
  amortizationVolume: number;
  /**
   * Default quantity the BOM prices were quoted at, for lines that do not state
   * their own `priceRefQty`. Omit to treat prices as already at programme
   * volume — which is what the module did unconditionally before.
   */
  bomPriceRefQty?: number;
  /** Assembly complexity level — multiplies SMT placement cycle time. Default: low. */
  assemblyComplexity?: AssemblyComplexityLevel;
  /** Quality / reliability grade — multiplies test/inspection cycle times. Default: consumer. */
  qualityGrade?: PCBAQualityGrade;
  /** Number of BGA packages — enables X-ray inspection operation when > 0. */
  bgaCount?: number;
  /**
   * How BGAs are inspected. Default 'offline_100pct' — the conservative
   * assumption, and what every estimate predating this field was built on.
   */
  xrayMode?: XrayInspectionMode;
  /** Inline AXI cycle time per board s. Only used when xrayMode = 'inline_axi'. Default 45. */
  inlineAxiCycleTimeSec?: number;
  /** Fraction of boards X-rayed. Only used when xrayMode = 'sample'. Default 0.1 (AQL sampling). */
  xraySampleRate?: number;
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
    'bom[].unitPriceGBP': 'number — unit price £ at bom[].priceRefQty',
    'bom[].priceRefQty': 'number? — quantity this price was quoted at (e.g. 1000 for a published break)',
    bomPriceRefQty: 'number? — default quote quantity for lines with no priceRefQty',
    smtMachineId: 'string — SMT pick-and-place machine ID',
    smtLabourId: 'string — SMT operator labour rate ID',
    smtLines: 'number — parallel SMT lines',
    smtOee: 'number 0–1 — SMT line OEE',
    smtSides: '1 | 2 — single or double-sided assembly (adds a second line pass, not a second set of placements)',
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
    xrayMode: "offline_100pct | inline_axi | sample — BGA inspection strategy (default offline_100pct)",
    inlineAxiCycleTimeSec: 'number? — inline AXI cycle time per board s (default 45); used when xrayMode = inline_axi',
    xraySampleRate: 'number? 0–1 — fraction X-rayed (default 0.1); used when xrayMode = sample',
    ictMachineId: 'string? — ICT / functional test machine ID',
    ictCycleTimeSec: 'number? — ICT test time per board s (default 120)',
    nreCost: 'number? — NRE cost £ (solder paste stencil + ICT fixture + programming). Default 0.',
    nreAmortizationVolume: 'number? — volume over which to amortize NRE. Required if nreCost > 0.',
  };
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computePCBADrivers(inputs: PCBAInputs): CommodityDrivers {
  // 1. Bill-of-materials cost
  // Component prices are quoted at SOME quantity; scale each line from that
  // quantity to the volume actually being built.
  const targetQty = inputs.amortizationVolume;
  const componentCost = inputs.bom.reduce((acc, line) => {
    const ref = line.priceRefQty ?? inputs.bomPriceRefQty ?? targetQty;
    return acc + line.qty * line.unitPriceGBP * bomVolumePriceFactor(ref, targetQty);
  }, 0);

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
  smtPlacementTimeHr *= complexityMult;

  // A second side is a second pass down the line, not a second set of placements.
  // The pass overhead is fixed handling, so the complexity multiplier — which
  // scales placement difficulty — does not apply to it.
  if ((inputs.smtSides ?? 1) === 2) {
    smtPlacementTimeHr += SECOND_SIDE_PASS_OVERHEAD_SEC / 3600 / inputs.smtLines;
  }

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
    const xrayMode: XrayInspectionMode = inputs.xrayMode ?? 'offline_100pct';
    // Offline: cycle scales with BGA count — 2 min base + 0.8 min per BGA, capped at 20 min.
    const offlineMin = Math.min(2 + (inputs.bgaCount ?? 1) * 0.8, 20);
    let xrayCycleHr: number;
    let xrayLabel: string;
    if (xrayMode === 'inline_axi') {
      // Inline AXI sits in the line and runs at takt, so BGA count does not
      // change the board's time through it. Quality grade still scales the
      // recipe depth (slice count / re-image on a marginal joint).
      xrayCycleHr = ((inputs.inlineAxiCycleTimeSec ?? INLINE_AXI_CYCLE_TIME_SEC) / 3600) * qualityMult;
      xrayLabel = 'BGA X-Ray Inspection (inline AXI)';
    } else if (xrayMode === 'sample') {
      const rate = Math.min(1, Math.max(0, inputs.xraySampleRate ?? 0.1));
      xrayCycleHr = (offlineMin / 60) * qualityMult * rate;
      xrayLabel = `BGA X-Ray Inspection (${Math.round(rate * 100)}% sample)`;
    } else {
      xrayCycleHr = (offlineMin / 60) * qualityMult;
      xrayLabel = 'BGA X-Ray Inspection (100% offline)';
    }
    operations.push({
      operationName: xrayLabel,
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
