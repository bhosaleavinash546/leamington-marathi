import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  computeSurfaceTreatment, type SurfaceTreatmentBreakdown,
} from '../surface-treatment-rate.js';
import { findSurfaceStage, surfaceDataWarning } from '../surface-treatment-data.js';

export {
  STANDARD_PAINT_LINE_STAGES, STANDARD_ZINC_PLATE_STAGES,
} from '../surface-treatment-rate.js';

/**
 * A paint film.
 *
 * `pretreat` is DELIBERATELY gone. It used to be a member, and a pre-treatment
 * stage entered that way was costed with the film-build formula — dry film
 * thickness / solids x price per litre. Phosphating and zirconium conversion
 * have neither a dry film thickness nor a solids content: they are bath
 * chemistry bought per m². The old number was not imprecise, it was meaningless,
 * and it LOOKED costed, which is worse than an obvious gap. Pre-treatment now
 * goes in `stages` and is costed by `computeSurfaceTreatment`.
 */
export type CoatType = 'e_coat' | 'primer' | 'basecoat' | 'clearcoat' | 'powder';

export interface CoatLayer {
  coatType: CoatType;
  materialId: string;          // paint material ID (for traceability / future lookup)
  dftMicrons: number;          // dry film thickness µm
  solidsPct: number;           // fraction 0–1 (solids content of wet paint)
  transferEfficiency: number;  // fraction 0–1 (paint that lands on the part)
  paintDensityKgPerL: number;  // typical 1.3–1.5 kg/L
  pricePerL: number;           // paint price £/L (user-supplied from rate library or quote)
}

export interface PaintingInputs {
  surfaceAreaM2: number;
  coats: CoatLayer[];
  lineId: string;              // paint line machine ID
  labourId: string;
  lineRatePartsPerHr: number;  // throughput of the paint line
  oee: number;
  manning: number;
  labourEfficiency: number;
  rejectReworkPct: number;     // 0–1 cost uplift for rework / rejects
  toolingCost: number;         // fixture / masking tooling cost £
  amortizationVolume: number;

  // ── The line, decomposed. Optional, so existing callers keep working. ──
  /**
   * Process stages in order — pre-treatment baths, ovens, masking, plating.
   * When given, throughput and the chemistry / masking / colour-change costs
   * are derived from them and `lineRatePartsPerHr` is ignored. When absent the
   * legacy single-rate behaviour stands and the result says so.
   */
  stages?: string[];
  /**
   * Parts on one rack, hook or barrel.
   *
   * THE lever: it divides the line's machine rate. Measured on a real part,
   * halving the effective line rate moved the cost 55% — more than any other
   * input in this commodity — and it used to be buried inside a single
   * parts-per-hour figure along with conveyor speed and part envelope.
   */
  partsPerRack?: number;
  racksPerHour?: number;
  /** Deposit thickness for plating stages, micron. Sets bath dwell, and on a
   *  hoist line that caps throughput. */
  depositThicknessUm?: number;
  colourChangeCostGBP?: number;
  partsPerColourRun?: number;
  region?: string;
}

/** What the line model derived, so the caller can print and argue with it. */
export interface PaintingAnalysis {
  surface: SurfaceTreatmentBreakdown | null;
  /** Set when the legacy single parts-per-hour path was used. */
  legacyLineRate: boolean;
  warnings: string[];
}

export function getPaintingInputSchema(): Record<string, string> {
  return {
    surfaceAreaM2: 'number — exposed surface area to be painted m²',
    'coats[].coatType': 'e_coat | primer | basecoat | clearcoat | powder — pre-treatment is NOT '
      + 'a coat: it has no dry film thickness, so it goes in `stages` and is costed per m²',
    'coats[].materialId': 'string — paint material ID (for traceability)',
    'coats[].dftMicrons': 'number — dry film thickness µm',
    'coats[].solidsPct': 'number 0–1 — solids fraction of wet paint',
    'coats[].transferEfficiency': 'number 0–1 — fraction of wet paint that reaches the part',
    'coats[].paintDensityKgPerL': 'number — paint density kg/L (typically 1.3–1.5)',
    'coats[].pricePerL':
      'number — paint cost £/L (from rate library or supplier quote)',
    lineId: 'string — paint line machine ID from rate library',
    labourId: 'string — labour rate ID',
    lineRatePartsPerHr: 'number — parts per hour; superseded by partsPerRack x racksPerHour',
    stages: 'string[]? — process stages in order (degrease, rinse, phosphate, cure_oven, masking, '
      + 'zinc_plate, ...). Drives throughput, bath chemistry, masking labour and plating dwell',
    partsPerRack: 'number? — parts on one rack/hook/barrel. Divides every time-based cost',
    racksPerHour: 'number? — racks through the line per hour',
    depositThicknessUm: 'number? — plating deposit thickness, micron; caps throughput on a hoist line',
    colourChangeCostGBP: 'number? — purge and scrapped paint at a colour change',
    partsPerColourRun: 'number? — parts between colour changes',
    region: 'string? — region the line runs in, for energy/labour/chemistry',
    oee: 'number 0–1',
    manning: 'number — operators on the paint line',
    labourEfficiency: 'number 0–1',
    rejectReworkPct: 'number 0–1 — uplift factor for rework / visual rejects (e.g. 0.05 = 5%)',
    toolingCost: 'number — fixture and masking tooling cost £',
    amortizationVolume: 'number — volume over which to amortize tooling',
  };
}

/**
 * Compute wet paint consumption per coat (litres) based on dry film build.
 *
 * wet_volume_L = surfaceAreaM2 × dftMicrons × 1e-6 / (solidsPct × transferEfficiency) × 1000
 *              (m² × m/m → m³; ÷ efficiency losses; × 1000 converts m³→L)
 */
export function coatWetVolumeLitres(coat: CoatLayer, surfaceAreaM2: number): number {
  const dftM = coat.dftMicrons * 1e-6; // µm → m
  return (surfaceAreaM2 * dftM) / (coat.solidsPct * coat.transferEfficiency) * 1000;
}

/**
 * Analyse the line without costing it, so a caller can show the derivation and
 * the warnings before committing to a number.
 */
export function analysePainting(inputs: PaintingInputs): PaintingAnalysis {
  const warnings: string[] = [];
  const w = surfaceDataWarning();
  if (w) warnings.push(w);

  if (!inputs.stages || inputs.stages.length === 0) {
    warnings.push(
      'Line costed from a single parts-per-hour figure. That number bundles three separate '
      + 'drivers — how many parts hang on a rack, how fast the line runs, and how much of the '
      + 'rack this part\'s size lets you use — and it is the largest lever in the commodity: '
      + 'halving it moves the part 55%. Supply the stage list with parts-per-rack and racks-per-'
      + 'hour to cost it properly, and to see the bath chemistry and masking it currently hides.');
    return { surface: null, legacyLineRate: true, warnings };
  }

  const surface = computeSurfaceTreatment({
    stages: inputs.stages,
    surfaceAreaM2: inputs.surfaceAreaM2,
    partsPerRack: inputs.partsPerRack,
    racksPerHour: inputs.racksPerHour,
    depositThicknessUm: inputs.depositThicknessUm,
    colourChangeCostGBP: inputs.colourChangeCostGBP,
    partsPerColourRun: inputs.partsPerColourRun,
    region: inputs.region,
  });
  if (surface.throughputCappedBy) {
    warnings.push(
      `Line throughput is limited by the process, not the conveyor: ${surface.throughputCappedBy}. `
      + 'A thicker deposit occupies the tank for longer, so it costs more in line time as well '
      + 'as in chemistry.');
  }
  if ((inputs.partsPerRack ?? 1) === 1) {
    warnings.push(
      'Parts per rack defaults to 1, which is deliberately pessimistic — every time-based cost '
      + 'is being carried by a single part. Racking is usually the cheapest saving available on '
      + 'a surface-treatment line, so confirm the real figure before quoting.');
  }

  // The route and the coat list are two independent inputs that can contradict
  // each other, and the model used to accept the contradiction in silence. A
  // zinc-plate route carrying the form's default e-coat + basecoat prices a
  // paint film onto a part that is never painted — measured live, that was 38%
  // of the part, i.e. bigger than the entire line cost it sat next to. Same
  // class of defect as costing a plating route on a paint line's machine rate.
  const filmCoats = inputs.coats.length;
  if (isPlatingRoute(surface.stageIds) && filmCoats > 0) {
    warnings.push(
      `${surfaceLineName(surface.stageIds)} route carries ${filmCoats} paint coat`
      + `${filmCoats === 1 ? '' : 's'}, which is a contradiction: this route has no paint stage, `
      + 'so the film is being charged to a part that is never painted. Clear the coats, or add '
      + 'the paint stages if the part really is plated AND painted.');
  } else if (!isPlatingRoute(surface.stageIds) && filmCoats === 0) {
    warnings.push(
      'A paint route with no coats defined: the line time and bath chemistry are costed but the '
      + 'paint itself is not. Add the coats, or pick a route that has no paint stage.');
  }
  return { surface, legacyLineRate: false, warnings };
}

/** True when the route's defining stage is electrochemical rather than a film. */
function isPlatingRoute(stageIds: string[]): boolean {
  return stageIds.some(id => findSurfaceStage(id)?.kind === 'plating');
}

/**
 * What to call the operation on the report.
 *
 * It was hard-coded to 'Paint Line', so a zinc-plate job printed an operation
 * named "Paint Line" running on a "Barrel Plating Line" — and the sensitivity
 * table inherited it as `Paint Line.machineRatePerHr`. The report has to name
 * the process it actually costed.
 */
function surfaceLineName(stageIds: string[]): string {
  const plating = stageIds
    .map(id => findSurfaceStage(id))
    .find(s => s?.kind === 'plating');
  if (!plating) return 'Paint Line';
  return /anodis/i.test(plating.label) ? 'Anodising Line' : 'Plating Line';
}

export function computePaintingDrivers(inputs: PaintingInputs): CommodityDrivers {
  // Paint film build. This part of the old model was right and is untouched:
  // area x dry film thickness / (solids x transfer efficiency) x price per litre.
  let totalPaintCostPerPart = 0;
  for (const coat of inputs.coats) {
    const wetVolL = coatWetVolumeLitres(coat, inputs.surfaceAreaM2);
    totalPaintCostPerPart += wetVolL * coat.pricePerL;
  }

  const { surface } = analysePainting(inputs);

  // Bath chemistry and the colour-change purge are consumables the paint film
  // formula cannot see, and no machine rate contains them either.
  const consumables = surface
    ? surface.chemistryPerPart + surface.colourChangePerPart
    : 0;

  // Rework uplift applies to everything consumed on a part that is then redone.
  const reworkUplift = 1 + inputs.rejectReworkPct;
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',      // bypasses the weight-based material path
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: totalPaintCostPerPart * reworkUplift,
    ...(consumables > 0 ? { consumablesCostPerPart: consumables * reworkUplift } : {}),
  };

  // Line time. With stages, throughput comes from rack density x racks per hour
  // — the thing that actually decides how much of the line's hourly rate this
  // part carries. Without them, the legacy single figure stands.
  const lineCycleHr = (surface ? surface.cycleTimeHr : 1 / inputs.lineRatePartsPerHr)
    * reworkUplift;

  const operations: OperationInput[] = [
    {
      operationName: surface ? surfaceLineName(surface.stageIds) : 'Paint Line',
      machineId: inputs.lineId,
      labourId: inputs.labourId,
      cycleTimeHr: lineCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: lineCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // Masking is per-part MANUAL work, not a fixture cost. The model previously
  // had only `toolingCost`, which cannot represent an operator standing at a
  // bench for 45 seconds a part — worth ~9% of a painted part and invisible.
  if (surface && surface.maskingSeconds > 0) {
    const maskHr = (surface.maskingSeconds / 3600) * reworkUplift;
    operations.push({
      operationName: 'Masking / de-masking',
      // A bench operation: the labour is the cost, so it carries no machine.
      machineId: inputs.lineId,
      labourId: inputs.labourId,
      cycleTimeHr: 0,
      partsPerCycle: 1,
      oee: 1,
      manning: 1,
      labourTimeHr: maskHr,
      labourEfficiency: inputs.labourEfficiency,
      // No line time: the part is off the conveyor while this happens. Without
      // the flag the validator rejected the whole costing, which made the
      // masked route silently un-calculable in the UI.
      benchOperation: true,
    });
  }

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolingCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
