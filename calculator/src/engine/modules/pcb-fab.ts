import type { CommodityDrivers, MaterialLineItem, RawMaterialInput, ToolingInput } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PCBTechnology =
  | 'FR4_STD'    // Standard FR-4, 1–8 layers, Tg 130–140°C
  | 'FR4_HTg'    // High-Tg FR-4, 4–16 layers, Tg 150–170°C
  | 'HDI_RIGID'  // HDI with microvias, 6–24 layers
  | 'RIGID_FLEX' // Rigid-flex (polyimide + FR4), 4–20 layers
  | 'FLEX'       // Pure flex (polyimide), 1–6 layers
  | 'RF_MICRO'   // RF/Microwave Rogers/PTFE laminates
  | 'MCPCB'      // Metal-core PCB (Al/Cu base)
  | 'CERAMIC';   // Ceramic substrate (AlN/Al2O3)

export type PCBQualityGrade =
  | 'consumer'     // IPC Class 1 — £×1.0
  | 'industrial'   // IPC Class 2 — £×1.20 (PCB_QUALITY_MULTIPLIER; this comment said 1.25)
  | 'auto_grade2'  // AEC-Q Grade 2, PPAP — £×1.50
  | 'auto_grade1'  // AEC-Q Grade 1, IATF 16949 — £×1.80
  | 'aerospace';   // IPC Class 3, AS9100 — £×2.20

/** 'imag' = immersion silver; 'iteq' is its legacy key (same price). */
export type SurfaceFinish = 'hasl' | 'hasl_lf' | 'osp' | 'enig' | 'enepig' | 'imag' | 'iteq';

export type HDIStructure =
  | 'none'             // Standard through-hole only
  | '1plus_n_plus1'    // 1+N+1 — one build-up layer each side
  | '2plus_n_plus2'    // 2+N+2 — two build-up layers each side
  | 'any_layer';       // Any-layer HDI — sequential lamination

export type ViaType =
  | 'through_only'           // All through-hole vias
  | 'through_blind'          // Through + blind vias
  | 'through_blind_buried'   // Through + blind + buried
  | 'microvia_hdi';          // Microvias (laser-drilled) + through

export type TestMethod =
  | 'none'
  | 'aoi_only'          // Automated optical inspection only
  | 'flying_probe'      // Electrical test, fixtureless
  | 'ict_fixtureless'   // In-circuit test, no fixture
  | 'ict_fixture'       // In-circuit test with bed-of-nails fixture
  | 'ict_xray';         // ICT + X-ray (BGA/CSP verification)

export type SolderMaskColor = 'green' | 'black' | 'white' | 'red' | 'blue';

export type PCBRegion = 'uk' | 'eu' | 'china' | 'india' | 'na';

// ─── Lookup tables ────────────────────────────────────────────────────────────

/**
 * Layer count → cost factor relative to 2L baseline. CostVision engineering figures, not sourced. (This said "IPC-2221
 * complexity model": IPC-2221 is the generic board DESIGN standard and holds no cost factors — arith audit, Oct 2026.)
 * A count between two listed ones is interpolated (see layerFactorFor).
 */
export const LAYER_FACTOR: Record<number, number> = {
  1:  0.65,
  2:  1.00,
  4:  1.85,
  6:  2.80,
  8:  3.90,
  10: 5.20,
  12: 6.60,
  16: 9.20,
  20: 12.50,
  24: 16.00,
};

/** Base panel price (£) for 500×600 mm 2-layer FR4-STD panel by sourcing region. CostVision engineering figures, not sourced. */
export const BASE_PANEL_PRICE_2L: Record<PCBRegion, number> = {
  uk:    15.00,
  eu:    13.00,
  china:  4.50,
  india:  5.50,
  na:    17.00,
};

/** Technology multiplier applied to panel price. FR4_STD = 1.0 baseline. */
export const TECH_MULTIPLIER: Record<PCBTechnology, number> = {
  FR4_STD:    1.00,
  FR4_HTg:    1.15,
  HDI_RIGID:  2.20,
  RIGID_FLEX: 3.50,
  FLEX:       2.00,
  RF_MICRO:   1.80,
  MCPCB:      1.60,
  CERAMIC:    4.00,
};

/** Quality grade multiplier on final per-board cost. */
export const PCB_QUALITY_MULTIPLIER: Record<PCBQualityGrade, number> = {
  consumer:    1.00,
  industrial:  1.20,
  auto_grade2: 1.50,
  auto_grade1: 1.80,
  aerospace:   2.20,
};

/** Surface finish adder per board (£). ENIG is automotive standard. */
export const FINISH_ADDER_GBP: Record<SurfaceFinish, number> = {
  hasl:    0.00,
  hasl_lf: 0.22,
  osp:     0.32,
  enig:    0.85,
  enepig:  1.80,
  // Immersion silver: the country table prices it at +10% over HASL against
  // ENIG's +22%, so its adder is ENIG's £0.85 × 10/22. It was £1.60 here —
  // dearer than ENIG, which no fabricator charges.
  imag:    0.39,
  iteq:    0.39,
};

/** HDI build-up structure multiplier (sequential lamination cost). */
export const HDI_STRUCTURE_MULTIPLIER: Record<HDIStructure, number> = {
  none:             1.00,
  '1plus_n_plus1':  1.30,
  '2plus_n_plus2':  1.65,
  any_layer:        2.20,
};

/** Solder mask colour premium as fraction of base panel cost. */
export const SOLDER_MASK_PREMIUM: Record<SolderMaskColor, number> = {
  green: 0.00,
  black: 0.08,
  white: 0.10,
  red:   0.07,
  blue:  0.07,
};

/** Electrical test cost per board (£) by method. */
export const TEST_COST_PER_BOARD: Record<TestMethod, number> = {
  none:            0.00,
  aoi_only:        0.40,
  flying_probe:    1.80,
  ict_fixtureless: 2.50,
  ict_fixture:     4.20,
  ict_xray:       12.00,
};

/**
 * The layer factor for any count: the table's figure, linear between two listed counts, and beyond 24 layers the
 * 20 → 24 slope continued. It was `layers × 0.65` for an unlisted count, which priced 3 layers (1.95) above 4 (1.85) and
 * 5 (3.25) above 6 (2.80) — arith audit, Oct 2026.
 */
export function layerFactorFor(layers: number): number {
  const n = Math.max(1, Number(layers) || 1);
  if (LAYER_FACTOR[n] != null) return LAYER_FACTOR[n];
  const keys = Object.keys(LAYER_FACTOR).map(Number).sort((x, y) => x - y);
  const hi = keys.find(k => k > n);
  if (hi == null) {
    const [a, b] = keys.slice(-2);
    return LAYER_FACTOR[b] + (n - b) * (LAYER_FACTOR[b] - LAYER_FACTOR[a]) / (b - a);
  }
  const lo = [...keys].reverse().find(k => k < n)!;
  return LAYER_FACTOR[lo] + (n - lo) * (LAYER_FACTOR[hi] - LAYER_FACTOR[lo]) / (hi - lo);
}

// ─── Yield model ─────────────────────────────────────────────────────────────

export function computeSuggestedFabYield(opts: {
  technology: PCBTechnology;
  layers: number;
  microViaCount: number;
  buriedViaCount: number;
  hasFinePitchBGA: boolean;
  minTraceSpaceMm: number;
  boardAreaCm2: number;
  hdiStructure: HDIStructure;
}): number {
  let y = 98.5;
  if (opts.layers >= 12)                         y -= 2.0;
  if (opts.layers >= 16)                         y -= 2.5;
  if (opts.microViaCount > 100)                  y -= 2.0;
  if (opts.microViaCount > 300)                  y -= 1.5;
  if (opts.buriedViaCount > 0)                   y -= 1.5;
  if (opts.hasFinePitchBGA)                      y -= 1.5;
  if (opts.minTraceSpaceMm < 0.10)               y -= 1.0;
  if (opts.minTraceSpaceMm < 0.075)              y -= 1.5;
  if (opts.technology === 'HDI_RIGID' || opts.technology === 'RIGID_FLEX') y -= 3.0;
  if (opts.technology === 'RIGID_FLEX')           y -= 1.5;
  if (opts.technology === 'CERAMIC')              y -= 4.0;
  if (opts.boardAreaCm2 > 300)                   y -= 1.0;
  if (opts.hdiStructure === '2plus_n_plus2')      y -= 1.0;
  if (opts.hdiStructure === 'any_layer')          y -= 2.0;
  return Math.max(0.70, Math.min(0.985, y / 100));
}

// ─── Input interface ──────────────────────────────────────────────────────────

export interface PCBFabInputs {
  // Geometry
  layers: number;
  boardWidthMm: number;
  boardHeightMm: number;
  panelWidthMm: number;
  panelHeightMm: number;
  panelUtilization: number;  // 0–1, accounts for breakout rails/tabs

  // Material & stack-up
  technology: PCBTechnology;
  baseMaterialTg: number;    // °C — 130 / 150 / 170
  copperWeightOz: number;    // inner layers oz/ft²
  outerCopperWeightOz: number; // outer layers oz/ft²

  // Via technology
  viaType: ViaType;
  throughViaCount: number;
  blindViaCount: number;
  buriedViaCount: number;
  microViaCount: number;
  hdiStructure: HDIStructure;

  // PCB features
  minTraceSpaceMm: number;
  impedanceControlled: boolean;
  hasFinePitchBGA: boolean;
  solderMaskColor: SolderMaskColor;
  silkscreenSides: number;   // 0 | 1 | 2

  // Surface finish
  surfaceFinish: SurfaceFinish;

  // Testing & inspection
  testMethod: TestMethod;

  // Quality & reliability
  qualityGrade: PCBQualityGrade;

  // Sourcing region (drives base panel price)
  region: PCBRegion;

  // NRE & amortisation
  nreCost: number;
  amortizationVolume: number;

  // Optional yield override (if not provided, auto-computed)
  fabYieldOverride?: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function getPCBFabInputSchema(): Record<string, string> {
  return {
    layers: 'number — 1 | 2 | 4 | 6 | 8 | 10 | 12 | 16 | 20 | 24',
    boardWidthMm: 'number — finished board width mm',
    boardHeightMm: 'number — finished board height mm',
    panelWidthMm: 'number — fabrication panel width mm (e.g. 500)',
    panelHeightMm: 'number — fabrication panel height mm (e.g. 600)',
    panelUtilization: 'number 0–1 — usable panel fraction after breakout rails',
    technology: 'FR4_STD | FR4_HTg | HDI_RIGID | RIGID_FLEX | FLEX | RF_MICRO | MCPCB | CERAMIC',
    baseMaterialTg: 'number °C — 130 (std) | 150 (mid) | 170 (high)',
    copperWeightOz: 'number — inner copper oz/ft² (0.5 | 1 | 2)',
    outerCopperWeightOz: 'number — outer copper oz/ft² (1 | 2 | 3)',
    viaType: 'through_only | through_blind | through_blind_buried | microvia_hdi',
    throughViaCount: 'number — mechanical drilled through-vias per board',
    blindViaCount: 'number — blind vias per board',
    buriedViaCount: 'number — buried vias per board',
    microViaCount: 'number — laser micro-vias per board (HDI)',
    hdiStructure: 'none | 1plus_n_plus1 | 2plus_n_plus2 | any_layer',
    minTraceSpaceMm: 'number mm — minimum trace/space (< 0.10 HDI, < 0.075 ultra-HDI)',
    impedanceControlled: 'boolean — true adds dielectric tolerance & coupon testing ~18%',
    hasFinePitchBGA: 'boolean — BGA ≤0.65mm pitch (yield penalty)',
    solderMaskColor: 'green | black | white | red | blue',
    silkscreenSides: '0 | 1 | 2 — number of silkscreen layers',
    surfaceFinish: 'hasl | hasl_lf | osp | enig | enepig | imag (immersion silver)',
    testMethod: 'none | aoi_only | flying_probe | ict_fixtureless | ict_fixture | ict_xray',
    qualityGrade: 'consumer | industrial | auto_grade2 | auto_grade1 | aerospace',
    region: 'uk | eu | china | india | na — sourcing region (drives base panel price)',
    nreCost: 'number £ — one-off NRE (Gerbers, drill programs, test fixtures)',
    amortizationVolume: 'number — lifetime volume for NRE amortisation',
    fabYieldOverride: 'number? 0–1 — override auto-computed yield',
  };
}

// ─── Main computation ─────────────────────────────────────────────────────────

export function computePCBFabDrivers(inputs: PCBFabInputs): CommodityDrivers {

  // 1. Board & panel geometry
  const boardAreaCm2 = (inputs.boardWidthMm * inputs.boardHeightMm) / 100;
  const panelAreaCm2 = (inputs.panelWidthMm * inputs.panelHeightMm) / 100;
  const boardsPerPanel = Math.max(
    1,
    Math.floor((panelAreaCm2 * inputs.panelUtilization) / boardAreaCm2),
  );

  // 2. Panel size normalisation (relative to 500×600 mm reference)
  const REF_PANEL_AREA = 3000; // cm²
  const panelSizeFactor = panelAreaCm2 / REF_PANEL_AREA;

  // 3. Layer complexity
  const layerFactor = layerFactorFor(inputs.layers);

  // 4. Material Tg factor
  const materialFactor =
    inputs.baseMaterialTg >= 170 ? 1.32 :
    inputs.baseMaterialTg >= 150 ? 1.16 :
    1.00;

  // 5. Technology multiplier
  const techMult = TECH_MULTIPLIER[inputs.technology];

  // 6. Copper weight factor (inner + outer combined)
  const cuFactor =
    1 +
    (inputs.copperWeightOz - 1) * 0.07 +
    (inputs.outerCopperWeightOz - 1) * 0.05;

  // The per-board adders (vias, silkscreen, finish, test) are UK fabricator prices.
  // They are priced in the SAME market as the panel: × that market's panel-price
  // ratio to the UK (country audit, Oct 2026 — they were UK £ in every market).
  const market = BASE_PANEL_PRICE_2L[inputs.region] / BASE_PANEL_PRICE_2L.uk;

  // 7. Via complexity adder per panel
  const viaAdderPerPanel = market * (
    inputs.throughViaCount  * 0.002 * boardsPerPanel +
    inputs.blindViaCount    * 0.008 * boardsPerPanel +
    inputs.buriedViaCount   * 0.015 * boardsPerPanel +
    inputs.microViaCount    * 0.012 * boardsPerPanel);

  // 8. HDI structure multiplier
  const hdiMult = HDI_STRUCTURE_MULTIPLIER[inputs.hdiStructure];

  // 9. Fine-trace factor (< 0.10 mm needs controlled-impedance tooling)
  const finePitchFactor =
    inputs.minTraceSpaceMm < 0.075 ? 1.18 :
    inputs.minTraceSpaceMm < 0.100 ? 1.10 :
    1.00;

  // 10. Impedance control
  const impedanceFactor = inputs.impedanceControlled ? 1.18 : 1.00;

  // 11. Solder mask premium
  const smPremium = 1 + SOLDER_MASK_PREMIUM[inputs.solderMaskColor];

  // 12. Silkscreen adder per board
  const silkAdder = inputs.silkscreenSides * 0.06 * market;

  // 13. Base panel price from region (scaled to actual panel size)
  const basePanelPrice = BASE_PANEL_PRICE_2L[inputs.region] * panelSizeFactor;

  // 14. Raw panel cost (all multipliers)
  const rawPanelCost =
    basePanelPrice *
    layerFactor *
    materialFactor *
    techMult *
    cuFactor *
    hdiMult *
    finePitchFactor *
    impedanceFactor *
    smPremium +
    viaAdderPerPanel;

  // 15. Yield
  const fabYield = inputs.fabYieldOverride ?? computeSuggestedFabYield({
    technology: inputs.technology,
    layers: inputs.layers,
    microViaCount: inputs.microViaCount,
    buriedViaCount: inputs.buriedViaCount,
    hasFinePitchBGA: inputs.hasFinePitchBGA,
    minTraceSpaceMm: inputs.minTraceSpaceMm,
    boardAreaCm2,
    hdiStructure: inputs.hdiStructure,
  });

  // 16. Cost per board from panel
  const costPerBoardPanel = rawPanelCost / boardsPerPanel / fabYield;

  // 17. Per-board adders
  const finishAdder = FINISH_ADDER_GBP[inputs.surfaceFinish] * market;
  const testAdder   = TEST_COST_PER_BOARD[inputs.testMethod] * market;
  const qualMult    = PCB_QUALITY_MULTIPLIER[inputs.qualityGrade];

  // 18. Final per-board cost
  const costPerBoard =
    (costPerBoardPanel + finishAdder + silkAdder + testAdder) * qualMult;

  // The build-up, printed by the screen and both reports (rawMaterial.lines): every figure and its class. The lines sum
  // to directCost exactly (arith audit, Oct 2026 — the module returned one number with ~70 unlabelled constants behind it).
  const E = 'CostVision engineering figure, not sourced';
  const fx = (v: number, dp = 2) => v.toFixed(dp);
  const panelPart = (rawPanelCost - viaAdderPerPanel) / boardsPerPanel / fabYield;
  const viaPart = viaAdderPerPanel / boardsPerPanel / fabYield;
  const subtotal = costPerBoardPanel + finishAdder + silkAdder + testAdder;
  const yieldNote = inputs.fabYieldOverride != null ? 'typed' : `suggested by the yield model (98.5 % less deductions for layers, vias, BGA, trace, technology, size — ${E})`;
  const lines: MaterialLineItem[] = [
    { ref: 'PANEL', qty: 1, unitCost: panelPart, note: E,
      description: `Panel share: base £${fx(BASE_PANEL_PRICE_2L[inputs.region])} (${inputs.region}, 500×600 mm 2L) × panel ${fx(panelSizeFactor, 3)} × layers ${fx(layerFactor)} × Tg ${fx(materialFactor)} × ${inputs.technology} ${fx(techMult)} × copper ${fx(cuFactor, 3)} × HDI ${fx(hdiMult)} × trace ${fx(finePitchFactor)} × impedance ${fx(impedanceFactor)} × mask ${fx(smPremium)} = £${fx(rawPanelCost - viaAdderPerPanel, 3)} a panel ÷ ${boardsPerPanel} boards ÷ yield ${fx(fabYield * 100, 1)} % (${yieldNote}) — every factor a ${E}` },
    { ref: 'VIAS', qty: 1, unitCost: viaPart, note: E,
      description: `Vias: (${inputs.throughViaCount} × £0.002 + ${inputs.blindViaCount} × £0.008 + ${inputs.buriedViaCount} × £0.015 + ${inputs.microViaCount} × £0.012) × market ${fx(market, 3)} ÷ yield — ${E}` },
    { ref: 'FINISH', qty: 1, unitCost: finishAdder, note: E, description: `Surface finish ${inputs.surfaceFinish}: £${fx(FINISH_ADDER_GBP[inputs.surfaceFinish])} × market ${fx(market, 3)} — ${E}` },
    { ref: 'SILK', qty: 1, unitCost: silkAdder, note: E, description: `Silkscreen: ${inputs.silkscreenSides} side(s) × £0.06 × market ${fx(market, 3)} — ${E}` },
    { ref: 'TEST', qty: 1, unitCost: testAdder, note: E, description: `Electrical test ${inputs.testMethod}: £${fx(TEST_COST_PER_BOARD[inputs.testMethod])} × market ${fx(market, 3)} — ${E}` },
    { ref: 'GRADE', qty: 1, unitCost: subtotal * (qualMult - 1), note: E, description: `Quality grade ${inputs.qualityGrade}: £${fx(subtotal, 4)} × (${fx(qualMult)} − 1) — ${E}` },
  ];

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: costPerBoard,
    lines,
  };

  const tooling: ToolingInput = {
    totalToolingCost: inputs.nreCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  // Every table above is what a fabricator charges — "base panel price" by
  // region, price-list adders for finish and test — so the figure already
  // carries the fab's overhead and margin. Adding 12% and 8% again overstated
  // a default board by ×1.22 (£82.43 → £100.75). It is declared a price, and
  // the caller adds no overhead or margin. Modelling imaging, etching,
  // lamination and plating as operations would need rates this repo has no
  // source for.
  return { rawMaterial, operations: [], tooling, priceBasis: 'market_price' };
}
