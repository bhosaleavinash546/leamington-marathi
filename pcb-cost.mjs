/**
 * BrainSpark — PCB / PCBA should-cost model v2
 * ------------------------------------------------------------------
 * A parametric board cost = components + bare-board fab + SMT/TH assembly +
 * test + logistics + EMS overhead. Separate domain from the mechanical engine.
 *
 * v2 accuracy model (grounded in EMS/distributor research, encoded as priors):
 *   • PER-CLASS price-volume curves — price(q) = P1k·(floor + (1−floor)·(q/1000)^−k).
 *     Passives discount steeply with volume (floor ~0.20); MCUs/SoCs barely
 *     (floor 0.65–0.75). Continuous — no cliff at any volume break.
 *   • REGION axis (PCB_REGIONS, 12 manufacturing hubs): a conversion index that
 *     scales ASSEMBLY+TEST only, a material markup % on components+fab, and a
 *     bare-fab regional multiplier. Materials dominate a PCBA, so the labour
 *     index must never scale the whole board.
 *   • Automotive grade (AEC-Q) uplift, test strategy (AOI/ICT/FCT with fixture
 *     NRE amortisation), double-side assembly, panel utilisation, tariff param.
 *   • simulatePcbCost (seeded Monte-Carlo P10/P50/P90) + pcbTornado (ranked
 *     what-if impacts) for sensitivity.
 *
 * IMPORTANT: photo-derived BOMs carry class/qty uncertainty; rate tables are
 * research priors (LOW/MED confidence). Treat outputs as engineering estimates
 * with the published band, not quotes.
 */

// Component class → indicative unit price (EUR at ~1k qty, rebased to GBP below),
// default mount/pins, and the price-volume curve (floorFrac = asymptotic fraction
// of the 1k price at very high volume; k = discount elasticity — passives steep,
// vendor-controlled silicon flat).
export const COMPONENT_CLASSES = {
  resistor:        { unit: 0.004, mount: 'SMT', pins: 2,  label: 'Resistor',           floorFrac: 0.20, k: 0.50 },
  capacitor_mlcc:  { unit: 0.010, mount: 'SMT', pins: 2,  label: 'MLCC capacitor',     floorFrac: 0.20, k: 0.50 },
  capacitor_elec:  { unit: 0.09,  mount: 'SMT', pins: 2,  label: 'Electrolytic cap',   floorFrac: 0.30, k: 0.40 },
  capacitor_tant:  { unit: 0.14,  mount: 'SMT', pins: 2,  label: 'Tantalum cap',       floorFrac: 0.30, k: 0.40 },
  inductor:        { unit: 0.06,  mount: 'SMT', pins: 2,  label: 'Inductor',           floorFrac: 0.30, k: 0.40 },
  ferrite_bead:    { unit: 0.02,  mount: 'SMT', pins: 2,  label: 'Ferrite bead',       floorFrac: 0.20, k: 0.50 },
  diode:           { unit: 0.04,  mount: 'SMT', pins: 2,  label: 'Diode',              floorFrac: 0.30, k: 0.40 },
  led:             { unit: 0.06,  mount: 'SMT', pins: 2,  label: 'LED',                floorFrac: 0.30, k: 0.40 },
  transistor:      { unit: 0.06,  mount: 'SMT', pins: 3,  label: 'Transistor',         floorFrac: 0.30, k: 0.40 },
  mosfet:          { unit: 0.18,  mount: 'SMT', pins: 3,  label: 'MOSFET',             floorFrac: 0.45, k: 0.30 },
  ic_logic:        { unit: 0.25,  mount: 'SMT', pins: 14, label: 'Logic IC',           floorFrac: 0.45, k: 0.30 },
  ic_analog:       { unit: 0.55,  mount: 'SMT', pins: 8,  label: 'Analog IC',          floorFrac: 0.45, k: 0.30 },
  ic_power:        { unit: 0.80,  mount: 'SMT', pins: 8,  label: 'Power/regulator IC', floorFrac: 0.45, k: 0.30 },
  mcu:             { unit: 2.50,  mount: 'SMT', pins: 48, label: 'Microcontroller',    floorFrac: 0.65, k: 0.20 },
  soc:             { unit: 15.0,  mount: 'SMT', pins: 256, label: 'SoC / processor',   floorFrac: 0.75, k: 0.15 },
  memory:          { unit: 1.20,  mount: 'SMT', pins: 48, label: 'Memory',             floorFrac: 0.65, k: 0.20 },
  connector:       { unit: 0.55,  mount: 'TH',  pins: 8,  label: 'Connector', th: true, floorFrac: 0.55, k: 0.25 },
  header:          { unit: 0.15,  mount: 'TH',  pins: 4,  label: 'Header / jumper',    floorFrac: 0.55, k: 0.25 },
  crystal:         { unit: 0.25,  mount: 'SMT', pins: 4,  label: 'Crystal',            floorFrac: 0.45, k: 0.30 },
  oscillator:      { unit: 0.55,  mount: 'SMT', pins: 4,  label: 'Oscillator',         floorFrac: 0.45, k: 0.30 },
  switch:          { unit: 0.22,  mount: 'SMT', pins: 4,  label: 'Switch / button',    floorFrac: 0.55, k: 0.25 },
  relay:           { unit: 0.65,  mount: 'TH',  pins: 5,  label: 'Relay',              floorFrac: 0.55, k: 0.25 },
  transformer:     { unit: 1.10,  mount: 'TH',  pins: 6,  label: 'Transformer',        floorFrac: 0.55, k: 0.25 },
  fuse:            { unit: 0.10,  mount: 'SMT', pins: 2,  label: 'Fuse',               floorFrac: 0.30, k: 0.40 },
  module:          { unit: 3.50,  mount: 'SMT', pins: 20, label: 'Module (RF/power)',  floorFrac: 0.55, k: 0.25 },
  test_point:      { unit: 0.01,  mount: 'TH',  pins: 1,  label: 'Test point',         floorFrac: 0.30, k: 0.40 },
  other:           { unit: 0.20,  mount: 'SMT', pins: 4,  label: 'Other',              floorFrac: 0.40, k: 0.30 },
};
export const COMPONENT_TYPES = Object.keys(COMPONENT_CLASSES);

// PCB manufacturing hubs. convIndex scales CONVERSION (assembly+test) only —
// never materials. matMarkupPct = EMS markup on bought-out materials at volume.
// fabMult = bare-board regional price vs China. labourHr = burdened SMT operator
// $/hr (informational). Priors from public EMS research — LOW/MED confidence,
// encoded with wide sensitivity bands.
// convIndex reflects the loaded SMT LINE rate (machine + operator + factory),
// NOT raw wage ratios — high-wage hubs run more automation, so conversion
// compresses toward ~2-2.5× China even where wages are 5-7×.
// fabMult is a LANDED bare-board index: at volume, boards are globally sourced
// (mostly Asian fab) wherever assembly happens, so a Western hub pays a
// freight/duty/local-blend premium (~+15-30%), not local-fab multiples.
export const PCB_REGIONS = {
  china:    { label: 'China',            convIndex: 1.0,  matMarkupPct: 0.08, fabMult: 1.0,  labourHr: 7 },
  taiwan:   { label: 'Taiwan',           convIndex: 1.2,  matMarkupPct: 0.08, fabMult: 1.05, labourHr: 12 },
  vietnam:  { label: 'Vietnam',          convIndex: 0.90, matMarkupPct: 0.09, fabMult: 1.10, labourHr: 3.5 },
  india:    { label: 'India',            convIndex: 0.92, matMarkupPct: 0.12, fabMult: 1.15, labourHr: 2.5 },
  thailand: { label: 'Thailand',         convIndex: 0.95, matMarkupPct: 0.08, fabMult: 1.10, labourHr: 4 },
  malaysia: { label: 'Malaysia',         convIndex: 1.0,  matMarkupPct: 0.08, fabMult: 1.10, labourHr: 5 },
  korea:    { label: 'South Korea',      convIndex: 1.8,  matMarkupPct: 0.07, fabMult: 1.20, labourHr: 26 },
  japan:    { label: 'Japan',            convIndex: 2.0,  matMarkupPct: 0.07, fabMult: 1.30, labourHr: 26 },
  mexico:   { label: 'Mexico',           convIndex: 1.15, matMarkupPct: 0.10, fabMult: 1.15, labourHr: 5.5 },
  easteu:   { label: 'Eastern Europe',   convIndex: 1.5,  matMarkupPct: 0.10, fabMult: 1.20, labourHr: 12 },
  germany:  { label: 'Germany / W. EU',  convIndex: 2.6,  matMarkupPct: 0.11, fabMult: 1.30, labourHr: 48 },
  usa:      { label: 'USA',              convIndex: 2.4,  matMarkupPct: 0.13, fabMult: 1.25, labourHr: 30 },
};
export const PCB_REGION_KEYS = Object.keys(PCB_REGIONS);

// Self-contained EUR basis rebased to the app's £ display currency.
const GBP = 0.85;   // £ per € (matches FX_FALLBACK.GBP)
for (const c of Object.values(COMPONENT_CLASSES)) c.unit = Number((c.unit * GBP).toFixed(4));

// China-basis bare-board fab rate (£/cm²) by layer count, at ~1k volume.
const LAYER_RATE = Object.fromEntries(Object.entries({ 1: 0.016, 2: 0.024, 4: 0.060, 6: 0.105, 8: 0.170, 10: 0.24 }).map(([k, v]) => [k, v * GBP]));
const FINISH_MULT = { hasl: 1.0, leadfree_hasl: 1.05, enig: 1.25, osp: 0.98, immersion_silver: 1.15 };
const FAB_NRE = 220 * GBP;             // panel/tooling £, amortised over annual volume
const ASSY_NRE = 180 * GBP;            // stencil + programming £, amortised
const FEEDER_SETUP = 1.6 * GBP;        // £/unique part, amortised
const SMT_PLACEMENT = 0.02 * GBP;      // £/placement at ~1k (China basis)
const BGA_PREMIUM = 0.15 * GBP;        // extra £/placement for fine-pitch/BGA (pins ≥ 48)
const XRAY_PER_BOARD = 0.20 * GBP;     // when any BGA present
const TH_LEAD = 0.035 * GBP;           // £/lead (selective/hand solder) — TH is 5-20× an SMT joint
const AOI_FLAT = 0.08 * GBP;           // inline optical inspection £/board
const FCT_BENCH_BASE = 0.30 * GBP;     // low-volume bench functional test £/board
const FCT_BENCH_PER_ACTIVE = 0.08 * GBP;
const SECOND_SIDE_ADDER = 0.25 * GBP;  // 2nd stencil/reflow pass £/board at ~1k (scaled by curves)
const ICT_FIXTURE_NRE = 9000;          // £ bed-of-nails fixture (research prior, LOW conf.)
const FCT_FIXTURE_NRE = 18000;         // £ functional fixture + test dev (LOW conf.)
const ICT_SEC = 20;                    // s/board on the ICT stand
const FCT_SEC_BASE = 30;               // s/board FCT base
const FCT_SEC_PER_ACTIVE = 1.5;        // s per active device under test
const TEST_RATE_HR = 40 * GBP;         // £/hr test stand incl. operator (China basis)
const FREIGHT_PCT = 0.06;              // inbound freight on materials
const FIRST_PASS_YIELD = 0.985;
const ATTRITION = 1.02;
const CONV_OVERHEAD = 0.30;            // EMS overhead+profit on CONVERSION (assembly+test) at volume
const AEC_Q_UPLIFT = 1.18;             // automotive-grade component premium (+10-30% band)

const ACTIVE_TYPES = new Set(['ic_logic', 'ic_analog', 'ic_power', 'mcu', 'soc', 'memory', 'module']);

// ── Continuous volume curves (no cliffs; ~1.0 at the 1k reference) ───────────
const curve = (q, floorFrac, k, protoCap) => {
  const m = floorFrac + (1 - floorFrac) * Math.pow(Math.max(1, q) / 1000, -k);
  return Math.min(protoCap, Math.max(floorFrac, m));
};
export const classVolMult = (clsKey, q) => {
  const c = COMPONENT_CLASSES[clsKey] || COMPONENT_CLASSES.other;
  return curve(q, c.floorFrac, c.k, 2.5);
};
const convVolMult = (q) => curve(q, 0.42, 0.28, 2.0);
const fabVolMult  = (q) => curve(q, 0.38, 0.30, 2.2);

const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : dflt; };

function classKey(type) {
  const t = String(type || '').toLowerCase().trim();
  return Object.hasOwn(COMPONENT_CLASSES, t) ? t : 'other';
}

function resolveTestStrategy(strategy, volume, activeDevices) {
  const s = String(strategy || 'auto');
  if (['aoi', 'aoi_fct', 'aoi_ict', 'aoi_ict_fct'].includes(s)) return s;
  // auto: fixtures only pay off at volume; bench FCT covers the mid range.
  if (activeDevices === 0) return 'aoi';
  if (volume >= 5000) return 'aoi_ict_fct';
  if (volume >= 200) return 'aoi_fct';
  return 'aoi';
}

/**
 * Cost a (vision-extracted or edited) PCB BOM.
 * @param {object} input  { board:{ widthMm, heightMm, layers, finish }, components:[{ refDes, type, qty, mount, pins, package, unitCostOverride }] }
 * @param {object} [opts] { volume=1000, region='china', autoGrade=true, testStrategy='auto',
 *                          sides='single', panelUtil=0.85, tariffPct=0 }
 */
export function costBom(input, opts = {}) {
  const volume = clampNum(opts.volume, 1, 100_000_000, 1000);
  const regionKey = Object.hasOwn(PCB_REGIONS, opts.region) ? opts.region : 'china';
  const region = PCB_REGIONS[regionKey];
  const autoGrade = opts.autoGrade !== false;   // automotive default
  const sides = opts.sides === 'double' ? 'double' : 'single';
  const panelUtil = clampNum(opts.panelUtil, 0.5, 0.95, 0.85);
  const tariffPct = clampNum(opts.tariffPct, 0, 200, 0);

  const board = input?.board || {};
  const comps = Array.isArray(input?.components) ? input.components : [];

  const widthMm  = clampNum(board.widthMm, 5, 1000, 80);
  const heightMm = clampNum(board.heightMm, 5, 1000, 60);
  const layers   = [1, 2, 4, 6, 8, 10].includes(Number(board.layers)) ? Number(board.layers) : 2;
  const finish   = Object.hasOwn(FINISH_MULT, board.finish) ? board.finish : 'hasl';
  const areaCm2  = (widthMm * heightMm) / 100;
  const y        = 1 / FIRST_PASS_YIELD;
  const convMult = convVolMult(volume);

  // ── Components: per-class price-volume curve + AEC-Q + attrition ───────────
  let componentCost = 0, placements = 0, bgaPlacements = 0, thLeads = 0, activeDevices = 0;
  const uniqueKeys = new Set();
  const lines = comps.map((c) => {
    const key = classKey(c.type);
    const cls = COMPONENT_CLASSES[key];
    const qty = Math.max(1, Math.round(clampNum(c.qty, 1, 100000, 1)));
    const mount = (c.mount === 'TH' || c.mount === 'SMT') ? c.mount : cls.mount;
    const pins = Math.max(1, Math.round(clampNum(c.pins, 1, 2000, cls.pins)));
    const pkg = String(c.package || '').slice(0, 24);
    // Positive override (user- or AI-supplied unit £ at THIS volume) wins;
    // else class average shaped by the class's own volume curve.
    const override = Number(c.unitCostOverride);
    const gradeMult = autoGrade ? AEC_Q_UPLIFT : 1;
    const unit = Number.isFinite(override) && override > 0
      ? override
      : cls.unit * classVolMult(key, volume) * gradeMult;
    componentCost += unit * qty;
    uniqueKeys.add(`${key}|${pkg}`);
    if (ACTIVE_TYPES.has(key)) activeDevices += qty;
    if (mount === 'TH') thLeads += pins * qty;
    else { placements += qty; if (pins >= 48) bgaPlacements += qty; }
    return {
      refDes: String(c.refDes || '').slice(0, 24),
      type: key, label: cls.label, package: pkg, mount, pins, qty,
      unitCost: round(unit, 4), lineCost: round(unit * qty, 3),
    };
  });
  componentCost *= ATTRITION * y;
  const uniqueParts = uniqueKeys.size;

  // ── Fab: layer rate × regional fab mult × volume curve × panel utilisation ─
  const fabRate = (LAYER_RATE[layers] || LAYER_RATE[2]) * fabVolMult(volume) * region.fabMult;
  const panelFactor = 0.85 / panelUtil;   // 0.85 reference → 1.0 at default
  const fabCost = (areaCm2 * fabRate * (FINISH_MULT[finish] || 1) * panelFactor + FAB_NRE / volume) * y;

  // ── Assembly (conversion — region convIndex applies here, NOT to materials) ─
  const placementCost = placements * SMT_PLACEMENT * convMult + bgaPlacements * BGA_PREMIUM;
  const thCost = thLeads * TH_LEAD * convMult;
  const secondSide = sides === 'double' ? SECOND_SIDE_ADDER * convMult : 0;
  const setupNre = (ASSY_NRE + uniqueParts * FEEDER_SETUP) / volume;
  const assemblyCost = (placementCost + thCost + secondSide + setupNre) * region.convIndex * y;

  // ── Test (strategy-dependent; fixture NRE amortised over annual volume) ────
  const testStrategy = resolveTestStrategy(opts.testStrategy, volume, activeDevices);
  const xray = bgaPlacements > 0 ? XRAY_PER_BOARD : 0;
  let testPerBoard = AOI_FLAT + xray;
  let testNre = 0;
  if (testStrategy === 'aoi_fct') {
    testPerBoard += FCT_BENCH_BASE + FCT_BENCH_PER_ACTIVE * activeDevices;
  }
  if (testStrategy === 'aoi_ict' || testStrategy === 'aoi_ict_fct') {
    testNre += ICT_FIXTURE_NRE;
    testPerBoard += (ICT_SEC / 3600) * TEST_RATE_HR;
  }
  if (testStrategy === 'aoi_ict_fct') {
    testNre += FCT_FIXTURE_NRE;
    testPerBoard += ((FCT_SEC_BASE + FCT_SEC_PER_ACTIVE * activeDevices) / 3600) * TEST_RATE_HR;
  }
  const testCost = (testPerBoard * region.convIndex + testNre / volume) * y;

  // ── Rollup: markup on materials, overhead on conversion, tariff as a line ──
  const materials = componentCost + fabCost;
  const conversion = assemblyCost + testCost;
  const logistics = materials * FREIGHT_PCT;
  const materialMarkup = materials * region.matMarkupPct;
  const convOverhead = conversion * CONV_OVERHEAD;
  const overhead = materialMarkup + convOverhead;
  const tariff = ((materials + conversion) * tariffPct) / 100;
  const total = materials + conversion + logistics + overhead + tariff;

  const pct = (x) => (total > 0 ? round((x / total) * 100, 1) : 0);
  return {
    currency: 'GBP',
    board: { widthMm, heightMm, areaCm2: round(areaCm2, 1), layers, finish },
    region: regionKey,
    regionLabel: region.label,
    params: { volume, autoGrade, testStrategy, sides, panelUtil: round(panelUtil, 2), tariffPct },
    stats: { lineItems: lines.length, uniqueParts, totalPlacements: placements, bgaPlacements, thLeads, activeDevices },
    lines,
    breakdown: {
      components: { value: round(componentCost), pct: pct(componentCost) },
      fab:        { value: round(fabCost), pct: pct(fabCost) },
      assembly:   { value: round(assemblyCost), pct: pct(assemblyCost) },
      test:       { value: round(testCost), pct: pct(testCost) },
      logistics:  { value: round(logistics), pct: pct(logistics) },
      overhead:   { value: round(overhead), pct: pct(overhead) },
      ...(tariff > 0 ? { tariff: { value: round(tariff), pct: pct(tariff) } } : {}),
    },
    componentCost: round(componentCost),
    fabCost: round(fabCost),
    assemblyCost: round(assemblyCost),
    testCost: round(testCost),
    logistics: round(logistics),
    overhead: round(overhead),
    tariff: round(tariff),
    total: round(total),
    volume,
    note: 'Engineering estimate from research-based rate priors (class-average component prices shaped by per-class volume curves; regional conversion/markup indices). Photo-derived BOMs add class/qty uncertainty. Treat as ±30–50% until part-number pricing or a real quote calibrates it.',
  };
}

/** Cost the same BOM across several manufacturing hubs. */
export function costBomMultiRegion(input, opts = {}) {
  const regions = (Array.isArray(opts.regions) && opts.regions.length
    ? opts.regions.filter(r => Object.hasOwn(PCB_REGIONS, r))
    : PCB_REGION_KEYS);
  const results = regions.map(r => {
    const c = costBom(input, { ...opts, region: r });
    return {
      region: r, label: PCB_REGIONS[r].label, labourHr: PCB_REGIONS[r].labourHr,
      total: c.total, breakdown: c.breakdown,
      componentCost: c.componentCost, fabCost: c.fabCost, assemblyCost: c.assemblyCost,
      testCost: c.testCost, logistics: c.logistics, overhead: c.overhead, tariff: c.tariff,
    };
  }).sort((a, b) => a.total - b.total);
  const cheapest = results[0]?.total ?? 0;
  return {
    currency: 'GBP',
    volume: clampNum(opts.volume, 1, 100_000_000, 1000),
    results: results.map(r => ({ ...r, deltaVsCheapest: round(r.total - cheapest) })),
  };
}

// ── Sensitivity ──────────────────────────────────────────────────────────────

// Deterministic seeded RNG (same construction as the mechanical engine).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded Monte-Carlo on the cost buckets. Component-price σ is class-weighted
 * (commodity passives are tight; silicon pricing is wide); fab/conversion ±15%;
 * yield ±1pp; plus a model-form uniform ±12%.
 * @returns { p10, p50, p90, mean, stdev, samples }
 */
export function simulatePcbCost(input, opts = {}, samples = 1500, seed = 20260719) {
  const base = costBom(input, opts);
  // Class-weighted component sigma: sigma_i = 0.08 + (1 − floorFrac)·0.20
  let wSigma = 0, wSum = 0;
  for (const l of base.lines) {
    const cls = COMPONENT_CLASSES[l.type] || COMPONENT_CLASSES.other;
    const w = l.lineCost;
    wSigma += (0.08 + (1 - cls.floorFrac) * 0.20) * w;
    wSum += w;
  }
  const compSigma = wSum > 0 ? wSigma / wSum : 0.15;
  const rnd = mulberry32(seed);
  const gauss = () => { // Box-Muller
    const u = Math.max(1e-9, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const totals = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const comp = base.componentCost * Math.max(0.4, 1 + gauss() * compSigma);
    const fab = base.fabCost * Math.max(0.5, 1 + gauss() * 0.15);
    const conv = (base.assemblyCost + base.testCost) * Math.max(0.5, 1 + gauss() * 0.15);
    const yieldMult = 1 / Math.min(0.999, Math.max(0.94, FIRST_PASS_YIELD + gauss() * 0.01)) * FIRST_PASS_YIELD;
    const materials = (comp + fab) * yieldMult;
    const conversion = conv * yieldMult;
    const region = PCB_REGIONS[base.region];
    const t = (materials + conversion
      + materials * FREIGHT_PCT
      + materials * region.matMarkupPct + conversion * CONV_OVERHEAD
      + ((materials + conversion) * base.params.tariffPct) / 100)
      * (0.88 + rnd() * 0.24);   // model-form uniform ±12%
    totals[i] = t;
  }
  totals.sort((a, b) => a - b);
  const q = (p) => totals[Math.min(samples - 1, Math.max(0, Math.floor(p * samples)))];
  const mean = totals.reduce((s, x) => s + x, 0) / samples;
  const stdev = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / samples);
  return { p10: round(q(0.10)), p50: round(q(0.50)), p90: round(q(0.90)), mean: round(mean), stdev: round(stdev), samples };
}

/**
 * Deterministic tornado: re-cost concrete what-ifs and rank by impact.
 * Every scenario is a REAL engine run — no fabricated deltas.
 */
export function pcbTornado(input, opts = {}) {
  const base = costBom(input, opts);
  const scenarios = [];
  const add = (label, newTotal) => scenarios.push({ label, total: round(newTotal), delta: round(newTotal - base.total) });

  // Top cost lines ±30% (component price risk / negotiation target).
  const top = [...base.lines].sort((a, b) => b.lineCost - a.lineCost).slice(0, 3);
  for (const l of top) {
    for (const [tag, mult] of [['−30%', 0.7], ['+30%', 1.3]]) {
      const comps = input.components.map(c => {
        const same = String(c.refDes || '') === l.refDes && classKey(c.type) === l.type;
        return same ? { ...c, unitCostOverride: l.unitCost * mult } : c;
      });
      add(`${l.refDes || l.label} price ${tag}`, costBom({ ...input, components: comps }, opts).total);
    }
  }
  // Board levers.
  const layers = base.board.layers;
  const layerSteps = [1, 2, 4, 6, 8, 10];
  const li = layerSteps.indexOf(layers);
  if (li > 1) add(`Reduce to ${layerSteps[li - 1]} layers`, costBom({ ...input, board: { ...input.board, layers: layerSteps[li - 1] } }, opts).total);
  if (base.board.finish !== 'hasl') add('Finish → HASL', costBom({ ...input, board: { ...input.board, finish: 'hasl' } }, opts).total);
  if ((opts.sides === 'double')) add('Single-side assembly', costBom(input, { ...opts, sides: 'single' }).total);
  add('Volume ×0.5', costBom(input, { ...opts, volume: base.volume * 0.5 }).total);
  add('Volume ×2', costBom(input, { ...opts, volume: base.volume * 2 }).total);
  add('Panel utilisation 0.95', costBom(input, { ...opts, panelUtil: 0.95 }).total);
  // Region moves vs current base.
  const interesting = ['china', 'vietnam', 'india', 'mexico', 'easteu'].filter(r => r !== base.region);
  for (const r of interesting.slice(0, 3)) add(`Build in ${PCB_REGIONS[r].label}`, costBom(input, { ...opts, region: r }).total);

  scenarios.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { baseTotal: base.total, scenarios: scenarios.slice(0, 12) };
}

// Internals surfaced for the detailed CBD engine (pcb-detailed.mjs), which
// decomposes the SAME constants into an editable driver tree — one engine,
// two views; parity at defaults is asserted in tests.
export const PCB_INTERNALS = {
  LAYER_RATE, FINISH_MULT, FAB_NRE, ASSY_NRE, FEEDER_SETUP, SMT_PLACEMENT,
  BGA_PREMIUM, XRAY_PER_BOARD, TH_LEAD, AOI_FLAT, FCT_BENCH_BASE,
  FCT_BENCH_PER_ACTIVE, SECOND_SIDE_ADDER, ICT_FIXTURE_NRE, FCT_FIXTURE_NRE,
  ICT_SEC, FCT_SEC_BASE, FCT_SEC_PER_ACTIVE, TEST_RATE_HR, FREIGHT_PCT,
  FIRST_PASS_YIELD, ATTRITION, CONV_OVERHEAD, AEC_Q_UPLIFT,
  convVolMult, fabVolMult, resolveTestStrategy,
};
