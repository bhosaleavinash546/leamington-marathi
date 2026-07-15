/**
 * CostVision — Deterministic Should-Cost Engine
 * ------------------------------------------------------------------
 * Pure, dependency-free, bottom-up parametric costing.
 * Every number is computed from rate × time / mass × price — NO LLM.
 *
 *   total = material + machine + labour + setup + finishing + tooling
 *           + overhead + commercial(packaging/freight) + SG&A/profit
 *
 * Also provides a Monte-Carlo simulation (P10/P50/P90) over the
 * uncertainty in commodity price, machine rate, cycle time and scrap.
 *
 * Exported:
 *   computeShouldCost(input)      → deterministic breakdown
 *   simulateShouldCost(input, n)  → { p10, p50, p90, mean, stdev }
 *   MATERIALS, PROCESSES, REGIONS → catalogues for UI/validation
 *   listMaterials(), listProcesses(), listRegions()
 */

import { calibrationFactor, calibrationSource } from './calibration.mjs';

// ─── Material database ────────────────────────────────────────────────────────
// price = €/kg (derived from COMMODITY_BASELINE), density = g/cm³,
// scrapRecovery = fraction of material price recovered on offcuts/runners.
export const MATERIALS = {
  'Steel (mild)':             { density: 7.85, price: 0.62, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel (high-strength)':    { density: 7.85, price: 1.10, scrapRecovery: 0.20, family: 'ferrous' },
  'Stainless Steel 304':      { density: 8.00, price: 2.85, scrapRecovery: 0.35, family: 'ferrous' },
  'Cast Iron (Grey)':         { density: 7.20, price: 0.50, scrapRecovery: 0.25, family: 'castiron' },
  'Cast Iron (Ductile/GJS)':  { density: 7.10, price: 0.58, scrapRecovery: 0.25, family: 'castiron' },
  'Aluminium 6061':           { density: 2.70, price: 2.85, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium 7075':           { density: 2.81, price: 4.20, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium A356 (cast)':    { density: 2.68, price: 2.60, scrapRecovery: 0.50, family: 'aluminium' },
  'Magnesium AZ31':           { density: 1.77, price: 3.20, scrapRecovery: 0.30, family: 'magnesium' },
  'Titanium Ti-6Al-4V':       { density: 4.43, price: 32.0, scrapRecovery: 0.40, family: 'titanium' },
  'Brass (CuZn39)':           { density: 8.40, price: 6.50, scrapRecovery: 0.60, family: 'copper' },
  'Zinc (ZAMAK 5)':           { density: 6.60, price: 2.90, scrapRecovery: 0.50, family: 'zinc' },
  'Polypropylene (PP)':       { density: 0.905, price: 1.65, scrapRecovery: 0.10, family: 'plastic' },
  'PA6 (Nylon)':              { density: 1.14, price: 3.20, scrapRecovery: 0.10, family: 'plastic' },
  'PA66-GF30 (glass-filled)': { density: 1.36, price: 3.80, scrapRecovery: 0.10, family: 'plastic' },
  'ABS':                      { density: 1.05, price: 2.10, scrapRecovery: 0.10, family: 'plastic' },
  'POM (Acetal)':             { density: 1.41, price: 2.60, scrapRecovery: 0.10, family: 'plastic' },
  'Polycarbonate (PC)':       { density: 1.20, price: 3.00, scrapRecovery: 0.10, family: 'plastic' },
  'CFRP (Carbon Fibre)':      { density: 1.55, price: 28.0, scrapRecovery: 0.00, family: 'composite' },
  // ── Families the audit flagged as uncostable (e-motors, busbars, seals,
  //    hoses, glazing, harnesses) ──
  'Copper (Cu-ETP)':          { density: 8.96, price: 9.20, scrapRecovery: 0.75, family: 'copper' },
  'Electrical Steel (M250-35A)': { density: 7.65, price: 1.45, scrapRecovery: 0.20, family: 'electricalsteel' },
  'EPDM Rubber':              { density: 1.20, price: 2.40, scrapRecovery: 0.00, family: 'elastomer' },
  'Glass (Soda-lime, automotive)': { density: 2.50, price: 0.85, scrapRecovery: 0.15, family: 'glass' },
};

// ─── Region database ──────────────────────────────────────────────────────────
// labour = fully-loaded direct €/hr; overheadPct = factory burden on conversion;
// sgaPct = SG&A + profit margin on works cost.
export const REGIONS = {
  'Germany':        { labour: 50, overheadPct: 0.20, sgaPct: 0.12 },
  'UK':             { labour: 47, overheadPct: 0.19, sgaPct: 0.12 },
  'Czech Republic': { labour: 17, overheadPct: 0.16, sgaPct: 0.11 },
  'Spain':          { labour: 24, overheadPct: 0.17, sgaPct: 0.11 },
  'Mexico':         { labour: 9,  overheadPct: 0.14, sgaPct: 0.10 },
  'USA':            { labour: 44, overheadPct: 0.18, sgaPct: 0.12 },
  'China':          { labour: 14, overheadPct: 0.15, sgaPct: 0.10 },
  'India':          { labour: 11, overheadPct: 0.14, sgaPct: 0.10 },
  'Korea':          { labour: 28, overheadPct: 0.17, sgaPct: 0.11 },
};

// ─── Process database ─────────────────────────────────────────────────────────
// machineRate  = €/hr machine-hour rate (depreciation + energy + maintenance)
// operators    = direct operators per machine (0.3 = highly automated cell)
// cavities     = parts produced per machine cycle
// utilisation  = finished-mass / input-mass (buy-to-fly inverse)
// scrapPct     = process reject rate (added to conversion)
// setupHr      = setup time per batch
// batch        = parts per setup (setup amortised over this)
// toolLife     = number of parts over which tooling is amortised
// cycleBase + cyclePerKg·w = machine cycle time in seconds as f(part weight kg)
// toolingBase + toolingPerKg·w = total hard-tooling cost € as f(part weight kg)
//   (expressed as uploadable coefficients so a custom rate library can override them)
// families     = compatible material families (validation)
export const PROCESSES = {
  'Stamping / Deep Drawing': {
    machineRate: 120, operators: 0.6, cavities: 1, utilisation: 0.62, scrapPct: 0.03,
    setupHr: 1.5, batch: 4000, toolLife: 1_200_000,
    cycleBase: 3, cyclePerKg: 1.2, toolingBase: 180_000, toolingPerKg: 90_000,
    families: ['ferrous', 'aluminium'],
  },
  'Roll Forming': {
    machineRate: 70, operators: 0.5, cavities: 1, utilisation: 0.88, scrapPct: 0.02,
    setupHr: 2.0, batch: 6000, toolLife: 3_000_000,
    cycleBase: 4, cyclePerKg: 0.8, toolingBase: 120_000, toolingPerKg: 40_000,
    families: ['ferrous', 'aluminium'],
  },
  'Hydroforming': {
    machineRate: 110, operators: 0.6, cavities: 1, utilisation: 0.80, scrapPct: 0.04,
    setupHr: 2.5, batch: 2000, toolLife: 800_000,
    cycleBase: 25, cyclePerKg: 4, toolingBase: 220_000, toolingPerKg: 70_000,
    families: ['ferrous', 'aluminium'],
  },
  'Laser Cutting + Bending': {
    machineRate: 85, operators: 0.8, cavities: 1, utilisation: 0.78, scrapPct: 0.03,
    setupHr: 0.5, batch: 500, toolLife: 5_000_000,
    cycleBase: 30, cyclePerKg: 12, toolingBase: 8_000, toolingPerKg: 0,
    families: ['ferrous', 'aluminium'],
  },
  // Casting `utilisation` is metal yield = finished-mass / poured-mass; the values
  // reflect real gating/riser/biscuit/overflow overhead (HPDC 0.60, sand 0.55,
  // investment 0.50, gravity 0.65, zinc hot-chamber 0.75). `returnsRecovery` is the
  // in-house remelt value of those returns + rejected castings (~0.9 of alloy),
  // which offsets the higher poured mass — so totals stay realistic while the
  // displayed buy-to-fly and input mass become physically defensible.
  'Die Casting (Aluminium)': {
    machineRate: 95, operators: 0.5, cavities: 1, utilisation: 0.60, scrapPct: 0.05,
    setupHr: 3.0, batch: 1500, toolLife: 150_000,
    cycleBase: 35, cyclePerKg: 6, toolingBase: 90_000, toolingPerKg: 60_000,
    families: ['aluminium', 'magnesium'],
    finishPct: 0.1, returnsRecovery: 0.90,
    // Tonnage-tiered machine rates: clamp T ≈ projected area (cm²) × 0.7 t/cm².
    // Used only when the caller supplies projectedAreaCm2; else the flat rate.
    clampTPerCm2: 0.7,
    machineTiers: [
      { maxClampT: 400, rate: 70 }, { maxClampT: 800, rate: 95 }, { maxClampT: 1200, rate: 130 },
      { maxClampT: 1800, rate: 180 }, { maxClampT: 2700, rate: 240 }, { maxClampT: 99999, rate: 320 },
    ],
  },
  'Die Casting (Zinc)': {
    machineRate: 75, operators: 0.5, cavities: 2, utilisation: 0.75, scrapPct: 0.04,
    setupHr: 2.0, batch: 2000, toolLife: 500_000,
    cycleBase: 12, cyclePerKg: 5, toolingBase: 60_000, toolingPerKg: 40_000,
    families: ['zinc'],
    finishPct: 0.1, returnsRecovery: 0.90,
  },
  'Sand Casting': {
    machineRate: 55, operators: 1.2, cavities: 1, utilisation: 0.55, scrapPct: 0.06,
    setupHr: 2.0, batch: 400, toolLife: 50_000,
    cycleBase: 45, cyclePerKg: 12, toolingBase: 18_000, toolingPerKg: 12_000,
    families: ['castiron', 'ferrous', 'aluminium', 'copper'],
    finishPct: 0.2, returnsRecovery: 0.90,
  },
  'Investment Casting': {
    // Shell route: wax injection, tree assembly, 7-9 ceramic dips over days,
    // dewax/fire/pour/cutoff/grind — the most labour-intensive casting process.
    machineRate: 70, operators: 2.5, cavities: 1, utilisation: 0.50, scrapPct: 0.05,
    setupHr: 3.0, batch: 800, toolLife: 100_000,
    cycleBase: 150, cyclePerKg: 60, toolingBase: 40_000, toolingPerKg: 30_000,
    families: ['ferrous', 'castiron', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.15, returnsRecovery: 0.90,
  },
  'Gravity Die Casting': {
    machineRate: 80, operators: 0.7, cavities: 1, utilisation: 0.65, scrapPct: 0.05,
    setupHr: 2.5, batch: 1500, toolLife: 120_000,
    cycleBase: 40, cyclePerKg: 8, toolingBase: 70_000, toolingPerKg: 45_000,
    families: ['aluminium', 'copper'],
    finishPct: 0.12, returnsRecovery: 0.90,
  },
  'Injection Moulding': {
    machineRate: 65, operators: 0.4, cavities: 2, utilisation: 0.95, scrapPct: 0.02,
    setupHr: 2.0, batch: 5000, toolLife: 1_000_000,
    cycleBase: 18, cyclePerKg: 22, toolingBase: 45_000, toolingPerKg: 80_000,
    families: ['plastic'],
    // Cooling-dominated cycle: with wallThicknessMm, cycle = base + k·wall² (a
    // 2 mm clip and a 4 mm carrier are not the same s/kg). k ≈ 2 s/mm² for PP/PA.
    coolingKSecPerMm2: 2.0,
    // Clamp T ≈ projected area (cm²) × 0.35 t/cm² for engineering thermoplastics.
    clampTPerCm2: 0.35,
    machineTiers: [
      { maxClampT: 100, rate: 28 }, { maxClampT: 250, rate: 45 }, { maxClampT: 500, rate: 65 },
      { maxClampT: 1000, rate: 95 }, { maxClampT: 2000, rate: 140 }, { maxClampT: 99999, rate: 190 },
    ],
  },
  'Composite Layup (RTM)': {
    machineRate: 60, operators: 1.5, cavities: 1, utilisation: 0.90, scrapPct: 0.05,
    setupHr: 2.0, batch: 300, toolLife: 40_000,
    cycleBase: 300, cyclePerKg: 120, toolingBase: 60_000, toolingPerKg: 40_000,
    families: ['composite'],
  },
  'Forging (Hot)': {
    machineRate: 150, operators: 1.0, cavities: 1, utilisation: 0.75, scrapPct: 0.05,
    setupHr: 2.5, batch: 2000, toolLife: 60_000,
    cycleBase: 8, cyclePerKg: 2.5, toolingBase: 70_000, toolingPerKg: 50_000,
    families: ['ferrous', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.12,
  },
  'Forging (Cold)': {
    // Cold heading/forming: multi-station headers run 100-300 strokes/min, so a
    // fastener is sub-second, tapering up for larger press-cold-forged parts. The
    // old flat 4s base made an M8 bolt ~10x too dear. Tooling is cheap carbide
    // die stations run over millions of hits (toolLife 2M), so a fastener isn't
    // tooling-dominated; larger cold-forged parts carry more via toolingPerKg.
    machineRate: 100, operators: 0.6, cavities: 1, utilisation: 0.88, scrapPct: 0.015,
    setupHr: 1.5, batch: 6000, toolLife: 2_000_000,
    cycleBase: 0.6, cyclePerKg: 4, toolingBase: 18_000, toolingPerKg: 40_000,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.1,
  },
  'Machining (CNC)': {
    machineRate: 65, operators: 0.5, cavities: 1, utilisation: 0.45, scrapPct: 0.02,
    setupHr: 1.0, batch: 200, toolLife: 10_000_000,
    // Real featured parts run multiple operations (roughing + finishing + non-cut
    // tool-change/rapids/probing), so cycle is far longer than a single pass.
    cycleBase: 30, cyclePerKg: 500, toolingBase: 4_000, toolingPerKg: 0,
    setups: 2,                   // op10/op20 fixturing
    perishablePerHr: 8,          // inserts, drills, coolant
    families: ['ferrous', 'castiron', 'aluminium', 'magnesium', 'titanium', 'copper', 'zinc', 'plastic'],
    finishPct: 0.20,
  },
  'Extrusion': {
    machineRate: 90, operators: 0.5, cavities: 1, utilisation: 0.85, scrapPct: 0.03,
    setupHr: 1.5, batch: 8000, toolLife: 2_000_000,
    cycleBase: 2, cyclePerKg: 0.5, toolingBase: 25_000, toolingPerKg: 0,
    families: ['aluminium', 'copper'],
  },
  'Lamination Stamping (Electrical Steel)': {
    // High-speed progressive stamping + interlock stacking of motor laminations.
    // 200+ spm carbide dies over tens of millions of hits; utilisation reflects
    // slot/skeleton scrap (~30% of the strip becomes remelt).
    machineRate: 110, operators: 0.4, cavities: 1, utilisation: 0.70, scrapPct: 0.02,
    setupHr: 3.0, batch: 10_000, toolLife: 40_000_000,
    cycleBase: 1.5, cyclePerKg: 3.0, toolingBase: 220_000, toolingPerKg: 20_000,
    families: ['electricalsteel'],
  },
  'Rubber Moulding (Compression/Injection)': {
    // Cure time dominates: 60-180 s in-mould vulcanisation. Multi-cavity tools
    // offset the slow cycle for seals/grommets/boots.
    machineRate: 45, operators: 0.6, cavities: 8, utilisation: 0.88, scrapPct: 0.04,
    setupHr: 2.0, batch: 3000, toolLife: 500_000,
    cycleBase: 90, cyclePerKg: 60, toolingBase: 22_000, toolingPerKg: 30_000,
    families: ['elastomer'],
  },
  'Glass Forming (Bend + Temper)': {
    // Automotive glazing: cut/grind → gravity/press bend → temper (or laminate).
    // Line rate dominates; the bending fixture is cheap relative to the furnace.
    machineRate: 150, operators: 0.8, cavities: 1, utilisation: 0.82, scrapPct: 0.04,
    setupHr: 2.5, batch: 2000, toolLife: 300_000,
    cycleBase: 40, cyclePerKg: 6, toolingBase: 30_000, toolingPerKg: 3_000,
    families: ['glass'],
  },
  'MIG Welding Assembly': {
    machineRate: 45, operators: 1.2, cavities: 1, utilisation: 0.98, scrapPct: 0.02,
    setupHr: 0.5, batch: 300, toolLife: 5_000_000,
    cycleBase: 60, cyclePerKg: 25, toolingBase: 30_000, toolingPerKg: 0,
    families: ['ferrous', 'aluminium'],
  },
  'Resistance Spot Welding': {
    machineRate: 80, operators: 0.4, cavities: 1, utilisation: 0.99, scrapPct: 0.01,
    setupHr: 0.8, batch: 1000, toolLife: 5_000_000,
    cycleBase: 25, cyclePerKg: 10, toolingBase: 120_000, toolingPerKg: 0,
    families: ['ferrous', 'aluminium'],
  },

  // ── Conversion-only downstream operations (process-chain routing) ───────────
  // These never appear as a primary op: they add conversion cost to a part that
  // already exists (costPerKg model — typical merchant-rate €/kg incl. energy,
  // labour and line burden). utilisation = mass retained through the op.
  'Machining (secondary ops)': {
    // Op-20/op-30 machining of a casting/forging: datum faces, bores, drilled &
    // tapped holes — NOT billet machining (that's 'Machining (CNC)'). Stock
    // removal ~8%, so the upstream op must deliver a slightly heavier part.
    conversionOnly: true,
    machineRate: 65, operators: 0.5, cavities: 1, utilisation: 0.92, scrapPct: 0.015,
    setupHr: 1.0, batch: 400, toolLife: 10_000_000,
    cycleBase: 30, cyclePerKg: 22, toolingBase: 6_000, toolingPerKg: 0,
    setups: 2, perishablePerHr: 8,
    families: ['ferrous', 'castiron', 'aluminium', 'magnesium', 'titanium', 'copper', 'zinc'],
  },
  'Heat Treatment (batch)': {
    conversionOnly: true, costPerKg: 0.32, utilisation: 1, scrapPct: 0.008,
    families: ['ferrous', 'castiron', 'aluminium', 'titanium', 'copper'],
    note: 'Normalise / Q&T / T6 in a batch furnace, merchant rate incl. energy',
  },
  'E-coat (KTL)': {
    conversionOnly: true, costPerKg: 0.28, utilisation: 1, scrapPct: 0.005,
    families: ['ferrous', 'castiron', 'aluminium'],
    note: 'Cathodic dip coating, rack density typical of chassis parts',
  },
  'Powder Coating': {
    conversionOnly: true, costPerKg: 0.45, utilisation: 1, scrapPct: 0.01,
    families: ['ferrous', 'castiron', 'aluminium'],
  },
  'Zinc Plating': {
    conversionOnly: true, costPerKg: 0.38, utilisation: 1, scrapPct: 0.01,
    families: ['ferrous'],
  },
  'Grinding (finish)': {
    conversionOnly: true, costPerKg: 0.85, utilisation: 0.995, scrapPct: 0.01,
    families: ['ferrous', 'castiron', 'aluminium', 'titanium'],
    note: 'Finish grinding of functional faces / journals to tight Ra',
  },
  'Washing & Final Inspection': {
    conversionOnly: true, costPerKg: 0.10, utilisation: 1, scrapPct: 0.002,
    families: ['ferrous', 'castiron', 'aluminium', 'magnesium', 'titanium', 'copper', 'zinc', 'plastic', 'composite'],
  },
};

export const listMaterials = () => Object.keys(MATERIALS);
export const listProcesses = () => Object.keys(PROCESSES);
export const listRegions   = () => Object.keys(REGIONS);

// ─── Calibration constants ────────────────────────────────────────────────────
// Tuned against the should-cost benchmark (benchmark/cost-run.mjs) to remove the
// systematic under-read of a pure works-cost buildup vs real piece prices.
//   DEFAULT_FINISH_PCT — secondary/finishing ops as a fraction of primary
//     conversion when a process does not specify its own `finishPct`.
//   COMMERCIAL_PCT — packaging + inbound/outbound freight + receiving & quality,
//     applied to works cost (before SG&A/profit).
const DEFAULT_FINISH_PCT = 0.06;
const COMMERCIAL_PCT = 0.05;
// Exposed so a custom rate library can read/override the global defaults.
export const COST_CONSTANTS = { commercialPct: COMMERCIAL_PCT, defaultFinishPct: DEFAULT_FINISH_PCT };

function round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Deterministic bottom-up should-cost.
 * @param {object} input
 * @param {string} input.material  key of MATERIALS
 * @param {string} input.process   key of PROCESSES
 * @param {number} input.weightKg  finished part mass (kg)
 * @param {number} input.annualVolume  units/year
 * @param {string} input.region    key of REGIONS
 * @param {number} [input.programYears=5]
 * @param {object} [overrides]  optional {priceMult, machineMult, cycleMult, scrapAdd} for simulation
 * @returns {object} full breakdown
 */
export function computeShouldCost(input, overrides = {}, calibration = null, library = null) {
  const { material, process, weightKg, annualVolume, region, programYears = 5 } = input;

  // Active rate library: a custom (admin-uploaded) library merged over the
  // built-in defaults, or the built-ins when none is supplied.
  const MAT = library?.MATERIALS || MATERIALS;
  const PROC = library?.PROCESSES || PROCESSES;
  const REG = library?.REGIONS || REGIONS;
  const commercialPct    = library?.constants?.commercialPct    ?? COMMERCIAL_PCT;
  const defaultFinishPct = library?.constants?.defaultFinishPct ?? DEFAULT_FINISH_PCT;

  // Own-property lookups only — a key like "constructor"/"__proto__" must resolve
  // to "unknown", not to an inherited Object.prototype member (which would slip
  // past the guards and yield NaN).
  const mat = Object.hasOwn(MAT, material) ? MAT[material] : undefined;
  const proc = Object.hasOwn(PROC, process) ? PROC[process] : undefined;
  const reg = Object.hasOwn(REG, region) ? REG[region] : undefined;
  if (!mat) throw new Error(`Unknown material: ${material}`);
  if (!proc) throw new Error(`Unknown process: ${process}`);
  if (!reg) throw new Error(`Unknown region: ${region}`);
  if (proc.conversionOnly) throw new Error(`${process} is a downstream operation — use it in a route after a primary forming process (e.g. "Sand Casting + ${process}").`);
  // Family compatibility: costing a ferrous part on an aluminium-die-casting model
  // (or similar) yields a physically meaningless number. Refuse rather than mislead.
  // A non-array `families` (e.g. from an unvalidated custom library) must NOT
  // silently disable the guard — treat it as incompatible.
  if (!Array.isArray(proc.families) || !proc.families.includes(mat.family)) {
    const allowed = Array.isArray(proc.families) ? proc.families.join(' / ') : '(process has no valid family list)';
    throw new Error(`${material} (${mat.family}) is not compatible with ${process}, which is modelled for ${allowed} only.`);
  }

  const w = Number(weightKg);
  const vol = Number(annualVolume);
  // Number.isFinite rejects Infinity/NaN too — a plain `> 0` lets `1e999`
  // (JSON.parse → Infinity) through, then `Infinity - Infinity` = NaN poisons
  // the whole breakdown and the endpoint returns HTTP 200 full of NaN.
  if (!Number.isFinite(w) || w <= 0) throw new Error('weightKg must be a finite number > 0');
  if (!Number.isFinite(vol) || vol <= 0) throw new Error('annualVolume must be a finite number > 0');

  // A custom (admin-uploaded) library or a programmatic caller can hand us a
  // process/material/region missing a load-bearing numeric field; guarding here
  // turns a silent NaN total into a clear error.
  const finitePos = (v) => Number.isFinite(v) && v > 0;
  if (!(proc.utilisation > 0 && proc.utilisation <= 1)) throw new Error(`${process}: utilisation must be in (0,1]`);
  if (!(Number.isFinite(proc.scrapPct) && proc.scrapPct >= 0 && proc.scrapPct < 1)) throw new Error(`${process}: scrapPct must be in [0,1)`);
  if (!finitePos(proc.cavities) || !finitePos(proc.batch)) throw new Error(`${process}: cavities and batch must be > 0`);
  if (!Number.isFinite(mat.price) || mat.price < 0) throw new Error(`${material}: price must be a finite number ≥ 0`);
  if (!Number.isFinite(reg.labour) || reg.labour < 0) throw new Error(`${region}: labour must be a finite number ≥ 0`);

  // Simulation multipliers (1 = deterministic). Floored at a small positive so a
  // stray negative/zero can't silently net conversion against material.
  const clampMult = (v) => Math.max(0.01, Number.isFinite(v) ? v : 1);
  const priceMult   = clampMult(overrides.priceMult   ?? 1);
  const machineMult = clampMult(overrides.machineMult ?? 1);
  const cycleMult   = clampMult(overrides.cycleMult   ?? 1);
  const scrapAdd    = Number.isFinite(overrides.scrapAdd) ? overrides.scrapAdd : 0;

  const scrapPct = Math.min(0.9, Math.max(0, proc.scrapPct + scrapAdd));

  // ── Tolerance / surface-finish drivers (bounded, disclosed multipliers) ─────
  // Costing the DRAWING, not just the mass: tighter IT grades raise cycle and
  // scrap; fine surface finish adds passes; each critical characteristic (CC/SC)
  // adds per-part gauging time. All effects surface in `drivers` for audit.
  // Defined BEFORE material: a tolerance reject is a physical part — its material
  // is consumed too, so the effective scrap grosses the material line as well.
  const TOL_CLASSES = { standard: { cycle: 1, scrap: 0 }, tight: { cycle: 1.15, scrap: 0.01 }, precision: { cycle: 1.35, scrap: 0.03 } };
  const FIN_CLASSES = { standard: 1, fine: 1.10, polished: 1.25 };
  const tol = TOL_CLASSES[input.toleranceClass] ?? TOL_CLASSES.standard;
  const finMult = FIN_CLASSES[input.surfaceFinish] ?? 1;
  const ccCount = Math.max(0, Math.min(50, Number(input.criticalCharacteristics) || 0));
  const scrapPctEff = Math.min(0.9, scrapPct + tol.scrap);
  // Correct yield gross-up: producing one GOOD part requires 1/(1-s) attempts
  // (not 1+s), and rejects consume setup share and tool life too.
  const yieldMultEff = 1 / (1 - scrapPctEff);

  // ── Material cost ──────────────────────────────────────────────────────────
  // Recovery of returned metal: a foundry/forge remelts its own runners, risers,
  // biscuits and REJECTED parts in-house at ~0.9 of alloy value (process-level
  // `returnsRecovery`), whereas machining swarf / stamping skeleton is sold as
  // external scrap at the material's `scrapRecovery`. Both offcuts AND rejected
  // parts are recovered — the old code recovered offcuts only and wrote off the
  // full material value of every reject.
  const pricePerKg = mat.price * priceMult;
  const recovery   = Number.isFinite(proc.returnsRecovery) ? proc.returnsRecovery : mat.scrapRecovery;
  const inputMass  = w / proc.utilisation;          // buy-to-fly (per good part)
  const offcutMass = inputMass - w;
  const grossMaterial   = inputMass * pricePerKg * yieldMultEff;           // input over all attempts
  const offcutRecovered = offcutMass * yieldMultEff;                      // gating/runner returns
  const rejectRecovered = w * (yieldMultEff - 1);                         // rejected part bodies, remelted
  const materialCost    = grossMaterial - pricePerKg * recovery * (offcutRecovered + rejectRecovered);

  // ── Conversion: machine + labour ────────────────────────────────────────────
  // Cooling-dominated moulding: when wall thickness is known, cycle scales with
  // wall² (Chvorinov-style) instead of mass — a 2 mm clip and a 4 mm carrier are
  // NOT the same seconds-per-kg.
  const wallMm = Number(input.wallThicknessMm) || 0;
  let cycleSec;
  if (proc.coolingKSecPerMm2 && wallMm > 0) {
    // Cooling dominates thin-wall cycles, but fill + screw recovery still scale
    // with shot mass — floor the wall² model at 40% of the mass model so a heavy
    // thin-wall part (3 kg @ 2 mm) isn't costed like a 30 g clip.
    const coolingCycle = proc.cycleBase + proc.coolingKSecPerMm2 * wallMm * wallMm;
    const massCycle = proc.cycleBase + proc.cyclePerKg * w;
    cycleSec = Math.max(coolingCycle, 0.4 * massCycle) * cycleMult * tol.cycle * finMult;
  } else {
    cycleSec = (proc.cycleBase + proc.cyclePerKg * w) * cycleMult * tol.cycle * finMult;
  }
  const secPerPart = cycleSec / proc.cavities;
  const hrPerPart = secPerPart / 3600;
  // Machine-size selection: with a projected area, pick the tonnage-tiered rate
  // (a 2,500 t HPDC cell is not a 400 t cell). Without geometry, keep the flat
  // catalogue rate (status quo — benchmark unaffected).
  let machineRate = proc.machineRate * machineMult;
  let machineTier = null;
  const projArea = Number(input.projectedAreaCm2) || 0;
  if (Array.isArray(proc.machineTiers) && projArea > 0) {
    const tonnage = projArea * (proc.clampTPerCm2 ?? 0.5) * proc.cavities;
    const tier = proc.machineTiers.find(t => tonnage <= t.maxClampT) || proc.machineTiers[proc.machineTiers.length - 1];
    machineRate = tier.rate * machineMult;
    machineTier = { clampTonnage: Math.round(tonnage), rate: tier.rate };
  }
  // Perishable tooling: cutting inserts/drills, coolant, abrasives, wheels —
  // consumed per machine-hour. Material for machining (billet removal) and
  // significant for grinding/casting fettling; 0 for net-shape moulding.
  const perishablePerHr = proc.perishablePerHr ?? 0;
  const machineCost = hrPerPart * (machineRate + perishablePerHr) * yieldMultEff;
  const labourCost  = hrPerPart * reg.labour * proc.operators * yieldMultEff + ccCount * (4 / 3600) * reg.labour;

  // ── Setup (amortised over batch) ────────────────────────────────────────────
  // Machining needs multiple fixturing setups (op10/op20/…); `setups` (default 1)
  // multiplies the per-batch setup so multi-op parts carry realistic non-cut cost.
  // Grossed for yield: a batch yields batch·(1-s) good parts.
  const setupCost = ((proc.setups ?? 1) * proc.setupHr * (machineRate + reg.labour)) / proc.batch * yieldMultEff;

  // ── Secondary / finishing operations ────────────────────────────────────────
  // Deburr, fettling, heat-treat, surface finish, gauging/inspection — real
  // routings always carry these; the bottom-up above omits them. Modelled as a
  // fraction of primary conversion, higher for machining/casting/forging.
  const finishPct = proc.finishPct ?? defaultFinishPct;
  const finishingCost = (machineCost + labourCost) * finishPct;

  // ── Tooling (amortised over the GOOD parts a tool set yields) ───────────────
  // The tool set is a fixed buy; its cost spreads over the good parts produced.
  // When tool life binds, that's toolLife·(1-scrap) good parts; when program
  // volume binds, you buy one set for lifetimeVol good parts. Folding scrap into
  // the amortisation base is equivalent to today's `×yieldMult` in the tool-life
  // case but AVOIDS charging the tool yieldMult-times-over when volume binds
  // (the low-volume casting/forging case) — a real +scrap% overstatement.
  const toolingTotal = proc.toolingBase + proc.toolingPerKg * w;
  const lifetimeVol = vol * programYears;
  const amortVol = Math.max(1, Math.min(proc.toolLife * (1 - scrapPctEff), lifetimeVol));
  const toolingCost = toolingTotal / amortVol;

  // ── Overhead + commercial + SG&A/profit ─────────────────────────────────────
  const conversion = machineCost + labourCost + setupCost + finishingCost;
  const overheadCost = conversion * reg.overheadPct;
  // Packaging, inbound/outbound freight, receiving & quality — a real line on
  // every piece price that a pure works-cost buildup misses.
  const commercialCost = (materialCost + conversion + toolingCost + overheadCost) * commercialPct;
  const worksCost = materialCost + conversion + toolingCost + overheadCost + commercialCost;
  const sgaCost = worksCost * reg.sgaPct;
  const baseTotal = worksCost + sgaCost;

  // Learned calibration: multiply the deterministic estimate by the correction
  // factor fitted from the user's real quotes for this process. Scales every
  // breakdown line equally, so composition (pct) is unchanged — only the level
  // moves toward the user's actual price history. cf = 1 when uncalibrated.
  const cf = calibration ? calibrationFactor(calibration, process) : 1;
  const total = baseTotal * cf;
  // Last line of defence: never return a non-finite price (would serialise to
  // null/NaN and render as a blank figure with no error).
  if (!Number.isFinite(total)) throw new Error('Costing produced a non-finite total — check inputs and rate library.');
  const sv = x => round(x * cf);                                   // scaled value
  const pct = x => (baseTotal > 0 ? round((x / baseTotal) * 100, 1) : 0);

  return {
    inputs: { material, process, weightKg: w, annualVolume: vol, region, programYears },
    calibration: cf !== 1
      ? { factor: round(cf, 3), applied: true, source: calibration ? calibrationSource(calibration, process) : 'none' }
      : { factor: 1, applied: false, source: 'none' },
    drivers: {
      pricePerKg: round(pricePerKg, 3),
      inputMassKg: round(inputMass, 3),
      cycleSecPerPart: round(secPerPart, 1),
      machineRate: round(machineRate, 1),
      labourRate: reg.labour,
      operators: proc.operators,
      utilisation: proc.utilisation,
      scrapPct: round(scrapPctEff * 100, 1),
      toolingTotal: round(toolingTotal),
      amortVolume: amortVol,
      ...(machineTier ? { machineTier } : {}),
      ...(input.toleranceClass && input.toleranceClass !== 'standard' ? { toleranceClass: input.toleranceClass, toleranceCycleMult: tol.cycle } : {}),
      ...(input.surfaceFinish && input.surfaceFinish !== 'standard' ? { surfaceFinish: input.surfaceFinish } : {}),
      ...(ccCount ? { criticalCharacteristics: ccCount } : {}),
    },
    breakdown: {
      material:   { value: sv(materialCost),   pct: pct(materialCost) },
      machine:    { value: sv(machineCost),    pct: pct(machineCost) },
      labour:     { value: sv(labourCost),     pct: pct(labourCost) },
      setup:      { value: sv(setupCost),      pct: pct(setupCost) },
      finishing:  { value: sv(finishingCost),  pct: pct(finishingCost) },
      tooling:    { value: sv(toolingCost),    pct: pct(toolingCost) },
      overhead:   { value: sv(overheadCost),   pct: pct(overheadCost) },
      commercial: { value: sv(commercialCost), pct: pct(commercialCost) },
      sgaProfit:  { value: sv(sgaCost),        pct: pct(sgaCost) },
    },
    totalShouldCost: round(total),
  };
}

// ─── Process-chain routing (cast → machine → heat-treat → coat) ───────────────
// A real automotive part is a ROUTING, not one op. computeRouteCost costs an
// ordered chain: op 1 is the primary (consumes material); downstream ops are
// conversion-only. Scrap compounds as rolled-throughput yield, and a reject at
// op N writes off the ACCUMULATED value (single-op yieldMult cannot express
// this). Overhead, commercial and SG&A are applied once, at the end.
//
//   computeRouteCost({ material, route: ['Sand Casting','Machining (secondary ops)',
//     'Washing & Final Inspection'], weightKg, annualVolume, region })
export function computeRouteCost(input, overrides = {}, calibration = null, library = null) {
  const { material, route, weightKg, annualVolume, region, programYears = 5 } = input;
  const MAT = library?.MATERIALS || MATERIALS;
  const PROC = library?.PROCESSES || PROCESSES;
  const REG = library?.REGIONS || REGIONS;
  const commercialPct = library?.constants?.commercialPct ?? COMMERCIAL_PCT;
  const defaultFinishPct = library?.constants?.defaultFinishPct ?? DEFAULT_FINISH_PCT;

  if (!Array.isArray(route) || route.length < 1) throw new Error('route must be a non-empty array of process names');
  if (route.length === 1) return computeShouldCost({ ...input, process: route[0] }, overrides, calibration, library);
  if (route.length > 8) throw new Error('route supports at most 8 operations');

  const mat = Object.hasOwn(MAT, material) ? MAT[material] : undefined;
  const reg = Object.hasOwn(REG, region) ? REG[region] : undefined;
  if (!mat) throw new Error(`Unknown material: ${material}`);
  if (!reg) throw new Error(`Unknown region: ${region}`);
  const w = Number(weightKg), vol = Number(annualVolume);
  if (!Number.isFinite(w) || w <= 0) throw new Error('weightKg must be a finite number > 0');
  if (!Number.isFinite(vol) || vol <= 0) throw new Error('annualVolume must be a finite number > 0');

  const clampMult = (v) => Math.max(0.01, Number.isFinite(v) ? v : 1);
  const priceMult = clampMult(overrides.priceMult ?? 1);
  const machineMult = clampMult(overrides.machineMult ?? 1);
  const cycleMult = clampMult(overrides.cycleMult ?? 1);
  const scrapAdd = Number.isFinite(overrides.scrapAdd) ? overrides.scrapAdd : 0;

  // Resolve ops. A primary process appearing downstream would double-charge
  // buy-to-fly, so billet 'Machining (CNC)' downstream maps to the secondary-op
  // model (op-20 machining of a near-net part).
  const ops = route.map((name, i) => {
    let key = name;
    if (i > 0 && key === 'Machining (CNC)' && Object.hasOwn(PROC, 'Machining (secondary ops)')) key = 'Machining (secondary ops)';
    const p = Object.hasOwn(PROC, key) ? PROC[key] : undefined;
    if (!p) throw new Error(`Unknown process in route: ${key}`);
    if (i === 0 && p.conversionOnly) throw new Error(`${key} cannot be the primary operation — start the route with a forming/primary process.`);
    if (!Array.isArray(p.families) || !p.families.includes(mat.family)) {
      throw new Error(`${material} (${mat.family}) is not compatible with ${key} in this route.`);
    }
    return { key, p };
  });

  // Mass chain, walked backwards from the finished mass: each op's OUTPUT is the
  // next op's input; ops with utilisation < 1 must be fed a heavier part.
  const massOut = new Array(ops.length);
  massOut[ops.length - 1] = w;
  for (let i = ops.length - 1; i > 0; i--) {
    const util = ops[i].p.utilisation ?? 1;
    massOut[i - 1] = massOut[i] / util;
  }
  const op1 = ops[0].p;
  const op1OutMass = massOut[0];
  const op1InMass = op1OutMass / (op1.utilisation ?? 1);   // buy-to-fly of the primary

  // Quality/geometry drivers apply to the PRIMARY op (same semantics as the
  // single-op engine): tolerance class raises op-1 cycle + scrap, surface finish
  // raises cycle, projected area picks the op-1 machine tier, CCs add gauging.
  const TOLR = { standard: { cycle: 1, scrap: 0 }, tight: { cycle: 1.15, scrap: 0.01 }, precision: { cycle: 1.35, scrap: 0.03 } };
  const FINR = { standard: 1, fine: 1.10, polished: 1.25 };
  const tolR = TOLR[input.toleranceClass] ?? TOLR.standard;
  const finMultR = FINR[input.surfaceFinish] ?? 1;
  const ccCountR = Math.max(0, Math.min(50, Number(input.criticalCharacteristics) || 0));

  // Material (primary op only) — same recovery algebra as computeShouldCost.
  const pricePerKg = mat.price * priceMult;
  const recovery = Number.isFinite(op1.returnsRecovery) ? op1.returnsRecovery : mat.scrapRecovery;
  const s1 = Math.min(0.9, Math.max(0, (op1.scrapPct ?? 0) + scrapAdd + tolR.scrap));
  const yield1 = 1 / (1 - s1);
  const grossMaterial = op1InMass * pricePerKg * yield1;
  const materialCost = grossMaterial - pricePerKg * recovery * ((op1InMass - op1OutMass) * yield1 + op1OutMass * (yield1 - 1));

  // Per-op scrap first (downstream MC noise applies to every op), so each op's
  // DOWNSTREAM suffix yield is known: a displayed line is that op's cost per
  // FINAL good part — line_i = own-gross(c_i) / Π_{j>i}(1-s_j). With lines
  // grossed this way, material + Σops + overhead + commercial + SG&A reconciles
  // EXACTLY with the accumulated total (no invisible scrap-cascade bucket).
  const lifetimeVol = vol * programYears;
  const scraps = ops.map(({ p }, i) => i === 0 ? s1 : Math.min(0.9, Math.max(0, (p.scrapPct ?? 0) + scrapAdd)));
  const suffixYield = new Array(ops.length + 1).fill(1);
  for (let i = ops.length - 1; i >= 0; i--) suffixYield[i] = suffixYield[i + 1] * (1 - scraps[i]);
  // suffixAfter(i) = Π_{j>i}(1-s_j): how many attempts at op i one FINAL good part needs beyond op i's own scrap.
  const suffixAfter = (i) => suffixYield[i + 1];

  const opLines = [];
  let machineTierR = null;
  let opsConvPerGood = 0, opsToolPerGood = 0, conversionBase = 0;
  for (let i = 0; i < ops.length; i++) {
    const { key, p } = ops[i];
    const outMass = massOut[i];
    const sI = scraps[i];
    let convPerAttempt, toolPerGood = 0;
    if (p.costPerKg != null) {
      convPerAttempt = p.costPerKg * outMass * machineMult;
    } else {
      const qualCycle = i === 0 ? tolR.cycle * finMultR : 1;
      const cycleSec = ((p.cycleBase ?? 0) + (p.cyclePerKg ?? 0) * outMass) * cycleMult * qualCycle;
      const hrPerPart = cycleSec / (p.cavities ?? 1) / 3600;
      let rate = (p.machineRate ?? 60) * machineMult;
      // Tonnage tier on the primary op when projected area is known.
      const projArea = Number(input.projectedAreaCm2) || 0;
      if (i === 0 && Array.isArray(p.machineTiers) && projArea > 0) {
        const tonnage = projArea * (p.clampTPerCm2 ?? 0.5) * (p.cavities ?? 1);
        const tier = p.machineTiers.find(t => tonnage <= t.maxClampT) || p.machineTiers[p.machineTiers.length - 1];
        rate = tier.rate * machineMult;
        machineTierR = { clampTonnage: Math.round(tonnage), rate: tier.rate };
      }
      const machine = hrPerPart * (rate + (p.perishablePerHr ?? 0));
      const labour = hrPerPart * reg.labour * (p.operators ?? 0.5) + (i === 0 ? ccCountR * (4 / 3600) * reg.labour : 0);
      const setup = ((p.setups ?? 1) * (p.setupHr ?? 1) * (rate + reg.labour)) / (p.batch ?? 500);
      const finishing = (machine + labour) * (p.finishPct ?? (i === 0 ? defaultFinishPct : 0));
      convPerAttempt = machine + labour + setup + finishing;
      const toolTotal = (p.toolingBase ?? 0) + (p.toolingPerKg ?? 0) * outMass;
      const amort = Math.max(1, Math.min((p.toolLife ?? 1e7) * (1 - sI), lifetimeVol));
      toolPerGood = toolTotal / amort;
    }
    // Per FINAL good part: own scrap gross-up AND downstream attempts.
    const convPerGood = convPerAttempt / (1 - sI) / suffixAfter(i);
    const toolPerFinal = toolPerGood / suffixAfter(i);
    opsConvPerGood += convPerGood;
    opsToolPerGood += toolPerFinal;
    conversionBase += convPerGood;   // overhead base: true embedded conversion content
    opLines.push({ op: key, conversion: round(convPerGood), tooling: round(toolPerFinal, 3), scrapPct: round(sI * 100, 1), outMassKg: round(outMass, 3) });
  }
  const rolledYield = suffixYield[0];
  // Material per FINAL good part: op-1 gross already in materialCost, downstream
  // attempts multiply it (a part scrapped at op-20 wastes its casting too). NOTE:
  // downstream rejects get no remelt credit — conservative, disclosed here.
  const materialPerGood = materialCost / suffixAfter(0);
  const accumulated = materialPerGood + opsConvPerGood + opsToolPerGood;

  // Overhead + commercial + SG&A once, on the accumulated works content.
  const overheadCost = conversionBase * reg.overheadPct;
  const preCommercial = accumulated + overheadCost;
  const commercialCost = preCommercial * commercialPct;
  const worksCost = preCommercial + commercialCost;
  const sgaCost = worksCost * reg.sgaPct;
  const baseTotal = worksCost + sgaCost;

  const cf = calibration ? calibrationFactor(calibration, route[0]) : 1;
  const total = baseTotal * cf;
  if (!Number.isFinite(total)) throw new Error('Route costing produced a non-finite total — check inputs.');
  const sv = (x) => round(x * cf);

  return {
    inputs: { material, route: ops.map(o => o.key), weightKg: w, annualVolume: vol, region, programYears },
    calibration: cf !== 1 ? { factor: round(cf, 3), applied: true, source: calibration ? calibrationSource(calibration, route[0]) : 'none' } : { factor: 1, applied: false, source: 'none' },
    drivers: {
      pricePerKg: round(pricePerKg, 3),
      inputMassKg: round(op1InMass, 3),
      finishedMassKg: w,
      rolledThroughputYield: round(rolledYield * 100, 1),
      operations: ops.length,
      primaryScrapPct: round(s1 * 100, 1),
      ...(machineTierR ? { machineTier: machineTierR } : {}),
      ...(input.toleranceClass && input.toleranceClass !== 'standard' ? { toleranceClass: input.toleranceClass } : {}),
      ...(input.surfaceFinish && input.surfaceFinish !== 'standard' ? { surfaceFinish: input.surfaceFinish } : {}),
      ...(ccCountR ? { criticalCharacteristics: ccCountR } : {}),
    },
    breakdown: {
      // All lines are per FINAL good part (downstream-attempt grossed), so
      // material + Σ operations + overhead + commercial + SG&A === total.
      material: { value: sv(materialPerGood), pct: baseTotal > 0 ? round(materialPerGood / baseTotal * 100, 1) : 0 },
      operations: opLines.map(l => ({ ...l, conversion: sv(l.conversion), tooling: sv(l.tooling) })),
      overhead: { value: sv(overheadCost) },
      commercial: { value: sv(commercialCost) },
      sgaProfit: { value: sv(sgaCost) },
    },
    totalShouldCost: round(total),
  };
}

/** Monte-Carlo band for a routed part (same uncertainty model as single-op). */
export function simulateRouteCost(input, samples = 1000, seed = 12345, calibration = null, library = null) {
  const rng = mulberry32(seed);
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const o = {
      priceMult: 1 + noise(rng, 0.20),
      machineMult: 1 + noise(rng, 0.12),
      cycleMult: 1 + noise(rng, 0.15),
      scrapAdd: noise(rng, 0.03),
    };
    const modelMult = 1 + noiseUniform(rng, 0.13);
    totals.push(computeRouteCost(input, o, calibration, library).totalShouldCost * modelMult);
  }
  totals.sort((a, b) => a - b);
  const at = q => totals[Math.min(totals.length - 1, Math.max(0, Math.floor(q * totals.length)))];
  return { p10: round(at(0.10)), p50: round(at(0.50)), p90: round(at(0.90)), samples };
}

/**
 * Predictive volume-sensitivity curve: unit cost at a set of annual volumes.
 * Shows the tooling-amortisation breakpoints — a real design-to-cost /
 * negotiation artifact (cost falls as fixed tooling spreads over more parts).
 * @returns {{volume:number, unitCost:number, delta:number}[]}  delta vs base volume
 */
export function volumeSensitivity(input, volumes, calibration = null, library = null) {
  const points = (volumes && volumes.length ? volumes : [10000, 25000, 50000, 100000, 250000, 500000]);
  const baseCost = computeShouldCost(input, {}, calibration, library).totalShouldCost;
  return points.map(v => {
    const unitCost = computeShouldCost({ ...input, annualVolume: v }, {}, calibration, library).totalShouldCost;
    return { volume: v, unitCost, delta: round(unitCost - baseCost) };
  });
}

// ─── Deterministic PRNG (mulberry32) for reproducible simulation ──────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Triangular-ish symmetric noise in [-spread, +spread], centred at 0
function noise(rng, spread) {
  return (rng() + rng() - 1) * spread; // sum of two uniforms → triangular
}
// Uniform symmetric noise in [-spread, +spread] — flatter shoulders than the
// triangular form, used for the systematic supplier/model-dispersion term so the
// band reflects genuine part-to-part and supplier-to-supplier price scatter.
function noiseUniform(rng, spread) {
  return (rng() * 2 - 1) * spread;
}

/**
 * Monte-Carlo simulation of should-cost uncertainty.
 * Sources of variance modelled:
 *   – commodity price ±20% (metals swing that much year-on-year),
 *   – machine rate ±12%, cycle time ±15%, scrap ±3pp (input-cost uncertainty),
 *   – a systematic ±13% supplier/model-dispersion term on the total, capturing
 *     un-modelled part complexity, supplier efficiency and negotiated margin —
 *     without it the band collapses to the input noise alone and P10–P90 fails
 *     to span the real price spread a benchmark of actual quotes shows.
 * Returns a percentile band on total unit cost.
 */
export function simulateShouldCost(input, samples = 2000, seed = 12345, calibration = null, library = null) {
  const rng = mulberry32(seed);
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const o = {
      priceMult: 1 + noise(rng, 0.20),
      machineMult: 1 + noise(rng, 0.12),
      cycleMult: 1 + noise(rng, 0.15),
      scrapAdd: noise(rng, 0.03),
    };
    const modelMult = 1 + noiseUniform(rng, 0.13);
    totals.push(computeShouldCost(input, o, calibration, library).totalShouldCost * modelMult);
  }
  totals.sort((a, b) => a - b);
  const at = q => totals[Math.min(totals.length - 1, Math.max(0, Math.floor(q * totals.length)))];
  const mean = totals.reduce((s, x) => s + x, 0) / totals.length;
  const variance = totals.reduce((s, x) => s + (x - mean) ** 2, 0) / totals.length;
  return {
    p10: round(at(0.10)),
    p50: round(at(0.50)),
    p90: round(at(0.90)),
    mean: round(mean),
    stdev: round(Math.sqrt(variance)),
    samples,
  };
}
