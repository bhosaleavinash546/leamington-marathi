/* ============================================================================
 * data.js — Calibration data & coefficients for the 360° PCB Should-Cost Model
 * 2026 EDITION — expanded materials, processes, latest technologies, updated
 * labour/region rates, and market (metal/energy) surcharges.
 *
 * All figures are industry-aligned ENGINEERING RANGES (not supplier quotes).
 * Number of layers and stack-up remain the PRIMARY cost drivers.
 * Cost coefficients are per square-decimetre (dm²): 1 dm² = 10,000 mm².
 *
 * 2026 market context baked into defaults:
 *  - Gold at historic highs → ENIG/ENEPIG/hard-gold finishes carry a premium.
 *  - Copper foil & resin elevated vs 2023–24; energy costs high (esp. EU).
 *  - Captured via the editable "market surcharge %" input (default 6%).
 * ==========================================================================*/

/* ---- PCB technology types: select routing + complexity multipliers ---- */
const PCB_TYPES = [
  { id: "rigid",     label: "Rigid (1–12+ layer)",         complexity: 1.00, defLayers: 4 },
  { id: "hdi",       label: "HDI (microvia build-up)",     complexity: 1.55, defLayers: 8 },
  { id: "anylayer",  label: "Any-layer HDI / SLP",         complexity: 1.95, defLayers: 10 },
  { id: "flex",      label: "Flex",                        complexity: 1.40, defLayers: 2 },
  { id: "rigidflex", label: "Rigid-Flex",                  complexity: 2.20, defLayers: 8 },
  { id: "highspeed", label: "High-speed / High-freq (RF)", complexity: 1.30, defLayers: 8 },
  { id: "power",     label: "Power / Heavy-copper",        complexity: 1.20, defLayers: 4 },
];

/* ---- Laminate / base materials. costDm2PerLayer = $/dm² per copper layer.
 *      2026 relative pricing; low-loss and RF grades are the big premiums. ---- */
const MATERIALS = [
  { id: "fr4_std",     label: "FR-4 standard (Tg 130–140)",       costDm2PerLayer: 0.44, tg: 140, family: "fr4",  note: "Dk~4.5, lossy" },
  { id: "fr4_midtg",   label: "FR-4 mid-Tg (150–160)",            costDm2PerLayer: 0.50, tg: 155, family: "fr4",  note: "" },
  { id: "fr4_hightg",  label: "FR-4 High-Tg (170–180, 370HR/S1000-2)", costDm2PerLayer: 0.58, tg: 175, family: "fr4", note: "auto default" },
  { id: "fr4_halfree", label: "Halogen-free FR-4",                costDm2PerLayer: 0.62, tg: 150, family: "fr4",  note: "" },
  { id: "lowloss_mid", label: "Low-loss (Megtron 6 / I-Tera)",    costDm2PerLayer: 1.15, tg: 200, family: "ll",   note: "Df~0.002, 28G" },
  { id: "lowloss_ult", label: "Ultra-low-loss (Megtron 7/8)",     costDm2PerLayer: 1.80, tg: 200, family: "ll",   note: "112G+ SerDes" },
  { id: "rogers_4350", label: "Rogers RO4350B (hydrocarbon)",     costDm2PerLayer: 2.60, tg: 280, family: "rf",   note: "Dk 3.48" },
  { id: "rogers_4003", label: "Rogers RO4003C",                   costDm2PerLayer: 2.50, tg: 280, family: "rf",   note: "Dk 3.38" },
  { id: "rogers_3003", label: "Rogers RO3003 (77 GHz radar)",     costDm2PerLayer: 4.20, tg: 280, family: "rf",   note: "PTFE, radar" },
  { id: "ptfe",        label: "PTFE / Taconic (microwave)",       costDm2PerLayer: 4.40, tg: 280, family: "rf",   note: "" },
  { id: "polyimide",   label: "Polyimide (flex)",                 costDm2PerLayer: 1.10, tg: 250, family: "flex", note: "" },
  { id: "lcp",         label: "LCP (mmWave flex)",                costDm2PerLayer: 2.60, tg: 300, family: "flex", note: "low-loss flex" },
  { id: "metalcore",   label: "Metal-core / IMS (aluminium)",     costDm2PerLayer: 0.72, tg: 140, family: "mc",   note: "thermal" },
];

/* ---- Copper weight multiplier on copper-related process & material ---- */
const COPPER_WEIGHTS = [
  { id: "0p5", label: "0.5 oz", oz: 0.5, mult: 0.90 },
  { id: "1",   label: "1 oz",   oz: 1.0, mult: 1.00 },
  { id: "2",   label: "2 oz",   oz: 2.0, mult: 1.28 },
  { id: "3",   label: "3 oz",   oz: 3.0, mult: 1.65 },
  { id: "4",   label: "4 oz",   oz: 4.0, mult: 2.10 },
  { id: "6",   label: "6 oz (heavy)",  oz: 6.0, mult: 3.10 },
  { id: "10",  label: "10 oz (extreme)", oz: 10.0, mult: 5.20 },
];

/* ---- Copper foil profile — matters for high-speed insertion loss + cost ---- */
const COPPER_FOILS = [
  { id: "hte",  label: "HTE (standard)",        addDm2: 0.00 },
  { id: "rtf",  label: "RTF (reverse-treat)",   addDm2: 0.03 },
  { id: "vlp",  label: "VLP (very-low-profile)", addDm2: 0.06 },
  { id: "hvlp", label: "HVLP / HVLP2 (28G+)",   addDm2: 0.10 },
];

/* ---- Fine-line / patterning process. Enables finer geometry, changes cost+yield. */
const FAB_PROCESSES = [
  { id: "subtractive", label: "Subtractive etch (standard)", imageMult: 1.00, yld: 1.00, minMil: 3 },
  { id: "msap",        label: "mSAP (modified semi-additive)", imageMult: 1.60, yld: 0.99, minMil: 1.4 },
  { id: "sap",         label: "SAP / ultra-HDI (<25 µm)",      imageMult: 2.30, yld: 0.96, minMil: 0.8 },
];

/* ---- Via technology: drives drilling, lamination cycles, plating, yield ---- */
const VIA_TYPES = [
  { id: "through", label: "Through-hole only",             lamExtra: 0, microvia: false },
  { id: "buried",  label: "Through + buried/blind",        lamExtra: 1, microvia: false },
  { id: "micro1",  label: "HDI 1+N+1 (microvia, 1 build)", lamExtra: 1, microvia: true, buildup: 1 },
  { id: "micro2",  label: "HDI 2+N+2 (microvia, 2 build)", lamExtra: 2, microvia: true, buildup: 2 },
  { id: "micro3",  label: "HDI 3+N+3 (any-layer)",         lamExtra: 3, microvia: true, buildup: 3 },
];

/* ---- Minimum trace/space classes → yield derating (imaging tech via FAB_PROCESSES) */
const TRACE_CLASSES = [
  { id: "8mil", label: "≥ 8 mil (standard)",      mil: 8,   fineMult: 1.00, yld: 1.00 },
  { id: "5mil", label: "5 mil",                   mil: 5,   fineMult: 1.08, yld: 0.98 },
  { id: "4mil", label: "4 mil",                   mil: 4,   fineMult: 1.16, yld: 0.96 },
  { id: "3mil", label: "3 mil (LDI)",             mil: 3,   fineMult: 1.32, yld: 0.93 },
  { id: "2mil", label: "2 mil (fine-line)",       mil: 2,   fineMult: 1.60, yld: 0.89 },
  { id: "1mil", label: "≤ 1.5 mil (mSAP/SAP)",    mil: 1.5, fineMult: 1.95, yld: 0.84 },
];

/* ---- Surface finishes: cost/dm² at reference gold ($4,100/oz, 2026) + flat
 *      setup. goldFrac = fraction of the finish cost that is spot-gold-variable
 *      (research: ENIG ~70%, a 10% gold rise ≈ +6.8% ENIG). The variable part is
 *      re-scaled by the user's gold-price input; the fixed part (process/labour)
 *      stays put. Silver-based finishes are exposed to silver, not gold. ---- */
const FINISHES = [
  { id: "hasl",    label: "HASL (leaded)",         costDm2: 0.10, setup: 8,  goldFrac: 0.00 },
  { id: "lfhasl",  label: "Lead-free HASL",        costDm2: 0.13, setup: 10, goldFrac: 0.00 },
  { id: "osp",     label: "OSP",                   costDm2: 0.07, setup: 6,  goldFrac: 0.00 },
  { id: "imag",    label: "Immersion silver",      costDm2: 0.26, setup: 14, goldFrac: 0.00 },
  { id: "isn",     label: "Immersion tin",         costDm2: 0.22, setup: 14, goldFrac: 0.00 },
  { id: "enig",    label: "ENIG (Ni/Au)",          costDm2: 0.85, setup: 24, goldFrac: 0.70 },
  { id: "enepig",  label: "ENEPIG (Ni/Pd/Au)",     costDm2: 1.25, setup: 32, goldFrac: 0.55 },
  { id: "epig",    label: "EPIG (Pd/Au, Ni-free)", costDm2: 1.15, setup: 30, goldFrac: 0.50 },
  { id: "hardgold",label: "Hard gold (edge/tab)",  costDm2: 2.20, setup: 38, goldFrac: 0.85 },
];
const GOLD_REF = 4100; // reference gold price ($/oz) at which FINISHES costs are set

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
  { id: "consumer",   label: "Consumer (IPC Class 2)",      yld: 0.97, scrap: 0.02, testMult: 1.0, inspect: 0.00, nreMult: 1.0, microsection: false, axi: false, margin: 0.15 },
  { id: "industrial", label: "Industrial (Class 2+)",       yld: 0.95, scrap: 0.03, testMult: 1.1, inspect: 0.04, nreMult: 1.2, microsection: false, axi: false, margin: 0.20 },
  { id: "automotive", label: "Automotive (Class 3 / IATF)", yld: 0.92, scrap: 0.05, testMult: 1.3, inspect: 0.10, nreMult: 1.8, microsection: true,  axi: true,  margin: 0.25 },
  { id: "aerospace",  label: "Aerospace/Mil (Class 3/A)",   yld: 0.88, scrap: 0.08, testMult: 1.6, inspect: 0.20, nreMult: 2.6, microsection: true,  axi: true,  margin: 0.35 },
];

/* ---- Region: 2026 processing-cost multipliers (China = 1.0). These are
 *      BLENDED fab-processing multipliers, NOT raw wage ratios — labour is only
 *      ~15–30% of PCB cost and low-wage regions have lower productivity, so the
 *      total-cost spread is compressed vs the raw wage index (China=1.0):
 *      India ~0.3, Vietnam ~0.65, Taiwan ~1.7, Korea ~3.5, USA ~7.2, DE ~8.8.
 *      Energy costs (EU highest, China/US ~$0.08/kWh) sit in the overhead term. */
const REGIONS = [
  { id: "china",   label: "China",             labor: 1.00, overhead: 1.00 },
  { id: "vietnam", label: "Vietnam / SE-Asia", labor: 0.85, overhead: 0.94 },
  { id: "india",   label: "India",             labor: 0.90, overhead: 1.00 },
  { id: "taiwan",  label: "Taiwan",            labor: 1.40, overhead: 1.20 },
  { id: "skorea",  label: "South Korea",       labor: 1.60, overhead: 1.25 },
  { id: "na",      label: "North America",     labor: 2.60, overhead: 1.90 },
  { id: "eu",      label: "Europe",            labor: 2.85, overhead: 2.10 },
];

/* ---- Global cost coefficients ($/dm² unless noted). Calibrated to 2026 fab
 *      economics. Tune here, transparently. */
const COEFF = {
  materialCal:     1.00,
  imagePerLayerDm2: 0.13,   // inner/outer imaging per copper layer
  etchPerLayerDm2:  0.11,   // develop-etch-strip per layer
  aoiPerLayerDm2:   0.05,   // AOI per layer
  lamPerCycleDm2:   0.55,   // lay-up + press per lamination cycle
  costPerHole:      0.0009, // mechanical drilled hole
  holeDensity:      160,    // holes/dm² default
  costPerMicrovia:  0.0011, // laser microvia
  microviaDensity:  900,    // microvias/dm² per build-up layer
  desmearPthDm2:    0.18,   // desmear + electroless copper
  platingDm2:       0.26,   // electroplate (layer-normalised)
  maskDm2:          0.10,   // solder mask per side
  silkDm2:          0.04,   // legend per side
  profilingDm2:     0.10,   // route/profile depanel
  impedanceDm2:     0.06,   // impedance control process premium
  impedanceCoupon:  18,     // TDR coupon NRE-ish
  // advanced processes (2026)
  backdrillFrac:    0.30,   // fraction of holes back-drilled (high-speed nets)
  costPerBackdrill: 0.10,   // $/back-drilled hole (controlled-depth stub removal)
  nreBackdrill:     260,    // back-drill program NRE
  viafillDm2:       0.28,   // resin/copper via-fill + planarise, per build-up
  msapAdderDm2:     0.05,   // extra chemistry/handling for semi-additive
  axiDm2:           0.04,   // automated X-ray (Class 3 buried-via inspection)
  istCoupon:        0.03,   // IST/CAF reliability coupon per board (amortised set)
  // back-end test
  flyingProbeRate:  0.9,    // $/board low-volume e-test
  fixtureTestDm2:   0.03,   // fixtured/ICT marginal per board
  // NRE (one-time, $)
  nrePhotoTools:    120,
  nreDrillProgram:  90,
  nreTestFixture:   350,
  nreLaserProgram:  180,
  // flex / rigid-flex extras (per dm²)
  coverlayDm2:      0.45,
  stiffenerDm2:     0.35,
  heavyCopperDm2:   0.22,   // etch comp per dm² per extra oz
};

/* ---- Default model state (4-layer FR-4 High-Tg automotive baseline) ---- */
const DEFAULTS = {
  pcbType: "rigid",
  boardW: 100, boardH: 80,
  layerCount: 4,
  material: "fr4_hightg",
  boardThickness: 1.6,
  copperInner: "1",
  copperOuter: "1",
  copperFoil: "hte",
  fabProcess: "subtractive",
  trace: "5mil",
  via: "through",
  impedance: true,
  backdrill: false,
  viafill: false,
  finish: "enig",
  maskColor: "green",
  silkscreen: true,
  panelW: 457, panelH: 305,        // 18"×12" working panel
  utilization: 80,
  quality: "automotive",
  region: "china",
  orderQty: 50000,
  holeDensity: 160,
  overheadPct: 18,
  marginPct: 25,
  marketSurcharge: 6,              // 2026 metal/energy surcharge on material+processing
  goldPrice: 4100,                 // spot gold $/oz — scales gold-finish variable cost
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
      material: "lowloss_mid", boardThickness: 1.6, copperInner: "1", copperOuter: "1",
      copperFoil: "vlp", fabProcess: "subtractive", trace: "4mil", via: "buried",
      impedance: true, backdrill: true, finish: "enig",
      quality: "automotive", region: "china", orderQty: 20000 },
  },
  {
    name: "10-layer HDI rigid-flex infotainment PCB",
    note: "Cockpit / IVI display + main board, luxury SUV",
    input: { ...DEFAULTS, pcbType: "rigidflex", boardW: 140, boardH: 90, layerCount: 10,
      material: "polyimide", boardThickness: 1.2, copperInner: "0p5", copperOuter: "1",
      copperFoil: "hte", fabProcess: "msap", trace: "3mil", via: "micro2",
      impedance: true, viafill: true, finish: "enepig",
      quality: "automotive", region: "china", orderQty: 8000 },
  },
];
