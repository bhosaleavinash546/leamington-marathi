/**
 * CostVision — Deterministic Should-Cost Engine
 * ------------------------------------------------------------------
 * Pure, dependency-free, bottom-up parametric costing.
 * Every number is computed from rate × time / mass × price — NO LLM.
 *
 *   total = material + machine + labour + setup + tooling + overhead + SG&A/profit
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

// ─── Material database ────────────────────────────────────────────────────────
// price = €/kg (derived from COMMODITY_BASELINE), density = g/cm³,
// scrapRecovery = fraction of material price recovered on offcuts/runners.
export const MATERIALS = {
  'Steel (mild)':           { density: 7.85, price: 0.62, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel (high-strength)':  { density: 7.85, price: 1.10, scrapRecovery: 0.20, family: 'ferrous' },
  'Stainless Steel 304':    { density: 8.00, price: 2.85, scrapRecovery: 0.35, family: 'ferrous' },
  'Aluminium 6061':         { density: 2.70, price: 2.85, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium 7075':         { density: 2.81, price: 4.20, scrapRecovery: 0.50, family: 'aluminium' },
  'Magnesium AZ31':         { density: 1.77, price: 3.20, scrapRecovery: 0.30, family: 'magnesium' },
  'Polypropylene (PP)':     { density: 0.905, price: 1.65, scrapRecovery: 0.10, family: 'plastic' },
  'PA6 (Nylon)':            { density: 1.14, price: 3.20, scrapRecovery: 0.10, family: 'plastic' },
  'ABS':                    { density: 1.05, price: 2.10, scrapRecovery: 0.10, family: 'plastic' },
  'CFRP (Carbon Fibre)':    { density: 1.55, price: 28.0, scrapRecovery: 0.00, family: 'composite' },
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
// cycleSec(w)  = machine cycle time in seconds as f(part weight kg)
// tooling(w)   = total hard-tooling cost € as f(part weight kg)
// families     = compatible material families (validation)
export const PROCESSES = {
  'Stamping / Deep Drawing': {
    machineRate: 120, operators: 0.6, cavities: 1, utilisation: 0.62, scrapPct: 0.03,
    setupHr: 1.5, batch: 4000, toolLife: 1_200_000,
    cycleSec: w => 3 + 1.2 * w, tooling: w => 180_000 + 90_000 * w,
    families: ['ferrous', 'aluminium'],
  },
  'Roll Forming': {
    machineRate: 70, operators: 0.5, cavities: 1, utilisation: 0.88, scrapPct: 0.02,
    setupHr: 2.0, batch: 6000, toolLife: 3_000_000,
    cycleSec: w => 4 + 0.8 * w, tooling: w => 120_000 + 40_000 * w,
    families: ['ferrous', 'aluminium'],
  },
  'Hydroforming': {
    machineRate: 110, operators: 0.6, cavities: 1, utilisation: 0.80, scrapPct: 0.04,
    setupHr: 2.5, batch: 2000, toolLife: 800_000,
    cycleSec: w => 25 + 4 * w, tooling: w => 220_000 + 70_000 * w,
    families: ['ferrous', 'aluminium'],
  },
  'Laser Cutting + Bending': {
    machineRate: 85, operators: 0.8, cavities: 1, utilisation: 0.78, scrapPct: 0.03,
    setupHr: 0.5, batch: 500, toolLife: 5_000_000,
    cycleSec: w => 30 + 12 * w, tooling: () => 8_000,
    families: ['ferrous', 'aluminium'],
  },
  'Die Casting (Aluminium)': {
    machineRate: 95, operators: 0.5, cavities: 1, utilisation: 0.85, scrapPct: 0.05,
    setupHr: 3.0, batch: 1500, toolLife: 150_000,
    cycleSec: w => 35 + 6 * w, tooling: w => 90_000 + 60_000 * w,
    families: ['aluminium', 'magnesium'],
  },
  'Die Casting (Zinc)': {
    machineRate: 75, operators: 0.5, cavities: 2, utilisation: 0.90, scrapPct: 0.04,
    setupHr: 2.0, batch: 2000, toolLife: 500_000,
    cycleSec: w => 12 + 5 * w, tooling: w => 60_000 + 40_000 * w,
    families: ['ferrous'], // zinc handled as cost proxy; restrict via UI
  },
  'Injection Moulding': {
    machineRate: 65, operators: 0.4, cavities: 2, utilisation: 0.95, scrapPct: 0.02,
    setupHr: 2.0, batch: 5000, toolLife: 1_000_000,
    cycleSec: w => 18 + 22 * w, tooling: w => 45_000 + 80_000 * w,
    families: ['plastic'],
  },
  'Forging (Hot)': {
    machineRate: 150, operators: 1.0, cavities: 1, utilisation: 0.75, scrapPct: 0.05,
    setupHr: 2.5, batch: 2000, toolLife: 60_000,
    cycleSec: w => 8 + 2.5 * w, tooling: w => 70_000 + 50_000 * w,
    families: ['ferrous', 'aluminium'],
  },
  'Forging (Cold)': {
    machineRate: 100, operators: 0.6, cavities: 1, utilisation: 0.88, scrapPct: 0.03,
    setupHr: 1.5, batch: 4000, toolLife: 400_000,
    cycleSec: w => 4 + 1.5 * w, tooling: w => 50_000 + 35_000 * w,
    families: ['ferrous', 'aluminium'],
  },
  'Machining (CNC)': {
    machineRate: 60, operators: 0.5, cavities: 1, utilisation: 0.45, scrapPct: 0.02,
    setupHr: 1.0, batch: 200, toolLife: 10_000_000,
    cycleSec: w => 90 + 120 * w, tooling: () => 4_000,
    families: ['ferrous', 'aluminium', 'magnesium', 'plastic'],
  },
  'Extrusion': {
    machineRate: 90, operators: 0.5, cavities: 1, utilisation: 0.85, scrapPct: 0.03,
    setupHr: 1.5, batch: 8000, toolLife: 2_000_000,
    cycleSec: w => 2 + 0.5 * w, tooling: () => 25_000,
    families: ['aluminium'],
  },
  'MIG Welding Assembly': {
    machineRate: 45, operators: 1.2, cavities: 1, utilisation: 0.98, scrapPct: 0.02,
    setupHr: 0.5, batch: 300, toolLife: 5_000_000,
    cycleSec: w => 60 + 25 * w, tooling: () => 30_000,
    families: ['ferrous', 'aluminium'],
  },
  'Resistance Spot Welding': {
    machineRate: 80, operators: 0.4, cavities: 1, utilisation: 0.99, scrapPct: 0.01,
    setupHr: 0.8, batch: 1000, toolLife: 5_000_000,
    cycleSec: w => 25 + 10 * w, tooling: () => 120_000,
    families: ['ferrous', 'aluminium'],
  },
};

export const listMaterials = () => Object.keys(MATERIALS);
export const listProcesses = () => Object.keys(PROCESSES);
export const listRegions   = () => Object.keys(REGIONS);

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
export function computeShouldCost(input, overrides = {}) {
  const { material, process, weightKg, annualVolume, region, programYears = 5 } = input;

  const mat = MATERIALS[material];
  const proc = PROCESSES[process];
  const reg = REGIONS[region];
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
  const cycleSec = proc.cycleSec(w) * cycleMult;
  const secPerPart = cycleSec / proc.cavities;
  const hrPerPart = secPerPart / 3600;
  const machineRate = proc.machineRate * machineMult;
  const machineCost = hrPerPart * machineRate * (1 + scrapPct);
  const labourCost  = hrPerPart * reg.labour * proc.operators * (1 + scrapPct);

  // ── Setup (amortised over batch) ────────────────────────────────────────────
  const setupCost = (proc.setupHr * (machineRate + reg.labour)) / proc.batch;

  // ── Tooling (amortised over min(toolLife, lifetime volume)) ─────────────────
  const lifetimeVol = vol * programYears;
  const amortVol = Math.max(1, Math.min(proc.toolLife, lifetimeVol));
  const toolingCost = proc.tooling(w) / amortVol;

  // ── Overhead + SG&A/profit ──────────────────────────────────────────────────
  const conversion = machineCost + labourCost + setupCost;
  const overheadCost = conversion * reg.overheadPct;
  const worksCost = materialCost + conversion + toolingCost + overheadCost;
  const sgaCost = worksCost * reg.sgaPct;
  const total = worksCost + sgaCost;

  const pct = x => (total > 0 ? round((x / total) * 100, 1) : 0);

  return {
    inputs: { material, process, weightKg: w, annualVolume: vol, region, programYears },
    drivers: {
      pricePerKg: round(pricePerKg, 3),
      inputMassKg: round(inputMass, 3),
      cycleSecPerPart: round(secPerPart, 1),
      machineRate: round(machineRate, 1),
      labourRate: reg.labour,
      operators: proc.operators,
      utilisation: proc.utilisation,
      scrapPct: round(scrapPct * 100, 1),
      toolingTotal: round(proc.tooling(w)),
      amortVolume: amortVol,
    },
    breakdown: {
      material:  { value: round(materialCost), pct: pct(materialCost) },
      machine:   { value: round(machineCost),  pct: pct(machineCost) },
      labour:    { value: round(labourCost),   pct: pct(labourCost) },
      setup:     { value: round(setupCost),    pct: pct(setupCost) },
      tooling:   { value: round(toolingCost),  pct: pct(toolingCost) },
      overhead:  { value: round(overheadCost), pct: pct(overheadCost) },
      sgaProfit: { value: round(sgaCost),      pct: pct(sgaCost) },
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
export function volumeSensitivity(input, volumes) {
  const points = (volumes && volumes.length ? volumes : [10000, 25000, 50000, 100000, 250000, 500000]);
  const baseCost = computeShouldCost(input).totalShouldCost;
  return points.map(v => {
    const unitCost = computeShouldCost({ ...input, annualVolume: v }).totalShouldCost;
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
export function simulateShouldCost(input, samples = 2000, seed = 12345) {
  const rng = mulberry32(seed);
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const o = {
      priceMult: 1 + noise(rng, 0.15),
      machineMult: 1 + noise(rng, 0.10),
      cycleMult: 1 + noise(rng, 0.12),
      scrapAdd: noise(rng, 0.02),
    };
    totals.push(computeShouldCost(input, o).totalShouldCost);
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
