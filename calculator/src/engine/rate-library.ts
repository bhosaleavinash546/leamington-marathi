import type { RateLibrary, MachineRate, MachineRateBuildup } from './types.js';

export function computeMachineRateFromBuildup(b: MachineRateBuildup): number {
  const totalAnnual =
    b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
  return totalAnnual / (b.annualAvailableHours * b.machineUtilization);
}

function makeMachine(
  id: string,
  machineClass: string,
  b: MachineRateBuildup,
  region: string,
  sourceNote: string
): MachineRate {
  return {
    id,
    machineClass,
    buildup: b,
    computedRatePerHr: computeMachineRateFromBuildup(b),
    region,
    effectiveDate: '2026-06-14',
    sourceNote,
    confidence: 'Medium',
  };
}

// UK default rate library — all rates editable at runtime
export const DEFAULT_RATE_LIBRARY: RateLibrary = {
  version: '2.1.0',
  lastModified: '2026-06-16',

  materials: [
    // ── Machining ──────────────────────────────────────────────────────────
    {
      id: 'mat-al6061',
      grade: '6061-T6',
      category: 'Aluminium',
      pricePerKg: 3.62,
      scrapRecoveryPricePerKg: 0.55,
      densityKgPerM3: 2700,
      region: 'UK',
      effectiveDate: '2026-07',
      sourceNote: 'LME + UK processor premium, Jun 2026. Index-anchored 2026-07 refresh.',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel1045',
      grade: '1045',
      category: 'Carbon Steel',
      pricePerKg: 0.95,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2026-07',
      sourceNote: 'UK steel stockholder, Jun 2026. Index-anchored 2026-07 refresh.',
      confidence: 'Medium',
    },
    {
      id: 'mat-ss316l',
      grade: '316L',
      category: 'Stainless Steel',
      pricePerKg: 3.82,
      scrapRecoveryPricePerKg: 0.85,
      densityKgPerM3: 7990,
      region: 'UK',
      effectiveDate: '2026-07',
      sourceNote: 'UK stainless distributor, Jun 2026. Index-anchored 2026-07 refresh.',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel4140',
      grade: '4140',
      category: 'Alloy Steel',
      pricePerKg: 1.21,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2026-07',
      sourceNote: 'UK steel stockholder, Jun 2026. Index-anchored 2026-07 refresh.',
      confidence: 'Medium',
    },
    {
      id: 'mat-ti6al4v',
      grade: 'Ti-6Al-4V',
      category: 'Titanium',
      pricePerKg: 47.50,
      scrapRecoveryPricePerKg: 16.00,
      densityKgPerM3: 4430,
      region: 'UK',
      effectiveDate: '2026-07',
      sourceNote: 'Titanium distributor UK, Jun 2026. Index-anchored 2026-07 refresh.',
      confidence: 'Low',
    },
    {
      id: 'mat-virtual',
      grade: 'Virtual / Pass-through',
      category: 'Virtual',
      pricePerKg: 1.00,
      scrapRecoveryPricePerKg: 0.00,
      densityKgPerM3: 1000,
      region: 'UK',
      effectiveDate: '2026-06-14',
      sourceNote: 'Placeholder for directCost modules (painting, BIW, PCB, PCBA). Price is irrelevant — directCost overrides.',
      confidence: 'Medium',
    },
    /*
     * MACHINING STOCK PRICING BASIS (index-anchored, 2026-07). Delivered UK
     * small-lot bar/plate £/kg = LME/metal index → GBP + stockholder cut-to-
     * length premium. Al off LME $3,398/t; stainless off Ni/Cr surcharge;
     * carbon/alloy off UK stockholder; engineering-plastic stock off UK
     * distributor semi-finished (rod/sheet) list. Medium where index-anchored.
     */
    // ── Machining stock (extended metals) ──────────────────────────────────
    { id: 'mat-en8', grade: 'EN8 / 080M40 (Medium Carbon)', category: 'Carbon Steel', pricePerKg: 0.98, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. General medium-carbon machining bar — shafts, studs, general engineering.', confidence: 'Medium' },
    { id: 'mat-ss304-bar', grade: '304 Stainless Bar', category: 'Stainless Steel', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. General austenitic machining bar — fittings, shafts, food/chemical.', confidence: 'Medium' },
    { id: 'mat-ss303', grade: '303 Free-Machining Stainless Bar', category: 'Stainless Steel', pricePerKg: 3.70, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. Sulphur-added free-machining austenitic — high-volume turned parts, fasteners.', confidence: 'Medium' },
    { id: 'mat-al6082-bar', grade: '6082-T6 Aluminium Bar', category: 'Aluminium', pricePerKg: 3.55, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. Structural 6xxx machining bar/plate — brackets, jigs, structural parts.', confidence: 'Medium' },
    { id: 'mat-al2011', grade: '2011-T3 Free-Machining Al Bar', category: 'Aluminium', pricePerKg: 3.95, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2830, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. Free-machining Al-Cu-Pb — high-speed screw-machine parts, fittings.', confidence: 'Low' },
    { id: 'mat-brass-cz121', grade: 'CZ121 / CW614N Free-Machining Brass', category: 'Copper Alloy', pricePerKg: 7.00, scrapRecoveryPricePerKg: 3.00, densityKgPerM3: 8490, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. Standard free-machining brass bar — fittings, valve parts, connectors.', confidence: 'Low' },
    { id: 'mat-bronze-pb1', grade: 'PB1 Phosphor Bronze Bar', category: 'Copper Alloy', pricePerKg: 9.20, scrapRecoveryPricePerKg: 2.80, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 refresh. Phosphor bronze bar — bearings, bushes, worm wheels, high-load sliding.', confidence: 'Low' },
    // ── Machining stock (engineering plastics — machinable semi-finished) ──
    { id: 'mat-pom-c', grade: 'POM-C (Acetal / Delrin Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Acetal copolymer rod/sheet — precision gears, bushes, manifolds; excellent machinability.', confidence: 'Medium' },
    { id: 'mat-pa6-cast', grade: 'Nylon 6 (Cast PA6 Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Cast nylon rod/slab — wear pads, sprockets, rollers, guide rails.', confidence: 'Medium' },
    { id: 'mat-ptfe', grade: 'PTFE (Virgin Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 12.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 2170, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Virgin PTFE rod/sheet — seals, insulators, chemical/low-friction parts.', confidence: 'Low' },
    { id: 'mat-peek-stock', grade: 'PEEK (Unfilled Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 95.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Unfilled PEEK rod/plate — high-temp/chemical machined parts, medical, aerospace.', confidence: 'Low' },
    { id: 'mat-acrylic-cast', grade: 'Cast Acrylic (PMMA Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 4.80, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Cast acrylic sheet/rod — optical, signage, machined transparent parts.', confidence: 'Low' },
    { id: 'mat-uhmwpe', grade: 'UHMW-PE (Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Ultra-high-molecular-weight PE sheet — wear strips, chute liners, guides.', confidence: 'Low' },
    // ── Sheet Metal ────────────────────────────────────────────────────────
    // PRICING BASIS (index-anchored, refreshed 2026-07). Delivered UK small-lot
    // £/kg = mill index → GBP + stockholder/cut-to-length premium + grade premium.
    //   • Steel anchor: EU HRC €691/t (Fastmarkets, end-May 2026); CRC = HRC + ~€90/t
    //     ⇒ CRC ≈ €781/t. FX EUR→GBP 0.855 ⇒ CRC mill ≈ £668/t = £0.67/kg. UK
    //     stockholder small-lot delivered premium ≈ +£190/t ⇒ CR mild ≈ £0.86/kg.
    //   • Grade premium ladder over CR mild (£/kg): IF +0.09 · BH +0.19 · HSLA 340/420/550
    //     +0.28/0.38/0.48 · DP600/780/980/1000 +0.39/0.46/0.59/0.66 · MS1200/1300/1500
    //     +0.69/0.76/0.86 · 22MnB5 (PHS) +0.88 · AlSi-coat (Usibor) +0.20 · 3rd-gen ~+0.82.
    //   • Coating extra over CR base (£/kg): EG +0.06 · GI +0.19 · GA +0.23 · Zn-Ni +0.31 ·
    //     ZM +0.28 · tinplate +0.43.
    //   • Aluminium anchor: LME Al 3M $3,398/t (Jun 2026) + EU DDP premium ~$300/t; FX
    //     USD→GBP 0.787 ⇒ primary ≈ £2.9/kg; rolled auto sheet + conversion/small-lot
    //     ⇒ 5xxx/6xxx ≈ £3.2–3.7/kg, 7075 aerospace plate ≈ £6.8/kg.
    //   • Confidence: 'Medium' where anchored to a public index + standard premium;
    //     'Low' where the grade/alloy premium is estimated (exotic AHSS/PHS/3rd-gen).
    //   Sources: Fastmarkets EU HRC, LME Aluminium & EU duty-paid premium, MEPS Europe.
    { id: 'mat-dc01', grade: 'DC01', category: 'Mild Steel Sheet', pricePerKg: 0.86, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK CR mild sheet, delivered small-lot. Index-anchored: CRC €781/t → £0.67/kg mill + £0.19/kg stockholder premium. Basis: Fastmarkets EU HRC €691/t May-26 +€90 CRC, FX 0.855. Yield ~140 MPa.', confidence: 'Medium' },
    { id: 'mat-dc01-gi', grade: 'DC01 GI (Hot-dip Galvanised)', category: 'Galvanised Steel Sheet', pricePerKg: 1.06, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK galv coil, BIW bodywork standard. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-dc03-ga', grade: 'DC03 GA (Galvannealed)', category: 'Galvanised Steel Sheet', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK galvannealed coil, standard BIW inner panels. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-dp600', grade: 'DP600', category: 'AHSS Sheet', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-hsla340', grade: 'HSLA 340', category: 'High Strength Steel Sheet', pricePerKg: 1.14, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK HSLA coil, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-22mnb5', grade: '22MnB5 (Hot Press Forming / Boron Steel)', category: 'Ultra-High Strength Steel', pricePerKg: 1.74, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK PHS coil for hot stamping (A/B-pillar, roof rail). Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-aa5182', grade: 'AA5182', category: 'Aluminium Sheet', pricePerKg: 3.25, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-ss304-sheet', grade: '304L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 3.36, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK stainless coil, food/pharma stampings. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    // ── Sheet Metal (extended — fabs & alloys) ─────────────────────────────
    { id: 'mat-aa5052', grade: 'AA5052-H32 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.25, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 5xxx series — marine/vehicle panels, excellent corrosion resistance. Yield 195 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-aa5083', grade: 'AA5083-H111 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.46, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 5xxx series — marine structures, shipbuilding. Higher strength than 5052. Yield 228 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-aa6082-sheet', grade: 'AA6082-T6 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.62, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet/plate stockholder Jun 2026. 6xxx series structural alloy — frames, structural parts. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-aisi430', grade: 'AISI 430 Ferritic SS Sheet', category: 'Stainless Steel Sheet', pricePerKg: 2.94, scrapRecoveryPricePerKg: 0.70, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK SS stockholder Jun 2026. Ferritic (magnetic) stainless — appliance panels, automotive trim. Moderate corrosion resistance. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-ss316-sheet', grade: 'AISI 316L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 4.41, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 7990, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK SS stockholder Jun 2026. 316L — food processing, medical, marine (Mo addition gives better chloride resistance than 304). Yield 170 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-dc01-ze', grade: 'DC01+ZE (Electrogalvanised)', category: 'Electrogalvanised Steel Sheet', pricePerKg: 0.93, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK steel coil Jun 2026. Thin zinc coating — automotive body, appliance housings. Better paintability than hot-dip. Yield 140 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-hsla420', grade: 'HSLA 420 Sheet', category: 'High Strength Steel Sheet', pricePerKg: 1.24, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK HSLA coil Jun 2026. 420 MPa min yield — structural reinforcements, crash components. Higher strength premium over HSLA 340. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-hrpo', grade: 'HRPO (Hot Rolled Pickled & Oiled)', category: 'Mild Steel Sheet', pricePerKg: 0.72, scrapRecoveryPricePerKg: 0.18, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK steel coil Jun 2026. Hot-rolled, pickled and oiled — structural fabrication, heavy-gauge brackets, lower cost than CR. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-aa5754-sheet', grade: 'AA5754-H22 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.38, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 5754 H22 — automotive body closures, truck panels. Excellent formability. Yield 140 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-aa6061-sheet', grade: 'AA6061-T6 Sheet/Plate', category: 'Aluminium Sheet', pricePerKg: 3.72, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 6061 T6 — general structural, aerospace, vehicle frames. Yield 276 MPa. Good weldability. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-aa6063-sheet', grade: 'AA6063-T5 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.55, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2690, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 6063 T5 — architectural panels, window frames, radiators. Yield 145 MPa. Anodises well. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-aa3003-sheet', grade: 'AA3003-H14 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.05, scrapRecoveryPricePerKg: 0.48, densityKgPerM3: 2730, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al sheet stockholder Jun 2026. 3003 H14 — heat exchangers, chemical equipment, fuel tanks, cookware. Best formability of common Al alloys. Yield 145 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-c110-copper', grade: 'C110 ETP Copper Sheet', category: 'Copper & Brass Sheet', pricePerKg: 9.85, scrapRecoveryPricePerKg: 5.50, densityKgPerM3: 8940, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK copper stockholder Jun 2026. C110 ETP copper — busbars, electrical contacts, heat sinks, roofing. 99.9% Cu, 100% IACS. Yield 70 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-cz108-brass', grade: 'CZ108 Brass Sheet (70/30)', category: 'Copper & Brass Sheet', pricePerKg: 7.42, scrapRecoveryPricePerKg: 4.20, densityKgPerM3: 8530, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK brass stockholder Jun 2026. CZ108 70/30 cartridge brass — decorative panels, heat exchangers, plumbing fittings. Excellent cold formability. Yield 105 MPa. Index-anchored 2026-07 (see PRICING BASIS).', confidence: 'Medium' },
    // ── Sheet Metal — Advanced High-Strength Steels (AHSS, dual-phase / TRIP / complex-phase) ──
    { id: 'mat-dp780', grade: 'DP780', category: 'AHSS Sheet', pricePerKg: 1.32, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 780 MPa UTS — crash rails, seat structures. Needs ~1.6× press tonnage & extra restrike vs DP600; springback compensation in die. Yield ~450 MPa.', confidence: 'Low' },
    { id: 'mat-dp980', grade: 'DP980', category: 'AHSS Sheet', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 980 MPa UTS — B-pillar reinforcements, longitudinals. High die wear, significant springback, limited formability. Yield ~600 MPa.', confidence: 'Low' },
    { id: 'mat-dp1000', grade: 'DP1000', category: 'AHSS Sheet', pricePerKg: 1.52, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 1000 MPa UTS — cold-formed crash structures. Yield ~700 MPa.', confidence: 'Low' },
    { id: 'mat-trip780', grade: 'TRIP780', category: 'AHSS Sheet', pricePerKg: 1.40, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. Transformation-induced plasticity 780 — best strength/formability balance, energy-absorbing members. Retained austenite. Yield ~440 MPa.', confidence: 'Low' },
    { id: 'mat-cp800', grade: 'CP800 (Complex Phase)', category: 'AHSS Sheet', pricePerKg: 1.38, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. Complex-phase 800 — high yield, good edge-stretch/hole expansion for chassis & suspension parts. Yield ~680 MPa.', confidence: 'Low' },
    { id: 'mat-ms1200', grade: 'MS1200 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.55, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1200 MPa — roll-formed bumper beams, door beams. Very low formability, roll-form only. Yield ~950 MPa.', confidence: 'Low' },
    { id: 'mat-ms1500', grade: 'MS1500 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.72, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1500 MPa — bumper beams, intrusion beams. Roll-forming or hot forming only. Yield ~1200 MPa.', confidence: 'Low' },
    // ── Press-Hardening / Boron Steels (hot stamping) ──
    { id: 'mat-usibor1500', grade: 'Usibor 1500 (AlSi-coated 22MnB5)', category: 'Press-Hardening Steel', pricePerKg: 1.95, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK PHS coil Jul 2026. AlSi-coated boron for hot stamping — A/B-pillar, rocker, roof rail. ~1500 MPa after press-hardening quench. Requires ~900°C furnace + water-cooled dies. Yield ~1100 MPa.', confidence: 'Low' },
    { id: 'mat-usibor2000', grade: 'Usibor 2000', category: 'Press-Hardening Steel', pricePerKg: 2.35, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK PHS coil Jul 2026. Next-gen ~2000 MPa press-hardening steel for lightweight safety cage. Highest strength hot-stamping grade. Yield ~1400 MPa.', confidence: 'Low' },
    { id: 'mat-ms1300', grade: 'MS1300 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.62, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1300 MPa — roll-formed reinforcements. Yield ~1050 MPa.', confidence: 'Low' },
    // ── 3rd-generation AHSS ──
    { id: 'mat-qp980', grade: 'QP980 (Quench & Partition)', category: 'AHSS Sheet (3rd Gen)', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. 3rd-gen quench-and-partition 980 — cold-formable at 980 MPa, high elongation. Structural + formable geometry. Yield ~700 MPa.', confidence: 'Low' },
    { id: 'mat-medmn1180', grade: 'Medium-Mn 1180', category: 'AHSS Sheet (3rd Gen)', pricePerKg: 1.75, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK AHSS coil Jul 2026. 3rd-gen medium-manganese 1180 — high strength + ductility for cold-formed safety parts. Yield ~850 MPa.', confidence: 'Low' },
    // ── HSLA / Bake-Hardening / Interstitial-Free ──
    { id: 'mat-hsla550', grade: 'HSLA 550', category: 'High Strength Steel Sheet', pricePerKg: 1.34, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK HSLA coil Jul 2026. 550 MPa min yield — chassis brackets, cross members, heavy reinforcements. Yield 550 MPa.', confidence: 'Low' },
    { id: 'mat-bh260', grade: 'BH260 (Bake-Hardening)', category: 'Bake-Hardening Steel Sheet', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK BH coil Jul 2026. Bake-hardening +260 — outer body panels; formable when stamped, gains strength & dent resistance after paint-bake. Yield ~180 MPa (pre-bake).', confidence: 'Low' },
    { id: 'mat-if-dx56', grade: 'DX56D IF (Interstitial-Free)', category: 'IF Steel Sheet', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK IF coil Jul 2026. Ultra-formable interstitial-free — deep-drawn complex outer/inner panels (fenders, doors). Highest r-value/drawability. Yield ~140 MPa.', confidence: 'Low' },
    { id: 'mat-if-hs260', grade: 'IF-HS 260 (High-Strength IF)', category: 'IF Steel Sheet', pricePerKg: 1.08, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK IF-HS coil Jul 2026. High-strength interstitial-free 260 — formable structural panels needing more strength than plain IF. Yield 260 MPa.', confidence: 'Low' },
    // ── Deep-drawing cold-rolled ladder (CR4) ──
    { id: 'mat-dc04', grade: 'DC04 (CR4 Deep-Drawing)', category: 'Mild Steel Sheet', pricePerKg: 0.72, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK CR coil Jul 2026. Deep-drawing quality — enclosures, brackets, moderate draws. Better r-value than DC01.', confidence: 'Medium' },
    { id: 'mat-dc05', grade: 'DC05 (Extra-Deep-Drawing)', category: 'Mild Steel Sheet', pricePerKg: 0.75, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK CR coil Jul 2026. Extra-deep-drawing — sinks, housings, deeper draws without splits.', confidence: 'Low' },
    { id: 'mat-dc06', grade: 'DC06 (Super-Deep-Drawing IF)', category: 'Mild Steel Sheet', pricePerKg: 0.80, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK CR/IF coil Jul 2026. Super-deep-drawing IF grade — complex deep pressings, fuel-filler pockets, tanks. Highest formability CR grade.', confidence: 'Low' },
    // ── Electrical (silicon) steel — motor/transformer laminations ──
    { id: 'mat-nogo-m270-35a', grade: 'M270-35A Non-Oriented Electrical (0.35mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.55, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Low-loss non-oriented Si-steel — EV/industrial motor + generator laminations; thin gauge, low core loss (~2.7 W/kg @1.5T/50Hz). Blanked/notched at high SPM.', confidence: 'Low' },
    { id: 'mat-nogo-m400-50a', grade: 'M400-50A Non-Oriented Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. General non-oriented Si-steel — appliance/industrial motors, pumps; 0.50mm, moderate loss. Cost-effective lamination grade.', confidence: 'Low' },
    { id: 'mat-go-m105-30p', grade: 'M105-30P Grain-Oriented Electrical (0.30mm)', category: 'Electrical Steel Sheet', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. High-permeability grain-oriented Si-steel — transformer cores (E/I laminations, wound cores); very low loss along rolling direction. Premium over NO.', confidence: 'Low' },
    // ── Non-oriented (NO) fully-processed ladder — motor laminations (EN 10106) ──
    { id: 'mat-m235-35a', grade: 'M235-35A NO Electrical (0.35mm, premium low-loss)', category: 'Electrical Steel Sheet', pricePerKg: 1.95, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Premium low-loss NO — high-efficiency EV/industrial traction motors; ~2.35 W/kg @1.5T/50Hz. High-Si, thin gauge.', confidence: 'Low' },
    { id: 'mat-m330-35a', grade: 'M330-35A NO Electrical (0.35mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.70, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Mid-grade 0.35mm NO — general traction/servo motors; good loss/cost balance.', confidence: 'Low' },
    { id: 'mat-m250-50a', grade: 'M250-50A NO Electrical (0.50mm, low-loss)', category: 'Electrical Steel Sheet', pricePerKg: 1.42, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Low-loss 0.50mm NO — efficient industrial motors, generators.', confidence: 'Low' },
    { id: 'mat-m470-50a', grade: 'M470-50A NO Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.20, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Standard 0.50mm NO — mains-frequency industrial motors, pumps. Workhorse economy grade.', confidence: 'Medium' },
    { id: 'mat-m600-50a', grade: 'M600-50A NO Electrical (0.50mm, economy)', category: 'Electrical Steel Sheet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7750, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Economy 0.50mm NO — small appliance/fan motors, low duty cycle.', confidence: 'Medium' },
    { id: 'mat-m700-65a', grade: 'M700-65A NO Electrical (0.65mm, mains)', category: 'Electrical Steel Sheet', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Thick 0.65mm NO — low-cost mains motors, ballasts; higher loss, cheapest lamination grade.', confidence: 'Low' },
    // ── EV traction thin-gauge NO (≤0.27mm, high-frequency) ──
    { id: 'mat-no27-27a', grade: 'NO27 (0.27mm EV Traction)', category: 'Electrical Steel Sheet', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. 0.27mm thin-gauge NO — high-speed EV traction (200–400 Hz), low iron loss. Notch-tool-wear intensive.', confidence: 'Low' },
    { id: 'mat-no25-25a', grade: 'NO25 (0.25mm EV Traction)', category: 'Electrical Steel Sheet', pricePerKg: 2.70, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. 0.25mm high-efficiency EV motor lamination; very low core loss, high mechanical strength grades available.', confidence: 'Low' },
    { id: 'mat-no20-20a', grade: 'NO20 (0.20mm High-Speed EV/aero)', category: 'Electrical Steel Sheet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. 0.20mm ultra-thin NO — high-speed (>15k rpm) EV/aerospace traction; lowest loss, premium price, low stacking factor.', confidence: 'Low' },
    // ── Domain-refined grain-oriented (transformers) ──
    { id: 'mat-cgo-m120-27', grade: 'M120-27S CGO (0.27mm Grain-Oriented)', category: 'Electrical Steel Sheet', pricePerKg: 2.55, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Conventional grain-oriented — distribution/power transformer cores.', confidence: 'Low' },
    { id: 'mat-hgo-m090-23', grade: 'M090-23P HGO Domain-Refined (0.23mm)', category: 'Electrical Steel Sheet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Laser-scribed domain-refined HGO — lowest-loss transformer grade, high-efficiency power transformers.', confidence: 'Low' },
    // ── High-performance soft magnetics ──
    { id: 'mat-cofe-hiperco50', grade: 'Cobalt-Iron (Hiperco 50 / Vacodur 49)', category: 'Electrical Steel Sheet', pricePerKg: 58.00, scrapRecoveryPricePerKg: 4.00, densityKgPerM3: 8120, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality Jul 2026. CoFe (49Co-2V) — highest saturation (2.3T), aerospace/defence & high-power-density EV traction; needs final anneal in H₂. Premium.', confidence: 'Low' },
    { id: 'mat-nife-permalloy80', grade: 'Nickel-Iron Permalloy (80% Ni)', category: 'Electrical Steel Sheet', pricePerKg: 24.00, scrapRecoveryPricePerKg: 2.00, densityKgPerM3: 8740, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality Jul 2026. 80NiFe — ultra-high permeability small cores, sensors, resolvers, current transformers; low saturation, expensive.', confidence: 'Low' },
    { id: 'mat-amorphous-2605sa1', grade: 'Amorphous Ribbon (Metglas 2605SA1)', category: 'Electrical Steel Sheet', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 7180, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality Jul 2026. Fe-based amorphous ribbon (~25µm) — ultra-low-loss distribution transformers, high-freq cut cores; brittle, cut/etched not conventionally stamped.', confidence: 'Low' },
    { id: 'mat-no-semiproc-50', grade: 'Semi-Processed NO Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.24, densityKgPerM3: 7750, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK electrical steel Jul 2026. Semi-processed NO — magnetic properties developed by the stamper’s post-blank anneal; low coil cost, mandatory stress-relief/decarb anneal.', confidence: 'Low' },
    // ── Spring steel strip ──
    { id: 'mat-c67s-spring', grade: 'C67S / 1.1231 (CR Spring Strip)', category: 'Spring Steel Strip', pricePerKg: 1.55, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK spring strip Jul 2026. Hardened-and-tempered carbon spring strip — stamped flat springs, clips, retainers, blades; high yield after HT.', confidence: 'Low' },
    { id: 'mat-ss301-spring', grade: '301 Spring-Temper Stainless Strip', category: 'Spring Steel Strip', pricePerKg: 4.40, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK stainless spring strip Jul 2026. Work-hardened 301 (1/2–full hard) — corrosion-resistant springs, contacts, diaphragms, EMI fingers.', confidence: 'Low' },
    // ── Modern coatings ──
    { id: 'mat-znni-eg', grade: 'Zn-Ni Electrogalvanised', category: 'Coated Steel Sheet', pricePerKg: 1.18, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coated coil Jul 2026. Zinc-nickel electroplated — superior corrosion + heat resistance for underbody/fasteners. Better than plain EG. Yield ~150 MPa.', confidence: 'Low' },
    { id: 'mat-zm-coated', grade: 'ZM (Zn-Mg-Al) Coated', category: 'Coated Steel Sheet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coated coil Jul 2026. Zinc-magnesium-aluminium coating — 2–3× corrosion life of GI at lower coat weight; battery trays, underbody. Yield ~180 MPa.', confidence: 'Low' },
    { id: 'mat-tinplate-etp', grade: 'Tinplate (ETP)', category: 'Coated Steel Sheet', pricePerKg: 1.30, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK tinplate Jul 2026. Electrolytic tin-plated low-carbon — cans, enclosures, shielding. Solderable, corrosion-resistant. Yield ~230 MPa.', confidence: 'Low' },
    // ── Automotive aluminium (outer-skin & structural) ──
    { id: 'mat-aa6016-t4', grade: 'AA6016-T4 Sheet (Auto Skin)', category: 'Aluminium Sheet', pricePerKg: 3.55, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al auto sheet Jul 2026. 6016 T4 — the dominant aluminium outer-panel skin (bonnet, door, fender); bake-hardens in paint oven, good hemming. Yield ~120 MPa (T4).', confidence: 'Low' },
    { id: 'mat-aa6111-t4', grade: 'AA6111-T4 Sheet (Auto Skin)', category: 'Aluminium Sheet', pricePerKg: 3.70, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2710, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al auto sheet Jul 2026. 6111 T4 — higher-strength outer skin for dent resistance; NA OEM closures. Yield ~160 MPa (T4).', confidence: 'Low' },
    { id: 'mat-aa7075-t6', grade: 'AA7075-T6 Sheet/Plate', category: 'Aluminium Sheet', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2810, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al plate Jul 2026. 7075 T6 — aerospace-grade high-strength structural (bumper beams, reinforcements). Poor formability/weldability; cold form in W-temper. Yield ~505 MPa.', confidence: 'Low' },
    // ── Sustainability-focused ──
    { id: 'mat-greensteel-dc01', grade: 'Low-CO₂ "Green" Steel (H₂-DRI, DC01 equiv.)', category: 'Low-Carbon Steel Sheet', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK green-steel offer Jul 2026. Hydrogen direct-reduced / high-scrap EAF route — DC01-equivalent properties at ~70–90% lower embodied CO₂. Premium ~15–25% over conventional. Yield ~140 MPa.', confidence: 'Low' },
    { id: 'mat-al-recycled-5xxx', grade: 'Recycled-Content Al 5xxx (Secondary)', category: 'Aluminium Sheet', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK secondary-Al sheet Jul 2026. High recycled-content 5xxx — non-visible inner panels/brackets; ~5% cheaper and far lower CO₂ than primary. Slightly wider property tolerance. Yield ~130 MPa.', confidence: 'Low' },
    // ── Injection Moulding (resins) ────────────────────────────────────────
    // coolTimeFactorSPerMm2: PP=3.16, ABS=2.0, PA66=2.0, PC=2.5, HDPE=3.5, POM=2.8, TPU=4.0
    { id: 'mat-pp', grade: 'PP Copolymer', category: 'Thermoplastic', pricePerKg: 1.12, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-abs', grade: 'ABS', category: 'Thermoplastic', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pa66gf30', grade: 'PA66 GF30', category: 'Thermoplastic', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pc', grade: 'PC (Lexan)', category: 'Thermoplastic', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-hdpe', grade: 'HDPE', category: 'Thermoplastic', pricePerKg: 1.06, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 960, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pom', grade: 'POM / Acetal (Delrin)', category: 'Thermoplastic', pricePerKg: 2.05, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026. coolFactor ~2.8 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pbt-gf30', grade: 'PBT GF30', category: 'Thermoplastic', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026. Common connector/housing material. Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-tpu-shore85', grade: 'TPU Shore 85A', category: 'Thermoplastic Elastomer', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor, Jun 2026. coolFactor ~4.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Low' },
    // ── Polyethylene family ────────────────────────────────────────────────────
    { id: 'mat-ldpe', grade: 'LDPE (2426H)', category: 'Thermoplastic', pricePerKg: 0.87, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 910, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. EBM film bags. coolFactor ~3.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-lldpe', grade: 'LLDPE C6', category: 'Thermoplastic', pricePerKg: 0.93, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Stretch/packaging film, rotomoulding. coolFactor ~3.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── PP grades ──────────────────────────────────────────────────────────────
    { id: 'mat-pp-homo', grade: 'PP Homopolymer (MFI 12)', category: 'Thermoplastic', pricePerKg: 0.96, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. High stiffness housings, caps. coolFactor ~3.16 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pp-impact', grade: 'PP Impact Copolymer (PP-B)', category: 'Thermoplastic', pricePerKg: 1.01, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Bumpers, battery cases. coolFactor ~3.16 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pp-gf30', grade: 'PP GF30 (Short Glass)', category: 'Thermoplastic', pricePerKg: 1.85, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1120, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. 30% short-glass PP — stiff housings, fan shrouds, pump bodies, brackets. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Low' },
    // ── PET ────────────────────────────────────────────────────────────────────
    { id: 'mat-pet-bg', grade: 'PET Bottle Grade (1101)', category: 'Thermoplastic', pricePerKg: 1.21, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1380, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. SBM beverage bottles. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pet-gf30', grade: 'PET GF30 (Engineering)', category: 'Thermoplastic', pricePerKg: 3.05, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Gears, precision parts. coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── PVC ────────────────────────────────────────────────────────────────────
    { id: 'mat-upvc', grade: 'Rigid PVC (uPVC pipe grade)', category: 'Thermoplastic', pricePerKg: 0.83, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Pipes, window profiles. coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-fpvc', grade: 'Flexible PVC (fPVC plasticised)', category: 'Thermoplastic', pricePerKg: 1.16, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Cables, hoses, medical tubing. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── PS grades ──────────────────────────────────────────────────────────────
    { id: 'mat-gpps', grade: 'GPPS (Crystal PS)', category: 'Thermoplastic', pricePerKg: 1.00, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Clear, rigid, brittle. CD cases, cutlery. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-hips', grade: 'HIPS (High Impact PS)', category: 'Thermoplastic', pricePerKg: 0.97, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1040, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. TV housings, fridge liners, thermoforming sheet. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── PC/ABS Blend ───────────────────────────────────────────────────────────
    { id: 'mat-pc-abs', grade: 'PC/ABS Blend (automotive grade)', category: 'Thermoplastic', pricePerKg: 1.95, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Automotive interior, electronics housings. coolFactor ~2.2 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── Polyamide (PA) grades ──────────────────────────────────────────────────
    { id: 'mat-pa6', grade: 'PA6 Unfilled', category: 'Thermoplastic', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Gears, under-hood. Moisture sensitive — dry before moulding. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pa6-gf30', grade: 'PA6 GF30', category: 'Thermoplastic', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1280, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Structural PA6 with glass fill. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-pa66', grade: 'PA66 Unfilled', category: 'Thermoplastic', pricePerKg: 1.89, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Higher temp than PA6. Connectors, structural. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Medium' },
    // ── High-Performance ───────────────────────────────────────────────────────
    { id: 'mat-peek', grade: 'PEEK Unfilled', category: 'High-Performance Thermoplastic', pricePerKg: 76.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier Jun 2026. Aerospace/medical/oil&gas. High temp (Tg~143°C, use to 250°C). coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-peek-gf30', grade: 'PEEK GF30', category: 'High-Performance Thermoplastic', pricePerKg: 93.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1430, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier Jun 2026. High-stiffness structural PEEK. Index-anchored 2026-07 (see RESIN PRICING BASIS).', confidence: 'Low' },
    // ── Injection Moulding — RESIN PRICING BASIS (index-anchored, 2026-07) ─────
    // Delivered UK small-lot £/kg = European polymer index → GBP + compounding/
    // colour + small-lot distributor premium.
    //   • Commodity anchor: European PP ~$1,346/t (ChemOrbis/ICIS, Mar-2026);
    //     FX USD→GBP 0.787 ⇒ PP natural ≈ £1.06/kg. PE/PS/PVC track the same
    //     naphtha→ethylene/propylene/styrene feedstock.
    //   • Premium ladder over commodity (£/kg): styrenics (ABS/ASA/SAN) +0.6–1.3 ·
    //     talc/mineral-filled PP +0.2–0.4 · PP long-glass +1.5 · engineering
    //     (PA6/PA66/POM/PBT/PC/PC-ABS) +0.6–1.7 · glass-fill +0.5–0.7 per 30% ·
    //     high-temp specialty (PPS/PPA/PEI/LCP) £5–14 · PEEK £76–93.
    //   • Confidence: 'Medium' where anchored to a public polymer index + standard
    //     compound premium; 'Low' for specialty/low-volume grades with estimated premium.
    //   Sources: ICIS / ChemOrbis Europe PP, Plastixx (PIE) polymer index, procurementresource.
    // ── Styrenics (weatherable / clarity) ──
    { id: 'mat-asa', grade: 'ASA (Weatherable)', category: 'Thermoplastic', pricePerKg: 2.30, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1070, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07 (see RESIN PRICING BASIS). UV-stable styrenic — exterior trim, grilles, mirror caps, roof rails. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    { id: 'mat-san', grade: 'SAN (Styrene-Acrylonitrile)', category: 'Thermoplastic', pricePerKg: 1.75, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1080, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Rigid, clear, chemical-resistant — housewares, cosmetics, lenses. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    // ── Filled / modified PP (automotive interiors & bumpers) ──
    { id: 'mat-pp-t20', grade: 'PP-T20 (20% Talc-filled)', category: 'Thermoplastic', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Stiffened PP — instrument-panel carriers, interior trim, HVAC. coolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pp-t30', grade: 'PP-T30 (30% Mineral/Talc-filled)', category: 'Thermoplastic', pricePerKg: 1.35, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. High-stiffness PP — bumper carriers, door panels, under-body shields. coolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pp-lgf30', grade: 'PP-LGF30 (Long-Glass PP)', category: 'Thermoplastic', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1120, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Long-glass-fibre PP — structural front-end carriers, door modules, seat structures (metal replacement). coolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-tpo', grade: 'TPO (Thermoplastic Olefin)', category: 'Thermoplastic', pricePerKg: 1.85, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Soft-touch olefinic — bumper fascia, cladding, skin/airbag covers. coolFactor ~3.2 s/mm².', confidence: 'Low' },
    // ── Elastomer & optical ──
    { id: 'mat-tpv', grade: 'TPV (Santoprene-type)', category: 'Thermoplastic Elastomer', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 970, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Vulcanised TPE — weatherseals, boots, glass encapsulation, grommets. coolFactor ~4.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pmma', grade: 'PMMA (Acrylic)', category: 'Thermoplastic', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Optical-clear acrylic — lenses, light guides, tail-lamp, badges. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    // ── High-temp / e-mobility / connectors ──
    { id: 'mat-pps-gf40', grade: 'PPS GF40', category: 'High-Performance Thermoplastic', pricePerKg: 5.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Polyphenylene-sulfide — under-hood, e-motor components, sensors, pumps, EV. Continuous use ~200°C. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    { id: 'mat-ppa-gf35', grade: 'PPA GF35 (High-Temp Polyamide)', category: 'High-Performance Thermoplastic', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1450, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Semi-aromatic PPA — high-temp connectors, e-mobility, thermal management. coolFactor ~2.2 s/mm².', confidence: 'Low' },
    { id: 'mat-pei', grade: 'PEI (Ultem, Unfilled)', category: 'High-Performance Thermoplastic', pricePerKg: 12.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Polyetherimide — high-temp electrical, aerospace interiors, sterilisable medical. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    { id: 'mat-pei-gf30', grade: 'PEI GF30', category: 'High-Performance Thermoplastic', pricePerKg: 14.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1510, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Glass-reinforced PEI — structural high-temp. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    { id: 'mat-lcp-gf30', grade: 'LCP GF30 (Liquid-Crystal Polymer)', category: 'High-Performance Thermoplastic', pricePerKg: 11.00, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 1620, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Ultra-thin-wall flow — fine-pitch connectors, SMT sockets, sensors. coolFactor ~1.8 s/mm².', confidence: 'Low' },
    // ── Extended polyamide family ──
    { id: 'mat-pa66-gf35', grade: 'PA66 GF35', category: 'Thermoplastic', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. 35% glass PA66 — structural brackets, engine mounts, pedals. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pa66-gf50', grade: 'PA66 GF50', category: 'Thermoplastic', pricePerKg: 3.55, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1560, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. 50% glass PA66 — highest-stiffness metal-replacement structural parts. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pa66-min', grade: 'PA66 Mineral-filled (Low-Warp)', category: 'Thermoplastic', pricePerKg: 3.00, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1440, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Mineral-filled PA66 — low-warp precision housings, covers. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pa12', grade: 'PA12 (Nylon 12)', category: 'Thermoplastic', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Low-moisture, flexible polyamide — fuel/brake lines, air-brake tubing, quick-connectors. coolFactor ~2.2 s/mm².', confidence: 'Low' },
    // ── Engineering blends ──
    { id: 'mat-pc-pbt', grade: 'PC/PBT Blend', category: 'Thermoplastic', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1210, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Impact + chemical resistance — bumper beams, exterior body panels, sill covers. coolFactor ~2.3 s/mm².', confidence: 'Low' },
    { id: 'mat-mppe', grade: 'mPPE / PPO (Noryl-type)', category: 'Thermoplastic', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1090, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Modified PPE — dimensional stability, low moisture — EV battery components, e-mobility, panels. coolFactor ~2.2 s/mm².', confidence: 'Low' },
    // ── Flame-retardant (UL94 V0) ──
    { id: 'mat-pc-fr', grade: 'PC FR (UL94 V0)', category: 'Thermoplastic', pricePerKg: 3.60, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1220, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Flame-retardant PC — EV enclosures, chargers, HV connectors, electronics. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    { id: 'mat-pa66-gf25-fr', grade: 'PA66 GF25 FR (UL94 V0)', category: 'Thermoplastic', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1450, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Halogen-free FR glass-filled PA66 — HV connectors, busbar carriers, EV. coolFactor ~2.0 s/mm².', confidence: 'Low' },
    // ── Sustainability (recycled / bio) ──
    { id: 'mat-pcr-pp', grade: 'PCR PP (Post-Consumer Recycled)', category: 'Thermoplastic', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK recycler. Index-anchored 2026-07. Recycled PP — non-visible trim, wheel-arch liners, under-body. ~10% cheaper than virgin, far lower CO₂; wider property tolerance. coolFactor ~3.16 s/mm².', confidence: 'Low' },
    { id: 'mat-bio-pa610', grade: 'Bio-PA610 (Castor-based)', category: 'High-Performance Thermoplastic', pricePerKg: 5.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1070, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Partly bio-based polyamide — low moisture uptake, sustainable structural/fuel-system parts. coolFactor ~2.1 s/mm².', confidence: 'Low' },
    { id: 'mat-pc-glazing', grade: 'PC Glazing Grade (Automotive)', category: 'Thermoplastic', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Hard-coat-ready PC for polycarbonate glazing — panoramic roofs, fixed side windows, lightweighting vs glass. coolFactor ~2.5 s/mm².', confidence: 'Low' },
    // ── Casting alloys ─────────────────────────────────────────────────────
    { id: 'mat-adc12', grade: 'ADC12 / A383', category: 'Die Cast Aluminium', pricePerKg: 2.78, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-a380', grade: 'A380', category: 'Die Cast Aluminium', pricePerKg: 2.83, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-gjl250', grade: 'EN-GJL-250', category: 'Grey Cast Iron', pricePerKg: 0.64, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK iron foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    // ── Additional casting alloys (Cast+Machine module) ────────────────────
    { id: 'mat-lm25', grade: 'LM25 / A356', category: 'Gravity/Sand Aluminium', pricePerKg: 3.04, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-gjl350', grade: 'EN-GJL-350', category: 'Grey Cast Iron', pricePerKg: 0.74, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK iron foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-bronze-c905', grade: 'C905 Phosphor Bronze', category: 'Copper Alloy', pricePerKg: 8.90, scrapRecoveryPricePerKg: 2.80, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK copper alloy distributor, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-mag-az91', grade: 'AZ91D Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.99, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 1810, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK Mg alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-ss304-cast', grade: 'CF8 / 304 Cast Stainless', category: 'Cast Stainless Steel', pricePerKg: 5.04, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK stainless foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    // ── Additional alloys ─────────────────────────────────────────────────
    { id: 'mat-adc12-secondary', grade: 'ADC12 Secondary (recycled)', category: 'Die Cast Aluminium', pricePerKg: 2.05, scrapRecoveryPricePerKg: 0.45, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK secondary Al alloy ingot — lower purity, suitable for non-structural castings. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-alsi10mg', grade: 'AlSi10Mg (A360/Scalmalloy)', category: 'Die Cast Aluminium', pricePerKg: 2.94, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Premium structural HPDC alloy, T5 heat treated. UK Al alloy ingot Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-a365', grade: 'A365 / AlSi7Mg', category: 'Die Cast Aluminium', pricePerKg: 2.83, scrapRecoveryPricePerKg: 0.52, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Structural automotive HPDC alloy (EDU housings, battery trays). UK Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-zamak3', grade: 'Zamak 3 (Zinc Die Cast)', category: 'Zinc Die Cast', pricePerKg: 2.47, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Zamak 3 zinc alloy ingot, UK distributor Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-zamak5', grade: 'Zamak 5 (Zinc Die Cast, Hi-Strength)', category: 'Zinc Die Cast', pricePerKg: 2.52, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Zamak 5 zinc alloy ingot, higher strength than Zamak 3. UK Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-gjs400', grade: 'EN-GJS-400-15 (Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Spheroidal graphite cast iron — highest volume casting material globally. UK foundry Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    { id: 'mat-gjs600', grade: 'EN-GJS-600-3 (Ductile Iron Hi-Strength)', category: 'Ductile Cast Iron', pricePerKg: 0.90, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'High-strength ductile iron for crankshafts, diff housings. UK foundry Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS).', confidence: 'Low' },
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  CASTING PRICING BASIS (index-anchored, refreshed 2026-07)
     * ══════════════════════════════════════════════════════════════════════
     *  Delivered UK small-lot foundry £/kg is built as:
     *      commodity index → GBP (FX)  +  alloying/master-alloy premium
     *      +  melt/cast/finish stockholder margin  +  grade premium ladder.
     *  FX used: USD→GBP 0.787, EUR→GBP 0.855.
     *  Commodity anchors (2026-07):
     *    • Aluminium  LME cash ~$3,398/t  → ~£2.67/kg metal; secondary
     *      die-cast ingot (ADC12/A380) lands ~£2.8/kg, structural/primary
     *      HPDC (AlSi10MnMg family) ~£3.0–3.2/kg after Mn/Mg master-alloy.
     *    • Magnesium  SMM ~$2,505/t → ~£1.97/kg metal; AZ91D die-cast
     *      alloy ~£3.9/kg, creep-resistant RE grades (AE44) ~£5/kg on the
     *      rare-earth (Ce/La) adder.
     *    • Foundry pig iron  SMM ~$375/t → ~£0.30/kg; grey/ductile castings
     *      ~£0.6–1.0/kg, CGI/SiMo/ADI ~£1.1–1.6/kg on alloying + heat-treat.
     *    • Zinc  LME ~$2,750/t → ~£2.16/kg; Zamak/ZA alloys ~£2.5–3.1/kg.
     *    • Cast stainless / 17-4PH / Ni-superalloy investment castings priced
     *      off Ni/Cr/Mo index + investment-shell yield; Inconel 718 dominated
     *      by nickel + cobalt content and low casting yield.
     *  Confidence: Medium where anchored to a published metal index; Low where
     *  the grade/premium is estimated. Real contract prices are confidential —
     *  load actuals via the admin Rate Library upload.
     * ══════════════════════════════════════════════════════════════════════
     */
    // ── Structural HPDC / megacasting aluminium ────────────────────────────
    { id: 'mat-aural5', grade: 'Aural-5 (AlSi9MnMg, Rheinfelden)', category: 'Structural HPDC Aluminium', pricePerKg: 3.12, scrapRecoveryPricePerKg: 0.58, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Ductile structural HPDC — shock towers, self-pierce-rivetable body nodes; T5/T7 heat treat.', confidence: 'Medium' },
    { id: 'mat-silafont36', grade: 'Silafont-36 (AlSi10MnMg)', category: 'Structural HPDC Aluminium', pricePerKg: 3.15, scrapRecoveryPricePerKg: 0.58, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Crash-relevant structural HPDC — battery trays, longitudinal rails, megacastings; high elongation after T7.', confidence: 'Medium' },
    { id: 'mat-castasil37', grade: 'Castasil-37 (AlSi9MnMoZr)', category: 'Structural HPDC Aluminium', pricePerKg: 3.08, scrapRecoveryPricePerKg: 0.58, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). As-cast high-ductility HPDC needing no heat treatment — cross-car beams, structural brackets; dimensionally stable.', confidence: 'Medium' },
    { id: 'mat-magsimal59', grade: 'Magsimal-59 (AlMg5Si2Mn)', category: 'Structural HPDC Aluminium', pricePerKg: 3.22, scrapRecoveryPricePerKg: 0.58, densityKgPerM3: 2650, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-strength/high-ductility as-cast HPDC — chassis nodes, suspension parts; excellent corrosion resistance.', confidence: 'Medium' },
    { id: 'mat-al-hpdc-lowco2', grade: 'Low-CO₂ Recycled HPDC (AlSi10MnMg)', category: 'Structural HPDC Aluminium', pricePerKg: 3.05, scrapRecoveryPricePerKg: 0.60, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). ≥75% recycled-content structural HPDC alloy — same mechanicals as Silafont, ~3–4 kg CO₂/kg vs ~8–20 for primary; OEM green-casting programmes.', confidence: 'Low' },
    // ── Die-cast aluminium (extended) ──────────────────────────────────────
    { id: 'mat-a413', grade: 'A413 / AlSi12 (Eutectic Die Cast)', category: 'Die Cast Aluminium', pricePerKg: 2.80, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Near-eutectic high-fluidity alloy — thin-wall pressure-tight housings, pump bodies, intricate die castings.', confidence: 'Medium' },
    { id: 'mat-a319', grade: 'A319 / AlSi6Cu4', category: 'Die Cast Aluminium', pricePerKg: 2.76, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2790, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose Al-Si-Cu — sand/permanent-mould engine blocks, manifolds, cylinder heads; good machinability.', confidence: 'Medium' },
    { id: 'mat-a390', grade: 'A390 / AlSi17Cu (Hypereutectic)', category: 'Die Cast Aluminium', pricePerKg: 3.32, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2730, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Hypereutectic wear-resistant alloy — compressor scrolls, pistons, cylinder liners; low CTE, high hardness.', confidence: 'Medium' },
    // ── Gravity / permanent-mould aluminium (extended) ─────────────────────
    { id: 'mat-a357', grade: 'A357 / AlSi7Mg0.6 (Premium T6)', category: 'Gravity/Sand Aluminium', pricePerKg: 3.26, scrapRecoveryPricePerKg: 0.56, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Premium high-integrity T6 alloy — aerospace structural, motorsport wheels, suspension uprights; HIP-capable.', confidence: 'Medium' },
    // ── Grey & ductile iron (extended) ─────────────────────────────────────
    { id: 'mat-gjl200', grade: 'EN-GJL-200 (Grey Iron)', category: 'Grey Cast Iron', pricePerKg: 0.60, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose grey iron — housings, covers, counterweights; good damping and machinability.', confidence: 'Low' },
    { id: 'mat-gjl300', grade: 'EN-GJL-300 (Grey Iron Hi-Strength)', category: 'Grey Cast Iron', pricePerKg: 0.70, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Higher-strength grey iron — engine blocks, brake discs/drums, machine-tool structures.', confidence: 'Low' },
    { id: 'mat-gjs500', grade: 'EN-GJS-500-7 (Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 0.86, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Mid-grade ductile iron — steering knuckles, hubs, brackets; balance of strength and ductility.', confidence: 'Low' },
    { id: 'mat-gjs700', grade: 'EN-GJS-700-2 (Ductile Iron Hi-Strength)', category: 'Ductile Cast Iron', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-strength ductile iron — heavy-duty gears, crankshafts, hydraulic bodies.', confidence: 'Low' },
    { id: 'mat-gjv450', grade: 'EN-GJV-450 (Compacted Graphite Iron)', category: 'Compacted Graphite Iron', pricePerKg: 1.12, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). CGI — high-output diesel cylinder blocks/heads, exhaust manifolds; ~75% stronger than grey iron with better thermal fatigue.', confidence: 'Low' },
    { id: 'mat-simo', grade: 'EN-GJS-SiMo (Heat-Resistant Ductile)', category: 'Ductile Cast Iron', pricePerKg: 1.35, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). SiMo heat-resistant ductile iron — exhaust manifolds, turbocharger housings; stable to ~800°C.', confidence: 'Low' },
    { id: 'mat-adi', grade: 'EN-GJS-800 ADI (Austempered Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 1.58, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Austempered ductile iron — gears, crankshafts, suspension arms; steel-like strength at lower weight/cost, austempering heat-treat included.', confidence: 'Low' },
    // ── Magnesium die cast (extended) ──────────────────────────────────────
    { id: 'mat-mag-am60', grade: 'AM60B Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.85, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-ductility Mg — steering wheels, seat frames, instrument-panel beams; better elongation than AZ91.', confidence: 'Low' },
    { id: 'mat-mag-am50', grade: 'AM50A Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.90, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 1770, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Highest-ductility standard Mg die-cast alloy — safety-critical energy-absorbing structures, IP beams, brackets.', confidence: 'Low' },
    { id: 'mat-mag-ae44', grade: 'AE44 Magnesium (Creep-Resistant)', category: 'Magnesium Alloy', pricePerKg: 5.20, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 1820, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Rare-earth (Ce/La) creep-resistant Mg — powertrain, engine cradles, transmission cases at elevated temperature; RE adder over AZ/AM grades.', confidence: 'Low' },
    // ── Zinc die cast (extended) ───────────────────────────────────────────
    { id: 'mat-za8', grade: 'ZA-8 (Zinc-Aluminium Die Cast)', category: 'Zinc Die Cast', pricePerKg: 2.82, scrapRecoveryPricePerKg: 1.25, densityKgPerM3: 6300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Hot-chamber ZA-8 — higher strength/creep than Zamak; hardware, gears, bushings.', confidence: 'Low' },
    { id: 'mat-za27', grade: 'ZA-27 (High-Strength Zinc-Aluminium)', category: 'Zinc Die Cast', pricePerKg: 3.10, scrapRecoveryPricePerKg: 1.15, densityKgPerM3: 5000, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Highest-strength ZA alloy — bronze-replacement bearings, high-load gravity/sand castings; lower density than Zamak.', confidence: 'Low' },
    // ── Steel & superalloy castings (investment / sand) ────────────────────
    { id: 'mat-gs-c25', grade: 'GS-C25 (Cast Carbon Steel)', category: 'Cast Carbon Steel', pricePerKg: 2.10, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose cast carbon steel — structural brackets, valve bodies, machine frames; weldable, machinable.', confidence: 'Low' },
    { id: 'mat-17-4ph-cast', grade: '17-4PH (Investment Cast Stainless)', category: 'Cast Stainless Steel', pricePerKg: 9.50, scrapRecoveryPricePerKg: 1.50, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Precipitation-hardening martensitic stainless investment casting — pump/valve internals, aerospace fittings, high strength + corrosion resistance.', confidence: 'Low' },
    { id: 'mat-inconel718-cast', grade: 'Inconel 718 (Investment Cast Superalloy)', category: 'Nickel Superalloy Casting', pricePerKg: 42.00, scrapRecoveryPricePerKg: 8.00, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Ni-Cr-Fe superalloy investment casting — turbine/hot-section, high-temperature structural; nickel + cobalt dominated, low casting yield.', confidence: 'Low' },
    // ── Forging billets ────────────────────────────────────────────────────
    { id: 'mat-steel1020', grade: '1020 / S20C', category: 'Carbon Steel Billet', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK steel billet, Jun 2026. Index-anchored 2026-07 (see FORGING PRICING BASIS).', confidence: 'Medium' },
    { id: 'mat-steel4340', grade: '4340', category: 'Alloy Steel Billet', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK alloy billet, Jun 2026. Index-anchored 2026-07 (see FORGING PRICING BASIS).', confidence: 'Medium' },
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  FORGING PRICING BASIS (index-anchored, refreshed 2026-07)
     * ══════════════════════════════════════════════════════════════════════
     *  Delivered UK small-lot forging billet/bar £/kg is built as:
     *      commodity index → GBP (FX)  +  alloying premium  +  bar/billet
     *      conversion (rolling/peeling/cut-to-length) + stockholder margin.
     *  FX used: USD→GBP 0.787, EUR→GBP 0.855.
     *  Commodity anchors (2026-07):
     *    • Carbon/alloy steel bar off UK/EU rebar-plus-conversion — plain
     *      carbon (1045/C45) ~£0.9–1.1/kg, low-alloy (4140/4340/8620)
     *      ~£1.4–1.7/kg, bearing (52100) ~£1.7/kg, UHS aero (300M) ~£3.8/kg.
     *    • Stainless bar off Ni/Cr surcharge — 410 ~£3.6/kg, 304L ~£4.6/kg,
     *      316L ~£6.2/kg, PH grades (17-4/15-5) ~£9–10/kg.
     *    • Aluminium forging stock off LME ~$3,398/t → 6xxx ~£3.3–3.4/kg,
     *      7075 ~£4.6/kg, 2618 piston/aero ~£5.2/kg.
     *    • Titanium sponge/bar — CP Gr2 ~£26/kg, Ti-6Al-4V (Gr5) ~£38/kg.
     *    • Nickel superalloy bar — Inconel 718 ~£44/kg, Waspaloy ~£70/kg
     *      (Ni + Co + Mo dominated, VIM/VAR remelt).
     *    • Forging brass (CZ122) off copper/zinc index ~£7.2/kg.
     *  Confidence: Medium where anchored to a published metal index; Low where
     *  the grade/premium is estimated. Mill/stockholder contract prices are
     *  confidential — load actuals via the admin Rate Library upload.
     * ══════════════════════════════════════════════════════════════════════
     */
    // ── Carbon & microalloyed forging steel (extended) ─────────────────────
    // (1045/C45 medium-carbon and 4140/42CrMo4 low-alloy already exist as
    //  general stock — mat-steel1045 / mat-steel4140 — usable for forging.)
    { id: 'mat-steel1141', grade: '1141 / 1144 (Free-Machining)', category: 'Carbon Steel Billet', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Resulphurised free-machining carbon steel — high-volume machined forgings, studs, couplings.', confidence: 'Medium' },
    { id: 'mat-steel-38mnvs6', grade: '38MnVS6 (Microalloyed)', category: 'Microalloyed Steel Billet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Air-hardening V-microalloyed steel — con-rods, crankshafts; controlled-cooled from forge heat, no separate Q&T.', confidence: 'Medium' },
    // ── Alloy & case-hardening forging steel (extended) ────────────────────
    { id: 'mat-steel4130', grade: '4130 / 25CrMo4', category: 'Alloy Steel Billet', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Weldable chromoly — aerospace/pressure fittings, tube-and-node structures.', confidence: 'Medium' },
    { id: 'mat-steel8620', grade: '8620 (Case-Hardening)', category: 'Alloy Steel Billet', pricePerKg: 1.50, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Carburising gear steel — pinions, ring gears, bearings; tough core + hard case.', confidence: 'Medium' },
    { id: 'mat-steel-20mncr5', grade: '20MnCr5 (Gear Steel)', category: 'Alloy Steel Billet', pricePerKg: 1.48, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). European case-hardening gear steel — transmission gears, shafts; excellent hardenability and grain control.', confidence: 'Medium' },
    { id: 'mat-steel-52100', grade: '52100 / 100Cr6 (Bearing Steel)', category: 'Alloy Steel Billet', pricePerKg: 1.70, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7810, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-carbon chromium bearing steel — rings, rollers, races; clean, through-hardening.', confidence: 'Medium' },
    { id: 'mat-steel-300m', grade: '300M (UHS Aerospace)', category: 'Alloy Steel Billet', pricePerKg: 3.80, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7830, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ultra-high-strength Si-modified 4340 — landing gear, aerospace structural; VAR remelt, tight cleanliness.', confidence: 'Low' },
    // ── Stainless forging bar ──────────────────────────────────────────────
    { id: 'mat-ss410-bar', grade: '410 (Martensitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 3.60, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 7740, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Hardenable martensitic stainless — valve stems, fasteners, turbine blades; moderate corrosion resistance.', confidence: 'Low' },
    { id: 'mat-ss304l-bar', grade: '304L (Austenitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 4.60, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). General-purpose austenitic forging bar — flanges, fittings, food/chemical; Ni/Cr surcharge driven.', confidence: 'Low' },
    { id: 'mat-ss316l-bar', grade: '316L (Austenitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 6.20, scrapRecoveryPricePerKg: 1.40, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Mo-bearing austenitic — marine/chemical flanges, valve bodies; higher pitting resistance than 304.', confidence: 'Low' },
    { id: 'mat-ss17-4ph-bar', grade: '17-4PH (PH Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 9.20, scrapRecoveryPricePerKg: 1.60, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Precipitation-hardening martensitic stainless — aerospace fittings, pump/valve, high strength + corrosion.', confidence: 'Low' },
    { id: 'mat-ss15-5ph-bar', grade: '15-5PH (PH Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 9.80, scrapRecoveryPricePerKg: 1.60, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Transverse-toughness PH stainless — aerospace structural, landing-gear fittings; cleaner than 17-4.', confidence: 'Low' },
    // ── Aluminium forging stock ────────────────────────────────────────────
    { id: 'mat-al6061-forge', grade: '6061 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). General-purpose forged aluminium — brackets, fittings, structural; T6 heat-treatable, weldable.', confidence: 'Medium' },
    { id: 'mat-al6082-forge', grade: '6082 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). European structural forging alloy — suspension arms, chassis brackets; higher strength than 6061.', confidence: 'Medium' },
    { id: 'mat-al7075-forge', grade: '7075 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 4.60, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2810, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-strength Al-Zn — aerospace/defence structural forgings, motorsport uprights; T73 for SCC resistance.', confidence: 'Medium' },
    { id: 'mat-al2618-forge', grade: '2618 (Al-Cu Piston/Aero)', category: 'Aluminium Forging Billet', pricePerKg: 5.20, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2760, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Elevated-temperature Al-Cu — forged pistons, compressor/turbo wheels; creep-resistant to ~200°C.', confidence: 'Low' },
    // ── Titanium forging bar ───────────────────────────────────────────────
    { id: 'mat-ti-cp-gr2', grade: 'CP Titanium Grade 2 (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 26.00, scrapRecoveryPricePerKg: 4.00, densityKgPerM3: 4510, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Commercially-pure titanium — chemical/marine, medical, corrosion service; readily forged/formed.', confidence: 'Low' },
    { id: 'mat-ti-6al4v-forge', grade: 'Ti-6Al-4V Grade 5 (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 38.00, scrapRecoveryPricePerKg: 5.50, densityKgPerM3: 4430, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Workhorse aerospace/medical titanium — airframe/engine forgings, implants; high strength-to-weight, β-forged for toughness.', confidence: 'Low' },
    // ── Nickel superalloy forging bar ──────────────────────────────────────
    { id: 'mat-inconel718-forge', grade: 'Inconel 718 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 44.00, scrapRecoveryPricePerKg: 8.00, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Age-hardenable Ni-Cr superalloy — turbine discs, shafts, rings; VIM/VAR remelt, high hot-strength.', confidence: 'Low' },
    { id: 'mat-waspaloy-forge', grade: 'Waspaloy (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 70.00, scrapRecoveryPricePerKg: 12.00, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Co-strengthened Ni superalloy — hot-section turbine discs, seals; retains strength to ~700°C, Co adder over 718.', confidence: 'Low' },
    { id: 'mat-inconel625-forge', grade: 'Inconel 625 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 38.00, scrapRecoveryPricePerKg: 7.00, densityKgPerM3: 8440, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Solid-solution Ni-Cr-Mo — marine/chemical, exhaust, subsea; excellent corrosion + weldability, non-age-hardening.', confidence: 'Low' },
    { id: 'mat-hastelloy-c276-forge', grade: 'Hastelloy C-276 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 55.00, scrapRecoveryPricePerKg: 9.00, densityKgPerM3: 8890, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ni-Mo-Cr — severe chemical/acid, flue-gas, subsea valves; outstanding pitting/crevice resistance, high Mo adder.', confidence: 'Low' },
    { id: 'mat-monel400-forge', grade: 'Monel 400 (Forging Bar)', category: 'Nickel Alloy Billet', pricePerKg: 28.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ni-Cu — marine shafting, valves, seawater service; resists chlorides and HF, non-hardenable.', confidence: 'Low' },
    { id: 'mat-ti-6242-forge', grade: 'Ti-6Al-2Sn-4Zr-2Mo (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 52.00, scrapRecoveryPricePerKg: 6.50, densityKgPerM3: 4540, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Near-α high-temp titanium — compressor discs/blades to ~540°C, engine forgings; premium over Ti-6Al-4V.', confidence: 'Low' },
    { id: 'mat-al7050-forge', grade: '7050 (Al-Zn Aero Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 8.50, scrapRecoveryPricePerKg: 1.10, densityKgPerM3: 2830, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-strength aerospace 7xxx — thick-section airframe fittings, bulkheads; better SCC resistance than 7075.', confidence: 'Low' },
    { id: 'mat-mg-az31-forge', grade: 'AZ31B (Mg Forging Bar)', category: 'Magnesium Forging Billet', pricePerKg: 6.50, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 1770, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Wrought Mg-Al-Zn — lightweight brackets, aerospace/defence, portable structures; forged warm (~300–400°C).', confidence: 'Low' },
    // ── Copper alloy forging stock ─────────────────────────────────────────
    { id: 'mat-brass-cz122-forge', grade: 'CZ122 / CW617N (Forging Brass)', category: 'Copper Alloy Billet', pricePerKg: 7.20, scrapRecoveryPricePerKg: 3.00, densityKgPerM3: 8500, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Hot-stamping brass — valve bodies, fittings, plumbing; excellent forgeability and machinability.', confidence: 'Low' },
    // ── Paint / coating materials (price per kg wet paint) ─────────────────
    { id: 'mat-paint-ecoat', grade: 'E-coat (Cathodic)', category: 'Paint', pricePerKg: 3.68, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-paint-primer', grade: '2K Primer', category: 'Paint', pricePerKg: 6.10, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-paint-basecoat', grade: 'Waterborne Basecoat', category: 'Paint', pricePerKg: 8.62, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-paint-clearcoat', grade: '2K Clearcoat', category: 'Paint', pricePerKg: 9.98, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-paint-powder', grade: 'Powder Coat (Polyester)', category: 'Paint', pricePerKg: 3.36, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK powder coat supplier, Jun 2026. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    // ── Paint / coating (extended) ─────────────────────────────────────────
    { id: 'mat-paint-1k-primer', grade: '1K Etch Primer', category: 'Paint', pricePerKg: 5.40, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Single-pack etch/adhesion primer — pretreat for aluminium/mixed substrates.', confidence: 'Low' },
    { id: 'mat-paint-sb-basecoat', grade: 'Solventborne Basecoat', category: 'Paint', pricePerKg: 9.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Solventborne colour basecoat — refinish/low-volume lines where waterborne cure is impractical.', confidence: 'Low' },
    { id: 'mat-paint-uv-clear', grade: 'UV-Cure Clearcoat', category: 'Paint', pricePerKg: 14.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1080, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. UV-cure clearcoat — instant cure, high scratch resistance, headlamp lenses and trim.', confidence: 'Low' },
    { id: 'mat-paint-pvc-underbody', grade: 'PVC Underbody / Anti-Chip Sealer', category: 'Paint', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Sprayable PVC underbody/anti-chip coating — sills, wheel arches, stone-chip protection.', confidence: 'Low' },
    // ── Blow Moulding Polymers ───────────────────────────────────────────────
    { id: 'mat-pp-bm', grade: 'PP Blow Grade (MFI 1.0, random co-polymer)', category: 'Blow Moulding', pricePerKg: 1.08, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. PP blow grade (random co-polymer, MFI 1.0) — automotive ducts, coolant reservoirs, squeeze bottles. CoolFactor ~3.16 s/mm². Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-petg-bm', grade: 'PETG Clear Blow Grade', category: 'Blow Moulding', pricePerKg: 2.18, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. PETG — clear cosmetic/food bottles, chemical containers. Excellent clarity. CoolFactor ~3.0 s/mm². Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-pvc-bm', grade: 'PVC Rigid Blow Grade (uPVC bottle grade)', category: 'Blow Moulding', pricePerKg: 0.92, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1380, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. Rigid PVC blow grade — detergent/shampoo/food bottles. Good chemical resistance. CoolFactor ~2.5 s/mm². Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-tpe-bm', grade: 'TPE Blow Grade 40 Shore A', category: 'Blow Moulding', pricePerKg: 2.48, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. TPE blow grade — soft-touch squeeze bottles, medical bulbs, automotive boots, flexible ducts. Shore 40A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-eva-bm', grade: 'EVA Blow Grade (14% VA)', category: 'Blow Moulding', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 930, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK resin distributor Jun 2026. EVA 14% vinyl acetate — flexible squeeze bottles, wine casks, co-extrusion tie layers. CoolFactor ~3.3 s/mm². Index-anchored 2026-07 refresh.', confidence: 'Low' },
    // ── Blow Moulding (extended) ─────────────────────────────────────────────
    { id: 'mat-hdpe-bm', grade: 'HDPE Blow Grade (jerry can / drum)', category: 'Blow Moulding', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Blow-moulding HDPE (high MW) — jerry cans, drums, IBC bottles, industrial containers. The workhorse blow resin. CoolFactor ~3.0 s/mm².', confidence: 'Medium' },
    { id: 'mat-hdpe-fuel-coex', grade: 'HDPE Coex Fuel-Tank Grade (6-layer/EVOH)', category: 'Blow Moulding', pricePerKg: 1.55, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Multilayer HDPE/EVOH barrier grade — automotive fuel tanks, permeation-controlled containers. CoolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-pa6-bm', grade: 'PA6 Blow Grade (charge-air / ducts)', category: 'Blow Moulding', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. High-melt-strength PA6 — 3D-blown charge-air ducts, turbo hoses, under-bonnet. CoolFactor ~2.4 s/mm².', confidence: 'Low' },
    { id: 'mat-pc-bm', grade: 'PC Blow Grade (clear/impact)', category: 'Blow Moulding', pricePerKg: 3.90, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Blow-grade polycarbonate — water bottles (5-gal), light globes, impact-clear containers. CoolFactor ~2.5 s/mm².', confidence: 'Low' },
    { id: 'mat-ldpe-bm', grade: 'LDPE Blow Grade', category: 'Blow Moulding', pricePerKg: 0.98, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Soft squeeze bottles, tubes — low stiffness, high ESCR. CoolFactor ~3.5 s/mm².', confidence: 'Medium' },
    { id: 'mat-lldpe-bm', grade: 'LLDPE Blow Grade', category: 'Blow Moulding', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 925, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Tough small containers, toys — better ESCR/impact than HDPE. CoolFactor ~3.4 s/mm².', confidence: 'Medium' },
    { id: 'mat-pet-preform', grade: 'PET Stretch-Blow Bottle Grade', category: 'Blow Moulding', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1370, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. SBM water/CSD/juice bottles (preform reheat-blow). IV ~0.80. CoolFactor ~3.0 s/mm².', confidence: 'Medium' },
    { id: 'mat-tritan-bm', grade: 'Tritan Copolyester (BPA-free clear)', category: 'Blow Moulding', pricePerKg: 6.50, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1180, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Premium clarity + impact, BPA-free — reusable bottles, tumblers, medical. CoolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-biope-bm', grade: 'Bio-PE Blow Grade (sugarcane HDPE)', category: 'Blow Moulding', pricePerKg: 2.20, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Drop-in renewable HDPE (I’m green) — cosmetics/food bottles, low-CO₂ packaging. CoolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-rhdpe-bm', grade: 'Recycled HDPE Blow Grade (PCR)', category: 'Blow Moulding', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Post-consumer HDPE — non-food bottles, detergent, drums; wider property spread. CoolFactor ~3.0 s/mm².', confidence: 'Low' },
    { id: 'mat-rpp-bm', grade: 'Recycled PP Blow Grade (PCR)', category: 'Blow Moulding', pricePerKg: 0.90, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Post-consumer PP — non-visible/industrial containers; lower CO₂, wider tolerance. CoolFactor ~3.16 s/mm².', confidence: 'Low' },
    // ── Rotational Moulding Polymers ─────────────────────────────────────────
    { id: 'mat-lldpe-roto', grade: 'LLDPE Roto Powder (natural)', category: 'Rotational Moulding', pricePerKg: 1.35, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Primary roto resin — tanks, containers, playground; ground to ~35 mesh (add grinding premium). ', confidence: 'Medium' },
    { id: 'mat-hdpe-roto', grade: 'HDPE Roto Powder', category: 'Rotational Moulding', pricePerKg: 1.30, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Stiffer roto grade — large tanks, agricultural, marine. Higher modulus than LLDPE.', confidence: 'Medium' },
    { id: 'mat-pp-roto', grade: 'PP Roto Powder', category: 'Rotational Moulding', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Higher-temp roto grade — chemical/hot-fill tanks, ducting. Narrower processing window.', confidence: 'Low' },
    { id: 'mat-xlpe-roto', grade: 'Cross-Linked PE (XLPE) Roto', category: 'Rotational Moulding', pricePerKg: 1.75, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Cross-linked PE — fuel/chemical tanks, ESCR-critical; not regrindable, needs longer bake.', confidence: 'Low' },
    { id: 'mat-pa12-roto', grade: 'PA12 Roto Powder', category: 'Rotational Moulding', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. High-performance roto — air ducts, fuel tanks, aerospace; high melt temp, long cycle.', confidence: 'Low' },
    { id: 'mat-fr-pe-roto', grade: 'Flame-Retardant PE Roto', category: 'Rotational Moulding', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 970, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. FR-compounded PE — enclosures, transit, rail (UL94/EN45545). Additive-loaded.', confidence: 'Low' },
    { id: 'mat-foam-pe-roto', grade: 'Foamable PE Roto (structural foam core)', category: 'Rotational Moulding', pricePerKg: 1.90, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 700, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Chemical-blowing-agent PE for foamed sandwich walls — stiffness-per-kg, insulation.', confidence: 'Low' },
    { id: 'mat-cond-pe-roto', grade: 'Conductive/Antistatic PE Roto', category: 'Rotational Moulding', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Carbon-loaded PE — ATEX/ESD tanks, fuel handling; surface resistivity <10^6 Ω.', confidence: 'Low' },
    { id: 'mat-rpe-roto', grade: 'Recycled PE Roto Powder', category: 'Rotational Moulding', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 945, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Recyclate roto grade — non-critical tanks, planters, civils; wider property spread.', confidence: 'Low' },
    // ── Rubber Compounds ─────────────────────────────────────────────────────
    { id: 'mat-epdm', grade: 'EPDM 70 Shore A', category: 'Rubber', pricePerKg: 1.90, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber compounder Jun 2026. EPDM seals, hoses, weatherstrips. Shore 70A. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-nbr', grade: 'NBR 70 Shore A', category: 'Rubber', pricePerKg: 2.32, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber compounder Jun 2026. Nitrile rubber — oil/fuel seals, O-rings. Shore 70A. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-silicone-hcr', grade: 'HCR Silicone 60 Shore A', category: 'Rubber', pricePerKg: 8.92, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK silicone supplier Jun 2026. High Consistency Rubber — compression/transfer moulding. Shore 60A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-lsr', grade: 'LSR 40 Shore A', category: 'Rubber', pricePerKg: 15.75, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK silicone supplier Jun 2026. Liquid Silicone Rubber — injection moulding, medical/auto seals. Shore 40A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-nr', grade: 'Natural Rubber SMR20', category: 'Rubber', pricePerKg: 1.72, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber importer Jun 2026. Natural rubber SMR20 grade — tyre compounds, anti-vibration mounts. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-viton-fkm', grade: 'FKM Viton 75 Shore A', category: 'Rubber', pricePerKg: 23.10, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1850, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK fluoroelastomer supplier Jun 2026. FKM Viton — high-temp/chemical seals (>200°C). Shore 75A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-sbr', grade: 'SBR 65 Shore A', category: 'Rubber', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.03, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber compounder Jun 2026. Styrene Butadiene Rubber — general-purpose seals, gaskets, belts, anti-vibration pads. Shore 65A. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-cr', grade: 'CR Neoprene 60 Shore A', category: 'Rubber', pricePerKg: 3.82, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1230, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber compounder Jun 2026. Chloroprene/Neoprene — oil/weather-resistant seals, CV boots, hoses, cable sheaths. Shore 60A. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-hnbr', grade: 'HNBR 70 Shore A', category: 'Rubber', pricePerKg: 5.65, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber compounder Jun 2026. Hydrogenated Nitrile — high-temp oil seals to 150°C+, cam cover gaskets, power steering. Shore 70A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-iir', grade: 'Butyl Rubber IIR 55 Shore A', category: 'Rubber', pricePerKg: 2.18, scrapRecoveryPricePerKg: 0.03, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK rubber importer Jun 2026. Butyl rubber — excellent gas impermeability, tire inner liners, vibration dampers, membrane seals. Shore 55A. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-pu-elastomer', grade: 'Polyurethane Elastomer 70 Shore A', category: 'Rubber', pricePerKg: 4.25, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK PU elastomer supplier Jun 2026. Cast/moulded polyurethane — wear-resistant seals, guide bushes, rollers, suspension bump stops. Shore 70A. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    // ── Rubber Compounds (extended — specialty elastomers) ───────────────────
    { id: 'mat-fvmq', grade: 'FVMQ Fluorosilicone 60 Shore A', category: 'Rubber', pricePerKg: 34.00, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Fluorosilicone — fuel/oil resistance with silicone low-temp flexibility; aerospace/fuel-system seals. Shore 60A.', confidence: 'Low' },
    { id: 'mat-acm', grade: 'ACM Polyacrylate 70 Shore A', category: 'Rubber', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Polyacrylate — hot-oil transmission/engine seals to ~150°C, better than NBR. Shore 70A.', confidence: 'Low' },
    { id: 'mat-aem', grade: 'AEM (Vamac) 60 Shore A', category: 'Rubber', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Ethylene-acrylic — automotive hoses, boots, seals; heat + oil + weather resistance. Shore 60A.', confidence: 'Low' },
    { id: 'mat-eco', grade: 'ECO Epichlorohydrin 65 Shore A', category: 'Rubber', pricePerKg: 5.90, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Epichlorohydrin — fuel hoses, diaphragms; excellent fuel/ozone resistance and low permeability. Shore 65A.', confidence: 'Low' },
    { id: 'mat-csm', grade: 'CSM Hypalon 65 Shore A', category: 'Rubber', pricePerKg: 6.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1500, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Chlorosulphonated PE — chemical/weather/ozone-resistant seals, roofing, cable jackets. Shore 65A.', confidence: 'Low' },
    // ── Composite fibre and resin materials ────────────────────────────────────
    { id: 'mat-cfrp-prepreg-t700', grade: 'T700 CF/Epoxy Prepreg (125°C cure)', category: 'Composite', pricePerKg: 33.60, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1560, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. T700/250F prepreg — structural automotive/aerospace hand layup. Vf~0.60. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-gfrp-prepreg-e', grade: 'E-glass/Epoxy Prepreg (120°C cure)', category: 'Composite', pricePerKg: 7.88, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. E-glass/epoxy prepreg — semi-structural panels, marine. Vf~0.55. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-cf-dry-3k', grade: 'Carbon Fibre 3K Twill Dry Fabric', category: 'Composite', pricePerKg: 25.20, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1750, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. 3K 2×2 twill dry CF — RTM, VARTM, filament winding. Pair with infusion resin. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-gf-dry-e', grade: 'E-glass Woven Dry Fabric (600 g/m²)', category: 'Composite', pricePerKg: 3.99, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. Woven E-glass 600 g/m² — marine, wind, automotive GFRP. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-epoxy-infusion', grade: 'Epoxy Infusion Resin System (LT cure)', category: 'Composite', pricePerKg: 13.65, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. Low-temp infusion epoxy (Gurit / Hexion). RTM/VARTM. Vf 0.50–0.60. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    { id: 'mat-vinylester-rtm', grade: 'Vinyl Ester RTM Resin', category: 'Composite', pricePerKg: 5.46, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. Vinyl ester RTM resin — marine, pipes, corrosion-resistant structures. Index-anchored 2026-07 refresh.', confidence: 'Medium' },
    { id: 'mat-aramid-k49', grade: 'Aramid (Kevlar 49) Woven Fabric', category: 'Composite', pricePerKg: 31.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1440, region: 'UK', effectiveDate: '2026-07', sourceNote: 'UK composite supplier Jun 2026. Kevlar 49 — ballistic protection, aircraft flooring, helmets. Index-anchored 2026-07 refresh.', confidence: 'Low' },
    // ── Composite (extended — UD prepreg, moulding compounds, thermoplastic, cores) ──
    { id: 'mat-cf-uni-t800', grade: 'T800 Unidirectional CF/Epoxy Prepreg', category: 'Composite', pricePerKg: 46.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1580, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Intermediate-modulus UD prepreg — primary aerospace/motorsport structures, autoclave cure. Vf~0.60.', confidence: 'Low' },
    { id: 'mat-smc-gf', grade: 'SMC (Glass-Filled Sheet Moulding Compound)', category: 'Composite', pricePerKg: 2.85, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1900, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Glass/polyester SMC — compression-moulded body panels, structural covers, EV battery lids.', confidence: 'Medium' },
    { id: 'mat-bmc', grade: 'BMC (Bulk Moulding Compound)', category: 'Composite', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1950, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Glass/polyester BMC — electrical housings, headlamp reflectors, motor components; injection/compression moulded.', confidence: 'Medium' },
    { id: 'mat-csm-gf', grade: 'E-glass Chopped Strand Mat (450 g/m²)', category: 'Composite', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1550, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Chopped strand mat — hand-layup/spray-up GFRP, marine hulls, tanks, enclosures.', confidence: 'Medium' },
    { id: 'mat-cf-peek-organo', grade: 'CF/PEEK Organosheet (Thermoplastic)', category: 'Composite', pricePerKg: 62.00, scrapRecoveryPricePerKg: 1.00, densityKgPerM3: 1550, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Continuous CF-reinforced PEEK laminate — stamp-formable aerospace brackets/clips, recyclable, weldable.', confidence: 'Low' },
    { id: 'mat-nomex-honeycomb', grade: 'Nomex Honeycomb Core', category: 'Composite', pricePerKg: 42.00, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 48, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Aramid-paper honeycomb — sandwich-panel core for aircraft floors/interiors; density is core bulk (~48 kg/m³).', confidence: 'Low' },
    { id: 'mat-pet-foam-core', grade: 'PET Structural Foam Core', category: 'Composite', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 100, region: 'UK', effectiveDate: '2026-07', sourceNote: 'Index-anchored 2026-07. Recyclable PET foam core — wind blades, marine, transport sandwich panels; density is core bulk (~100 kg/m³).', confidence: 'Low' },
  ],

  machines: [
    makeMachine(
      'mach-lathe-cnc',
      'CNC Lathe (2-axis)',
      {
        annualDepreciation: 40000,
        maintenance: 22000,
        energy: 20000,
        floorSpace: 8000,
        indirectSupport: 22000,
        financeCost: 16000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 CNC turning centre (Doosan/Hyundai class). Target £40/hr. Jun 2026'
    ),
    makeMachine(
      'mach-vmc3',
      'CNC VMC 3-axis',
      {
        annualDepreciation: 55000,
        maintenance: 30000,
        energy: 28000,
        floorSpace: 12000,
        indirectSupport: 30000,
        financeCost: 21000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 3-axis VMC (HAAS VF/VM class). Target £55/hr. Jun 2026'
    ),
    makeMachine(
      'mach-vmc5',
      'CNC VMC 5-axis',
      {
        annualDepreciation: 95000,
        maintenance: 45000,
        energy: 35000,
        floorSpace: 18000,
        indirectSupport: 48000,
        financeCost: 24200,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'UK Tier-1 5-axis machining centre (DMG/Hermle class). Target £85/hr. Jun 2026'
    ),
    makeMachine(
      'mach-drill',
      'CNC Drilling Centre',
      {
        annualDepreciation: 28000,
        maintenance: 12000,
        energy: 18000,
        floorSpace: 8000,
        indirectSupport: 16000,
        financeCost: 14000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 CNC drilling/tapping centre. Target £30/hr. Jun 2026'
    ),
    makeMachine(
      'mach-grind',
      'CNC Cylindrical Grinder',
      {
        annualDepreciation: 55000,
        maintenance: 30000,
        energy: 28000,
        floorSpace: 10000,
        indirectSupport: 28000,
        financeCost: 20600,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'UK Tier-2 CNC cylindrical grinder. Target £55/hr (precision, high coolant cost). Jun 2026'
    ),
    makeMachine(
      'bench-assembly',
      'Assembly Workbench',
      { annualDepreciation: 500, maintenance: 200, energy: 300, floorSpace: 800, indirectSupport: 500, financeCost: 50, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'Assembly bench — low machine rate; cost primarily driven by labour'
    ),
    // ── Named Machining Centres (Cast+Machine dataset) ─────────────────────
    // HAAS VF-2 3-axis Mill: total=90000, util=0.50 → rate=90000/(4000×0.50)=£45/hr
    makeMachine('mach-haas-vf2', 'HAAS VF-2 (3-axis Mill)',
      { annualDepreciation: 38000, maintenance: 18000, energy: 10500, floorSpace: 5000, indirectSupport: 9500, financeCost: 9000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'HAAS VF-2 benchmark, UK Tier-2 machining shop'),
    // DMG Mori DMU 50 5-axis Mill: total=190000, util=0.50 → rate=£95/hr
    makeMachine('mach-dmg-dmu50', 'DMG Mori DMU 50 (5-axis Mill)',
      { annualDepreciation: 85000, maintenance: 35000, energy: 20000, floorSpace: 8000, indirectSupport: 22000, financeCost: 20000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'DMG Mori DMU 50 benchmark, UK Tier-1 precision shop'),
    // HAAS UMC-500 5-axis Mill: total=150000, util=0.50 → rate=£75/hr
    makeMachine('mach-haas-umc500', 'HAAS UMC-500 (5-axis Mill)',
      { annualDepreciation: 65000, maintenance: 28000, energy: 16000, floorSpace: 7000, indirectSupport: 18000, financeCost: 16000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'HAAS UMC-500 benchmark, UK Tier-2 machining shop'),
    // Mazak Quick Turn 200 Turning: total=100000, util=0.50 → rate=£50/hr
    makeMachine('mach-mazak-qt200', 'Mazak Quick Turn 200 (Turning)',
      { annualDepreciation: 42000, maintenance: 20000, energy: 11000, floorSpace: 5000, indirectSupport: 12000, financeCost: 10000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'Mazak Quick Turn 200 benchmark, UK Tier-2 machining shop'),
    // Gravity Die Casting Machine: total=76000, util=0.50 → rate=76000/(4000×0.50)=£38/hr ≈ £35/hr target
    makeMachine('grav-die-cast-std', 'Gravity Die Casting Machine',
      { annualDepreciation: 28000, maintenance: 14000, energy: 10000, floorSpace: 8000, indirectSupport: 9000, financeCost: 7000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'Standard gravity die casting machine, UK foundry benchmark'),
    // Investment Casting Furnace: total=100000, util=0.60 → rate=100000/(4000×0.60)≈£41.67/hr ≈ £42/hr
    makeMachine('invest-cast-furnace', 'Investment Casting Furnace',
      { annualDepreciation: 40000, maintenance: 16000, energy: 18000, floorSpace: 8000, indirectSupport: 9600, financeCost: 8400, annualAvailableHours: 4000, machineUtilization: 0.60 },
      'UK', 'Investment casting furnace, UK foundry benchmark'),
    makeMachine('heat-treat-furnace', 'Heat Treatment / Ageing Furnace',
      { annualDepreciation: 22000, maintenance: 8000, energy: 35000, floorSpace: 6000, indirectSupport: 5000, financeCost: 2750, annualAvailableHours: 6000, machineUtilization: 0.75 },
      'UK', 'T5/T6 solution + ageing furnace, UK foundry benchmark'),
    // ── Sheet Metal Presses ────────────────────────────────────────────────
    // Generic press-shop presses: STANDARD/AMORTISED mechanical presses (general
    // subcontract press shop). Rates are intentionally lower than the named
    // premium automotive stamping lines (press-schuler-400t ~£150/hr,
    // press-aida-200t ~£120/hr) which model NEW servo/transfer capex — pick the
    // named machines when quoting a dedicated automotive stamping programme.
    makeMachine('press-100t', '100T Mechanical Press (general press shop)',
      { annualDepreciation: 18000, maintenance: 9000, energy: 5000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-200t', '200T Mechanical Press (general press shop)',
      { annualDepreciation: 28000, maintenance: 14000, energy: 7500, floorSpace: 7500, indirectSupport: 6000, financeCost: 3500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-400t', '400T Mechanical Press (general press shop)',
      { annualDepreciation: 50000, maintenance: 22000, energy: 11000, floorSpace: 10000, indirectSupport: 9000, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press; new servo transfer line: use press-schuler-400t), Jun 2026'),
    makeMachine('press-630t', '630T Mechanical Press (general press shop)',
      { annualDepreciation: 75000, maintenance: 35000, energy: 15000, floorSpace: 15000, indirectSupport: 14000, financeCost: 9375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-800t', '800T Mechanical Press (general press shop)',
      { annualDepreciation: 90000, maintenance: 42000, energy: 18000, floorSpace: 18000, indirectSupport: 16000, financeCost: 11250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-1000t', '1000T Mechanical Press (general press shop)',
      { annualDepreciation: 115000, maintenance: 52000, energy: 22000, floorSpace: 22000, indirectSupport: 20000, financeCost: 14375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (large stamping press — deep-draw panels, structural), Jun 2026'),
    makeMachine('press-1250t', '1250T Mechanical Press (general press shop)',
      { annualDepreciation: 145000, maintenance: 65000, energy: 27000, floorSpace: 26000, indirectSupport: 24000, financeCost: 18125, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (heavy stamping press — large body/chassis panels), Jun 2026'),
    makeMachine('press-fineblank-250t', '250T Fine-Blanking Press (triple-action)',
      { annualDepreciation: 60000, maintenance: 28000, energy: 12000, floorSpace: 12000, indirectSupport: 11000, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fine-blanking benchmark. Triple-action FB press — full-shear precision edges (gears, levers, seat recliners). Jun 2026'),
    makeMachine('press-hotstamp-1000t', '1000T Hot-Stamping Press (water-cooled dies)',
      { annualDepreciation: 180000, maintenance: 80000, energy: 30000, floorSpace: 25000, indirectSupport: 24000, financeCost: 22500, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK hot-stamping line press. Forms + quenches austenitised boron blanks in water-cooled dies (B-pillar, rocker). Quench-dwell limited. Jun 2026'),
    makeMachine('furnace-roller-hearth', 'Roller-Hearth Austenitising Furnace (hot stamping)',
      { annualDepreciation: 90000, maintenance: 40000, energy: 50000, floorSpace: 40000, indirectSupport: 20000, financeCost: 11250, annualAvailableHours: 6000, machineUtilization: 0.80 },
      'UK', 'UK hot-stamping furnace. ~900–950°C austenitising roller hearth. Capital/standby only — per-part austenitising heat is a separate energy consumable. Jun 2026'),
    // ── E-Motor Lamination processing ──────────────────────────────────────
    makeMachine('notching-machine', 'CNC Notching Machine (laminations)',
      { annualDepreciation: 40000, maintenance: 18000, energy: 10000, floorSpace: 10000, indirectSupport: 9000, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK electrical-steel benchmark. Single-slot rotary notching for prototype / low-volume stator & rotor laminations (no hard progressive die). Jun 2026'),
    makeMachine('lamination-anneal-furnace', 'Stress-Relief Annealing Furnace (laminations)',
      { annualDepreciation: 70000, maintenance: 30000, energy: 40000, floorSpace: 20000, indirectSupport: 15000, financeCost: 8750, annualAvailableHours: 6000, machineUtilization: 0.80 },
      'UK', 'UK electrical-steel benchmark. ~750–850°C continuous N₂/H₂ stress-relief/decarb anneal to restore core loss after blanking. Per-part heat is a separate energy consumable. Jun 2026'),
    makeMachine('backlack-bonding-oven', 'Backlack Bonding Oven/Press (self-bonded stacks)',
      { annualDepreciation: 45000, maintenance: 20000, energy: 25000, floorSpace: 12000, indirectSupport: 10000, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK electrical-steel benchmark. Heat+pressure cure of self-bonding (backlack) varnish — lowest-loss laminated stacks, EV traction. Jun 2026'),
    makeMachine('laser-stack-welder', 'Laser Stack Welder (stator OD welds)',
      { annualDepreciation: 90000, maintenance: 35000, energy: 15000, floorSpace: 10000, indirectSupport: 14000, financeCost: 11250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK electrical-steel benchmark. Laser welding of stacked stator laminations along the OD — fast, but weld shorts a few edge laminations (small loss penalty). Jun 2026'),
    // ── Injection Moulding Machines ────────────────────────────────────────
    // IMM energy: reflects actual running power (hydraulic pump + heaters + cooling).
    // Energy £ lines are on the UK £0.23/kWh basis (matches REGIONAL_DATA.UK) so
    // buildRegionalLibrary can re-tariff them at each region's actual electricity price.
    // Approx avg power: 50T ~12 kW · 100T ~22 kW · 200T ~38 kW · 350T ~57 kW ·
    // 400T ~65 kW · 500T ~78 kW · 800T ~114 kW · 1200T ~163 kW.
    makeMachine('imm-50t', '50T Injection Moulding Machine',
      { annualDepreciation: 9000, maintenance: 4500, energy: 11000, floorSpace: 2500, indirectSupport: 2000, financeCost: 1125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark (small precision/technical mouldings), Jun 2026'),
    makeMachine('imm-100t', '100T Injection Moulding Machine',
      { annualDepreciation: 14000, maintenance: 7000, energy: 20000, floorSpace: 3500, indirectSupport: 3000, financeCost: 1750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-200t', '200T Injection Moulding Machine',
      { annualDepreciation: 22000, maintenance: 11000, energy: 35000, floorSpace: 5000, indirectSupport: 4500, financeCost: 2750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-350t', '350T Injection Moulding Machine',
      { annualDepreciation: 34000, maintenance: 15500, energy: 52000, floorSpace: 7000, indirectSupport: 6800, financeCost: 4250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-400t', '400T Injection Moulding Machine',
      { annualDepreciation: 40000, maintenance: 18000, energy: 60000, floorSpace: 8000, indirectSupport: 8000, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-500t', '500T Injection Moulding Machine',
      { annualDepreciation: 50000, maintenance: 22000, energy: 72000, floorSpace: 9500, indirectSupport: 10000, financeCost: 6250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-800t', '800T Injection Moulding Machine',
      { annualDepreciation: 70000, maintenance: 32000, energy: 105000, floorSpace: 14000, indirectSupport: 14000, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-1200t', '1200T Injection Moulding Machine',
      { annualDepreciation: 100000, maintenance: 46000, energy: 150000, floorSpace: 20000, indirectSupport: 20000, financeCost: 12500, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark (large structural mouldings), Jun 2026'),
    // ── HPDC Machines ─────────────────────────────────────────────────────
    makeMachine('hpdc-500t', 'HPDC 500T',
      { annualDepreciation: 50000, maintenance: 25000, energy: 40000, floorSpace: 12000, indirectSupport: 10000, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-800t', 'HPDC 800T',
      { annualDepreciation: 80000, maintenance: 38000, energy: 55000, floorSpace: 18000, indirectSupport: 15000, financeCost: 10000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-1600t', 'HPDC 1600T',
      { annualDepreciation: 140000, maintenance: 65000, energy: 100000, floorSpace: 28000, indirectSupport: 25000, financeCost: 17500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('sand-cast-line', 'Sand Casting Moulding Line',
      { annualDepreciation: 25000, maintenance: 12000, energy: 25000, floorSpace: 10000, indirectSupport: 8000, financeCost: 3125, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-160t', 'HPDC 160T (Zinc/Small Al)',
      { annualDepreciation: 18000, maintenance: 9000, energy: 14000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'Small HPDC / zinc die casting machine, UK foundry benchmark'),
    // ── Forging Machines ──────────────────────────────────────────────────
    // Forge press/hammer energy = press motor / compressor only (UK £0.23/kWh basis,
    // re-tariffed regionally). Billet furnace/induction heating is a SEPARATE per-part
    // cost via the heatingEnergyKwhPerKg input — do not fold it into these rates.
    // Presses/screw/upsetter are force-rated (tonnage in the id → load validation);
    // hammers are energy/ram-mass rated and are NOT tonnage-validated.
    makeMachine('forge-press-500t', '500T Mechanical Forge Press',
      { annualDepreciation: 45000, maintenance: 22000, energy: 55000, floorSpace: 12000, indirectSupport: 10000, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jun 2026'),
    makeMachine('forge-press-1600t', '1600T Mechanical Forge Press',
      { annualDepreciation: 90000, maintenance: 42000, energy: 85000, floorSpace: 20000, indirectSupport: 18000, financeCost: 11250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (mid-size crank press), Jun 2026'),
    makeMachine('forge-press-2500t', '2500T Mechanical Forge Press',
      { annualDepreciation: 130000, maintenance: 60000, energy: 120000, floorSpace: 28000, indirectSupport: 26000, financeCost: 16250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (automotive crank/con-rod press), Jun 2026'),
    makeMachine('forge-press-4000t', '4000T Hydraulic Forge Press',
      { annualDepreciation: 200000, maintenance: 90000, energy: 175000, floorSpace: 40000, indirectSupport: 40000, financeCost: 25000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (large hydraulic press), Jun 2026'),
    makeMachine('forge-press-8000t', '8000T Hydraulic Forge Press',
      { annualDepreciation: 380000, maintenance: 170000, energy: 320000, floorSpace: 70000, indirectSupport: 75000, financeCost: 47500, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK forge shop benchmark (heavy structural/aero press), Jun 2026'),
    makeMachine('forge-screw-1000t', '1000T Screw Press',
      { annualDepreciation: 70000, maintenance: 32000, energy: 60000, floorSpace: 16000, indirectSupport: 14000, financeCost: 8750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (screw press — precision/near-net), Jun 2026'),
    makeMachine('forge-upsetter-1000t', '1000T Horizontal Upsetter',
      { annualDepreciation: 60000, maintenance: 28000, energy: 40000, floorSpace: 14000, indirectSupport: 12000, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (upset forging — gears, valves, flanges), Jun 2026'),
    makeMachine('forge-hammer-2t', '2T Pneumatic Forge Hammer',
      { annualDepreciation: 20000, maintenance: 10000, energy: 28000, floorSpace: 10000, indirectSupport: 6000, financeCost: 2500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (small drop hammer), Jun 2026'),
    makeMachine('forge-hammer-5t', '5T Pneumatic Forge Hammer',
      { annualDepreciation: 35000, maintenance: 18000, energy: 45000, floorSpace: 15000, indirectSupport: 9000, financeCost: 4375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jun 2026'),
    makeMachine('forge-hammer-10t', '10T Counterblow Forge Hammer',
      { annualDepreciation: 60000, maintenance: 30000, energy: 70000, floorSpace: 22000, indirectSupport: 15000, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (heavy counterblow hammer), Jun 2026'),
    makeMachine('forge-ring-mill', 'CNC Seamless Ring Rolling Mill',
      { annualDepreciation: 120000, maintenance: 55000, energy: 90000, floorSpace: 30000, indirectSupport: 25000, financeCost: 15000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (radial-axial ring mill), Jun 2026'),
    // ── Painting ──────────────────────────────────────────────────────────
    makeMachine('paint-line-std', 'Standard Paint Line (E-coat + Topcoat)',
      { annualDepreciation: 120000, maintenance: 50000, energy: 80000, floorSpace: 40000, indirectSupport: 30000, financeCost: 15000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK OEM paint line benchmark, Jun 2026'),
    // ── BIW / Assembly ────────────────────────────────────────────────────
    makeMachine('robot-weld-station', 'Robot Welding Station',
      { annualDepreciation: 35000, maintenance: 14000, energy: 6000, floorSpace: 8000, indirectSupport: 7000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK body shop benchmark, Jun 2026'),
    // ── Electronics ───────────────────────────────────────────────────────
    makeMachine('smt-line', 'SMT Pick & Place + Reflow Line',
      { annualDepreciation: 80000, maintenance: 30000, energy: 15000, floorSpace: 20000, indirectSupport: 20000, financeCost: 10000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK EMS benchmark, Jun 2026'),
    makeMachine('smt-high-speed-line', 'High-Speed SMT Line (Fuji/Juki/ASM)',
      { annualDepreciation: 180000, maintenance: 80000, energy: 55000, floorSpace: 30000, indirectSupport: 100000, financeCost: 47000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'High-speed SMT line 80000+ CPH. Automotive EMS benchmark. Target £150/hr. Jun 2026'),
    makeMachine('laser-drill-75um', 'Laser Drill — 75 µm Microvia (CO₂/UV)',
      { annualDepreciation: 150000, maintenance: 60000, energy: 40000, floorSpace: 25000, indirectSupport: 80000, financeCost: 38600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'CO₂/UV laser drill for HDI microvias (≥75 µm). UK PCB fab benchmark. Target £120/hr. Jun 2026'),
    makeMachine('xray-bga-inspection', 'X-Ray BGA Inspection Cell (2D/3D AXI)',
      { annualDepreciation: 120000, maintenance: 45000, energy: 25000, floorSpace: 20000, indirectSupport: 65000, financeCost: 20200, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', '2D/3D automated X-ray inspection for BGA solder joints. EMS automotive benchmark. Target £90/hr. Jun 2026'),
    makeMachine('ict-automotive', 'ICT Bed-of-Nails Test System (Automotive)',
      { annualDepreciation: 130000, maintenance: 55000, energy: 30000, floorSpace: 25000, indirectSupport: 85000, financeCost: 36600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'In-circuit test fixture for IATF 16949 automotive boards. Target £110/hr. Jun 2026'),
    // ── Blow Moulding ─────────────────────────────────────────────────────────
    makeMachine('blow-ebm-100l', 'EBM Blow Moulder (up to 5L)',
      { annualDepreciation: 25000, maintenance: 12000, energy: 18000, floorSpace: 6000, indirectSupport: 5000, financeCost: 3125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for bottles/containers up to 5L. Jun 2026'),
    makeMachine('blow-ebm-500l', 'EBM Blow Moulder (5–100L tanks/drums)',
      { annualDepreciation: 45000, maintenance: 20000, energy: 30000, floorSpace: 12000, indirectSupport: 9000, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for large industrial containers, automotive fuel tanks. Jun 2026'),
    makeMachine('blow-ebm-2head', 'EBM 2-Head (Bottles 1–5L)',
      { annualDepreciation: 30000, maintenance: 14000, energy: 22000, floorSpace: 7000, indirectSupport: 6000, financeCost: 3750, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark Jun 2026. Continuous 2-head EBM for HDPE/LDPE/PP bottles and containers 1–5L. High output, straightforward tooling, typical dairy/detergent packaging.'),
    makeMachine('blow-ebm-coex3', '3-Layer Co-Ex EBM',
      { annualDepreciation: 60000, maintenance: 25000, energy: 35000, floorSpace: 12000, indirectSupport: 12000, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark Jun 2026. 3-layer co-extrusion EBM — HDPE/regrind/HDPE or HDPE/barrier/HDPE for fuel tanks and barrier packaging. Higher capital and manning than mono-layer.'),
    makeMachine('blow-ebm-coex5', '5-Layer Co-Ex EBM (High-Barrier)',
      { annualDepreciation: 100000, maintenance: 40000, energy: 50000, floorSpace: 18000, indirectSupport: 20000, financeCost: 12500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK plastics benchmark Jun 2026. 5-layer co-ex EBM — HDPE/tie/EVOH/tie/HDPE for automotive fuel systems, food packaging requiring high oxygen/fuel barrier. Complex, high capital.'),
    makeMachine('blow-ebm-large', 'Large EBM Accumulator Head (20–200L)',
      { annualDepreciation: 70000, maintenance: 32000, energy: 45000, floorSpace: 20000, indirectSupport: 14000, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.77 },
      'UK', 'UK plastics benchmark Jun 2026. Large accumulator-head EBM for drums (20–200L), IBCs, automotive fuel tanks. Long cycle, single cavity, high tonnage clamp.'),
    makeMachine('blow-ibm-rotary', 'IBM Rotary Machine (Pharma/Cosmetics)',
      { annualDepreciation: 80000, maintenance: 28000, energy: 25000, floorSpace: 15000, indirectSupport: 16000, financeCost: 10000, annualAvailableHours: 5000, machineUtilization: 0.88 },
      'UK', 'UK plastics benchmark Jun 2026. Injection blow moulding rotary — 3/4-station indexing. No flash, dimensional accuracy ±0.05mm. Pharma vials, cosmetics jars, eye-drop bottles. PP/PE/PET.'),
    makeMachine('blow-ibm-linear', 'IBM Linear Machine (Medium Volume)',
      { annualDepreciation: 55000, maintenance: 20000, energy: 20000, floorSpace: 12000, indirectSupport: 11000, financeCost: 6875, annualAvailableHours: 4500, machineUtilization: 0.85 },
      'UK', 'UK plastics benchmark Jun 2026. Injection blow moulding linear indexing. Wide-mouth jars, pharmaceutical bottles, narrow-neck containers. No flash. PP/PE.'),
    makeMachine('blow-sbm-1stage', 'SBM Single-Stage (Preform + Blow)',
      { annualDepreciation: 65000, maintenance: 24000, energy: 35000, floorSpace: 14000, indirectSupport: 13000, financeCost: 8125, annualAvailableHours: 4500, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark Jun 2026. Single-stage stretch blow moulding — preform injection and stretch-blow in one machine. PET/PP wide-mouth jars, cosmetics, condiment bottles. Excellent clarity.'),
    makeMachine('blow-sbm-2stage', 'SBM Two-Stage Reheat (High-Speed PET)',
      { annualDepreciation: 90000, maintenance: 35000, energy: 40000, floorSpace: 16000, indirectSupport: 18000, financeCost: 11250, annualAvailableHours: 6000, machineUtilization: 0.90 },
      'UK', 'UK plastics benchmark Jun 2026. Two-stage reheat SBM — preforms made separately, reheated and blown at 20,000–80,000 bph. Dominant for PET water/CSD/juice bottles. Very low per-part cost at volume.'),
    makeMachine('blow-deflash-trimmer', 'Deflash Trim Robot / Station',
      { annualDepreciation: 15000, maintenance: 6000, energy: 8000, floorSpace: 6000, indirectSupport: 3000, financeCost: 1875, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'UK plastics benchmark Jun 2026. Automated deflash trim station / robot for EBM parts. Removes pinch-off flash from bottles, tanks, automotive parts. 6–15s per part cycle.'),
    // ── Extrusion Lines ────────────────────────────────────────────────────────
    makeMachine('extruder-75mm', 'Single Screw Extruder 75mm',
      { annualDepreciation: 20000, maintenance: 8000, energy: 35000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2500, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. 75mm SSE for profile/pipe/sheet. ~200–400 kg/hr. Jun 2026'),
    makeMachine('extruder-150mm', 'Twin Screw Compounding/Extrusion Line 150mm',
      { annualDepreciation: 80000, maintenance: 30000, energy: 70000, floorSpace: 15000, indirectSupport: 15000, financeCost: 10000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. 150mm TSE compounding/extrusion line. ~800–1500 kg/hr. Jun 2026'),
    // ── Thermoforming ──────────────────────────────────────────────────────────
    makeMachine('thermoform-small', 'Thermoformer (Small/Single Station)',
      { annualDepreciation: 15000, maintenance: 6000, energy: 12000, floorSpace: 4000, indirectSupport: 3000, financeCost: 1875, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. Single-station vacuum former, up to 800×600mm sheet. Jun 2026'),
    makeMachine('thermoform-large', 'Thermoformer (Inline/Rotary, Large)',
      { annualDepreciation: 45000, maintenance: 18000, energy: 28000, floorSpace: 10000, indirectSupport: 9000, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. Inline rotary thermoformer, 1200×1000mm+ sheet. Jun 2026'),
    // ── Rotational Moulding ────────────────────────────────────────────────────
    // Roto energy = oven (gas/electric) + drives; embedded here as a lump, re-tariffed regionally.
    makeMachine('rotomould-biaxial', 'Biaxial Rotational Moulder (3-arm carousel)',
      { annualDepreciation: 30000, maintenance: 14000, energy: 40000, floorSpace: 20000, indirectSupport: 8000, financeCost: 3750, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK plastics benchmark. 3-arm biaxial carousel. Large tanks/playground equip. Jun 2026'),
    makeMachine('rotomould-lab-1arm', 'Single-Arm Rotational Moulder (small/lab)',
      { annualDepreciation: 12000, maintenance: 5000, energy: 15000, floorSpace: 8000, indirectSupport: 3000, financeCost: 1500, annualAvailableHours: 3500, machineUtilization: 0.65 },
      'UK', 'UK plastics benchmark. Single-arm / lab roto — small tanks, prototyping, low volume. Jun 2026'),
    makeMachine('rotomould-shuttle', 'Shuttle Rotational Moulder (1–2 station)',
      { annualDepreciation: 26000, maintenance: 12000, energy: 35000, floorSpace: 18000, indirectSupport: 7000, financeCost: 3250, annualAvailableHours: 3500, machineUtilization: 0.72 },
      'UK', 'UK plastics benchmark. Shuttle roto — mid volume, large/awkward parts, flexible tool changes. Jun 2026'),
    makeMachine('rotomould-rocknroll', 'Rock-and-Roll Rotational Moulder',
      { annualDepreciation: 22000, maintenance: 10000, energy: 30000, floorSpace: 15000, indirectSupport: 6000, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.72 },
      'UK', 'UK plastics benchmark. Rock-and-roll — long narrow parts (kayaks, ducts, pontoons); minor-axis rock + major-axis roll. Jun 2026'),
    makeMachine('rotomould-carousel-4arm', '4-Arm Fixed Carousel Rotational Moulder',
      { annualDepreciation: 45000, maintenance: 20000, energy: 60000, floorSpace: 28000, indirectSupport: 12000, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark. 4-arm fixed-carousel — high-volume independent-arm production, best oven utilisation. Jun 2026'),
    // ── Plastic Joining / Welding ──────────────────────────────────────────────
    makeMachine('ultrasonic-welder', 'Ultrasonic Welder',
      { annualDepreciation: 8000, maintenance: 3000, energy: 2000, floorSpace: 1500, indirectSupport: 2000, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. 3kW+ ultrasonic welder, small–medium plastic parts. Jun 2026'),
    makeMachine('hot-plate-welder', 'Hot Plate Welder',
      { annualDepreciation: 12000, maintenance: 4000, energy: 3000, floorSpace: 3000, indirectSupport: 2500, financeCost: 1500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Hot plate welding for tanks and manifolds. Jun 2026'),
    makeMachine('vibration-welder', 'Vibration Welder',
      { annualDepreciation: 18000, maintenance: 7000, energy: 4000, floorSpace: 4000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Vibration welding, large flat interfaces (automotive ducts). Jun 2026'),
    // ── Sheet Metal Fab — Laser Cutters (named brands) ──────────────────────────
    makeMachine('laser-trumpf-3030', 'Trumpf TruLaser 3030 (6kW Fiber)',
      { annualDepreciation: 90000, maintenance: 65000, energy: 32000, floorSpace: 10000, indirectSupport: 40000, financeCost: 18000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Trumpf TruLaser 3030, 6kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £85/hr. Jun 2026'),
    makeMachine('laser-bystronic-3015', 'Bystronic BySmart 3015 (4kW Fiber)',
      { annualDepreciation: 68000, maintenance: 50000, energy: 24000, floorSpace: 9000, indirectSupport: 35000, financeCost: 24000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Bystronic BySmart 3015, 4kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £70/hr. Jun 2026'),
    // ── Sheet Metal Fab — Turret Punches ──────────────────────────────────────────
    makeMachine('punch-amada-emz3610', 'Amada EMZ 3610 Turret Punch (30T)',
      { annualDepreciation: 58000, maintenance: 45000, energy: 18000, floorSpace: 9000, indirectSupport: 30000, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Amada EMZ 3610, 30T, 58-tool capacity. UK fab shop benchmark. Target £65/hr. Jun 2026'),
    makeMachine('punch-trumpf-5000', 'Trumpf TruPunch 5000 (30T)',
      { annualDepreciation: 68000, maintenance: 55000, energy: 22000, floorSpace: 10000, indirectSupport: 33000, financeCost: 22000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Trumpf TruPunch 5000, 30T, 72-tool capacity. UK fab shop benchmark. Target £75/hr. Jun 2026'),
    // ── Sheet Metal Fab — Press Brakes ────────────────────────────────────────────
    makeMachine('brake-amada-hfe100', 'Amada HFE 100T Press Brake (3m)',
      { annualDepreciation: 48000, maintenance: 38000, energy: 14000, floorSpace: 9000, indirectSupport: 22000, financeCost: 14000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Amada HFE3i 100T, 3000mm. UK fab shop benchmark. Target £55/hr. Jun 2026'),
    makeMachine('brake-trumpf-5230', 'Trumpf TruBend 5230 (230T)',
      { annualDepreciation: 62000, maintenance: 48000, energy: 18000, floorSpace: 10000, indirectSupport: 28000, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Trumpf TruBend 5230, 230T, 3230mm. UK fab shop benchmark. Target £70/hr. Jun 2026'),
    // ── Sheet Metal Fab — High-Volume Stamping Presses ────────────────────────────
    makeMachine('press-schuler-400t', 'Schuler 400T Stamping Press',
      { annualDepreciation: 145000, maintenance: 84500, energy: 55000, floorSpace: 20000, indirectSupport: 65000, financeCost: 40000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Schuler 400T mechanical stamping press. UK automotive press shop. Target £150/hr. Jun 2026'),
    makeMachine('press-aida-200t', 'AIDA 200T Stamping Press',
      { annualDepreciation: 110000, maintenance: 70000, energy: 40000, floorSpace: 18000, indirectSupport: 55000, financeCost: 35000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'AIDA 200T servo stamping press. UK press shop benchmark. Target £120/hr. Jun 2026'),
    // ── Sheet Metal Fab — Roll Forming ────────────────────────────────────────────
    makeMachine('rollform-dimeco-20st', 'Dimeco Roll Forming Line (20 stations)',
      { annualDepreciation: 150000, maintenance: 95000, energy: 55000, floorSpace: 35000, indirectSupport: 70000, financeCost: 40000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'Dimeco 20-station roll forming line. UK fabricator. Target £110/hr. Jun 2026'),
    // ── Sheet Metal Fab — Joining ──────────────────────────────────────────────────
    makeMachine('robot-spotweld-kuka', 'KUKA Spot Welding Robot Cell',
      { annualDepreciation: 90000, maintenance: 55000, energy: 25000, floorSpace: 15000, indirectSupport: 65000, financeCost: 38000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'KUKA robot spot weld cell. UK automotive body shop. Target £90/hr. Jun 2026'),
    makeMachine('mig-welder-manual', 'Manual MIG/MAG Welder Station',
      { annualDepreciation: 4000, maintenance: 2000, energy: 4000, floorSpace: 2000, indirectSupport: 2000, financeCost: 500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual MIG/MAG station. Machine rate low — cost dominated by operator labour. UK fab shop. Jun 2026'),
    makeMachine('tig-welder-manual', 'Manual TIG Welder Station',
      { annualDepreciation: 5000, maintenance: 2500, energy: 3500, floorSpace: 2000, indirectSupport: 2000, financeCost: 700, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual TIG station. Machine rate low — cost dominated by skilled operator labour. UK fab shop. Jun 2026'),
    // ── Sheet Metal Fab — Laser (additional) ─────────────────────────────────
    makeMachine('laser-trumpf-5030', 'Trumpf TruLaser 5030 (10kW Fiber)',
      { annualDepreciation: 135000, maintenance: 90000, energy: 50000, floorSpace: 14000, indirectSupport: 55000, financeCost: 28000, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK fab shop benchmark Jun 2026. Trumpf TruLaser 5030, 10kW fiber, 3000×1500 bed. High-speed cutting of thick plate (25mm mild steel, 15mm SS). Dynamic beam shaping BrightLine.'),
    makeMachine('laser-amada-ensis-3015', 'Amada ENSIS 3015 AJ (3kW Fiber)',
      { annualDepreciation: 72000, maintenance: 52000, energy: 22000, floorSpace: 9000, indirectSupport: 36000, financeCost: 15000, annualAvailableHours: 4000, machineUtilization: 0.76 },
      'UK', 'UK fab shop benchmark Jun 2026. Amada ENSIS 3015 AJ, 3kW variable-beam fiber, 3000×1500 bed. Intelligent beam control — cuts thin to thick sheet without mode change.'),
    // ── Sheet Metal Fab — Plasma Cutting ─────────────────────────────────────
    makeMachine('plasma-hypertherm-xpr300', 'Hypertherm XPR300 Plasma Table',
      { annualDepreciation: 38000, maintenance: 28000, energy: 22000, floorSpace: 14000, indirectSupport: 18000, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Hypertherm XPR300 plasma — 300A, cuts up to 80mm mild steel. Plasma table for structural steel, heavy plate, general fabrication. Better edge quality than HiFocus for thick plate.'),
    makeMachine('plasma-kjellberg-hifocus280', 'Kjellberg HiFocus 280i Plasma Table',
      { annualDepreciation: 32000, maintenance: 24000, energy: 20000, floorSpace: 14000, indirectSupport: 16000, financeCost: 6500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Kjellberg HiFocus 280i — 280A HD plasma for precision cutting up to 50mm. Better edge perpendicularity than standard plasma.'),
    // ── Sheet Metal Fab — Waterjet ────────────────────────────────────────────
    makeMachine('waterjet-flow-mach500', 'Flow Mach 500 Waterjet (60K psi)',
      { annualDepreciation: 45000, maintenance: 32000, energy: 28000, floorSpace: 16000, indirectSupport: 20000, financeCost: 9000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Flow Mach 500, 4000×2000 bed, 60,000 psi. Cuts steel, Al, SS, titanium, glass, ceramic. No HAZ — ideal for hardened/heat-sensitive materials.'),
    makeMachine('waterjet-omax-80x', 'Omax 80X Waterjet (60K psi)',
      { annualDepreciation: 38000, maintenance: 28000, energy: 24000, floorSpace: 14000, indirectSupport: 18000, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Omax 80X, 2286×2286 bed, 60,000 psi. Versatile shop waterjet — metal, glass, stone, composites. Intelli-MAX software with optimised path generation.'),
    // ── Sheet Metal Fab — Shearing ────────────────────────────────────────────
    makeMachine('shear-hydraulic-3m', 'Hydraulic Guillotine Shear (3m × 6mm)',
      { annualDepreciation: 14000, maintenance: 8000, energy: 5000, floorSpace: 6000, indirectSupport: 5000, financeCost: 2500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Hydraulic guillotine shear, 3000mm × 6mm mild steel capacity. Straight-line blanking. Very low cycle cost — ideal for simple rectangular blanks.'),
    makeMachine('shear-guillotine-6mm', 'Hydraulic Shear Heavy Duty (4m × 6mm)',
      { annualDepreciation: 20000, maintenance: 10000, energy: 7000, floorSpace: 8000, indirectSupport: 7000, financeCost: 3500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Heavy-duty hydraulic shear, 4000mm × 6mm (12mm MS). For heavy plate blanking and structural steel service centres.'),
    // ── Sheet Metal Fab — Press Brakes (additional) ───────────────────────────
    makeMachine('brake-amada-hfe170', 'Amada HFE3i 170T Press Brake (4m)',
      { annualDepreciation: 60000, maintenance: 46000, energy: 18000, floorSpace: 11000, indirectSupport: 28000, financeCost: 17000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Amada HFE3i 170T, 4000mm. Larger brake for heavier plate forming and longer parts. ATC (Auto Tool Changer) option available.'),
    makeMachine('brake-trumpf-trubend3100', 'Trumpf TruBend 3100 (100T)',
      { annualDepreciation: 45000, maintenance: 35000, energy: 13000, floorSpace: 9000, indirectSupport: 20000, financeCost: 13000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Trumpf TruBend 3100, 100T, 3000mm. CNC press brake with BendGuard safety and TASC adaptive bending for high angle accuracy.'),
    makeMachine('brake-lvd-ppeb135', 'LVD PPEB 135T/30 Press Brake',
      { annualDepreciation: 52000, maintenance: 40000, energy: 15000, floorSpace: 10000, indirectSupport: 24000, financeCost: 15000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. LVD PPEB 135T/30, 3000mm. Electro-hydraulic CNC brake with Touch-B offline programming and angle measurement system.'),
    // ── Sheet Metal Fab — Joining (additional) ────────────────────────────────
    makeMachine('spotweld-gun-manual', 'Pedestal Spot Welding Machine',
      { annualDepreciation: 6000, maintenance: 3000, energy: 5000, floorSpace: 4000, indirectSupport: 3000, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Pedestal spot welder, 100kVA, programmable pressure/time/current. Manual C-gun also available. For body panel tack welding and structural joins.'),
    makeMachine('robot-mig-cell', 'Robotic MIG/MAG Welding Cell',
      { annualDepreciation: 75000, maintenance: 40000, energy: 20000, floorSpace: 12000, indirectSupport: 45000, financeCost: 30000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK fab shop benchmark Jun 2026. 6-axis robot MIG cell (Fanuc/KUKA), dual-station fixture, arc-sensing seam tracking. Deposition speed 0.5–1.2 m/min. For high-volume structural welding.'),
    // ── Rubber Processing ─────────────────────────────────────────────────────
    makeMachine('compression-mould-std', 'Compression Moulding Press 250T',
      { annualDepreciation: 18000, maintenance: 8000, energy: 10000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK rubber moulding benchmark Jun 2026. 250T compression press — EPDM/NR/NBR gaskets, mounts.'),
    makeMachine('transfer-mould-std', 'Transfer Moulding Press 200T',
      { annualDepreciation: 22000, maintenance: 10000, energy: 12000, floorSpace: 6000, indirectSupport: 5000, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK rubber moulding benchmark Jun 2026. 200T transfer press — bonded rubber-metal parts, complex geometry.'),
    makeMachine('lsr-injection-machine', 'LSR Injection Moulding Machine',
      { annualDepreciation: 35000, maintenance: 14000, energy: 20000, floorSpace: 7000, indirectSupport: 7000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK silicone moulding benchmark Jun 2026. Liquid silicone rubber injection (Engel/Arburg/Sumitomo). Medical/auto seals.'),
    makeMachine('cure-oven-rubber', 'Rubber Cure / Vulcanisation Oven',
      { annualDepreciation: 10000, maintenance: 4000, energy: 25000, floorSpace: 6000, indirectSupport: 3000, financeCost: 1250, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK rubber benchmark Jun 2026. Salt-bath or hot-air oven for EPDM/NBR extrusion vulcanisation.'),
    makeMachine('extruder-rubber-60mm', 'Rubber Extruder 60mm (Cold-feed)',
      { annualDepreciation: 15000, maintenance: 6000, energy: 18000, floorSpace: 4000, indirectSupport: 3500, financeCost: 1875, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK rubber benchmark Jun 2026. 60mm cold-feed rubber extruder — EPDM seals, hose profiles.'),
    makeMachine('die-cut-press-rubber', 'Hydraulic Die-Cutting Press 20T',
      { annualDepreciation: 8000, maintenance: 3500, energy: 5000, floorSpace: 3000, indirectSupport: 2000, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'UK rubber benchmark Jun 2026. 20T hydraulic die-cutting press — flat gaskets, seals, strips. Blanks pre-vulcanised EPDM/SBR/NBR/CR sheet at high throughput.'),
    // ── Composite Manufacturing Equipment ────────────────────────────────────
    makeMachine('autoclave-1200mm', 'Production Autoclave 1200mm dia',
      { annualDepreciation: 60000, maintenance: 25000, energy: 50000, floorSpace: 20000, indirectSupport: 15000, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'UK composites benchmark Jun 2026. 1200mm × 3000mm production autoclave. CFRP aerospace/auto structures.'),
    makeMachine('oven-composite-cure', 'Composite Cure Oven (Fan-Assisted)',
      { annualDepreciation: 18000, maintenance: 6000, energy: 30000, floorSpace: 12000, indirectSupport: 5000, financeCost: 2250, annualAvailableHours: 5000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark Jun 2026. Fan-assisted oven cure — prepreg (no autoclave pressure), wet layup post-cure.'),
    makeMachine('rtm-press-std', 'RTM / VARTM Injection Press',
      { annualDepreciation: 22000, maintenance: 9000, energy: 12000, floorSpace: 8000, indirectSupport: 6000, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK composites benchmark Jun 2026. Resin Transfer Moulding injection press. Structural automotive CFRP/GFRP.'),
    makeMachine('waterjet-5ax-composite', '5-Axis Waterjet Trim System',
      { annualDepreciation: 35000, maintenance: 14000, energy: 20000, floorSpace: 12000, indirectSupport: 10000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark Jun 2026. 5-axis waterjet trim/drill for CFRP panels. 380 MPa, 0.4mm orifice.'),
    makeMachine('mach-afp-atl', 'AFP/ATL Composite Cell',
      { annualDepreciation: 420000, maintenance: 160000, energy: 80000, floorSpace: 40000, indirectSupport: 60000, financeCost: 24000, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'Automated Fibre/Tape Placement cell. Rate includes robot, gantry, head, NC software, maintenance. Setup: 4.0 hr. UK composites benchmark Jun 2026.'),
    // ── Wiring Harness Equipment ───────────────────────────────────────────
    makeMachine('harness-test-sys', 'Electrical Harness Test System (Continuity + HiPot)',
      { annualDepreciation: 18000, maintenance: 5000, energy: 3000, floorSpace: 4000, indirectSupport: 5000, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK harness benchmark Jun 2026. Automated electrical test: continuity, insulation resistance, HiPot. IATF-compliant.'),

    // ══════════════════════════════════════════════════════════════════════════
    // REGIONAL MACHINE RATES — China, India, Germany, Poland, Mexico
    // Depreciation & finance cost same as UK (capital equipment is globally traded).
    // Energy, floor-space, maintenance & indirect support scaled to regional rates.
    // Energy ratios vs UK £0.23/kWh: CN=0.26, IN=0.35, DE=0.87, PL=0.52, MX=0.39
    // Floor ratios vs UK: CN=0.15, IN=0.10, DE=0.80, PL=0.35, MX=0.20
    // Indirect/maintenance ratios vs UK: CN=0.30, IN=0.22, DE=1.40, PL=0.45, MX=0.30
    // ══════════════════════════════════════════════════════════════════════════

    // ── CNC Machining — VMC 3-axis ────────────────────────────────────────────
    makeMachine('mach-vmc3-cn', 'VMC 3-axis CNC (China)',
      { annualDepreciation: 22000, maintenance: 2400, energy: 1300, floorSpace: 525, indirectSupport: 2250, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'CN', 'China CNC machining benchmark. 3-axis VMC, Jiangsu/Guangdong region. Jun 2026'),
    makeMachine('mach-vmc3-in', 'VMC 3-axis CNC (India)',
      { annualDepreciation: 22000, maintenance: 2000, energy: 1750, floorSpace: 350, indirectSupport: 1500, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'IN', 'India CNC machining benchmark. Pune/Chennai corridor. Jun 2026'),
    makeMachine('mach-vmc3-de', 'VMC 3-axis CNC (Germany)',
      { annualDepreciation: 22000, maintenance: 11200, energy: 4350, floorSpace: 2800, indirectSupport: 10500, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.87 },
      'DE', 'Germany precision machining benchmark. Baden-Württemberg. Jun 2026'),
    makeMachine('mach-vmc3-pl', 'VMC 3-axis CNC (Poland)',
      { annualDepreciation: 22000, maintenance: 3600, energy: 2600, floorSpace: 1225, indirectSupport: 3375, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'PL', 'Poland CNC machining benchmark. Silesia/Lower Silesia. Jun 2026'),
    makeMachine('mach-vmc3-mx', 'VMC 3-axis CNC (Mexico)',
      { annualDepreciation: 22000, maintenance: 2400, energy: 1950, floorSpace: 700, indirectSupport: 2250, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'MX', 'Mexico CNC machining benchmark. Monterrey/Guanajuato. Jun 2026'),

    // ── Injection Moulding — 200T ──────────────────────────────────────────────
    makeMachine('imm-200t-cn', 'Injection Moulding 200T (China)',
      { annualDepreciation: 28000, maintenance: 3000, energy: 4200, floorSpace: 1200, indirectSupport: 3000, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.85 },
      'CN', 'China injection moulding benchmark. Taizhou/Guangdong plastics belt. Jun 2026'),
    makeMachine('imm-200t-in', 'Injection Moulding 200T (India)',
      { annualDepreciation: 28000, maintenance: 2500, energy: 5600, floorSpace: 800, indirectSupport: 2200, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.83 },
      'IN', 'India injection moulding benchmark. Pune/Rajkot plastics cluster. Jun 2026'),
    makeMachine('imm-200t-de', 'Injection Moulding 200T (Germany)',
      { annualDepreciation: 28000, maintenance: 14000, energy: 13920, floorSpace: 6400, indirectSupport: 22400, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.87 },
      'DE', 'Germany injection moulding benchmark. Jun 2026'),
    makeMachine('imm-200t-pl', 'Injection Moulding 200T (Poland)',
      { annualDepreciation: 28000, maintenance: 4500, energy: 8320, floorSpace: 2800, indirectSupport: 7200, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.85 },
      'PL', 'Poland injection moulding benchmark. Jun 2026'),
    makeMachine('imm-200t-mx', 'Injection Moulding 200T (Mexico)',
      { annualDepreciation: 28000, maintenance: 3000, energy: 6240, floorSpace: 1600, indirectSupport: 3000, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.84 },
      'MX', 'Mexico injection moulding benchmark. Monterrey/Saltillo. Jun 2026'),

    // ── HPDC Casting — 500T ──────────────────────────────────────────────────
    makeMachine('hpdc-500t-cn', 'HPDC 500T (China)',
      { annualDepreciation: 55000, maintenance: 6000, energy: 7800, floorSpace: 2250, indirectSupport: 7500, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'CN', 'China HPDC foundry benchmark. ADC12 Al alloy. Guangdong/Jiangsu. Jun 2026'),
    makeMachine('hpdc-500t-in', 'HPDC 500T (India)',
      { annualDepreciation: 55000, maintenance: 5000, energy: 10500, floorSpace: 1500, indirectSupport: 5500, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'IN', 'India HPDC foundry benchmark. Rajkot/Pune auto cluster. Jun 2026'),
    makeMachine('hpdc-500t-mx', 'HPDC 500T (Mexico)',
      { annualDepreciation: 55000, maintenance: 6000, energy: 11700, floorSpace: 3000, indirectSupport: 7500, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'MX', 'Mexico HPDC benchmark. Monterrey auto zone. Jun 2026'),

    // ── Sheet Metal Stamping — 400T ────────────────────────────────────────────
    makeMachine('press-400t-cn', 'Stamping Press 400T (China)',
      { annualDepreciation: 38000, maintenance: 3600, energy: 5200, floorSpace: 3000, indirectSupport: 4500, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'CN', 'China press shop benchmark. Wuhan/Shanghai auto stamping. Jun 2026'),
    makeMachine('press-400t-in', 'Stamping Press 400T (India)',
      { annualDepreciation: 38000, maintenance: 3000, energy: 7000, floorSpace: 2000, indirectSupport: 3300, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'IN', 'India press shop benchmark. Pune/NCR auto cluster. Jun 2026'),
    makeMachine('press-400t-pl', 'Stamping Press 400T (Poland)',
      { annualDepreciation: 38000, maintenance: 5400, energy: 10400, floorSpace: 5250, indirectSupport: 6750, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'PL', 'Poland stamping press benchmark. Silesia auto suppliers. Jun 2026'),
    makeMachine('press-400t-mx', 'Stamping Press 400T (Mexico)',
      { annualDepreciation: 38000, maintenance: 3600, energy: 7800, floorSpace: 4000, indirectSupport: 4500, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'MX', 'Mexico stamping benchmark. Saltillo auto corridor. Jun 2026'),

    // ── Manual Assembly / Bench ────────────────────────────────────────────────
    makeMachine('bench-assembly-cn', 'Manual Assembly Bench (China)',
      { annualDepreciation: 3000, maintenance: 300, energy: 260, floorSpace: 600, indirectSupport: 1000, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'CN', 'China assembly benchmark. Shenzhen/Suzhou. Harness, PCBA, BIW subassembly. Jun 2026'),
    makeMachine('bench-assembly-in', 'Manual Assembly Bench (India)',
      { annualDepreciation: 3000, maintenance: 250, energy: 350, floorSpace: 400, indirectSupport: 750, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'IN', 'India assembly benchmark. Pune/Nashik auto corridor. Jun 2026'),
    makeMachine('bench-assembly-mx', 'Manual Assembly Bench (Mexico)',
      { annualDepreciation: 3000, maintenance: 300, energy: 390, floorSpace: 800, indirectSupport: 1000, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'MX', 'Mexico assembly benchmark. Juárez/Monterrey maquiladora. Jun 2026'),
    makeMachine('bench-assembly-vn', 'Manual Assembly Bench (Vietnam)',
      { annualDepreciation: 3000, maintenance: 200, energy: 312, floorSpace: 300, indirectSupport: 600, financeCost: 750, annualAvailableHours: 4800, machineUtilization: 0.92 },
      'VN', 'Vietnam assembly benchmark. Ho Chi Minh City / Hanoi. Wiring harness. Jun 2026'),
    makeMachine('bench-assembly-pl', 'Manual Assembly Bench (Poland)',
      { annualDepreciation: 3000, maintenance: 450, energy: 624, floorSpace: 1050, indirectSupport: 1350, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'PL', 'Poland assembly benchmark. Łódź/Wrocław. Harness, electronics. Jun 2026'),
  ],

  labour: [
    {
      id: 'lab-uk-skilled',
      region: 'UK',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 26.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK AMT wage survey Jun 2026, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-semiskilled',
      region: 'UK',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 19.80,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK AMT wage survey Jun 2026, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-engineer',
      region: 'UK',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 42.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK engineering salary benchmark Jun 2026',
      confidence: 'Medium',
    },
    {
      id: 'lab-in-skilled',
      region: 'India',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 5.10,
      effectiveDate: '2026-06-14',
      sourceNote: 'India manufacturing wage benchmark Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-skilled',
      region: 'China',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.90,
      effectiveDate: '2026-06-14',
      sourceNote: 'China manufacturing wage benchmark Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-foundry',
      region: 'UK',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 18.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK foundry/casting operator wage survey Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-inspector',
      region: 'UK',
      skillLevel: 'CMM / Quality Inspector',
      fullyLoadedRatePerHr: 27.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK quality/inspection wage benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-technician',
      region: 'UK',
      skillLevel: 'Maintenance / Mould-Setter Technician',
      fullyLoadedRatePerHr: 28.60,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK process/maintenance technician benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-supervisor',
      region: 'UK',
      skillLevel: 'Shift / Production Supervisor',
      fullyLoadedRatePerHr: 35.10,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK production supervisor benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-forge',
      region: 'UK',
      skillLevel: 'Forge Operator / Hammer-man',
      fullyLoadedRatePerHr: 24.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK drop-forge operator wage benchmark Jun 2026, incl. NI + benefits + hot-work allowance',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-furnace',
      region: 'UK',
      skillLevel: 'Furnace / Heat Operator',
      fullyLoadedRatePerHr: 22.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK furnace/induction heat operator wage benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-blow',
      region: 'UK',
      skillLevel: 'Blow Moulding Operator',
      fullyLoadedRatePerHr: 20.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK blow-moulding machine operator wage benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-roto',
      region: 'UK',
      skillLevel: 'Rotational Moulding Operator',
      fullyLoadedRatePerHr: 20.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK roto-moulding operator wage benchmark Jun 2026, incl. NI + benefits (hot demould/charge)',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-skilled',
      region: 'Germany',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 40.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Germany IG Metall wage survey Jun 2026, incl. social costs',
      confidence: 'Medium',
    },
    {
      id: 'lab-pl-skilled',
      region: 'Poland',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 12.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Poland manufacturing wage benchmark Jun 2026, incl. social costs',
      confidence: 'Low',
    },
    {
      id: 'lab-mx-skilled',
      region: 'Mexico',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Mexico manufacturing wage benchmark Jun 2026 (IMSS included)',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-electronics',
      region: 'UK',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 17.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'UK EMS operator wage benchmark Jun 2026, incl. NI + benefits',
      confidence: 'Medium',
    },
    // ── Germany ──────────────────────────────────────────────────────────────
    {
      id: 'lab-de-semiskilled',
      region: 'Germany',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 32.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Germany IG Metall Lohngruppe 3 Jun 2026, incl. social costs',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-foundry',
      region: 'Germany',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 35.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Germany foundry Tarifvertrag Jun 2026, incl. social costs',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-electronics',
      region: 'Germany',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 30.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Germany EMS operator benchmark Jun 2026, incl. social costs',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-engineer',
      region: 'Germany',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 65.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Germany engineering salary benchmark Jun 2026, incl. social costs',
      confidence: 'Medium',
    },
    // ── Poland ───────────────────────────────────────────────────────────────
    {
      id: 'lab-pl-semiskilled',
      region: 'Poland',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 9.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Poland manufacturing wage benchmark Jun 2026, incl. social costs',
      confidence: 'Low',
    },
    {
      id: 'lab-pl-electronics',
      region: 'Poland',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 10.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Poland EMS sector benchmark Jun 2026, incl. social costs',
      confidence: 'Low',
    },
    {
      id: 'lab-pl-foundry',
      region: 'Poland',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 10.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Poland foundry wage benchmark Jun 2026, incl. social costs',
      confidence: 'Low',
    },
    // ── China ─────────────────────────────────────────────────────────────────
    {
      id: 'lab-cn-semiskilled',
      region: 'China',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'China Pearl/Yangtze delta manufacturing wage benchmark Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-electronics',
      region: 'China',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 6.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'China EMS operator benchmark Jun 2026 (Shenzhen/Suzhou)',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-engineer',
      region: 'China',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 18.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'China manufacturing engineer salary benchmark Jun 2026',
      confidence: 'Low',
    },
    // ── India ─────────────────────────────────────────────────────────────────
    {
      id: 'lab-in-semiskilled',
      region: 'India',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 3.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'India manufacturing wage benchmark Jun 2026 (Pune/Chennai)',
      confidence: 'Low',
    },
    {
      id: 'lab-in-electronics',
      region: 'India',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 4.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'India EMS operator benchmark Jun 2026 (Bangalore/Chennai)',
      confidence: 'Low',
    },
    {
      id: 'lab-in-engineer',
      region: 'India',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 12.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'India manufacturing engineer salary benchmark Jun 2026',
      confidence: 'Low',
    },
    // ── Mexico ────────────────────────────────────────────────────────────────
    {
      id: 'lab-mx-semiskilled',
      region: 'Mexico',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.80,
      effectiveDate: '2026-06-14',
      sourceNote: 'Mexico manufacturing wage benchmark Jun 2026 (Monterrey/Juárez, IMSS included)',
      confidence: 'Low',
    },
    {
      id: 'lab-mx-electronics',
      region: 'Mexico',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 6.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Mexico EMS operator benchmark Jun 2026 (Juárez/Tijuana, IMSS included)',
      confidence: 'Low',
    },
    // ── Turkey ────────────────────────────────────────────────────────────────
    {
      id: 'lab-tr-skilled',
      region: 'Turkey',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 8.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Turkey manufacturing wage benchmark Jun 2026 (Bursa/İzmir, SGK included)',
      confidence: 'Low',
    },
    {
      id: 'lab-tr-semiskilled',
      region: 'Turkey',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 6.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Turkey manufacturing wage benchmark Jun 2026 (SGK included)',
      confidence: 'Low',
    },
    // ── Vietnam ───────────────────────────────────────────────────────────────
    {
      id: 'lab-vn-skilled',
      region: 'Vietnam',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 4.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Vietnam manufacturing wage benchmark Jun 2026 (Ho Chi Minh / Hanoi)',
      confidence: 'Low',
    },
    {
      id: 'lab-vn-semiskilled',
      region: 'Vietnam',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 2.80,
      effectiveDate: '2026-06-14',
      sourceNote: 'Vietnam manufacturing wage benchmark Jun 2026',
      confidence: 'Low',
    },
    // ── South Korea ───────────────────────────────────────────────────────────
    {
      id: 'lab-kr-skilled',
      region: 'South Korea',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 22.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Korea manufacturing wage benchmark Jun 2026 (Ulsan/Busan, incl. health + pension)',
      confidence: 'Low',
    },
    {
      id: 'lab-kr-electronics',
      region: 'South Korea',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 18.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Korea EMS operator benchmark Jun 2026 (Suwon/Gumi)',
      confidence: 'Low',
    },
    // ── Romania ───────────────────────────────────────────────────────────────
    {
      id: 'lab-ro-skilled',
      region: 'Romania',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 8.00,
      effectiveDate: '2026-06-14',
      sourceNote: 'Romania manufacturing wage benchmark Jun 2026 (Cluj/Timișoara, CAS included)',
      confidence: 'Low',
    },
    {
      id: 'lab-ro-semiskilled',
      region: 'Romania',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 6.50,
      effectiveDate: '2026-06-14',
      sourceNote: 'Romania manufacturing wage benchmark Jun 2026 (CAS included)',
      confidence: 'Low',
    },
  ],

  energy: [
    {
      id: 'energy-uk',
      region: 'UK',
      electricityPerKwh: 0.23,
      gasPerKwh: 0.065,
      effectiveDate: '2026-06-14',
      sourceNote: 'Ofgem industrial tariff Q1 2026',
      confidence: 'High',
    },
    {
      id: 'energy-eu',
      region: 'EU',
      electricityPerKwh: 0.185,
      gasPerKwh: 0.058,
      effectiveDate: '2026-06-14',
      sourceNote: 'Eurostat industrial energy Q1 2026',
      confidence: 'Medium',
    },
    {
      id: 'energy-de',
      region: 'Germany',
      electricityPerKwh: 0.20,
      gasPerKwh: 0.055,
      effectiveDate: '2026-06-14',
      sourceNote: 'Bundesnetzagentur industrial tariff Q1 2026',
      confidence: 'Medium',
    },
    {
      id: 'energy-pl',
      region: 'Poland',
      electricityPerKwh: 0.12,
      gasPerKwh: 0.040,
      effectiveDate: '2026-06-14',
      sourceNote: 'URE Poland industrial energy Q1 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-cn',
      region: 'China',
      electricityPerKwh: 0.06,
      gasPerKwh: 0.025,
      effectiveDate: '2026-06-14',
      sourceNote: 'NDRC China industrial electricity benchmark Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-in',
      region: 'India',
      electricityPerKwh: 0.08,
      gasPerKwh: 0.020,
      effectiveDate: '2026-06-14',
      sourceNote: 'India industrial electricity benchmark Jun 2026 (MSEDCL/TNEB avg)',
      confidence: 'Low',
    },
    {
      id: 'energy-mx',
      region: 'Mexico',
      electricityPerKwh: 0.09,
      gasPerKwh: 0.030,
      effectiveDate: '2026-06-14',
      sourceNote: 'CFE Mexico industrial tariff Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-tr',
      region: 'Turkey',
      electricityPerKwh: 0.11,
      gasPerKwh: 0.038,
      effectiveDate: '2026-06-14',
      sourceNote: 'EPDK Turkey industrial tariff Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-kr',
      region: 'South Korea',
      electricityPerKwh: 0.09,
      gasPerKwh: 0.032,
      effectiveDate: '2026-06-14',
      sourceNote: 'KEPCO Korea industrial tariff Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-vn',
      region: 'Vietnam',
      electricityPerKwh: 0.07,
      gasPerKwh: 0.018,
      effectiveDate: '2026-06-14',
      sourceNote: 'EVN Vietnam industrial electricity benchmark Jun 2026',
      confidence: 'Low',
    },
    {
      id: 'energy-ro',
      region: 'Romania',
      electricityPerKwh: 0.11,
      gasPerKwh: 0.042,
      effectiveDate: '2026-06-14',
      sourceNote: 'ANRE Romania industrial tariff Jun 2026',
      confidence: 'Low',
    },
  ],

  fx: [
    { id: 'fx-gbp-eur', fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.16, effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-usd', fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.27, effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-inr', fromCurrency: 'GBP', toCurrency: 'INR', rate: 109.5, effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-cny', fromCurrency: 'GBP', toCurrency: 'CNY', rate: 9.05, effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-mxn', fromCurrency: 'GBP', toCurrency: 'MXN', rate: 25.5,    effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-thb', fromCurrency: 'GBP', toCurrency: 'THB', rate: 45.5,    effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-vnd', fromCurrency: 'GBP', toCurrency: 'VND', rate: 33800.0, effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-brl', fromCurrency: 'GBP', toCurrency: 'BRL', rate: 6.85,    effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
    { id: 'fx-gbp-krw', fromCurrency: 'GBP', toCurrency: 'KRW', rate: 1790.0,  effectiveDate: '2026-06-14', sourceNote: 'BOE spot Jun 2026' },
  ],

  overheadDefaults: [
    { id: 'oh-machining-t2',         commodityType: 'machining',          supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-machining-t1',         commodityType: 'machining',          supplierTier: 'Tier 1', overheadPct: 0.15, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-sheet-metal-t2',       commodityType: 'sheet_metal',        supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-injection-moulding-t2',commodityType: 'injection_moulding', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-casting-t2',           commodityType: 'casting',            supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-forging-t2',           commodityType: 'forging',            supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-painting-t2',          commodityType: 'painting',           supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.06, sourceNote: 'Industry benchmark' },
    { id: 'oh-biw-t2',               commodityType: 'biw_assembly',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-pcb-fab-t2',           commodityType: 'pcb_fab',            supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-pcba-t2',              commodityType: 'pcba',               supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-cast-and-machine-t2',  commodityType: 'cast_and_machine',   supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-blow-moulding-t2',    commodityType: 'blow_moulding',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-extrusion-t2',        commodityType: 'extrusion',           supplierTier: 'Tier 2', overheadPct: 0.09, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-thermoforming-t2',    commodityType: 'thermoforming',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-rotomoulding-t2',     commodityType: 'rotational_moulding', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-sheet-metal-fab-t2', commodityType: 'sheet_metal_fab',     supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-rubber-t2', commodityType: 'rubber', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-composites-t2',    commodityType: 'composites',     supplierTier: 'Tier 2', overheadPct: 0.14, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-wiring-harness-t2',commodityType: 'wiring_harness', supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
  ],
};

export function getLibraryFromStorage(): RateLibrary {
  if (typeof localStorage === 'undefined') return DEFAULT_RATE_LIBRARY;
  const stored = localStorage.getItem('shouldCostRateLibrary');
  if (!stored) return DEFAULT_RATE_LIBRARY;
  try {
    return JSON.parse(stored) as RateLibrary;
  } catch {
    return DEFAULT_RATE_LIBRARY;
  }
}

export function saveLibraryToStorage(lib: RateLibrary): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('shouldCostRateLibrary', JSON.stringify(lib));
}

export function recomputeMachineRates(lib: RateLibrary): RateLibrary {
  return {
    ...lib,
    machines: lib.machines.map(m => ({
      ...m,
      computedRatePerHr: computeMachineRateFromBuildup(m.buildup),
    })),
  };
}

const REGION_ALIASES: Record<string, string[]> = {
  UK:          ['uk', 'united kingdom', 'gb', 'great britain'],
  Germany:     ['de', 'germany', 'deutschland'],
  Poland:      ['pl', 'poland', 'polska'],
  China:       ['cn', 'china', 'prc'],
  India:       ['in', 'india'],
  Mexico:      ['mx', 'mexico', 'méxico'],
  Turkey:      ['tr', 'turkey', 'türkiye'],
  Vietnam:     ['vn', 'vietnam', 'viet nam'],
  'South Korea': ['kr', 'korea', 'south korea'],
  Romania:     ['ro', 'romania'],
  EU:          ['eu', 'europe', 'eurozone'],
};

function resolveRegion(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.includes(lower)) return canonical;
  }
  return null;
}

/**
 * Returns a filtered RateLibrary containing only entries for the given region
 * (plus UK entries as fallback where region-specific entries are absent).
 * `region` accepts full name or ISO-2 code (case-insensitive).
 */
export function getRegionalLibrary(region: string): RateLibrary {
  const canonical = resolveRegion(region) ?? region;
  const base = getLibraryFromStorage();

  const machines = base.machines.filter(m => m.region === canonical || m.region === 'UK');
  const labour   = base.labour.filter(l => l.region === canonical || l.region === 'UK');
  const energy   = base.energy.filter(e => e.region === canonical || e.region === 'EU' || e.region === 'UK');

  return {
    ...base,
    machines: machines.length > 0 ? machines : base.machines.filter(m => m.region === 'UK'),
    labour:   labour.length   > 0 ? labour   : base.labour.filter(l => l.region === 'UK'),
    energy:   energy.length   > 0 ? energy   : base.energy.filter(e => e.region === 'UK'),
  };
}
