import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import { estimateStampingDieCost, estimateStampingDieLife } from './sheet-metal-advisor.js';

export type DieType = 'single_stage' | 'progressive' | 'transfer' | 'fine_blanking';

export interface SheetMetalSecondaryOp {
  operationName?: string;
  machineId: string;
  labourId: string;
  cycleTimeHr: number;
  oee?: number;
  manning?: number;
  labourEfficiency?: number;
}

export interface SheetMetalInputs {
  materialId: string;
  netWeightKg: number;
  blankLengthMm: number;
  blankWidthMm: number;
  thicknessMm: number;
  perimeterMm: number;
  shearStrengthMPa: number; // default 250 for mild steel
  stripWidthMm: number;
  pitchMm: number;
  partsPerStroke: number;
  pressId: string;
  labourId: string;
  strokesPerMin: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  numOperations: number;
  dieType: DieType;
  dieLife: number;
  dieCostEstimate: number;
  amortizationVolume: number;
  secondaryOpsMachineId?: string;
  secondaryOpsLabourId?: string;
  secondaryOpsCycleHr?: number;
  secondaryOpsOee?: number;             // defaults to press OEE if not supplied
  secondaryOpsManning?: number;         // defaults to press manning if not supplied
  secondaryOpsLabourEfficiency?: number;// defaults to press labourEfficiency if not supplied
  /** Additional chained secondary operations (tap / deburr / wash / anodise …). */
  secondaryOps?: SheetMetalSecondaryOp[];
  // ── Hot stamping / press-hardening (boron / Usibor) ──
  hotStamping?: boolean;
  austenitiseEnergyKwhPerKg?: number;    // wall-plug/gas energy to ~900°C per kg blank (default 0.30)
  hotStampingEnergyPricePerKwh?: number; // effective fuel tariff £/kWh (default 0.23)
  quenchDwellSec?: number;               // die-closed quench time; overrides SPM press cycle when hot stamping
  furnaceMachineId?: string;             // austenitising furnace machine ID
  furnaceLabourId?: string;
  furnaceCycleHrPerPart?: number;        // effective furnace occupancy per part
  /** Generic per-part material-bucket consumable (e.g. lamination join + anneal energy + coating). */
  extraConsumablesPerPart?: number;
  rejectRate?: number;                  // 0–1 scrap fraction; uplifts both material and cycle time
  /**
   * Material density kg/m³. When supplied (>0), gross material is computed from the
   * actual strip fed per part (strip-cell volume × density) so blank→part trim/pierce
   * scrap is captured — not just strip-nesting scrap. Falls back to the blank-area
   * ratio (nesting only) when omitted, preserving legacy behaviour.
   */
  densityKgPerM3?: number;
}

export function getSheetMetalInputSchema(): Record<string, string> {
  return {
    materialId: 'string — ID from rate library materials (e.g. mat-steel1045)',
    netWeightKg: 'number — finished part weight kg',
    blankLengthMm: 'number — developed blank length in mm',
    blankWidthMm: 'number — developed blank width in mm',
    thicknessMm: 'number — sheet/strip thickness in mm',
    perimeterMm: 'number — cut perimeter in mm (for tonnage estimate)',
    shearStrengthMPa: 'number — material shear strength MPa (default 250 for mild steel)',
    stripWidthMm: 'number — actual strip width fed into die',
    pitchMm: 'number — feed advance per stroke in mm',
    partsPerStroke: 'number — parts produced per press stroke (usually 1)',
    pressId: 'string — machine ID for the press (e.g. press-100t)',
    labourId: 'string — labour rate ID',
    strokesPerMin: 'number — press speed SPM',
    oee: 'number 0–1 — overall equipment effectiveness',
    manning: 'number — operators per press',
    labourEfficiency: 'number 0–1',
    numOperations: 'number — informational: blank/pierce/form/trim stages',
    dieType: 'single_stage | progressive | transfer | fine_blanking',
    dieLife: 'number — parts per die life. ≤0 → predict from material hardness / thickness / die type',
    dieCostEstimate: 'number — total die/tooling cost £. ≤0 → estimate from die type, stations, blank size and hardness',
    amortizationVolume: 'number — volume over which to amortize tooling',
    secondaryOpsMachineId: 'string? — optional secondary operation machine ID',
    secondaryOpsLabourId: 'string? — optional secondary operation labour ID',
    secondaryOpsCycleHr: 'number? — optional secondary operation cycle time hr',
    secondaryOpsOee: 'number? 0–1 — secondary op OEE (defaults to press OEE)',
    secondaryOpsManning: 'number? — secondary op operators per machine (defaults to press manning)',
    secondaryOpsLabourEfficiency: 'number? 0–1 — secondary op labour efficiency (defaults to press value)',
    rejectRate: 'number? 0–1 — press-shop scrap fraction; uplifts material weight and cycle times',
    densityKgPerM3: 'number? kg/m³ — if supplied, gross material is computed from actual strip fed per part (captures trim/pierce scrap); falls back to blank-area ratio when omitted',
    secondaryOps: 'SecondaryOp[]? — chained secondary operations (tap/deburr/wash…), each {machineId, labourId, cycleTimeHr, oee?, manning?, labourEfficiency?, operationName?}',
    hotStamping: 'boolean? — press-hardening (boron/Usibor): adds austenitising-furnace energy + quench-dwell press cycle',
    austenitiseEnergyKwhPerKg: 'number? — furnace heat kWh/kg of blank to ~900°C (default 0.30)',
    hotStampingEnergyPricePerKwh: 'number? — furnace fuel tariff £/kWh (default 0.23)',
    quenchDwellSec: 'number? — die-closed quench time s; overrides SPM press cycle when hotStamping',
    furnaceMachineId: 'string? — austenitising furnace machine ID (hot stamping)',
    furnaceLabourId: 'string? — furnace labour ID',
    furnaceCycleHrPerPart: 'number? — effective furnace occupancy per part hr',
  };
}

export function computeSheetMetalDrivers(inputs: SheetMetalInputs): CommodityDrivers {
  const blankArea = inputs.blankLengthMm * inputs.blankWidthMm;
  const stripCellArea = inputs.stripWidthMm * inputs.pitchMm;

  // Material utilisation = finished-part weight ÷ gross strip consumed per part.
  // Preferred (density supplied): gross = strip-cell volume × thickness × density,
  // per part — this captures BOTH strip-nesting scrap AND blank→part trim/pierce
  // scrap (because net is the finished weight and gross is the metal actually fed).
  // Fallback (no density): blank-area/strip-cell ratio, which captures nesting scrap
  // only (legacy behaviour, preserved so existing callers/tests are unchanged).
  // Guard: zero strip geometry / part count → NaN (rejected by validateStackInput)
  // rather than silently clamping to 100% utilisation (x / 0 = Infinity → min(∞,1)=1).
  let materialUtilization: number;
  if ((inputs.densityKgPerM3 ?? 0) > 0 && stripCellArea > 0 && inputs.partsPerStroke > 0 && inputs.netWeightKg > 0) {
    const stripKgPerStroke = (stripCellArea * inputs.thicknessMm) * (inputs.densityKgPerM3 as number) / 1e9; // mm³→m³ × kg/m³
    const grossPerPartKg = stripKgPerStroke / inputs.partsPerStroke;
    materialUtilization = grossPerPartKg > 0 ? Math.min(inputs.netWeightKg / grossPerPartKg, 1.0) : NaN;
  } else {
    materialUtilization = blankArea > 0 && stripCellArea > 0
      ? Math.min((blankArea / stripCellArea) * inputs.partsPerStroke, 1.0)
      : NaN;
  }

  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  // Gross blank weight fed per part (for hot-stamping furnace energy).
  const grossBlankKg = materialUtilization > 0 ? inputs.netWeightKg / materialUtilization : inputs.netWeightKg;

  // Hot stamping / press-hardening: austenitising furnace heat is a per-part
  // energy consumable (dominant, part-size driven), priced at the fuel tariff.
  const furnaceEnergyPerPart = inputs.hotStamping
    ? (inputs.austenitiseEnergyKwhPerKg ?? 0.30) * grossBlankKg * (inputs.hotStampingEnergyPricePerKwh ?? 0.23)
    : 0;

  // Per-part material-bucket consumables: hot-stamp furnace heat + any extra
  // (e.g. lamination join/anneal-energy/coating passed via extraConsumablesPerPart).
  const consumablesCostPerPart = furnaceEnergyPerPart + Math.max(0, inputs.extraConsumablesPerPart ?? 0);

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.netWeightKg * rejectUplift,
    materialUtilization,
    ...(consumablesCostPerPart > 0 ? { consumablesCostPerPart } : {}),
  };

  // Cycle time per STROKE: 1 stroke takes 1/SPM minutes = 1/(SPM*60) hours.
  // Hot stamping is quench-dwell limited (die-closed cooling), not SPM limited —
  // use the quench dwell when supplied. Per-part allocation happens in the core via
  // partsPerCycle — do NOT divide by partsPerStroke here as well.
  // Guard: SPM ≤ 0 would give Infinity; emit NaN so validateStackInput rejects it.
  const baseCycleHr = (inputs.hotStamping && (inputs.quenchDwellSec ?? 0) > 0)
    ? (inputs.quenchDwellSec as number) / 3600
    : inputs.strokesPerMin > 0 ? 1 / (inputs.strokesPerMin * 60) : NaN;
  // Effective press-LINE cycle floor. The bare die-close stroke (1/SPM) counts
  // only the press stroke and ignores coil feed, sensing, part-out and line
  // losses across the whole stamping line (decoiler → straightener → feeder →
  // press → scrap). Without a floor the forming line collapses to ~zero on a
  // fast nameplate SPM. Floor the effective cycle by die type (transfer/fine-
  // blank run slower than progressive/single). Hot stamping is quench-limited —
  // never floor it. Only ever RAISES the cycle, never speeds it up.
  const lineFloorSec = inputs.hotStamping ? 0
    : inputs.dieType === 'transfer' || inputs.dieType === 'fine_blanking' ? 4.5
    : inputs.dieType === 'progressive' ? 3.0
    : 2.0; // single_stage
  const cycleTimeHr = Math.max(baseCycleHr, lineFloorSec / 3600) * rejectUplift;

  const operations: OperationInput[] = [];

  // Austenitising furnace stage (hot stamping only), before the press.
  if (
    inputs.hotStamping &&
    inputs.furnaceMachineId !== undefined &&
    inputs.furnaceLabourId !== undefined &&
    inputs.furnaceCycleHrPerPart !== undefined &&
    inputs.furnaceCycleHrPerPart > 0
  ) {
    operations.push({
      operationName: 'Austenitising Furnace',
      machineId: inputs.furnaceMachineId,
      labourId: inputs.furnaceLabourId,
      cycleTimeHr: inputs.furnaceCycleHrPerPart * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: inputs.furnaceCycleHrPerPart * rejectUplift,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  operations.push({
    operationName: inputs.hotStamping ? 'Hot Stamping (form + quench)' : `Press (${inputs.dieType.replace('_', ' ')})`,
    machineId: inputs.pressId,
    labourId: inputs.labourId,
    cycleTimeHr,
    partsPerCycle: inputs.partsPerStroke,
    oee: inputs.oee,
    manning: inputs.manning,
    labourTimeHr: cycleTimeHr,
    labourEfficiency: inputs.labourEfficiency,
  });

  // Legacy single secondary op (backward compatible).
  if (
    inputs.secondaryOpsMachineId !== undefined &&
    inputs.secondaryOpsLabourId !== undefined &&
    inputs.secondaryOpsCycleHr !== undefined
  ) {
    operations.push({
      operationName: 'Secondary Operation',
      machineId: inputs.secondaryOpsMachineId,
      labourId: inputs.secondaryOpsLabourId,
      cycleTimeHr: inputs.secondaryOpsCycleHr * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.secondaryOpsOee ?? inputs.oee,
      manning: inputs.secondaryOpsManning ?? inputs.manning,
      labourTimeHr: inputs.secondaryOpsCycleHr * rejectUplift,
      labourEfficiency: inputs.secondaryOpsLabourEfficiency ?? inputs.labourEfficiency,
    });
  }

  // Additional chained secondary operations.
  for (const op of inputs.secondaryOps ?? []) {
    if (!op.machineId || !op.labourId || !(op.cycleTimeHr > 0)) continue;
    operations.push({
      operationName: op.operationName ?? 'Secondary Operation',
      machineId: op.machineId,
      labourId: op.labourId,
      cycleTimeHr: op.cycleTimeHr * rejectUplift,
      partsPerCycle: 1,
      oee: op.oee ?? inputs.oee,
      manning: op.manning ?? inputs.manning,
      labourTimeHr: op.cycleTimeHr * rejectUplift,
      labourEfficiency: op.labourEfficiency ?? inputs.labourEfficiency,
    });
  }

  // Die life: use the given value, else predict from material hardness / thickness / die type.
  const dieLife = inputs.dieLife > 0
    ? inputs.dieLife
    : estimateStampingDieLife({
        shearStrengthMPa: inputs.shearStrengthMPa,
        thicknessMm: inputs.thicknessMm,
        dieType: inputs.dieType,
      });

  // Die cost: use the given value, else estimate parametrically.
  const dieCost = inputs.dieCostEstimate > 0
    ? inputs.dieCostEstimate
    : estimateStampingDieCost({
        dieType: inputs.dieType,
        stations: inputs.numOperations,
        blankAreaCm2: (inputs.blankLengthMm * inputs.blankWidthMm) / 100,  // mm² → cm²
        shearStrengthMPa: inputs.shearStrengthMPa,
      }).total;

  // Number of die sets needed over the programme life
  const numDieSets = dieLife > 0 ? Math.ceil(inputs.amortizationVolume / dieLife) : 1;
  const tooling: ToolingInput = {
    totalToolingCost: dieCost * numDieSets,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}

/** Indicative blanking/piercing tonnage estimate (kN). Not used in cost model — reference only. */
export function estimateTonnageKN(inputs: Pick<SheetMetalInputs, 'perimeterMm' | 'thicknessMm' | 'shearStrengthMPa'>): number {
  return inputs.perimeterMm * 1e-3 * inputs.thicknessMm * 1e-3 * inputs.shearStrengthMPa * 1e6 / 1000;
}

/** Force required for blanking, expressed in metric tonnes-force (1 tonf ≈ 9.807 kN). */
export function estimateTonnageTonnes(inputs: Pick<SheetMetalInputs, 'perimeterMm' | 'thicknessMm' | 'shearStrengthMPa'>): number {
  return estimateTonnageKN(inputs) / 9.807;
}

export interface PressTonnageAssessment {
  requiredTonnes: number;
  capacityTonnes: number;
  /** Recommended press ≥ requiredTonnes × safety factor (default 1.25). */
  recommendedTonnes: number;
  adequate: boolean;
  message: string | null;
}

/**
 * Compare a selected press capacity against the estimated blanking force.
 * Presses are sized ~1.25–1.5× the calculated force to cover snap-through,
 * friction and tolerance. Returns a warning when the press is under-sized;
 * `message` is null when adequate or when capacity is unknown (≤0).
 */
export function assessPressTonnage(
  inputs: Pick<SheetMetalInputs, 'perimeterMm' | 'thicknessMm' | 'shearStrengthMPa'>,
  capacityTonnes: number,
  safetyFactor = 1.25,
): PressTonnageAssessment {
  const requiredTonnes = estimateTonnageTonnes(inputs);
  const recommendedTonnes = requiredTonnes * safetyFactor;
  const known = capacityTonnes > 0 && Number.isFinite(requiredTonnes) && requiredTonnes > 0;
  const adequate = !known || capacityTonnes >= recommendedTonnes;
  const message = known && !adequate
    ? `Selected press ${capacityTonnes.toFixed(0)}T is under-sized: blanking needs ~${requiredTonnes.toFixed(0)}T (≥${recommendedTonnes.toFixed(0)}T with 1.25× margin). Risk of overload/tool damage — select a larger press.`
    : null;
  return { requiredTonnes, capacityTonnes, recommendedTonnes, adequate, message };
}
