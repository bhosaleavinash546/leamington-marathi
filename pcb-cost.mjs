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
  soc:             { unit: 8.00,  mount: 'SMT', pins: 256, label: 'SoC / processor' },
  memory:          { unit: 1.20,  mount: 'SMT', pins: 48, label: 'Memory' },
  connector:       { unit: 0.55,  mount: 'TH',  pins: 8,  label: 'Connector' },
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

// Bare-board fab rate (EUR / cm²) by layer count, at ~1k volume.
const LAYER_RATE = { 1: 0.016, 2: 0.024, 4: 0.060, 6: 0.105, 8: 0.170, 10: 0.24 };
const FINISH_MULT = { hasl: 1.0, leadfree_hasl: 1.05, enig: 1.25, osp: 0.98, immersion_silver: 1.15 };
const FAB_NRE = 220;             // panel/tooling €, amortised over volume
const ASSY_NRE = 180;            // stencil + programming €, amortised over volume
const SMT_PLACEMENT = 0.0045;    // €/placement (machine + paste amort) at ~1k
const TH_LEAD = 0.03;            // €/lead (selective/hand solder)
const AOI_TEST = 0.12;           // €/board inspection + FCT allowance
const EMS_OVERHEAD = 0.18;       // SG&A + margin on cost of goods

const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : dflt; };

function classOf(type) {
  const t = String(type || '').toLowerCase().trim();
  return Object.hasOwn(COMPONENT_CLASSES, t) ? COMPONENT_CLASSES[t] : COMPONENT_CLASSES.other;
}

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

  // ── Components ────────────────────────────────────────────────────────────
  let componentCost = 0, placements = 0, thLeads = 0, uniquePartNos = 0;
  const lines = comps.map((c) => {
    const cls = classOf(c.type);
    const qty = Math.max(1, Math.round(clampNum(c.qty, 1, 100000, 1)));
    const mount = (c.mount === 'TH' || c.mount === 'SMT') ? c.mount : cls.mount;
    const pins = Math.max(1, Math.round(clampNum(c.pins, 1, 2000, cls.pins)));
    const unit = clampNum(c.unitCostOverride, 0, 100000, cls.unit);
    const lineCost = unit * qty;
    componentCost += lineCost;
    uniquePartNos += 1;
    if (mount === 'TH') thLeads += pins * qty; else placements += qty;
    return {
      refDes: String(c.refDes || '').slice(0, 24),
      type: Object.hasOwn(COMPONENT_CLASSES, String(c.type || '').toLowerCase()) ? String(c.type).toLowerCase() : 'other',
      label: cls.label,
      package: String(c.package || '').slice(0, 24),
      mount, pins, qty,
      unitCost: round(unit, 4),
      lineCost: round(lineCost, 3),
    };
  });

  // ── Fab (bare board) ──────────────────────────────────────────────────────
  const rate = LAYER_RATE[layers] || LAYER_RATE[2];
  const fabCost = areaCm2 * rate * (FINISH_MULT[finish] || 1) + FAB_NRE / volume;

  // ── Assembly (SMT + TH + inspection) ──────────────────────────────────────
  const assemblyCost = placements * SMT_PLACEMENT + thLeads * TH_LEAD + AOI_TEST + ASSY_NRE / volume;

  const cogs = componentCost + fabCost + assemblyCost;
  const overhead = cogs * EMS_OVERHEAD;
  const total = cogs + overhead;

  const pct = (x) => (total > 0 ? round((x / total) * 100, 1) : 0);
  return {
    currency: 'EUR',
    board: { widthMm, heightMm, areaCm2: round(areaCm2, 1), layers, finish },
    stats: { lineItems: lines.length, uniquePartNos, totalPlacements: placements, thLeads },
    lines,
    breakdown: {
      components: { value: round(componentCost), pct: pct(componentCost) },
      fab:        { value: round(fabCost), pct: pct(fabCost) },
      assembly:   { value: round(assemblyCost), pct: pct(assemblyCost) },
      overhead:   { value: round(overhead), pct: pct(overhead) },
    },
    componentCost: round(componentCost),
    fabCost: round(fabCost),
    assemblyCost: round(assemblyCost),
    overhead: round(overhead),
    total: round(total),
    volume,
    note: 'Indicative parametric estimate. Vision infers component class/package/qty, not exact part numbers — edit the BOM and re-cost for a firm number.',
  };
}
