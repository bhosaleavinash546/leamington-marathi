/* ============================================================================
 * data.js — Calibration data & coefficients for the 360° PCB Should-Cost Model
 *
 * Covers ALL PCB types (rigid 1–12+ layer, HDI, flex, rigid-flex, high-speed/RF,
 * power/heavy-copper) for consumer → aerospace quality, multiple regions.
 *
 * All figures are industry-aligned ENGINEERING RANGES (not supplier quotes),
 * consistent with typical PCB fab process economics and IPC build classes.
 * Number of layers and stack-up are treated as PRIMARY cost drivers throughout.
 *
 * Cost coefficients are expressed per square-decimetre (dm²) of panel/board area
 * because PCB fabs quote and cost in $/m² and $/panel. 1 dm² = 10,000 mm².
 * ==========================================================================*/

/* ---- PCB technology types: each selects routing + complexity multipliers ---- */
const PCB_TYPES = [
  { id: "rigid",      label: "Rigid (1–12+ layer)",      complexity: 1.00, defLayers: 4 },
  { id: "hdi",        label: "HDI (microvia build-up)",  complexity: 1.55, defLayers: 8 },
  { id: "flex",       label: "Flex",                     complexity: 1.40, defLayers: 2 },
  { id: "rigidflex",  label: "Rigid-Flex",               complexity: 2.20, defLayers: 8 },
  { id: "highspeed",  label: "High-speed / High-freq (RF)", complexity: 1.30, defLayers: 8 },
  { id: "power",      label: "Power / Heavy-copper",     complexity: 1.20, defLayers: 4 },
];

/* ---- Laminate / base materials. costDm2PerLayer = $/dm² per copper layer ---- */
const MATERIALS = [
  { id: "fr4_std",     label: "FR-4 standard (Tg 130–140)",     costDm2PerLayer: 0.42, tg: 140,  family: "fr4" },
  { id: "fr4_hightg",  label: "FR-4 High-Tg (Tg 170–180)",      costDm2PerLayer: 0.55, tg: 175,  family: "fr4" },
  { id: "fr4_halfree", label: "Halogen-free FR-4",              costDm2PerLayer: 0.60, tg: 150,  family: "fr4" },
  { id: "rogers",      label: "Rogers / PTFE (RF)",             costDm2PerLayer: 2.40, tg: 280,  family: "rf"  },
  { id: "hydrocarbon", label: "Hydrocarbon-ceramic (mid-loss)", costDm2PerLayer: 1.50, tg: 280,  family: "rf"  },
  { id: "polyimide",   label: "Polyimide (flex)",               costDm2PerLayer: 1.10, tg: 250,  family: "flex"},
  { id: "metalcore",   label: "Metal-core / IMS (aluminium)",   costDm2PerLayer: 0.70, tg: 140,  family: "mc"  },
];

/* ---- Copper weight multiplier on copper-related process & material ---- */
const COPPER_WEIGHTS = [
  { id: "0p5", label: "0.5 oz", oz: 0.5, mult: 0.90 },
  { id: "1",   label: "1 oz",   oz: 1.0, mult: 1.00 },
  { id: "2",   label: "2 oz",   oz: 2.0, mult: 1.28 },
  { id: "3",   label: "3 oz",   oz: 3.0, mult: 1.65 },
  { id: "4",   label: "4 oz (heavy)", oz: 4.0, mult: 2.10 },
];

/* ---- Via technology: drives drilling, lamination cycles, plating, yield ---- */
const VIA_TYPES = [
  { id: "through", label: "Through-hole only",            lamExtra: 0, microvia: false },
  { id: "buried",  label: "Through + buried/blind",       lamExtra: 1, microvia: false },
  { id: "micro1",  label: "HDI 1+N+1 (microvia, 1 build)", lamExtra: 1, microvia: true, buildup: 1 },
  { id: "micro2",  label: "HDI 2+N+2 (microvia, 2 build)", lamExtra: 2, microvia: true, buildup: 2 },
  { id: "micro3",  label: "HDI 3+N+3 (any-layer)",         lamExtra: 3, microvia: true, buildup: 3 },
];

/* ---- Minimum trace/space classes → imaging tech + yield derating ---- */
const TRACE_CLASSES = [
  { id: "8mil", label: "≥ 8 mil (standard)",     mil: 8,  fineMult: 1.00, yld: 1.00 },
  { id: "5mil", label: "5 mil",                  mil: 5,  fineMult: 1.10, yld: 0.98 },
  { id: "4mil", label: "4 mil",                  mil: 4,  fineMult: 1.20, yld: 0.96 },
  { id: "3mil", label: "3 mil (LDI)",            mil: 3,  fineMult: 1.40, yld: 0.93 },
  { id: "2mil", label: "≤ 2 mil (HDI fine-line)",mil: 2,  fineMult: 1.75, yld: 0.88 },
];

/* ---- Surface finishes: cost per dm² + flat setup ---- */
const FINISHES = [
  { id: "hasl",    label: "HASL (leaded)",        costDm2: 0.10, setup: 8 },
  { id: "lfhasl",  label: "Lead-free HASL",       costDm2: 0.13, setup: 10 },
  { id: "osp",     label: "OSP",                  costDm2: 0.07, setup: 6 },
  { id: "imag",    label: "Immersion silver",     costDm2: 0.22, setup: 14 },
  { id: "isn",     label: "Immersion tin",        costDm2: 0.20, setup: 14 },
  { id: "enig",    label: "ENIG",                 costDm2: 0.45, setup: 22 },
  { id: "enepig",  label: "ENEPIG",               costDm2: 0.70, setup: 30 },
  { id: "hardgold",label: "Hard gold (edge/tab)", costDm2: 1.20, setup: 35 },
];

/* ---- Solder-mask colour adders (green is baseline) ---- */
const MASK_COLORS = [
  { id: "green", label: "Green (standard)", add: 0.00 },
  { id: "black", label: "Black",            add: 0.06 },
  { id: "blue",  label: "Blue",             add: 0.05 },
  { id: "red",   label: "Red",              add: 0.05 },
  { id: "white", label: "White",            add: 0.08 },
  { id: "matte", label: "Matte black/any",  add: 0.12 },
];

/* ---- Quality / IPC build class: yield, test, inspection, NRE, margin ---- */
const QUALITY_LEVELS = [
  { id: "consumer",   label: "Consumer (IPC Class 2)",        yld: 0.97, scrap: 0.02, testMult: 1.0, inspect: 0.00, nreMult: 1.0, microsection: false, margin: 0.15 },
  { id: "industrial", label: "Industrial (Class 2+)",         yld: 0.95, scrap: 0.03, testMult: 1.1, inspect: 0.04, nreMult: 1.2, microsection: false, margin: 0.20 },
  { id: "automotive", label: "Automotive (Class 3 / IATF)",   yld: 0.92, scrap: 0.05, testMult: 1.3, inspect: 0.10, nreMult: 1.8, microsection: true,  margin: 0.25 },
  { id: "aerospace",  label: "Aerospace/Mil (Class 3/A)",     yld: 0.88, scrap: 0.08, testMult: 1.6, inspect: 0.20, nreMult: 2.6, microsection: true,  margin: 0.35 },
];

/* ---- Region: labour & overhead multipliers (China = 1.0 baseline) ---- */
const REGIONS = [
  { id: "china", label: "China",        labor: 1.00, overhead: 1.00 },
  { id: "india", label: "India",        labor: 1.10, overhead: 1.05 },
  { id: "na",    label: "North America", labor: 2.10, overhead: 1.75 },
  { id: "eu",    label: "Europe",       labor: 2.25, overhead: 1.85 },
];

/* ---- Global cost coefficients ($/dm² unless noted). Calibrated so worked
 *      examples land in published fab price ranges. Tune here, transparently. */
const COEFF = {
  materialCal:     1.00,   // global scaler on material
  imagePerLayerDm2: 0.13,  // inner/outer imaging per copper layer
  etchPerLayerDm2:  0.11,  // develop-etch-strip per layer
  aoiPerLayerDm2:   0.05,  // AOI per layer
  lamPerCycleDm2:   0.55,  // lay-up + press per lamination cycle
  costPerHole:      0.0009,// mechanical drilled hole
  holeDensity:      160,   // holes per dm² (derived default)
  costPerMicrovia:  0.0011,// laser microvia
  microviaDensity:  900,   // microvias per dm² per build-up layer
  desmearPthDm2:    0.18,  // desmear + electroless copper
  platingDm2:       0.26,  // electroplate per (layer-normalised) area
  maskDm2:          0.10,  // solder mask per side
  silkDm2:          0.04,  // legend per side
  profilingDm2:     0.10,  // route/profile depanel
  impedanceDm2:     0.06,  // impedance control process premium
  impedanceCoupon:  18,    // TDR test coupon NRE-ish, amortized via volume
  // back-end test
  flyingProbeRate:  0.9,   // $/board-equivalent low volume e-test
  fixtureTestDm2:   0.03,  // fixture/ICT marginal per board
  // NRE (one-time, $ — amortized over order quantity)
  nrePhotoTools:    120,
  nreDrillProgram:  90,
  nreTestFixture:   350,   // bed-of-nails / e-test fixture
  nreLaserProgram:  180,   // HDI laser drill program
  nreStencil:       0,     // PCB fab (bare board) — stencil belongs to assembly
  // flex / rigid-flex extras (per dm²)
  coverlayDm2:      0.45,
  stiffenerDm2:     0.35,
  // power / heavy copper extra etch comp per dm² per extra oz
  heavyCopperDm2:   0.22,
};

/* ---- Default model state (4-layer FR-4 automotive baseline) ---- */
const DEFAULTS = {
  pcbType: "rigid",
  boardW: 100, boardH: 80,
  layerCount: 4,
  material: "fr4_hightg",
  boardThickness: 1.6,
  copperInner: "1",
  copperOuter: "1",
  trace: "5mil",
  via: "through",
  impedance: true,
  finish: "enig",
  maskColor: "green",
  silkscreen: true,
  panelW: 457, panelH: 305,        // standard 18"×12" working panel
  utilization: 80,
  quality: "automotive",
  region: "china",
  orderQty: 50000,
  holeDensity: 160,
  overheadPct: 18,
  marginPct: 25,
};

/* ---- Pre-loaded worked examples (luxury SUV context) ---- */
const EXAMPLES = [
  {
    name: "4-layer automotive control PCB",
    note: "Body/chassis control module, luxury SUV",
    input: { ...DEFAULTS, pcbType: "rigid", boardW: 100, boardH: 80, layerCount: 4,
      material: "fr4_hightg", copperInner: "1", copperOuter: "1", trace: "5mil",
      via: "through", impedance: true, finish: "enig", quality: "automotive",
      region: "china", orderQty: 50000 },
  },
  {
    name: "8-layer high-speed domain controller PCB",
    note: "Central compute / ADAS domain controller, luxury SUV",
    input: { ...DEFAULTS, pcbType: "highspeed", boardW: 160, boardH: 120, layerCount: 8,
      material: "fr4_hightg", boardThickness: 1.6, copperInner: "1", copperOuter: "1",
      trace: "4mil", via: "buried", impedance: true, finish: "enig",
      quality: "automotive", region: "china", orderQty: 20000 },
  },
  {
    name: "10-layer HDI rigid-flex infotainment PCB",
    note: "Cockpit / IVI display + main board, luxury SUV",
    input: { ...DEFAULTS, pcbType: "rigidflex", boardW: 140, boardH: 90, layerCount: 10,
      material: "polyimide", boardThickness: 1.2, copperInner: "0p5", copperOuter: "1",
      trace: "3mil", via: "micro2", impedance: true, finish: "enepig",
      quality: "automotive", region: "china", orderQty: 8000 },
  },
];
