/* ============================================================================
 * data.js — Calibration benchmarks for the Automotive IVI SoC should-cost model
 *
 * All figures are public/analyst-derived engineering estimates for 2025–2026
 * automotive-grade production on a fabless business model. They are RANGES and
 * MIDPOINTS for transparency; the model uses the midpoint as the editable
 * default. Sources & rationale are summarised in the Methodology tab.
 *
 * Wafer cost = fully-processed 300mm wafer, automotive-qualified flow.
 * Mask cost  = full photomask set for the node.
 * D0         = mature random defect density (defects/cm²) for the node in
 *              steady-state automotive production.
 * ==========================================================================*/

const NODES = [
  // tier: mature | mid | advanced
  { id: "40",  label: "40 nm",      tier: "mature",   waferCost: 2500,  waferLo: 2200,  waferHi: 2900,  mask: 1100000,  d0: 0.06, dieArea: 130, euv: false },
  { id: "28",  label: "28 nm",      tier: "mature",   waferCost: 3000,  waferLo: 2700,  waferHi: 3400,  mask: 1500000,  d0: 0.06, dieArea: 120, euv: false },
  { id: "22",  label: "22 nm",      tier: "mature",   waferCost: 3300,  waferLo: 3000,  waferHi: 3800,  mask: 1900000,  d0: 0.07, dieArea: 110, euv: false },
  { id: "16",  label: "16 nm",      tier: "mid",      waferCost: 5500,  waferLo: 4900,  waferHi: 6200,  mask: 6000000,  d0: 0.08, dieArea: 100, euv: false },
  { id: "14",  label: "14 nm",      tier: "mid",      waferCost: 5300,  waferLo: 4700,  waferHi: 6000,  mask: 5500000,  d0: 0.08, dieArea: 100, euv: false },
  { id: "7",   label: "7 nm",       tier: "advanced", waferCost: 9800,  waferLo: 9000,  waferHi: 11000, mask: 16000000, d0: 0.10, dieArea: 90,  euv: true  },
  { id: "6",   label: "6 nm",       tier: "advanced", waferCost: 10200, waferLo: 9300,  waferHi: 11500, mask: 17500000, d0: 0.10, dieArea: 85,  euv: true  },
  { id: "5",   label: "5 nm",       tier: "advanced", waferCost: 14500, waferLo: 13000, waferHi: 17000, mask: 27000000, d0: 0.12, dieArea: 80,  euv: true  },
];

/* Package presets. Cost is auto-estimated as base + perBall*ballCount, then the
 * field is editable. Defaults reflect mainstream automotive IVI packaging. */
const PACKAGES = [
  { id: "bga",    label: "Standard BGA (0.8 mm, 400–800 balls)", base: 0.60, perBall: 0.0028, balls: 600, assembly: 0.40 },
  { id: "fcbga",  label: "Flip-chip BGA (advanced substrate)",    base: 1.30, perBall: 0.0045, balls: 700, assembly: 0.55 },
  { id: "fcbga_hd", label: "FC-BGA high-density (fine-pitch)",     base: 2.20, perBall: 0.0060, balls: 900, assembly: 0.70 },
  { id: "pop",    label: "PoP (package-on-package, +DRAM stack)",  base: 2.00, perBall: 0.0050, balls: 600, assembly: 0.90 },
  { id: "sip",    label: "SiP (system-in-package, multi-die)",     base: 3.50, perBall: 0.0065, balls: 800, assembly: 1.40 },
];

/* Default model state (mature 28nm automotive IVI baseline). */
const DEFAULTS = {
  waferDiameter: 300,
  waferCost: 3000,
  edgeExclusion: 3,
  scribe: 0.1,
  dieArea: 100,
  asilOverhead: 8,
  defectDensity: 0.06,
  clustering: 2.5,
  systematicYield: 95,
  packageType: "bga",
  ballCount: 600,
  packageCost: 2.50,
  assemblyCost: 0.45,
  testTime: 12,
  testerRate: 180,
  burnIn: false,
  burnInCost: 0.35,
  assemblyYield: 99,
  testYield: 98,
  ipRoyalty: 1.80,
  ipUpfront: 8000000,
  maskCost: 1500000,
  designNRE: 25000000,
  qualNRE: 6000000,
  annualVolume: 2000000,
  programYears: 5,
  overheadPct: 12,
  grossMargin: 45,
};
