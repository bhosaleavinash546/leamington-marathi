/**
 * CostVision — PCB / PCBA should-cost model
 * ------------------------------------------------------------------
 * A parametric board cost = components + bare-board fab + SMT/TH assembly +
 * EMS overhead. This is a SEPARATE domain from the mechanical engine (which is
 * material €/kg × process); PCBs are costed from component unit prices, fab area/
 * layers, and per-placement assembly.
 *
 * IMPORTANT: costs from an IMAGE are indicative — vision infers component TYPE +
 * package + qty, not exact part numbers/values, so unit prices are class averages.
 * Edit the extracted BOM and re-cost for accuracy.
 *
 *   costBom({ board, components }, opts) -> { lines, componentCost, fabCost, assemblyCost, overhead, total, breakdown, currency }
 *
 * Reference basis (EUR, ~1k board volume): distributor class averages (Digikey/
 * Mouser price bands), typical Asian/EU EMS fab & SMT rates. Pure, dependency-free.
 */

// Component class → indicative unit price (EUR at ~1k qty) + default mount + pins.
export const COMPONENT_CLASSES = {
  resistor:        { unit: 0.004, mount: 'SMT', pins: 2,  label: 'Resistor' },
  capacitor_mlcc:  { unit: 0.010, mount: 'SMT', pins: 2,  label: 'MLCC capacitor' },
  capacitor_elec:  { unit: 0.09,  mount: 'SMT', pins: 2,  label: 'Electrolytic cap' },
  capacitor_tant:  { unit: 0.14,  mount: 'SMT', pins: 2,  label: 'Tantalum cap' },
  inductor:        { unit: 0.06,  mount: 'SMT', pins: 2,  label: 'Inductor' },
  ferrite_bead:    { unit: 0.02,  mount: 'SMT', pins: 2,  label: 'Ferrite bead' },
  diode:           { unit: 0.04,  mount: 'SMT', pins: 2,  label: 'Diode' },
  led:             { unit: 0.06,  mount: 'SMT', pins: 2,  label: 'LED' },
  transistor:      { unit: 0.06,  mount: 'SMT', pins: 3,  label: 'Transistor' },
  mosfet:          { unit: 0.18,  mount: 'SMT', pins: 3,  label: 'MOSFET' },
  ic_logic:        { unit: 0.25,  mount: 'SMT', pins: 14, label: 'Logic IC' },
  ic_analog:       { unit: 0.55,  mount: 'SMT', pins: 8,  label: 'Analog IC' },
  ic_power:        { unit: 0.80,  mount: 'SMT', pins: 8,  label: 'Power/regulator IC' },
  mcu:             { unit: 2.50,  mount: 'SMT', pins: 48, label: 'Microcontroller' },
  soc:             { unit: 15.0,  mount: 'SMT', pins: 256, label: 'SoC / processor' },
  memory:          { unit: 1.20,  mount: 'SMT', pins: 48, label: 'Memory' },
  connector:       { unit: 0.55,  mount: 'TH',  pins: 8,  label: 'Connector', th: true },
  header:          { unit: 0.15,  mount: 'TH',  pins: 4,  label: 'Header / jumper' },
  crystal:         { unit: 0.25,  mount: 'SMT', pins: 4,  label: 'Crystal' },
  oscillator:      { unit: 0.55,  mount: 'SMT', pins: 4,  label: 'Oscillator' },
  switch:          { unit: 0.22,  mount: 'SMT', pins: 4,  label: 'Switch / button' },
  relay:           { unit: 0.65,  mount: 'TH',  pins: 5,  label: 'Relay' },
  transformer:     { unit: 1.10,  mount: 'TH',  pins: 6,  label: 'Transformer' },
  fuse:            { unit: 0.10,  mount: 'SMT', pins: 2,  label: 'Fuse' },
  module:          { unit: 3.50,  mount: 'SMT', pins: 20, label: 'Module (RF/power)' },
  test_point:      { unit: 0.01,  mount: 'TH',  pins: 1,  label: 'Test point' },
  other:           { unit: 0.20,  mount: 'SMT', pins: 4,  label: 'Other' },
};
export const COMPONENT_TYPES = Object.keys(COMPONENT_CLASSES);

// Basis: Asia-sourced bare board + EU/Asia-blend assembly, EUR, at ~1k boards/yr.
// Bare-board fab rate (EUR / cm²) by layer count.
const LAYER_RATE = { 1: 0.016, 2: 0.024, 4: 0.060, 6: 0.105, 8: 0.170, 10: 0.24 };
const FINISH_MULT = { hasl: 1.0, leadfree_hasl: 1.05, enig: 1.25, osp: 0.98, immersion_silver: 1.15 };
const FAB_NRE = 220;             // panel/tooling €, amortised over annual volume
const ASSY_NRE = 180;            // stencil + programming €, amortised over annual volume
const FEEDER_SETUP = 1.6;        // €/unique part (feeder load + changeover), amortised
const SMT_PLACEMENT = 0.02;      // €/placement (machine + paste + reflow + handling) at ~1k
const BGA_PREMIUM = 0.15;        // extra €/placement for fine-pitch/BGA (pins ≥ 48, SMT)
const XRAY_PER_BOARD = 0.20;     // X-ray inspection when any BGA/fine-pitch part present
const TH_LEAD = 0.035;           // €/lead (selective/hand solder)
const AOI_FLAT = 0.08;           // €/board optical inspection
const FCT_BASE = 0.30;           // €/board functional test setup
const FCT_PER_ACTIVE = 0.08;     // €/board per active device (IC/MCU/SoC…) under test
const FREIGHT_PCT = 0.06;        // inbound freight/duty on materials + fab
const FIRST_PASS_YIELD = 0.985;  // rework/scrap divisor
const ATTRITION = 1.02;          // component reel/handling attrition
const EMS_OVERHEAD = 0.22;       // SG&A + margin on cost of goods at ~1k volume

const ACTIVE_TYPES = new Set(['ic_logic', 'ic_analog', 'ic_power', 'mcu', 'soc', 'memory', 'module']);

// Volume tier multipliers on component unit price (mat), conversion/assembly rates
// (conv) and fab €/cm² (fab). ~1.0 at 1k. Approximates MOQ/reel effects at low
// volume and price-break/rate erosion at high volume.
function volTier(v) {
  if (v <= 10)     return { mat: 2.2, conv: 1.8, fab: 2.0 };
  if (v <= 100)    return { mat: 1.4, conv: 1.3, fab: 1.35 };
  if (v <= 1000)   return { mat: 1.0, conv: 1.0, fab: 1.0 };
  if (v <= 10000)  return { mat: 0.78, conv: 0.82, fab: 0.75 };
  if (v <= 100000) return { mat: 0.62, conv: 0.60, fab: 0.55 };
  return { mat: 0.52, conv: 0.50, fab: 0.45 };
}

const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : dflt; };

function classKey(type) {
  const t = String(type || '').toLowerCase().trim();
  return Object.hasOwn(COMPONENT_CLASSES, t) ? t : 'other';
}
function classOf(type) { return COMPONENT_CLASSES[classKey(type)]; }

/**
 * Cost a (vision-extracted or edited) PCB BOM.
 * @param {object} input  { board:{ widthMm, heightMm, layers, finish }, components:[{ refDes, type, qty, mount, pins, unitCostOverride }] }
 * @param {object} [opts] { volume=1000 }
 */
export function costBom(input, opts = {}) {
  const volume = clampNum(opts.volume, 1, 100_000_000, 1000);
  const board = input?.board || {};
  const comps = Array.isArray(input?.components) ? input.components : [];

  const widthMm  = clampNum(board.widthMm, 5, 1000, 80);
  const heightMm = clampNum(board.heightMm, 5, 1000, 60);
  const layers   = [1, 2, 4, 6, 8, 10].includes(Number(board.layers)) ? Number(board.layers) : 2;
  const finish   = Object.hasOwn(FINISH_MULT, board.finish) ? board.finish : 'hasl';
  const areaCm2  = (widthMm * heightMm) / 100;
  const tier     = volTier(volume);
  const y        = 1 / FIRST_PASS_YIELD;   // yield/rework gross-up

  // ── Components (volume-tiered unit price + reel attrition) ─────────────────
  let componentCost = 0, placements = 0, bgaPlacements = 0, thLeads = 0, activeDevices = 0;
  const uniqueKeys = new Set();
  const lines = comps.map((c) => {
    const key = classKey(c.type);
    const cls = COMPONENT_CLASSES[key];
    const qty = Math.max(1, Math.round(clampNum(c.qty, 1, 100000, 1)));
    const mount = (c.mount === 'TH' || c.mount === 'SMT') ? c.mount : cls.mount;
    const pins = Math.max(1, Math.round(clampNum(c.pins, 1, 2000, cls.pins)));
    const pkg = String(c.package || '').slice(0, 24);
    // Unit-cost override wins ONLY when a positive number is given; else the
    // volume-tiered class average (blank/0 must not zero out a component).
    const override = Number(c.unitCostOverride);
    const unit = Number.isFinite(override) && override > 0 ? override : cls.unit * tier.mat;
    componentCost += unit * qty;
    uniqueKeys.add(`${key}|${pkg}`);
    if (ACTIVE_TYPES.has(key)) activeDevices += qty;
    if (mount === 'TH') thLeads += pins * qty;
    else { placements += qty; if (pins >= 48) bgaPlacements += qty; }   // fine-pitch/BGA proxy
    return {
      refDes: String(c.refDes || '').slice(0, 24),
      type: key, label: cls.label, package: pkg, mount, pins, qty,
      unitCost: round(unit, 4), lineCost: round(unit * qty, 3),
    };
  });
  componentCost *= ATTRITION * y;
  const uniqueParts = uniqueKeys.size;

  // ── Fab (bare board) ──────────────────────────────────────────────────────
  const rate = (LAYER_RATE[layers] || LAYER_RATE[2]) * tier.fab;
  const fabCost = (areaCm2 * rate * (FINISH_MULT[finish] || 1) + FAB_NRE / volume) * y;

  // ── Assembly: placement + BGA premium + TH + inspection + FCT + setup ──────
  const placementCost = placements * SMT_PLACEMENT * tier.conv + bgaPlacements * BGA_PREMIUM;
  const thCost   = thLeads * TH_LEAD * tier.conv;
  const xray     = bgaPlacements > 0 ? XRAY_PER_BOARD : 0;
  const fct      = activeDevices > 0 ? FCT_BASE + FCT_PER_ACTIVE * activeDevices : 0;
  const setupNre = (ASSY_NRE + uniqueParts * FEEDER_SETUP) / volume;
  const assemblyCost = (placementCost + thCost + AOI_FLAT + xray + fct + setupNre) * y;

  // ── Logistics (inbound freight/duty on materials + fab) ────────────────────
  const logistics = (componentCost + fabCost) * FREIGHT_PCT;

  const cogs = componentCost + fabCost + assemblyCost + logistics;
  const overhead = cogs * EMS_OVERHEAD;
  const total = cogs + overhead;

  const pct = (x) => (total > 0 ? round((x / total) * 100, 1) : 0);
  return {
    currency: 'EUR',
    board: { widthMm, heightMm, areaCm2: round(areaCm2, 1), layers, finish },
    stats: { lineItems: lines.length, uniqueParts, totalPlacements: placements, bgaPlacements, thLeads, activeDevices },
    lines,
    breakdown: {
      components: { value: round(componentCost), pct: pct(componentCost) },
      fab:        { value: round(fabCost), pct: pct(fabCost) },
      assembly:   { value: round(assemblyCost), pct: pct(assemblyCost) },
      logistics:  { value: round(logistics), pct: pct(logistics) },
      overhead:   { value: round(overhead), pct: pct(overhead) },
    },
    componentCost: round(componentCost),
    fabCost: round(fabCost),
    assemblyCost: round(assemblyCost),
    logistics: round(logistics),
    overhead: round(overhead),
    total: round(total),
    volume,
    note: 'Indicative parametric estimate (Asia-sourced fab, ~1k-volume basis). Vision infers component class/package/qty and board size — not exact part numbers, layer count or hidden bottom-side parts — so treat as ±30–50%. Edit the BOM and re-cost for a firm number.',
  };
}
