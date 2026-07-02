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

import { calibrationFactor } from './calibration.mjs';

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
  'Die Casting (Aluminium)': {
    machineRate: 95, operators: 0.5, cavities: 1, utilisation: 0.85, scrapPct: 0.05,
    setupHr: 3.0, batch: 1500, toolLife: 150_000,
    cycleBase: 35, cyclePerKg: 6, toolingBase: 90_000, toolingPerKg: 60_000,
    families: ['aluminium', 'magnesium'],
    finishPct: 0.1,
  },
  'Die Casting (Zinc)': {
    machineRate: 75, operators: 0.5, cavities: 2, utilisation: 0.90, scrapPct: 0.04,
    setupHr: 2.0, batch: 2000, toolLife: 500_000,
    cycleBase: 12, cyclePerKg: 5, toolingBase: 60_000, toolingPerKg: 40_000,
    families: ['zinc'],
    finishPct: 0.1,
  },
  'Sand Casting': {
    machineRate: 55, operators: 1.2, cavities: 1, utilisation: 0.70, scrapPct: 0.06,
    setupHr: 2.0, batch: 400, toolLife: 50_000,
    cycleBase: 45, cyclePerKg: 12, toolingBase: 18_000, toolingPerKg: 12_000,
    families: ['castiron', 'ferrous', 'aluminium', 'copper'],
    finishPct: 0.2,
  },
  'Investment Casting': {
    machineRate: 70, operators: 1.4, cavities: 1, utilisation: 0.85, scrapPct: 0.05,
    setupHr: 3.0, batch: 800, toolLife: 100_000,
    cycleBase: 90, cyclePerKg: 20, toolingBase: 40_000, toolingPerKg: 30_000,
    families: ['ferrous', 'castiron', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.15,
  },
  'Gravity Die Casting': {
    machineRate: 80, operators: 0.7, cavities: 1, utilisation: 0.82, scrapPct: 0.05,
    setupHr: 2.5, batch: 1500, toolLife: 120_000,
    cycleBase: 40, cyclePerKg: 8, toolingBase: 70_000, toolingPerKg: 45_000,
    families: ['aluminium', 'copper'],
    finishPct: 0.12,
  },
  'Injection Moulding': {
    machineRate: 65, operators: 0.4, cavities: 2, utilisation: 0.95, scrapPct: 0.02,
    setupHr: 2.0, batch: 5000, toolLife: 1_000_000,
    cycleBase: 18, cyclePerKg: 22, toolingBase: 45_000, toolingPerKg: 80_000,
    families: ['plastic'],
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
    machineRate: 100, operators: 0.6, cavities: 1, utilisation: 0.88, scrapPct: 0.03,
    setupHr: 1.5, batch: 4000, toolLife: 400_000,
    cycleBase: 4, cyclePerKg: 1.5, toolingBase: 50_000, toolingPerKg: 35_000,
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

  const mat = MAT[material];
  const proc = PROC[process];
  const reg = REG[region];
  if (!mat) throw new Error(`Unknown material: ${material}`);
  if (!proc) throw new Error(`Unknown process: ${process}`);
  if (!reg) throw new Error(`Unknown region: ${region}`);
  // Family compatibility: costing a ferrous part on an aluminium-die-casting model
  // (or similar) yields a physically meaningless number. Refuse rather than mislead.
  if (Array.isArray(proc.families) && !proc.families.includes(mat.family)) {
    throw new Error(`${material} (${mat.family}) is not compatible with ${process}, which is modelled for ${proc.families.join(' / ')} only.`);
  }

  const w = Number(weightKg);
  const vol = Number(annualVolume);
  if (!(w > 0)) throw new Error('weightKg must be > 0');
  if (!(vol > 0)) throw new Error('annualVolume must be > 0');

  // Simulation multipliers (1 = deterministic)
  const priceMult   = overrides.priceMult   ?? 1;
  const machineMult = overrides.machineMult ?? 1;
  const cycleMult   = overrides.cycleMult   ?? 1;
  const scrapAdd    = overrides.scrapAdd    ?? 0;

  const scrapPct = Math.max(0, proc.scrapPct + scrapAdd);

  // ── Material cost ──────────────────────────────────────────────────────────
  const pricePerKg = mat.price * priceMult;
  const inputMass  = w / proc.utilisation;          // buy-to-fly
  const offcutMass = inputMass - w;
  const grossMaterial = inputMass * pricePerKg;
  const scrapCredit   = offcutMass * pricePerKg * mat.scrapRecovery;
  const materialCost  = (grossMaterial - scrapCredit) * (1 + scrapPct);

  // ── Conversion: machine + labour ────────────────────────────────────────────
  const cycleSec = (proc.cycleBase + proc.cyclePerKg * w) * cycleMult;
  const secPerPart = cycleSec / proc.cavities;
  const hrPerPart = secPerPart / 3600;
  const machineRate = proc.machineRate * machineMult;
  // Perishable tooling: cutting inserts/drills, coolant, abrasives, wheels —
  // consumed per machine-hour. Material for machining (billet removal) and
  // significant for grinding/casting fettling; 0 for net-shape moulding.
  const perishablePerHr = proc.perishablePerHr ?? 0;
  const machineCost = hrPerPart * (machineRate + perishablePerHr) * (1 + scrapPct);
  const labourCost  = hrPerPart * reg.labour * proc.operators * (1 + scrapPct);

  // ── Setup (amortised over batch) ────────────────────────────────────────────
  // Machining needs multiple fixturing setups (op10/op20/…); `setups` (default 1)
  // multiplies the per-batch setup so multi-op parts carry realistic non-cut cost.
  const setupCost = ((proc.setups ?? 1) * proc.setupHr * (machineRate + reg.labour)) / proc.batch;

  // ── Secondary / finishing operations ────────────────────────────────────────
  // Deburr, fettling, heat-treat, surface finish, gauging/inspection — real
  // routings always carry these; the bottom-up above omits them. Modelled as a
  // fraction of primary conversion, higher for machining/casting/forging.
  const finishPct = proc.finishPct ?? defaultFinishPct;
  const finishingCost = (machineCost + labourCost) * finishPct;

  // ── Tooling (amortised over min(toolLife, lifetime volume)) ─────────────────
  const toolingTotal = proc.toolingBase + proc.toolingPerKg * w;
  const lifetimeVol = vol * programYears;
  const amortVol = Math.max(1, Math.min(proc.toolLife, lifetimeVol));
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
  const sv = x => round(x * cf);                                   // scaled value
  const pct = x => (baseTotal > 0 ? round((x / baseTotal) * 100, 1) : 0);

  return {
    inputs: { material, process, weightKg: w, annualVolume: vol, region, programYears },
    calibration: cf !== 1 ? { factor: round(cf, 3), applied: true } : { factor: 1, applied: false },
    drivers: {
      pricePerKg: round(pricePerKg, 3),
      inputMassKg: round(inputMass, 3),
      cycleSecPerPart: round(secPerPart, 1),
      machineRate: round(machineRate, 1),
      labourRate: reg.labour,
      operators: proc.operators,
      utilisation: proc.utilisation,
      scrapPct: round(scrapPct * 100, 1),
      toolingTotal: round(toolingTotal),
      amortVolume: amortVol,
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

/**
 * Monte-Carlo simulation of should-cost uncertainty.
 * Varies commodity price (±15%), machine rate (±10%), cycle time (±12%),
 * scrap (±2pp). Returns percentile band on total unit cost.
 */
export function simulateShouldCost(input, samples = 2000, seed = 12345, calibration = null, library = null) {
  const rng = mulberry32(seed);
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const o = {
      priceMult: 1 + noise(rng, 0.15),
      machineMult: 1 + noise(rng, 0.10),
      cycleMult: 1 + noise(rng, 0.12),
      scrapAdd: noise(rng, 0.02),
    };
    totals.push(computeShouldCost(input, o, calibration, library).totalShouldCost);
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
