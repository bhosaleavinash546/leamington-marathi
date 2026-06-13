import type { CommodityDrivers, RawMaterialInput, ToolingInput } from '../types.js';

// ─── Technology & Quality Types ───────────────────────────────────────────────

export type PCBTechnology =
  | 'FR4_STD'    // Standard FR-4, 1–8 layers
  | 'FR4_HTg'    // High-Tg FR-4, 4–16 layers
  | 'HDI_RIGID'  // HDI with microvias, 6–24 layers
  | 'RIGID_FLEX' // Rigid-flex, 4–20 layers
  | 'FLEX'       // Pure flex, 1–6 layers (polyimide)
  | 'RF_MICRO'   // RF/Microwave (Rogers/PTFE laminates)
  | 'MCPCB'      // Metal-core (aluminium/copper base)
  | 'CERAMIC';   // Ceramic substrate (AlN, Al2O3, DBC)

export type PCBQualityGrade =
  | 'consumer'     // ×1.0 — standard commercial
  | 'industrial'   // ×1.2 — IPC Class 2, higher inspection
  | 'auto_grade2'  // ×1.5 — AEC-Q100/200 Grade 2, PPAP
  | 'auto_grade1'  // ×1.8 — AEC Grade 1, IATF 16949
  | 'aerospace';   // ×2.2 — IPC Class 3, AS9100

export type SurfaceFinish = 'hasl' | 'enig' | 'osp' | 'hasl_lf' | 'iteq';

// ─── Lookup tables ────────────────────────────────────────────────────────────

/** PCB technology cost multiplier applied to base panel price. */
export const TECH_MULTIPLIER: Record<PCBTechnology, number> = {
  FR4_STD:    1.0,
  FR4_HTg:    1.15,
  HDI_RIGID:  2.2,
  RIGID_FLEX: 3.5,
  FLEX:       2.0,
  RF_MICRO:   1.8,
  MCPCB:      1.6,
  CERAMIC:    4.0,
};

/** Quality grade multiplier applied to per-board cost (test, inspection, traceability overhead). */
export const PCB_QUALITY_MULTIPLIER: Record<PCBQualityGrade, number> = {
  consumer:    1.0,
  industrial:  1.2,
  auto_grade2: 1.5,
  auto_grade1: 1.8,
  aerospace:   2.2,
};

/** Layer count → cost complexity factor (extended to 24 layers). */
const LAYER_FACTOR: Record<number, number> = {
  1:  0.7,
  2:  1.0,
  4:  1.8,
  6:  2.7,
  8:  3.8,
  10: 5.0,
  12: 6.3,
  16: 8.5,
  20: 11.0,
  24: 13.5,
};

/** Surface finish adder per board (£). */
const FINISH_ADDER_GBP: Record<SurfaceFinish, number> = {
  hasl:    0.00,
  hasl_lf: 0.20,
  osp:     0.30,
  enig:    0.80,
  iteq:    1.50,
};

// ─── Yield model ─────────────────────────────────────────────────────────────

/**
 * Compute a suggested fab yield from board features using the dataset's penalty model.
 * Base yield = 98%; penalties are subtracted and clamped to [0.70, 0.98].
 */
export function computeSuggestedFabYield(opts: {
  technology: PCBTechnology;
  microViaCount: number;
  hasFinePitchBGA: boolean;
  boardAreaCm2: number;
}): number {
  let yieldPct = 98;
  if (opts.microViaCount > 100) yieldPct -= 3;   // microvia_density_high
  if (opts.hasFinePitchBGA)     yieldPct -= 2;   // fine_pitch_BGA
  if (opts.technology === 'HDI_RIGID' || opts.technology === 'RIGID_FLEX') yieldPct -= 4; // HDI_stackup_complex
  if (opts.boardAreaCm2 > 300)  yieldPct -= 1;   // board_area_large
  if (opts.technology === 'CERAMIC') yieldPct -= 5; // ceramic_substrate
  return Math.max(0.70, Math.min(0.98, yieldPct / 100));
}

// ─── Input interface ──────────────────────────────────────────────────────────

export interface PCBFabInputs {
  layers: number;               // 1, 2, 4, 6, 8, 10, 12, 16, 20, 24
  boardAreaCm2: number;
  panelUtilization: number;    // 0–1, fraction of panel area occupied by boards
  panelAreaCm2: number;        // standard panel area cm² (e.g. 500×600 mm → 3000 cm²)
  baseMaterialTg: number;      // glass-transition temperature °C (130 / 150 / 170)
  copperWeightOz: number;      // copper weight oz/ft² (0.5 / 1 / 2)
  viaCount: number;            // standard drilled vias per board
  microViaCount: number;       // laser micro-vias per board (HDI)
  surfaceFinish: SurfaceFinish;
  minTraceSpaceMm: number;     // min trace/space mm (< 0.1 mm reduces yield)
  impedanceControlled?: boolean;
  fabYield: number;            // 0–1 — good boards / panels processed
  testablePct: number;         // fraction of boards subjected to flying-probe / AOI
  nreCost: number;             // tooling NRE £ (Gerbers, drill files, stencil)
  amortizationVolume: number;
  basePanelPriceGBP: number;  // bare panel price for the specified panel size at base layer count
  /** PCB technology — drives tech cost multiplier. Defaults to FR4_STD. */
  technology?: PCBTechnology;
  /** Quality / reliability grade — scales final per-board cost. Defaults to consumer. */
  qualityGrade?: PCBQualityGrade;
  /** True if board has fine-pitch BGA components (yield penalty input). */
  hasFinePitchBGA?: boolean;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function getPCBFabInputSchema(): Record<string, string> {
  return {
    layers: 'number — layer count: 1 | 2 | 4 | 6 | 8 | 10 | 12 | 16 | 20 | 24',
    boardAreaCm2: 'number — finished board area cm²',
    panelUtilization: 'number 0–1 — fraction of panel area used (breakout tabs etc.)',
    panelAreaCm2: 'number — fabrication panel area cm² (e.g. 3000 for 500×600 mm)',
    baseMaterialTg: 'number — Tg °C (130=FR4_STD, 150=mid-Tg, 170=FR4_HTg)',
    copperWeightOz: 'number — copper weight oz/ft² (0.5 | 1 | 2)',
    viaCount: 'number — standard drilled vias per board',
    microViaCount: 'number — laser micro-vias (0 if none)',
    surfaceFinish: 'hasl | enig | osp | hasl_lf | iteq',
    minTraceSpaceMm: 'number — min trace/space mm (< 0.1 reduces yield)',
    impedanceControlled: 'boolean? — true adds ~8% for controlled-impedance stackup',
    fabYield: 'number 0–1 — good boards fraction (use computeSuggestedFabYield for guidance)',
    testablePct: 'number 0–1 — fraction tested with flying probe/AOI',
    nreCost: 'number — one-off NRE £ (Gerbers, drill programs, test fixtures)',
    amortizationVolume: 'number — volume over which to amortize NRE',
    basePanelPriceGBP: 'number — panel price £ at base (2-layer FR4_STD)',
    technology: 'FR4_STD | FR4_HTg | HDI_RIGID | RIGID_FLEX | FLEX | RF_MICRO | MCPCB | CERAMIC',
    qualityGrade: 'consumer | industrial | auto_grade2 | auto_grade1 | aerospace',
    hasFinePitchBGA: 'boolean? — true if board carries fine-pitch BGA (affects yield suggestion)',
  };
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computePCBFabDrivers(inputs: PCBFabInputs): CommodityDrivers {
  // Boards per panel
  const boardsPerPanel = Math.max(
    1,
    Math.floor((inputs.panelAreaCm2 * inputs.panelUtilization) / inputs.boardAreaCm2)
  );

  // Layer complexity factor (clamp to nearest known; linear extrapolation above 24)
  const layerFactor = LAYER_FACTOR[inputs.layers] ?? inputs.layers * 0.55;

  // Base material Tg uplift (independent of technology selector for backwards compat)
  const materialFactor =
    inputs.baseMaterialTg >= 170 ? 1.30 :
    inputs.baseMaterialTg >= 150 ? 1.15 :
    1.00;

  // Technology multiplier (FR4_STD = 1.0 baseline)
  const techMultiplier = TECH_MULTIPLIER[inputs.technology ?? 'FR4_STD'];

  // Quality grade multiplier
  const qualityMultiplier = PCB_QUALITY_MULTIPLIER[inputs.qualityGrade ?? 'consumer'];

  // Surface finish adder per board
  const finishAdder = FINISH_ADDER_GBP[inputs.surfaceFinish] ?? 0;

  // Via cost adder per board (standard: £0.002 each; micro-via: £0.012 each)
  const viaAdder = inputs.viaCount * 0.002 + inputs.microViaCount * 0.012;

  // Test cost per board (AOI / flying probe fraction)
  const testCost = inputs.testablePct * 0.15;

  // Copper weight adder per board
  const cuAdder = inputs.copperWeightOz * 0.08;

  // Fine-pitch penalty (< 0.1 mm trace/space)
  const finePitchFactor = inputs.minTraceSpaceMm < 0.10 ? 1.10 : 1.00;

  // Impedance control (test coupons, tighter dielectric tolerances)
  const impedanceFactor = inputs.impedanceControlled ? 1.08 : 1.00;

  // Raw panel cost including all multipliers
  const rawPanelCost =
    inputs.basePanelPriceGBP *
    layerFactor *
    materialFactor *
    techMultiplier *
    finePitchFactor *
    impedanceFactor;

  // Cost per board before quality uplift
  const costPerBoardBase = rawPanelCost / boardsPerPanel / inputs.fabYield;

  // Per-board cost with adders, then quality multiplier
  const costPerBoard =
    (costPerBoardBase + finishAdder + viaAdder + testCost + cuAdder) * qualityMultiplier;

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: costPerBoard,
  };

  const tooling: ToolingInput = {
    totalToolingCost: inputs.nreCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations: [], tooling };
}
