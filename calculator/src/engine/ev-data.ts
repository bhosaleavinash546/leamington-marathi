/**
 * EV propulsion data — battery pack and e-motor should-cost (Oct 2026).
 *
 * DATA ONLY. Every figure says where it comes from: a cited market source, or `ESTIMATE` (an engineering
 * typical, there to be replaced by a quote or plant data). Metals the library already prices (copper,
 * aluminium, electrical steel, shaft steel, die-cast alloy) are NOT repeated here — the modules read them
 * from the active rate book, so they follow the costing country. See docs/ev/battery-emotor-build-2026-10.md.
 *
 * Sources (read 7 Oct 2026; the publishers' own pages are blocked from this build environment, so the
 * figures are as reported by the cited secondary coverage):
 *  [BNEF25] BloombergNEF, 2025 Lithium-Ion Battery Price Survey (Dec 2025): average pack $108/kWh; LFP packs
 *           $81/kWh, NMC packs $128/kWh; BEV packs $99/kWh with BEV cells $79/kWh = 80 % of the pack.
 *           https://about.bnef.com/insights/clean-transport/lithium-ion-battery-pack-prices-fall-to-108-per-kilowatt-hour
 *           (as reported by https://www.ess-news.com/?p=7552 and https://www.energy-storage.news/?p=91801)
 *  [SMM26]  SMM rare-earth weekly reviews, 2026: NdFeB blank 45SH(Ce) quoted ¥250–270/kg and, in a later
 *           review, ¥320–340/kg; 40H ¥200–210 → ¥270–280/kg. https://news.metal.com/en/newscontent/104008899
 *  [SUN26]  SunSirs, 12 Feb 2026: terbium oxide ¥6,650,000–6,700,000/t; dysprosium oxide ¥1,490,000–1,500,000/t.
 *           https://www.sunsirs.com/uk/detail_news-30628.html
 *  [EVR]    1–2 kg NdFeB per PMSM traction motor (industry benchmark). https://evreporter.com/?p=14125
 */

// ─── Battery cells ───────────────────────────────────────────────────────────

export type CellChemistry = 'LFP' | 'LMFP' | 'NMC' | 'NCA';
export type CellFormat = 'prismatic' | 'pouch' | 'cylindrical_4680' | 'cylindrical_2170';

/** BEV cells were 80 % of the BEV pack in 2025 [BNEF25]. */
export const BNEF_CELL_SHARE_OF_PACK = 0.80;
/** BEV pack minus BEV cell, $/kWh [BNEF25]: $99 − $79 = $20/kWh of pack integration (BMS, housing, thermal, HV, assembly). */
export const BNEF_PACK_INTEGRATION_USD_PER_KWH = 99 - 79;

/**
 * Bought-in cell price, USD per kWh, global average 2025. Derived from [BNEF25] as the chemistry's pack price ×
 * the BEV cell share (80 %): LFP $81 × 0.8 = $64.8; NMC $128 × 0.8 = $102.4. LMFP and NCA have no survey line:
 * LMFP = LFP + 10 % (manganese-doped LFP) and NCA = NMC — both ESTIMATE. A quote replaces it (the form field).
 */
export const CELL_PRICE_USD_PER_KWH: Record<CellChemistry, { usd: number; basis: string }> = {
  LFP: { usd: 64.8, basis: 'BNEF 2025 survey: LFP pack $81/kWh × BEV cell share 80 % [BNEF25]' },
  LMFP: { usd: 71.3, basis: 'ESTIMATE: LFP cell + 10 % (no survey line for LMFP)' },
  NMC: { usd: 102.4, basis: 'BNEF 2025 survey: NMC pack $128/kWh × BEV cell share 80 % [BNEF25]' },
  NCA: { usd: 102.4, basis: 'ESTIMATE: as NMC (no survey line for NCA)' },
};

/** Nominal cell voltage, V — chemistry-typical (engineering reference values). */
export const CELL_NOMINAL_V: Record<CellChemistry, number> = { LFP: 3.2, LMFP: 3.7, NMC: 3.65, NCA: 3.6 };

/**
 * Per cell-format integration figures — all ESTIMATE (engineering typical):
 *  - busbarGPerJoint: aluminium busbar / contact-system mass per cell connection, g
 *  - weldSecPerJoint: laser weld time per joint, s (scanner optics; cylindrical cells take a faster, smaller weld)
 *  - stackSecPerCell: pick, place and compress per cell, s
 */
export const CELL_FORMAT: Record<CellFormat, { label: string; busbarGPerJoint: number; weldSecPerJoint: number; stackSecPerCell: number }> = {
  prismatic: { label: 'Prismatic', busbarGPerJoint: 12, weldSecPerJoint: 2.5, stackSecPerCell: 6 },
  pouch: { label: 'Pouch', busbarGPerJoint: 8, weldSecPerJoint: 2.0, stackSecPerCell: 7 },
  cylindrical_4680: { label: 'Cylindrical 4680', busbarGPerJoint: 4, weldSecPerJoint: 1.2, stackSecPerCell: 2.5 },
  cylindrical_2170: { label: 'Cylindrical 2170', busbarGPerJoint: 1.5, weldSecPerJoint: 0.8, stackSecPerCell: 1.2 },
};

/**
 * Pack integration parts, UK £ — ESTIMATE unless stated (engineering typical for 2026 automotive volumes;
 * replace with quotes). Basis says how each moves by country (regional-services.ts).
 */
export const PACK_PARTS = {
  bmsMaster: { gbp: 45, basis: 'global' as const, note: 'BMS master controller board — ESTIMATE' },
  cmuBoard: { gbp: 18, basis: 'global' as const, note: 'cell monitoring board (12–18 channels) — ESTIMATE' },
  sensingPerChannel: { gbp: 1.2, basis: 'global' as const, note: 'cell contact system / FPC sensing per series channel — ESTIMATE' },
  mainContactor: { gbp: 22, basis: 'global' as const, note: 'HV main contactor, each — ESTIMATE' },
  prechargeCircuit: { gbp: 9, basis: 'global' as const, note: 'pre-charge contactor + resistor — ESTIMATE' },
  pyrofuse: { gbp: 18, basis: 'global' as const, note: 'pyrotechnic disconnect — ESTIMATE' },
  mainFuse: { gbp: 8, basis: 'global' as const, note: 'HV main fuse — ESTIMATE' },
  currentSensor: { gbp: 12, basis: 'global' as const, note: 'shunt / Hall current sensor — ESTIMATE' },
  serviceDisconnect: { gbp: 10, basis: 'global' as const, note: 'manual service disconnect — ESTIMATE' },
  hvConnectors: { gbp: 25, basis: 'global' as const, note: 'HV connector pair — ESTIMATE' },
  lvConnector: { gbp: 4, basis: 'global' as const, note: 'LV signal connector — ESTIMATE' },
  ventValve: { gbp: 3, basis: 'global' as const, note: 'pressure-equalising vent valve — ESTIMATE' },
  coolantConnectors: { gbp: 6, basis: 'global' as const, note: 'coolant inlet / outlet pair — ESTIMATE' },
  sealsFasteners: { gbp: 15, basis: 'global' as const, note: 'lid seal, fasteners — ESTIMATE' },
  moduleHardware: { gbp: 6, basis: { globalShare: 0.5, rest: 'process' as const }, note: 'module end / side plates + strap, per module — ESTIMATE' },
  /** Thermal interface (gap filler), £/kg and kg per m² of cooled floor. ESTIMATE. */
  gapFillerGbpPerKg: 12, gapFillerKgPerM2: 1.5,
  /** Thermal-runaway barrier (mica), £/m² per layer; two layers (above and below the cells). ESTIMATE. */
  micaGbpPerM2: 8,
  /** Structural adhesive / potting in a cell-to-pack design, kg per kWh and £/kg. ESTIMATE. */
  ctpAdhesiveKgPerKwh: 0.3, adhesiveGbpPerKg: 8,
};

/**
 * Enclosure and cold plate, per m² of pack footprint. Mass is ESTIMATE (typical automotive designs). The metal
 * is the library grade (follows the country); the conversion (extrude / stamp / weld / braze) is a process
 * service £ per kg, ESTIMATE.
 */
export const PACK_STRUCTURE = {
  aluminium: { kgPerM2: 14, materialId: 'mat-aa6082-sheet', conversionGbpPerKg: 2.5, label: 'Aluminium (extrusion frame + floor + lid)' },
  steel: { kgPerM2: 22, materialId: 'mat-dc01', conversionGbpPerKg: 1.2, label: 'Steel (stamped tray + lid)' },
  coldPlate: { kgPerM2: 4, materialId: 'mat-aa3003-sheet', conversionGbpPerKg: 4.0, label: 'Brazed aluminium cold plate' },
  busbarMaterialId: 'mat-al-busbar',
  /** Busbar stamping, plating and forming, £ per kg of busbar — ESTIMATE. */
  busbarConversionGbpPerKg: 3.0,
  interModuleCopperKgPerModule: 0.15,
  copperMaterialId: 'mat-c110-copper',
};

// ─── E-motor ─────────────────────────────────────────────────────────────────

export type MagnetGrade = '45SH' | '45UH_GBD' | '42EH_GBD';

/** CNY per GBP is read from the rate library (fx-gbp-cny); this is the magnet price build-up in CNY/kg. */
export const MAGNET_GRADES: Record<MagnetGrade, { label: string; blankCnyPerKg: number; tbMassFraction: number; basis: string }> = {
  '45SH': { label: 'N45SH (no heavy rare earth)', blankCnyPerKg: 295, tbMassFraction: 0,
    basis: 'SMM 2026 NdFeB blank 45SH(Ce) ¥250–340/kg across two weekly reviews — midpoint ¥295 [SMM26]' },
  '45UH_GBD': { label: 'N45UH, Tb grain-boundary diffused', blankCnyPerKg: 295, tbMassFraction: 0.004,
    basis: '45SH blank [SMM26] + 0.4 wt% Tb by grain-boundary diffusion (ESTIMATE content) at the Tb oxide price [SUN26]' },
  '42EH_GBD': { label: 'N42EH, Tb grain-boundary diffused', blankCnyPerKg: 295, tbMassFraction: 0.007,
    basis: '45SH blank [SMM26] + 0.7 wt% Tb by grain-boundary diffusion (ESTIMATE content) at the Tb oxide price [SUN26]' },
};
/** Terbium oxide, ¥/kg (¥6,650,000–6,700,000/t, 12 Feb 2026 [SUN26]); Tb4O7 is 85.0 % Tb by mass (4×158.93 / 747.7). */
export const TB_OXIDE_CNY_PER_KG = 6675;
export const TB_IN_OXIDE = 0.850;
/** Blank → finished traction magnet (slice / grind, coat, inspect, magnetise): + 30 % on the blank. ESTIMATE. */
export const MAGNET_FINISHING_UPLIFT = 0.30;
export const NDFEB_DENSITY = 7500;

/** E-motor bought-in parts, UK £ — ESTIMATE (engineering typical; replace with quotes). */
export const MOTOR_PARTS = {
  bearing: { gbp: 8, basis: 'global' as const, note: 'deep-groove ball bearing (EV-rated), each — ESTIMATE' },
  resolver: { gbp: 18, basis: 'global' as const, note: 'variable-reluctance resolver — ESTIMATE' },
  tempSensor: { gbp: 2, basis: 'global' as const, note: 'winding NTC, each — ESTIMATE' },
  slotLinerPerSlot: { gbp: 0.15, basis: 'global' as const, note: 'aramid / PET slot liner per slot — ESTIMATE' },
  hvTerminal: { gbp: 12, basis: 'global' as const, note: 'HV terminal block + phase leads — ESTIMATE' },
  sealsFasteners: { gbp: 6, basis: 'global' as const, note: 'seals, fasteners, end-cover gasket — ESTIMATE' },
  /** Impregnation resin, kg per kg of copper, and £/kg. ESTIMATE. */
  resinKgPerKgCopper: 0.08, resinGbpPerKg: 9,
  /** Induction rotor cage (die-cast aluminium) as a share of rotor lamination net mass. ESTIMATE. */
  cageMassFractionOfRotor: 0.25,
  /** Die-casting the cage into the rotor stack, £ per kg of cage — ESTIMATE. */
  cageConversionGbpPerKg: 3.0,
  /** EESM rotor: field copper as a share of stator copper, plus slip rings / brushes £. ESTIMATE. */
  eesmRotorCopperFraction: 0.35, slipRingGbp: 15,
};

/** Housing and shaft conversion (die-cast + machine; turn + grind + spline) £ per kg of part. ESTIMATE. */
export const MOTOR_STRUCTURE = {
  housingAlloyId: 'mat-a380', housingConversionGbpPerKg: 6.0, housingWallMm: 6, housingCastYield: 0.7,
  /** Bosses, flanges, cooling jacket and end bell on top of the plain shell — × 1.6, ESTIMATE. */
  housingFeatureFactor: 1.6,
  shaftSteelId: 'mat-steel-20mncr5', shaftConversionGbpPerKg: 9.0,
};

// ─── Line equipment (machine rate build-ups) ─────────────────────────────────

/**
 * Capex is ESTIMATE (engineering typical for an automotive-volume line, 2026). Rates are built like every library
 * machine — depreciation over 10 years, maintenance, energy, floor, indirect support, finance — so the country
 * book re-rates them (capex multiplier, local tariff) exactly as the rest of the library.
 */
export const EV_MACHINES: Array<{ id: string; label: string; capexGbp: number; kw: number; floorM2: number }> = [
  { id: 'bat-cell-ocv-tester', label: 'Cell incoming OCV / IR test station', capexGbp: 250_000, kw: 8, floorM2: 40 },
  { id: 'bat-module-stacking', label: 'Cell stacking + compression line', capexGbp: 3_500_000, kw: 120, floorM2: 400 },
  { id: 'bat-laser-weld', label: 'Busbar laser welding cell (scanner)', capexGbp: 1_200_000, kw: 60, floorM2: 80 },
  { id: 'bat-module-eol', label: 'Module end-of-line tester', capexGbp: 400_000, kw: 15, floorM2: 40 },
  { id: 'bat-dispense', label: 'Gap-filler / adhesive dispensing cell', capexGbp: 400_000, kw: 20, floorM2: 50 },
  { id: 'bat-pack-assembly', label: 'Pack assembly station (semi-automatic)', capexGbp: 600_000, kw: 30, floorM2: 150 },
  { id: 'bat-leak-test', label: 'Pack / coolant-circuit leak tester (helium)', capexGbp: 300_000, kw: 10, floorM2: 40 },
  { id: 'bat-pack-eol', label: 'Pack end-of-line tester (HiPot, isolation, BMS, charge / discharge)', capexGbp: 900_000, kw: 80, floorM2: 80 },
  { id: 'emot-lamination-press', label: 'High-speed lamination press (progressive die, 300 spm)', capexGbp: 2_500_000, kw: 150, floorM2: 250 },
  { id: 'emot-hairpin-line', label: 'Hairpin forming + insertion line', capexGbp: 4_000_000, kw: 90, floorM2: 300 },
  { id: 'emot-winding-machine', label: 'Round-wire winding + insertion machine', capexGbp: 900_000, kw: 30, floorM2: 80 },
  { id: 'emot-hairpin-weld', label: 'Hairpin twist + laser weld cell', capexGbp: 1_500_000, kw: 60, floorM2: 100 },
  { id: 'emot-impregnation', label: 'Trickle / VPI impregnation + cure line', capexGbp: 1_200_000, kw: 180, floorM2: 200 },
  { id: 'emot-rotor-line', label: 'Rotor magnet insertion + bonding + shaft press', capexGbp: 1_500_000, kw: 50, floorM2: 150 },
  { id: 'emot-balancing', label: 'Rotor balancing machine', capexGbp: 350_000, kw: 15, floorM2: 30 },
  { id: 'emot-assembly-line', label: 'Motor final assembly line (shrink-fit, bearings, resolver)', capexGbp: 1_800_000, kw: 80, floorM2: 250 },
  { id: 'emot-eol', label: 'Motor end-of-line tester (back-EMF, HiPot, partial discharge, NVH)', capexGbp: 900_000, kw: 120, floorM2: 80 },
];

/** Line-specific tooling, UK £ — ESTIMATE. Toolroom-weighted country basis (20 % traded, 80 % toolroom). */
export const EV_TOOLING = {
  packFixturesGbp: 600_000,          // stacking, welding, EOL adapters for one pack design
  laminationDieGbp: 350_000, laminationDieLifeStrokes: 50_000_000,
  hairpinToolsGbp: 250_000, motorFixturesGbp: 200_000,
};
