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

import { calibrationFactor, calibrationSource, isClamped } from './calibration.mjs';
import { MACHINABILITY, machinabilityFor } from './machining-feature-cost.mjs';

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
  // ── E-drive unit families (800V EDU: magnets, windings, thin-gauge cores) ──
  //    Prices are ILLUSTRATIVE anchors like every other entry here, not
  //    supplier quotes. NdFeB is the most volatile line in this table — the
  //    rare-earth market moves in steps, and a magnet price is a contract
  //    position, not a commodity read. Treat it as an order-of-magnitude
  //    anchor and calibrate from your own quotes before quoting a magnet.
  'Magnet (NdFeB, sintered, heavy-RE)': { density: 7.50, price: 62.0, scrapRecovery: 0.05, family: 'magnet' },
  'Magnet (Ferrite, Y30BH)':  { density: 4.90, price: 3.80, scrapRecovery: 0.05, family: 'magnet' },
  //    Enamelled winding wire carries a drawing + coating conversion premium
  //    over Cu-ETP cathode; rectangular hairpin wire sits at the top of it.
  'Copper (enamelled winding wire)': { density: 8.89, price: 12.40, scrapRecovery: 0.70, family: 'copper' },
  //    Thin-gauge non-oriented steel for high-frequency 800V traction cores —
  //    the gauge premium over M250-35A is the whole point of the grade.
  'Electrical Steel (NO20, 0.20 mm)': { density: 7.60, price: 3.40, scrapRecovery: 0.20, family: 'electricalsteel' },
  'Epoxy (impregnation resin)': { density: 1.15, price: 6.50, scrapRecovery: 0.00, family: 'plastic' },
  'Electrical Steel (M250-35A)': { density: 7.65, price: 1.45, scrapRecovery: 0.20, family: 'electricalsteel' },
  'EPDM Rubber':              { density: 1.20, price: 2.40, scrapRecovery: 0.00, family: 'elastomer' },
  'Glass (Soda-lime, automotive)': { density: 2.50, price: 0.85, scrapRecovery: 0.15, family: 'glass' },
  // ── Standard grades a cost engineer expects to find ──────────────────────
  //
  // The list above named ONE alloy per family and several of them were the wrong
  // one for the process that family is actually used by: A356 is a gravity /
  // sand-casting alloy and the tool offered it for high-pressure die casting,
  // where the production alloy is A380/ADC12; AZ31 is a WROUGHT magnesium and
  // die-cast magnesium is AZ91D; ZAMAK 5 was listed without ZAMAK 3, which is
  // the more common of the two. A picker that cannot name the alloy the part is
  // actually made from forces the user to pick a near-miss, and every
  // material-specific threshold downstream is then resolved for the wrong metal.
  //
  // Densities are physical constants. PRICES ARE INDICATIVE €/kg on the same
  // basis as the entries above — a static library the commodity bridge overrides
  // where a live index exists — and they move with the market, so they are a
  // starting point for a should-cost, not a quotation.

  // Steels: the body-in-white and driveline grades
  'Stainless Steel 316L':     { density: 8.00, price: 4.10, scrapRecovery: 0.35, family: 'ferrous' },
  'Stainless Steel 430':      { density: 7.70, price: 2.20, scrapRecovery: 0.35, family: 'ferrous' },
  'Steel DP600 (dual-phase)': { density: 7.85, price: 0.95, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel DP980 (dual-phase)': { density: 7.85, price: 1.25, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel 22MnB5 (press-hardened)': { density: 7.85, price: 1.35, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel 42CrMo4 / 4140':     { density: 7.85, price: 1.30, scrapRecovery: 0.20, family: 'ferrous' },
  'Steel 16MnCr5 (case-hardening)': { density: 7.85, price: 1.20, scrapRecovery: 0.20, family: 'ferrous' },
  'Cast Iron (CGI / GJV-450)': { density: 7.10, price: 0.85, scrapRecovery: 0.25, family: 'castiron' },

  // Aluminium: the die-casting alloy the family was missing, plus sheet and
  // European structural extrusion
  'Aluminium A380 / ADC12 (die-cast)': { density: 2.71, price: 2.45, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium 5052 (sheet)':   { density: 2.68, price: 3.05, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium 6082':           { density: 2.70, price: 2.95, scrapRecovery: 0.50, family: 'aluminium' },
  'Magnesium AZ91D (die-cast)': { density: 1.81, price: 3.40, scrapRecovery: 0.30, family: 'magnesium' },
  'Zinc (ZAMAK 3)':           { density: 6.60, price: 2.85, scrapRecovery: 0.50, family: 'zinc' },
  'Bronze (CuSn8)':           { density: 8.80, price: 8.50, scrapRecovery: 0.60, family: 'copper' },

  // ── THE CASTING ALLOYS A FOUNDRY ACTUALLY QUOTES ──────────────────────────
  //
  // The list above carried ONE aluminium die-casting alloy, ONE magnesium and
  // two zincs, which is enough to demonstrate the engine and not enough to run a
  // programme. A cost engineer opening the picker for a structural HPDC node
  // wants Silafont or Castasil by name; one for a gearbox housing wants AlSi9Cu3
  // or ADC10; the thin-wall convertor wants A360 or A413. Forcing all of them
  // onto "A380 / ADC12" resolves every alloy-specific threshold — minimum wall,
  // draft, core slenderness — against the wrong metal, and the report then says
  // "resolved for Aluminium A380" on a part that is not made of it.
  //
  // Densities are physical constants. PRICES ARE INDICATIVE €/kg on the same
  // static basis as everything above — the commodity bridge overrides them where
  // a live index exists — so they start a should-cost rather than settle one.

  // High-pressure die casting. Silafont-36 and Castasil-37 are the two that
  // matter for structural, heat-treatable and weldable castings; the rest are
  // the conventional secondary-alloy workhorses.
  'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)': { density: 2.65, price: 3.10, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium Castasil-37 (AlSi9MnMoZr, structural HPDC)': { density: 2.65, price: 3.25, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)': { density: 2.75, price: 2.40, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium ADC10 / A383 (die-cast)': { density: 2.74, price: 2.42, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium A360 (die-cast)': { density: 2.68, price: 2.55, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium A413 (die-cast)': { density: 2.66, price: 2.50, scrapRecovery: 0.50, family: 'aluminium' },

  // Gravity, low-pressure and sand: the Al-Si-Mg heat-treatable family. A356 was
  // already here; these are the two grades quoted beside it.
  'Aluminium A357 (cast)':    { density: 2.68, price: 3.00, scrapRecovery: 0.50, family: 'aluminium' },
  'Aluminium AlSi7Mg0.3 / EN AC-42100 (cast)': { density: 2.67, price: 2.90, scrapRecovery: 0.50, family: 'aluminium' },

  // Magnesium die casting. AZ91D is the strongest and the least ductile; AM60
  // and AM50 are what a steering wheel armature or an instrument-panel beam is
  // actually cast in, because they take an impact.
  'Magnesium AM60B (die-cast)': { density: 1.80, price: 3.60, scrapRecovery: 0.30, family: 'magnesium' },
  'Magnesium AM50A (die-cast)': { density: 1.78, price: 3.65, scrapRecovery: 0.30, family: 'magnesium' },

  // Zinc hot-chamber. ZAMAK 2 is the strongest of the three; ZA-8 is the
  // higher-aluminium alloy for bearing and wear duty.
  'Zinc (ZAMAK 2)':           { density: 6.60, price: 3.00, scrapRecovery: 0.50, family: 'zinc' },
  'Zinc ZA-8':                { density: 6.30, price: 3.10, scrapRecovery: 0.50, family: 'zinc' },

  // Iron castings beyond the three already listed: ADI for gears and suspension
  // arms, SiMo for exhaust manifolds and turbo housings.
  'Cast Iron (ADI 900, austempered)': { density: 7.10, price: 1.55, scrapRecovery: 0.25, family: 'castiron' },
  'Cast Iron (SiMo, exhaust)': { density: 7.05, price: 1.70, scrapRecovery: 0.25, family: 'castiron' },

  // Thermoplastics: interior, connector, under-bonnet and blow-moulded grades
  'PC/ABS blend':             { density: 1.12, price: 2.90, scrapRecovery: 0.10, family: 'plastic' },
  'PBT':                      { density: 1.31, price: 3.10, scrapRecovery: 0.10, family: 'plastic' },
  'PP-T20 (talc-filled)':     { density: 1.05, price: 1.75, scrapRecovery: 0.10, family: 'plastic' },
  'PET':                      { density: 1.38, price: 1.85, scrapRecovery: 0.10, family: 'plastic' },
  'PPS':                      { density: 1.35, price: 12.0, scrapRecovery: 0.10, family: 'plastic' },
  'PEEK':                     { density: 1.30, price: 90.0, scrapRecovery: 0.10, family: 'plastic' },
  'TPU (thermoplastic PU)':   { density: 1.20, price: 4.60, scrapRecovery: 0.10, family: 'plastic' },
  'HDPE':                     { density: 0.95, price: 1.45, scrapRecovery: 0.10, family: 'plastic' },

  // Elastomers: the three seal compounds EPDM does not cover
  'NBR (Nitrile) Rubber':     { density: 1.25, price: 3.40, scrapRecovery: 0.00, family: 'elastomer' },
  'Silicone (VMQ) Rubber':    { density: 1.15, price: 7.50, scrapRecovery: 0.00, family: 'elastomer' },
  'FKM (Viton) Rubber':       { density: 1.85, price: 32.0, scrapRecovery: 0.00, family: 'elastomer' },

  // Composites: glass fibre is far more common in automotive than carbon
  'GFRP (Glass Fibre)':       { density: 1.90, price: 4.50, scrapRecovery: 0.00, family: 'composite' },
  'SMC (Sheet Moulding Compound)': { density: 1.85, price: 3.20, scrapRecovery: 0.00, family: 'composite' },
};

// ─── Region database ──────────────────────────────────────────────────────────
// labour = fully-loaded direct €/hr; overheadPct = factory burden on conversion;
// sgaPct = SG&A + profit margin on works cost.
// A REGION IS MORE THAN ITS LABOUR RATE.
//
// Until Sept 2026 a region carried labour, overhead and SG&A only, so
// `machineRate` — depreciation, energy, maintenance — was identical
// everywhere. Measured (review R-27): a 0.15 kg PP clip at 500k/yr cost
// €0.830 in Germany and €0.720 in China, a ratio of 1.15 against a labour
// ratio of 3.6, because an injection press was assumed to cost the same per
// hour in both and `operators` is 0.4. For any automated process the answer
// to "what if we move it" was therefore roughly flat — the single most common
// question put to a should-cost tool.
//
// Three new fields, each stated rather than folded into labour:
//   energyEurPerKwh  industrial electricity price. Public data (IEA/Eurostat
//                    band for industry, 2025-26). Feeds machineRate and the
//                    carbon engine's grid factor lookup.
//   machineMult      capital and maintenance index for the same machine in
//                    that region, relative to Germany = 1.00. Equipment is a
//                    world market, so the spread is far narrower than labour:
//                    it reflects installation, local finance, service cover
//                    and utilisation norms, not a different press.
//   commercialPct    packaging + inbound/outbound freight + receiving, for a
//                    part CONSUMED IN EUROPE. This is the freight and duty
//                    axis the flat 5% could not express (R-28); a lane-level
//                    rate card would supersede it, and until one exists the
//                    lane is an explicit, visible assumption.
//
// The nine original regions keep their labour, overhead and SG&A untouched so
// the benchmark is unaffected; the nine added ones are the footprints the
// industry actually moved to (R-37).
export const REGIONS = {
  'Germany':        { labour: 50, overheadPct: 0.20, sgaPct: 0.12, energyEurPerKwh: 0.20, machineMult: 1.00, commercialPct: 0.045 },
  'UK':             { labour: 47, overheadPct: 0.19, sgaPct: 0.12, energyEurPerKwh: 0.22, machineMult: 1.00, commercialPct: 0.050 },
  'Czech Republic': { labour: 17, overheadPct: 0.16, sgaPct: 0.11, energyEurPerKwh: 0.16, machineMult: 0.92, commercialPct: 0.045 },
  'Spain':          { labour: 24, overheadPct: 0.17, sgaPct: 0.11, energyEurPerKwh: 0.15, machineMult: 0.94, commercialPct: 0.050 },
  'Mexico':         { labour: 9,  overheadPct: 0.14, sgaPct: 0.10, energyEurPerKwh: 0.11, machineMult: 0.88, commercialPct: 0.085 },
  'USA':            { labour: 44, overheadPct: 0.18, sgaPct: 0.12, energyEurPerKwh: 0.09, machineMult: 0.96, commercialPct: 0.080 },
  'China':          { labour: 14, overheadPct: 0.15, sgaPct: 0.10, energyEurPerKwh: 0.09, machineMult: 0.82, commercialPct: 0.095 },
  'India':          { labour: 11, overheadPct: 0.14, sgaPct: 0.10, energyEurPerKwh: 0.10, machineMult: 0.84, commercialPct: 0.100 },
  'Korea':          { labour: 28, overheadPct: 0.17, sgaPct: 0.11, energyEurPerKwh: 0.11, machineMult: 0.94, commercialPct: 0.085 },
  // ── The footprints the industry moved to ──
  'Turkey':         { labour: 12, overheadPct: 0.15, sgaPct: 0.10, energyEurPerKwh: 0.10, machineMult: 0.86, commercialPct: 0.060 },
  'Morocco':        { labour: 7,  overheadPct: 0.13, sgaPct: 0.10, energyEurPerKwh: 0.11, machineMult: 0.85, commercialPct: 0.060 },
  'Poland':         { labour: 15, overheadPct: 0.16, sgaPct: 0.11, energyEurPerKwh: 0.15, machineMult: 0.90, commercialPct: 0.045 },
  'Romania':        { labour: 11, overheadPct: 0.15, sgaPct: 0.10, energyEurPerKwh: 0.14, machineMult: 0.88, commercialPct: 0.050 },
  'Slovakia':       { labour: 16, overheadPct: 0.16, sgaPct: 0.11, energyEurPerKwh: 0.16, machineMult: 0.91, commercialPct: 0.045 },
  'Portugal':       { labour: 14, overheadPct: 0.16, sgaPct: 0.11, energyEurPerKwh: 0.15, machineMult: 0.92, commercialPct: 0.055 },
  'Vietnam':        { labour: 6,  overheadPct: 0.13, sgaPct: 0.10, energyEurPerKwh: 0.07, machineMult: 0.80, commercialPct: 0.105 },
  'Thailand':       { labour: 8,  overheadPct: 0.14, sgaPct: 0.10, energyEurPerKwh: 0.11, machineMult: 0.84, commercialPct: 0.100 },
  'Japan':          { labour: 34, overheadPct: 0.18, sgaPct: 0.12, energyEurPerKwh: 0.16, machineMult: 0.98, commercialPct: 0.090 },
  'Brazil':         { labour: 10, overheadPct: 0.15, sgaPct: 0.11, energyEurPerKwh: 0.13, machineMult: 0.90, commercialPct: 0.105 },
};

/** Germany is the reference for the energy and capital indices. */
export const REGION_REFERENCE = 'Germany';

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
    // Copper added Sept 2026 (review R-36): stamped and formed copper busbars,
    // terminals and contacts run on this same class of progressive-die press
    // line, and copper's lower shear strength makes it no harder to blank than
    // the mild steel this model is anchored on. Excluding it meant the engine
    // REFUSED the single highest-value stamped part in an e-drive. Fine
    // Blanking already accepted copper; the generic line was the outlier.
    //
    // electricalsteel added for the same reason: a non-oriented silicon steel
    // sheet is blanked on a conventional press like any other sheet steel. The
    // dedicated 'Lamination Stamping' entry models a HIGH-SPEED lamination line
    // (interlock, stack, thin gauge); refusing the generic line meant a Prism
    // idea comparing "generic press versus dedicated lamination line" could not
    // be priced at all, which is precisely the comparison worth making.
    families: ['ferrous', 'aluminium', 'copper', 'electricalsteel'],
  },
  // ── The sheet and bulk-forming specialisations ────────────────────────────
  //
  // Each was previously reachable only by selecting the generic neighbour, which
  // priced a different press, a different die and a different cycle. Every
  // parameter is set RELATIVE to that neighbour with the physical reason stated.
  'Fine Blanking': {
    // A triple-action press with a V-ring and a counter-punch: three times the
    // die cost of a conventional blanking tool, a slower stroke rate because the
    // clamp has to set before the cut, and in exchange a sheared face over the
    // full thickness that no longer needs a secondary broach or ream.
    machineRate: 95, operators: 0.4, cavities: 1, utilisation: 0.72, scrapPct: 0.03,
    setupHr: 3.0, batch: 5000, toolLife: 800_000,
    cycleBase: 20, cyclePerKg: 8, toolingBase: 60_000, toolingPerKg: 30_000,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.04, returnsRecovery: 0.92,
  },
  'Hot Stamping (Press Hardening)': {
    // Blank, austenitise at 900+ C, form and quench in a water-cooled die. The
    // furnace is a continuous energy cost the press line does not have, the die
    // carries cooling channels, and every hole after quench is a laser hole.
    machineRate: 155, operators: 0.6, cavities: 1, utilisation: 0.62, scrapPct: 0.04,
    setupHr: 4.0, batch: 3000, toolLife: 400_000,
    cycleBase: 30, cyclePerKg: 9, toolingBase: 260_000, toolingPerKg: 85_000,
    families: ['ferrous'],
    finishPct: 0.12, returnsRecovery: 0.88,
  },
  'Deep Drawing (Multi-stage)': {
    // A transfer or progressive line with a die per stage. Tooling scales with
    // the number of draws, which is what the depth-to-width rule is really
    // warning about — every redraw is another station to buy and to run.
    machineRate: 105, operators: 0.5, cavities: 1, utilisation: 0.70, scrapPct: 0.04,
    setupHr: 3.0, batch: 5000, toolLife: 700_000,
    cycleBase: 25, cyclePerKg: 10, toolingBase: 95_000, toolingPerKg: 45_000,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.08, returnsRecovery: 0.92,
  },
  'Metal Spinning': {
    // A mandrel and a roller. The tooling is one turned mandrel, which is why
    // spinning wins at low volume and loses at high — the cycle is long and it
    // is one operator per machine.
    machineRate: 70, operators: 1.0, cavities: 1, utilisation: 0.60, scrapPct: 0.04,
    setupHr: 1.5, batch: 200, toolLife: 200_000,
    cycleBase: 90, cyclePerKg: 40, toolingBase: 6_000, toolingPerKg: 2_500,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.10, returnsRecovery: 0.90,
  },
  'Cold Heading / Upsetting': {
    // The cheapest metal-forming process per part that exists, and the reason
    // fasteners are not machined: multi-station machines running hundreds of
    // parts a minute off coil, with near-zero material loss.
    machineRate: 60, operators: 0.25, cavities: 1, utilisation: 0.95, scrapPct: 0.02,
    setupHr: 2.5, batch: 20000, toolLife: 1_000_000,
    cycleBase: 3, cyclePerKg: 2, toolingBase: 12_000, toolingPerKg: 5_000,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.03, returnsRecovery: 0.92,
  },
  'Open-Die Forging': {
    // Flat tools and a manipulator. No die cavity to pay for, and a machining
    // allowance measured in centimetres — the mass is in the cost whether it
    // ends up in the part or in the swarf, which is what `utilisation` carries.
    machineRate: 110, operators: 2.0, cavities: 1, utilisation: 0.45, scrapPct: 0.04,
    setupHr: 1.5, batch: 50, toolLife: 500_000,
    cycleBase: 180, cyclePerKg: 45, toolingBase: 6_000, toolingPerKg: 2_000,
    families: ['ferrous', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.25, returnsRecovery: 0.90,
  },
  'Tube Bending': {
    // Priced, and deliberately NOT judged: see PROCESS_TO_DFM_FAMILY, where it
    // is the one shaping process routed to no rule family because tube
    // recognition is not built. A CNC bender with one tool set per radius.
    machineRate: 70, operators: 0.6, cavities: 1, utilisation: 0.75, scrapPct: 0.04,
    setupHr: 1.0, batch: 500, toolLife: 300_000,
    cycleBase: 35, cyclePerKg: 25, toolingBase: 9_000, toolingPerKg: 2_000,
    families: ['ferrous', 'aluminium', 'copper'],
    finishPct: 0.06, returnsRecovery: 0.92,
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
    // electricalsteel added Sept 2026: die-less fibre-laser blanking of
    // laminations is the standard prototype and low-volume route, and the
    // tooling-free/high-cycle trade against a progressive die is exactly what a
    // volume-sensitivity comparison is for.
    families: ['ferrous', 'aluminium', 'electricalsteel'],
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
  // ── The permanent-mould and specialist casting family ──────────────────────
  //
  // Each of these was reachable only by mis-selecting its nearest neighbour, so
  // a wheel rim was priced as gravity die and a structural node as plain HPDC.
  // Every parameter below is set RELATIVE to a modelled neighbour with the
  // physical reason stated, not sampled from a quotation the tool has never
  // seen — the same discipline the rest of this table follows.
  'Low-Pressure Die Casting': {
    // Bottom-fed from a sealed furnace at 0.3-1.5 bar. Against gravity die: the
    // same permanent mould (so similar tooling), better yield because the riser
    // IS the fill tube and drains back, and a LONGER cycle because the fill is
    // deliberately slow and the pressure is held through solidification.
    // utilisation is METAL YIELD here, and it is the whole commercial case for
    // LPDC: the fill tube is the feeder and drains back into the furnace, so
    // there is no riser to cut off and remelt. Copying gravity's 0.65 would have
    // erased the one thing that makes the route worth quoting.
    machineRate: 90, operators: 0.6, cavities: 1, utilisation: 0.85, scrapPct: 0.04,
    setupHr: 3.0, batch: 1500, toolLife: 120_000,
    cycleBase: 55, cyclePerKg: 11, toolingBase: 85_000, toolingPerKg: 50_000,
    families: ['aluminium', 'magnesium'],
    finishPct: 0.08, returnsRecovery: 0.92,
  },
  'Squeeze Casting': {
    // Poured then pressurised through solidification on a hydraulic press. Die
    // cost and press rate above HPDC because the tonnage is held for seconds
    // rather than a fraction of one; scrap low because the pressure closes
    // shrinkage porosity, which is the entire reason to choose it.
    // Yield high because the applied pressure feeds solidification shrinkage —
    // that is what replaces the riser.
    machineRate: 120, operators: 0.7, cavities: 1, utilisation: 0.80, scrapPct: 0.04,
    setupHr: 3.5, batch: 1200, toolLife: 100_000,
    cycleBase: 60, cyclePerKg: 14, toolingBase: 110_000, toolingPerKg: 70_000,
    families: ['aluminium'],
    finishPct: 0.10, returnsRecovery: 0.92,
  },
  'Semi-Solid Casting (Thixo/Rheo)': {
    // Injected as a slurry, not a liquid. Laminar fill means near-zero trapped
    // gas, so the part is heat-treatable and weldable — but the slug/slurry
    // preparation is an extra process step and the machines are fewer, which is
    // where the rate goes.
    // Laminar fill needs less overflow than a turbulent HPDC shot, so yield sits
    // above HPDC's 0.60 without approaching LPDC's gravity-fed return.
    machineRate: 140, operators: 0.6, cavities: 1, utilisation: 0.68, scrapPct: 0.04,
    setupHr: 3.5, batch: 1500, toolLife: 120_000,
    cycleBase: 45, cyclePerKg: 9, toolingBase: 120_000, toolingPerKg: 75_000,
    families: ['aluminium', 'magnesium'],
    finishPct: 0.08, returnsRecovery: 0.90,
  },
  'Vacuum-Assisted Die Casting': {
    // HPDC with the cavity evacuated before the shot. Same machine class and
    // same die, plus the vacuum block, valve and its maintenance — so tooling
    // and rate sit just above HPDC and the scrap sits below it.
    // Same gating and overflow geometry as HPDC — the vacuum changes the gas in
    // the cavity, not the runner system — so yield tracks HPDC's 0.60.
    machineRate: 110, operators: 0.5, cavities: 1, utilisation: 0.60, scrapPct: 0.04,
    setupHr: 3.5, batch: 1500, toolLife: 140_000,
    cycleBase: 38, cyclePerKg: 6.5, toolingBase: 110_000, toolingPerKg: 70_000,
    families: ['aluminium', 'magnesium'],
    finishPct: 0.09, returnsRecovery: 0.90,
    clampTPerCm2: 0.7,
    machineTiers: [
      { maxClampT: 400, rate: 85 }, { maxClampT: 800, rate: 110 }, { maxClampT: 1200, rate: 150 },
      { maxClampT: 1800, rate: 205 }, { maxClampT: 2700, rate: 275 }, { maxClampT: 99999, rate: 365 },
    ],
  },
  'Shell Mould Casting': {
    // Resin-bonded sand cured against a heated metal pattern. Against green
    // sand: a real pattern cost instead of a cheap one, resin sand instead of
    // green sand, and in exchange a better finish and a tighter tolerance —
    // which is why it survives on smaller, more accurate parts.
    // Yield above green sand (0.55): a shell mould feeds a smaller, better-placed
    // riser because the resin shell chills faster than a rammed green-sand mould.
    machineRate: 65, operators: 1.0, cavities: 1, utilisation: 0.62, scrapPct: 0.05,
    setupHr: 2.5, batch: 800, toolLife: 80_000,
    cycleBase: 40, cyclePerKg: 10, toolingBase: 32_000, toolingPerKg: 20_000,
    families: ['castiron', 'ferrous', 'aluminium', 'copper'],
    finishPct: 0.14, returnsRecovery: 0.90,
  },
  'Centrifugal Casting': {
    // Poured into a mould spinning at 200-2000 rpm. There is no core and no
    // riser — the bore is formed by rotation and the dross collects on the
    // inside diameter to be machined away — so tooling is cheap and the yield
    // penalty lands in the machining allowance rather than in scrap.
    // No gating and no riser at all — rotation feeds the casting — so the poured
    // mass is close to the finished mass. What is lost is machined off the bore,
    // and that belongs in the machining allowance, not in the metal yield.
    machineRate: 75, operators: 1.0, cavities: 1, utilisation: 0.80, scrapPct: 0.05,
    setupHr: 2.0, batch: 400, toolLife: 60_000,
    cycleBase: 50, cyclePerKg: 10, toolingBase: 20_000, toolingPerKg: 9_000,
    families: ['ferrous', 'castiron', 'copper', 'aluminium'],
    finishPct: 0.18, returnsRecovery: 0.90,
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
  // ── Plastics beyond injection moulding, and the powder/additive routes ────
  'Thermoforming': {
    // One tool face, low pressure, and a trim operation afterwards. The tooling
    // is a fraction of an injection mould, which is why it wins at low volume
    // and on large panels an injection press could not hold.
    machineRate: 55, operators: 0.8, cavities: 1, utilisation: 0.70, scrapPct: 0.08,
    setupHr: 1.0, batch: 500, toolLife: 200_000,
    cycleBase: 45, cyclePerKg: 30, toolingBase: 9_000, toolingPerKg: 4_000,
    families: ['plastic'],
    finishPct: 0.15, returnsRecovery: 0.60,
  },
  'Rotational Moulding': {
    // The longest cycle of any plastics route: the whole mould is heated and
    // cooled with the part inside it. Tooling is cheap sheet or cast aluminium.
    machineRate: 45, operators: 1.0, cavities: 1, utilisation: 0.60, scrapPct: 0.05,
    setupHr: 1.5, batch: 100, toolLife: 100_000,
    cycleBase: 900, cyclePerKg: 240, toolingBase: 12_000, toolingPerKg: 5_000,
    families: ['plastic'],
    finishPct: 0.10, returnsRecovery: 0.60,
  },
  'Powder Metallurgy (Press & Sinter)': {
    // Near-net at very high rate off a compaction press, then a sintering belt.
    // Material utilisation is the headline: what is pressed is what ships.
    machineRate: 70, operators: 0.3, cavities: 1, utilisation: 0.97, scrapPct: 0.03,
    setupHr: 2.5, batch: 10000, toolLife: 500_000,
    cycleBase: 6, cyclePerKg: 12, toolingBase: 35_000, toolingPerKg: 15_000,
    families: ['ferrous', 'copper'],
    finishPct: 0.06, returnsRecovery: 0.80,
  },
  'Metal Injection Moulding (MIM)': {
    // An injection mould plus debinding and sintering — days of furnace time
    // per batch, and a feedstock that costs several times the base powder.
    machineRate: 85, operators: 0.5, cavities: 4, utilisation: 0.85, scrapPct: 0.05,
    setupHr: 3.0, batch: 20000, toolLife: 1_000_000,
    cycleBase: 25, cyclePerKg: 60, toolingBase: 55_000, toolingPerKg: 60_000,
    families: ['ferrous', 'titanium', 'copper'],
    finishPct: 0.08, returnsRecovery: 0.70,
  },
  'Laser Powder Bed Fusion (DMLS/SLM)': {
    // Priced by machine-hour and build height, not by part. Tooling is zero,
    // which is the whole proposition — and the piece price never falls with
    // volume, which is the whole limitation.
    machineRate: 95, operators: 0.35, cavities: 1, utilisation: 0.80, scrapPct: 0.05,
    setupHr: 3.0, batch: 20, toolLife: 5_000_000,
    cycleBase: 600, cyclePerKg: 9000, toolingBase: 0, toolingPerKg: 0,
    families: ['ferrous', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.30, returnsRecovery: 0.50,
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
  // ── The machining split ───────────────────────────────────────────────────
  //
  // `Machining (CNC)` priced a turned shaft, a wire-cut die plate, a gun-drilled
  // manifold and a broached spline at one rate. They differ by more than an
  // order of magnitude in cycle time per part and by two in tooling.
  'Turning (CNC)': {
    // A lathe is cheaper per hour than a machining centre and far faster per
    // part on a round component: one setup, one axis of rotation, and bar feed
    // instead of a fixture.
    machineRate: 65, operators: 0.3, cavities: 1, utilisation: 0.80, scrapPct: 0.02,
    setupHr: 1.0, batch: 500, toolLife: 5_000_000,
    cycleBase: 90, cyclePerKg: 500, toolingBase: 1_500, toolingPerKg: 0,
    families: ['ferrous', 'castiron', 'aluminium', 'copper', 'titanium', 'plastic'],
    finishPct: 0.04, returnsRecovery: 0.85,
  },
  'Wire EDM': {
    // Slow, unattended, and priced by the hour of spark time. The machine runs
    // lights-out, so the operator load is a fraction of a machining centre's —
    // but the cut rate is measured in square millimetres per minute.
    machineRate: 75, operators: 0.15, cavities: 1, utilisation: 0.85, scrapPct: 0.01,
    setupHr: 1.5, batch: 50, toolLife: 5_000_000,
    cycleBase: 300, cyclePerKg: 1800, toolingBase: 800, toolingPerKg: 0,
    families: ['ferrous', 'aluminium', 'copper', 'titanium'],
    finishPct: 0.02, returnsRecovery: 0.85,
  },
  'Deep-Hole / Gun Drilling': {
    // A dedicated machine with high-pressure through-coolant. The cost is in the
    // machine and the cycle, not in tooling — one gun drill per diameter.
    machineRate: 95, operators: 0.4, cavities: 1, utilisation: 0.75, scrapPct: 0.03,
    setupHr: 1.5, batch: 200, toolLife: 2_000_000,
    cycleBase: 150, cyclePerKg: 300, toolingBase: 2_500, toolingPerKg: 0,
    families: ['ferrous', 'castiron', 'aluminium', 'titanium', 'copper'],
    finishPct: 0.05, returnsRecovery: 0.85,
  },
  'Broaching': {
    // The inverse of wire EDM: a very expensive tool and a cycle measured in
    // seconds. A broach is worth cutting only when the volume pays for it, which
    // is exactly the trade-off the route table exists to show.
    machineRate: 70, operators: 0.4, cavities: 1, utilisation: 0.80, scrapPct: 0.02,
    setupHr: 1.5, batch: 2000, toolLife: 250_000,
    cycleBase: 15, cyclePerKg: 40, toolingBase: 18_000, toolingPerKg: 3_000,
    families: ['ferrous', 'castiron', 'aluminium', 'copper'],
    finishPct: 0.03, returnsRecovery: 0.85,
  },
  'Extrusion': {
    machineRate: 90, operators: 0.5, cavities: 1, utilisation: 0.85, scrapPct: 0.03,
    setupHr: 1.5, batch: 8000, toolLife: 2_000_000,
    cycleBase: 2, cyclePerKg: 0.5, toolingBase: 25_000, toolingPerKg: 0,
    families: ['aluminium', 'copper'],
  },
  // ── E-drive conversion routes ─────────────────────────────────────────────
  // Cycle times are per STATOR (or per rotor), not per kg of a generic part:
  // a hairpin line forms/inserts/twists/welds a full slot set, so cycleBase
  // carries the fixed handling and cyclePerKg scales with the copper mass.
  'Hairpin Winding (form, insert, weld)': {
    machineRate: 185, operators: 0.6, cavities: 1, utilisation: 0.75, scrapPct: 0.03,
    setupHr: 2.5, batch: 5000, toolLife: 20000000,
    cycleBase: 30, cyclePerKg: 12, toolingBase: 450000, toolingPerKg: 18000,
    families: ['copper'],
  },
  'Coil Winding (needle/flyer, round wire)': {
    machineRate: 120, operators: 0.5, cavities: 1, utilisation: 0.72, scrapPct: 0.025,
    setupHr: 2, batch: 4000, toolLife: 15000000,
    cycleBase: 40, cyclePerKg: 22, toolingBase: 180000, toolingPerKg: 9000,
    families: ['copper'],
  },
  // Magnets are usually a bought part; this models the supplier's own route so
  // a magnet line in a quote can be judged rather than accepted.
  'Magnet Production (sinter, grind, coat)': {
    machineRate: 95, operators: 0.5, cavities: 1, utilisation: 0.68, scrapPct: 0.08,
    setupHr: 2, batch: 20000, toolLife: 8000000,
    cycleBase: 8, cyclePerKg: 26, toolingBase: 60000, toolingPerKg: 4000,
    families: ['magnet'],
  },
  'Vacuum Pressure Impregnation (VPI)': {
    machineRate: 70, operators: 0.3, cavities: 4, utilisation: 0.65, scrapPct: 0.01,
    setupHr: 1, batch: 2000, toolLife: 50000000,
    cycleBase: 45, cyclePerKg: 6, toolingBase: 40000, toolingPerKg: 1500,
    families: ['copper', 'electricalsteel', 'plastic'],
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
    // electricalsteel added Sept 2026: stress-relief annealing after blanking is
    // standard practice on lamination stacks — cutting work-hardens the slot
    // edge and raises core loss, and the anneal is a merchant batch-furnace
    // operation like any other. Its absence made a real, commonly-proposed
    // lamination lever unpriceable.
    families: ['ferrous', 'castiron', 'aluminium', 'titanium', 'copper', 'electricalsteel'],
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
// Share of a catalogue machine-hour rate that is electricity, so the rest is
// capital and maintenance. Stated assumption; the sensitivity is small (a 2x
// energy-price spread moves the machine rate ~18% at this share).
const ENERGY_SHARE = 0.18;

// Processes whose cycle is set by REMOVING metal. Everything else (pressing,
// casting, moulding, joining, coating) has a cycle governed by the tool, the
// die or the line, not by how the material cuts.
const CUTTING_PROCESSES = new Set([
  'Machining (CNC)', 'Turning (CNC)', 'Machining (secondary ops)',
  'Deep-Hole / Gun Drilling', 'Broaching', 'Grinding (finish)',
]);

/**
 * Cycle multiplier from machinability.
 *
 * The constants are the roughing-MRR table in machining-feature-cost.mjs —
 * already in this repo, with its own provenance — not a new fit to these
 * fixtures. What needed a decision is the REFERENCE the multiplier is 1 at,
 * and it is taken from the table rather than chosen to suit a benchmark: that
 * table states its own baseline in its own comment, "drillFactor (relative to
 * steel = 1.0)". Steel is therefore the reference here too. A titanium part
 * costs more than a steel one and an aluminium part less, which is the
 * physical fact the mass engine could not express.
 *
 * Only PART of a machining cycle is metal removal. Approach moves, rapids,
 * tool changes, probing and handling are set by the path and the machine, not
 * by the alloy. REMOVAL_SHARE is the fraction that scales.
 *
 * Three formulations were measured on both fixture sets before this one was
 * kept — the held-out set decides, because it is the honest one:
 *
 *   whole cycle × MRR ratio      cal 93.8%/12.1%   held 92.9%/15.9%   div 1.32
 *   REMOVAL_SHARE 0.5 (kept)     cal 93.8%/11.0%   held 92.9%/15.2%   div 1.37
 *   cyclePerKg term only         cal 87.5%/13.8%   held 92.9%/16.2%   div 1.17
 *
 * The last is the more obvious split — cycleBase looks like fixed time — and
 * it is the weakest, because the catalogue's cycleBase is NOT pure fixed
 * time: it was fitted to whole parts and carries removal content with it.
 * Applying the share to the total is therefore the better model OF THIS
 * CATALOGUE. Sensitivity is mild: 0.4 to 0.6 moves a titanium part ±15%.
 *
 * Centring on the geometric mean of the process's compatible families was also
 * measured and rejected: calibrated MAPE 8.8% → 19.1% for no held-out gain.
 * Choosing the anchor to suit a benchmark would be fitting to fixtures, which
 * is what benchmark/cost-divergence.mjs exists to catch.
 *
 * Bounded to [0.5, 4] so one table entry cannot dominate an estimate, and 1
 * for every non-cutting process.
 */
const REMOVAL_SHARE = 0.5;

export function cuttingMachinabilityMult(materialKey, family, processKey) {
  if (!CUTTING_PROCESSES.has(processKey)) return 1;
  const m = machinabilityFor(materialKey, family);
  const base = MACHINABILITY.ferrous.roughMRR;   // the table's stated reference
  const mrr = Number(m?.roughMRR) > 0 ? Number(m.roughMRR) : base;
  return Math.min(4, Math.max(0.5, REMOVAL_SHARE * (base / mrr) + (1 - REMOVAL_SHARE)));
}
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
  const commercialPctBase = library?.constants?.commercialPct ?? COMMERCIAL_PCT;
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
  // Machinability multiplier on cycle time — cutting processes only.
  const machinabilityMult = cuttingMachinabilityMult(material, mat.family, process);
  let cycleSec;
  if (proc.coolingKSecPerMm2 && wallMm > 0) {
    // Cooling dominates thin-wall cycles, but fill + screw recovery still scale
    // with shot mass — floor the wall² model at 40% of the mass model so a heavy
    // thin-wall part (3 kg @ 2 mm) isn't costed like a 30 g clip.
    const coolingCycle = proc.cycleBase + proc.coolingKSecPerMm2 * wallMm * wallMm;
    const massCycle = proc.cycleBase + proc.cyclePerKg * w;
    cycleSec = Math.max(coolingCycle, 0.4 * massCycle) * cycleMult * tol.cycle * finMult;
  } else {
    // MACHINABILITY (R-31). Cycle time was linear in mass and blind to
    // material, so 0.35 kg of titanium and 0.35 kg of aluminium both machined
    // in 205 s — and the held-out set recorded the consequence: a Ti-6Al-4V
    // machined fitting at −46%. The multiplier imports the roughing-MRR table
    // that already lives in machining-feature-cost.mjs with its own
    // provenance, rather than fitting a new constant to the fixtures.
    // MACHINABILITY (R-31). Cycle was linear in mass and blind to material, so
    // 0.35 kg of titanium and 0.35 kg of aluminium both machined in 205 s —
    // and the held-out set recorded the consequence: a Ti-6Al-4V fitting at
    // −46%. The multiplier already carries the removal share (see its doc);
    // it applies to the whole cycle because the catalogue's cycleBase is not
    // pure fixed time.
    cycleSec = (proc.cycleBase + proc.cyclePerKg * w) * cycleMult * tol.cycle * finMult * machinabilityMult;
  }
  const secPerPart = cycleSec / proc.cavities;
  const hrPerPart = secPerPart / 3600;
  // Machine-size selection: with a projected area, pick the tonnage-tiered rate
  // (a 2,500 t HPDC cell is not a 400 t cell). Without geometry, keep the flat
  // catalogue rate (status quo — benchmark unaffected).
  // The machine rate now MOVES WITH THE REGION (R-27). A machine-hour is
  // capital + maintenance + energy; the first two scale with the region's
  // capital index and the third with its electricity price. ENERGY_SHARE is
  // the fraction of a catalogue machine rate that is electricity — a stated
  // modelling assumption, not a measurement, and the same for every process
  // until per-process kW draw is threaded through (carbon.mjs has the kWh/kg
  // figures that would refine it).
  const regionMachineMult = Number(reg.machineMult) > 0 ? Number(reg.machineMult) : 1;
  const refEnergy = (REG[REGION_REFERENCE] ?? REGIONS[REGION_REFERENCE]).energyEurPerKwh ?? 0.20;
  const regionEnergy = Number(reg.energyEurPerKwh) > 0 ? Number(reg.energyEurPerKwh) : refEnergy;
  const energyRatio = regionEnergy / refEnergy;
  const regionRateMult = regionMachineMult * (1 - ENERGY_SHARE) + regionMachineMult * ENERGY_SHARE * energyRatio;
  let machineRate = proc.machineRate * machineMult * regionRateMult;
  let machineTier = null;
  const projArea = Number(input.projectedAreaCm2) || 0;
  if (Array.isArray(proc.machineTiers) && projArea > 0) {
    const tonnage = projArea * (proc.clampTPerCm2 ?? 0.5) * proc.cavities;
    const tier = proc.machineTiers.find(t => tonnage <= t.maxClampT) || proc.machineTiers[proc.machineTiers.length - 1];
    machineRate = tier.rate * machineMult * regionRateMult;
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
  // Freight and receiving depend on WHERE the part is made relative to where
  // it is consumed. A flat 5% could express neither side of the low-cost-
  // country trade (R-28); the region's own figure is used when it has one.
  const commercialPct = Number(reg.commercialPct) > 0 ? Number(reg.commercialPct) : commercialPctBase;
  const commercialCost = (materialCost + conversion + toolingCost + overheadCost) * commercialPct;
  const worksCost = materialCost + conversion + toolingCost + overheadCost + commercialCost;
  const sgaCost = worksCost * reg.sgaPct;
  const baseTotal = worksCost + sgaCost;

  // Learned calibration: multiply the deterministic estimate by the correction
  // factor fitted from the user's real quotes for this process. Scales every
  // breakdown line equally, so composition (pct) is unchanged — only the level
  // moves toward the user's actual price history. cf = 1 when uncalibrated.
  const cf = calibration ? calibrationFactor(calibration, process, { region, annualVolume }) : 1;
  const total = baseTotal * cf;
  // Last line of defence: never return a non-finite price (would serialise to
  // null/NaN and render as a blank figure with no error).
  if (!Number.isFinite(total)) throw new Error('Costing produced a non-finite total — check inputs and rate library.');
  const sv = x => round(x * cf);                                   // scaled value
  const pct = x => (baseTotal > 0 ? round((x / baseTotal) * 100, 1) : 0);

  return {
    inputs: { material, process, weightKg: w, annualVolume: vol, region, programYears },
    calibration: cf !== 1
      ? { factor: round(cf, 3), applied: true, clamped: isClamped(cf), source: calibration ? calibrationSource(calibration, process, { region, annualVolume }) : 'none' }
      : {
          factor: 1,
          // A corpus that CONFIRMS the model is a result, not an absence
          // (review R-32): applied stays false because nothing moved, but the
          // source says the quotes were there and agreed.
          applied: false,
          clamped: false,
          source: calibration && Number(calibration.n) > 0 ? 'fitted-neutral' : 'none',
        },
    drivers: {
      pricePerKg: round(pricePerKg, 3),
      inputMassKg: round(inputMass, 3),
      cycleSecPerPart: round(secPerPart, 1),
      ...(machinabilityMult !== 1 ? { machinabilityMult: round(machinabilityMult, 2) } : {}),
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

  const cf = calibration ? calibrationFactor(calibration, route[0], { region, annualVolume }) : 1;
  const total = baseTotal * cf;
  if (!Number.isFinite(total)) throw new Error('Route costing produced a non-finite total — check inputs.');
  const sv = (x) => round(x * cf);

  return {
    inputs: { material, route: ops.map(o => o.key), weightKg: w, annualVolume: vol, region, programYears },
    calibration: cf !== 1
      ? { factor: round(cf, 3), applied: true, clamped: isClamped(cf), source: calibration ? calibrationSource(calibration, route[0], { region, annualVolume }) : 'none' }
      : { factor: 1, applied: false, clamped: false, source: calibration && Number(calibration.n) > 0 ? 'fitted-neutral' : 'none' },
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
    const modelMult = 1 + noiseUniform(rng, MODEL_DISPERSION);
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
 * Systematic model-dispersion term, measured — not chosen.
 *
 * This is the half-width of the uniform term applied to the total, standing for
 * everything the parametric model does not represent: un-modelled part
 * complexity, supplier efficiency, negotiated margin.
 *
 * It used to be 0.13, and the August 2026 audit found where that came from. The
 * residual half-spread ((p90−p10)/2) of the CALIBRATED fixture set is 13.4% —
 * the constant matched the fixtures the engine had been tuned on, so the band
 * measured 87.5% coverage there and collapsed to **35.7%** on held-out parts,
 * whose residual half-spread is **33.5%**. The uncertainty model had been
 * over-fitted in exactly the way the cost model was.
 *
 * A user's part is an unseen part, so the held-out residuals are the honest
 * basis. Note the distinction that makes this legitimate: tuning a *cost*
 * constant to fixture prices is over-fitting and the benchmark files forbid it.
 * Calibrating an *uncertainty* model to observed residuals is the only correct
 * way to size one — the residuals ARE the measurement.
 *
 * Derivation: held-out residual half-spread 33.5%. A uniform ±a has its p10–p90
 * at ±0.8a, and the input-noise terms above already contribute part of the
 * spread, so a is set from the residual spread and then verified empirically —
 * `benchmark/cost-run.mjs` reports measured band coverage and gates on it.
 */
export const MODEL_DISPERSION = 0.34;

/**
 * Monte-Carlo simulation of should-cost uncertainty.
 * Sources of variance modelled:
 *   – commodity price ±20% (metals swing that much year-on-year),
 *   – machine rate ±12%, cycle time ±15%, scrap ±3pp (input-cost uncertainty),
 *   – MODEL_DISPERSION on the total (see above) — measured from held-out
 *     residuals, not asserted.
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
    const modelMult = 1 + noiseUniform(rng, MODEL_DISPERSION);
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
