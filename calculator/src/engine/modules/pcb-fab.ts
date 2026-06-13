import type { CommodityDrivers, RawMaterialInput, ToolingInput } from '../types.js';

export type SurfaceFinish = 'hasl' | 'enig' | 'osp' | 'hasl_lf' | 'iteq';

export interface PCBFabInputs {
  layers: number;              // 2, 4, 6, 8, 10
  boardAreaCm2: number;
  panelUtilization: number;   // 0–1, fraction of panel area occupied by boards
  panelAreaCm2: number;       // standard panel area cm² (e.g. 500×600 mm → 3000 cm²)
  baseMaterialTg: number;     // glass-transition temperature °C (130 / 150 / 170)
  copperWeightOz: number;     // copper weight oz/ft² (0.5 / 1 / 2)
  viaCount: number;           // standard drilled vias per board
  microViaCount: number;      // laser micro-vias per board (HDI)
  surfaceFinish: SurfaceFinish;
  minTraceSpaceMm: number;    // minimum trace/space mm (yield driver; <0.1mm reduces yield)
  impedanceControlled?: boolean; // true adds ~8% to panel cost for controlled-impedance stackup
  fabYield: number;           // 0–1 — good boards / panels processed
  testablePct: number;        // fraction of boards subjected to flying-probe / AOI
  nreCost: number;            // tooling NRE £ (Gerbers, drill files, stencil)
  amortizationVolume: number;
  basePanelPriceGBP: number;  // bare panel price for the specified panel size and base layer count
}

// ─── Layer complexity multipliers ──────────────────────────────────────────────
const LAYER_FACTOR: Record<number, number> = {
  2: 1.0,
  4: 1.8,
  6: 2.7,
  8: 3.8,
  10: 5.0,
};

// ─── Surface finish adder per board (£) ────────────────────────────────────────
const FINISH_ADDER_GBP: Record<SurfaceFinish, number> = {
  hasl: 0.00,
  hasl_lf: 0.20,
  osp: 0.30,
  enig: 0.80,
  iteq: 1.50,
};

export function getPCBFabInputSchema(): Record<string, string> {
  return {
    layers: 'number — layer count: 2 | 4 | 6 | 8 | 10',
    boardAreaCm2: 'number — finished board area cm²',
    panelUtilization: 'number 0–1 — fraction of panel area used by boards (accounts for breakout tabs)',
    panelAreaCm2: 'number — fabrication panel area cm² (e.g. 3000 for 500×600 mm)',
    baseMaterialTg: 'number — Tg of base material °C (130 = standard FR4, 150 = mid-Tg, 170 = high-Tg)',
    copperWeightOz: 'number — copper weight oz/ft² (0.5 | 1 | 2)',
    viaCount: 'number — standard drilled vias per board',
    microViaCount: 'number — laser micro-vias per board (0 if none)',
    surfaceFinish: 'hasl | enig | osp | hasl_lf | iteq',
    minTraceSpaceMm: 'number — min trace/space mm (< 0.1 reduces yield and adds cost)',
    fabYield: 'number 0–1 — good boards fraction (typically 0.95–0.99 for standard; lower for HDI)',
    testablePct: 'number 0–1 — fraction of boards tested with flying probe/AOI',
    nreCost: 'number — one-off NRE £ (Gerbers, drill programs, test fixtures, stencil)',
    amortizationVolume: 'number — volume over which to amortize NRE',
    basePanelPriceGBP:
      'number — panel fabrication price £ for the specified panel size at base (2-layer standard FR4) — from fab quote or rate library',
  };
}

export function computePCBFabDrivers(inputs: PCBFabInputs): CommodityDrivers {
  // Boards per panel
  const boardsPerPanel = Math.max(
    1,
    Math.floor((inputs.panelAreaCm2 * inputs.panelUtilization) / inputs.boardAreaCm2)
  );

  // Layer complexity factor (clamp to nearest known; extrapolate linearly above 10)
  const layerFactor = LAYER_FACTOR[inputs.layers] ?? inputs.layers * 0.5;

  // Base material Tg uplift (>= 170 = high-Tg, >= 150 = mid-Tg, < 150 = standard FR4)
  const materialFactor =
    inputs.baseMaterialTg >= 170 ? 1.30 :
    inputs.baseMaterialTg >= 150 ? 1.15 :
    1.00;

  // Surface finish adder per board
  const finishAdder = FINISH_ADDER_GBP[inputs.surfaceFinish] ?? 0;

  // Via cost adder per board
  const viaAdder = inputs.viaCount * 0.002 + inputs.microViaCount * 0.012;

  // Test cost per board
  const testCost = inputs.testablePct * 0.15;

  // Copper weight adder per board
  const cuAdder = inputs.copperWeightOz * 0.08;

  // Fine-pitch yield penalty (< 0.1 mm trace/space adds cost via reduced panel yield)
  const finePitchFactor = inputs.minTraceSpaceMm < 0.10 ? 1.10 : 1.00;

  // Impedance-controlled stackup adds ~8% (test coupons, tighter dielectric tolerances)
  const impedanceFactor = inputs.impedanceControlled ? 1.08 : 1.00;

  // Raw panel cost
  const rawPanelCost = inputs.basePanelPriceGBP * layerFactor * materialFactor * finePitchFactor * impedanceFactor;

  // Cost per board before NRE (yield adjustment applied at panel level)
  const costPerBoardBase = rawPanelCost / boardsPerPanel / inputs.fabYield;

  // Total per-board cost (excl. NRE — handled via tooling)
  const costPerBoard = costPerBoardBase + finishAdder + viaAdder + testCost + cuAdder;

  // directCost bypasses weight-based material calculation
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: costPerBoard,
  };

  // NRE amortized via tooling (not double-counted in directCost)
  const tooling: ToolingInput = {
    totalToolingCost: inputs.nreCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  // PCB fabrication is outsourced — no in-house process operations
  return { rawMaterial, operations: [], tooling };
}
