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
    effectiveDate: '2025-06-01',
    sourceNote,
    confidence: 'Medium',
  };
}

// UK default rate library — all rates editable at runtime
export const DEFAULT_RATE_LIBRARY: RateLibrary = {
  version: '2.0.0',
  lastModified: '2025-06-01',

  materials: [
    // ── Machining ──────────────────────────────────────────────────────────
    {
      id: 'mat-al6061',
      grade: '6061-T6',
      category: 'Aluminium',
      pricePerKg: 3.45,
      scrapRecoveryPricePerKg: 0.55,
      densityKgPerM3: 2700,
      region: 'UK',
      effectiveDate: '2025-06-01',
      sourceNote: 'LME + UK processor premium, Jan 2025',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel1045',
      grade: '1045',
      category: 'Carbon Steel',
      pricePerKg: 0.90,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2025-06-01',
      sourceNote: 'UK steel stockholder, Jan 2025',
      confidence: 'Medium',
    },
    {
      id: 'mat-ss316l',
      grade: '316L',
      category: 'Stainless Steel',
      pricePerKg: 3.65,
      scrapRecoveryPricePerKg: 0.85,
      densityKgPerM3: 7990,
      region: 'UK',
      effectiveDate: '2025-06-01',
      sourceNote: 'UK stainless distributor, Jan 2025',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel4140',
      grade: '4140',
      category: 'Alloy Steel',
      pricePerKg: 1.15,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2025-06-01',
      sourceNote: 'UK steel stockholder, Jan 2025',
      confidence: 'Medium',
    },
    {
      id: 'mat-ti6al4v',
      grade: 'Ti-6Al-4V',
      category: 'Titanium',
      pricePerKg: 45.00,
      scrapRecoveryPricePerKg: 16.00,
      densityKgPerM3: 4430,
      region: 'UK',
      effectiveDate: '2025-06-01',
      sourceNote: 'Titanium distributor UK, Jan 2025',
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
      effectiveDate: '2024-01-01',
      sourceNote: 'Placeholder for directCost modules (painting, BIW, PCB, PCBA). Price is irrelevant — directCost overrides.',
      confidence: 'Medium',
    },
    // ── Sheet Metal ────────────────────────────────────────────────────────
    { id: 'mat-dc01', grade: 'DC01', category: 'Mild Steel Sheet', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK steel coil, Jan 2025', confidence: 'Medium' },
    { id: 'mat-dc01-gi', grade: 'DC01 GI (Hot-dip Galvanised)', category: 'Galvanised Steel Sheet', pricePerKg: 1.00, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK galv coil, BIW bodywork standard. Jan 2025', confidence: 'Medium' },
    { id: 'mat-dc03-ga', grade: 'DC03 GA (Galvannealed)', category: 'Galvanised Steel Sheet', pricePerKg: 1.04, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK galvannealed coil, standard BIW inner panels. Jan 2025', confidence: 'Medium' },
    { id: 'mat-dp600', grade: 'DP600', category: 'AHSS Sheet', pricePerKg: 1.18, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK AHSS coil, Jan 2025', confidence: 'Medium' },
    { id: 'mat-hsla340', grade: 'HSLA 340', category: 'High Strength Steel Sheet', pricePerKg: 1.08, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK HSLA coil, Jan 2025', confidence: 'Medium' },
    { id: 'mat-22mnb5', grade: '22MnB5 (Hot Press Forming / Boron Steel)', category: 'Ultra-High Strength Steel', pricePerKg: 1.65, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK PHS coil for hot stamping (A/B-pillar, roof rail). Jan 2025', confidence: 'Low' },
    { id: 'mat-aa5182', grade: 'AA5182', category: 'Aluminium Sheet', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK Al sheet, Jan 2025', confidence: 'Medium' },
    { id: 'mat-ss304-sheet', grade: '304L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK stainless coil, food/pharma stampings. Jan 2024', confidence: 'Medium' },
    // ── Sheet Metal (extended — fabs & alloys) ─────────────────────────────
    { id: 'mat-aa5052', grade: 'AA5052-H32 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al sheet stockholder Jan 2024. 5xxx series — marine/vehicle panels, excellent corrosion resistance. Yield 195 MPa.', confidence: 'Medium' },
    { id: 'mat-aa5083', grade: 'AA5083-H111 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al sheet stockholder Jan 2024. 5xxx series — marine structures, shipbuilding. Higher strength than 5052. Yield 228 MPa.', confidence: 'Medium' },
    { id: 'mat-aa6082-sheet', grade: 'AA6082-T6 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.45, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al sheet/plate stockholder Jan 2024. 6xxx series structural alloy — frames, structural parts. Yield 250 MPa.', confidence: 'Low' },
    { id: 'mat-aisi430', grade: 'AISI 430 Ferritic SS Sheet', category: 'Stainless Steel Sheet', pricePerKg: 2.80, scrapRecoveryPricePerKg: 0.70, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK SS stockholder Jan 2024. Ferritic (magnetic) stainless — appliance panels, automotive trim. Moderate corrosion resistance. Yield 250 MPa.', confidence: 'Low' },
    { id: 'mat-ss316-sheet', grade: 'AISI 316L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.90, densityKgPerM3: 7990, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK SS stockholder Jan 2024. 316L — food processing, medical, marine (Mo addition gives better chloride resistance than 304). Yield 170 MPa.', confidence: 'Medium' },
    { id: 'mat-dc01-ze', grade: 'DC01+ZE (Electrogalvanised)', category: 'Electrogalvanised Steel Sheet', pricePerKg: 0.88, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK steel coil Jan 2024. Thin zinc coating — automotive body, appliance housings. Better paintability than hot-dip. Yield 140 MPa.', confidence: 'Medium' },
    { id: 'mat-hsla420', grade: 'HSLA 420 Sheet', category: 'High Strength Steel Sheet', pricePerKg: 1.18, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK HSLA coil Jan 2024. 420 MPa min yield — structural reinforcements, crash components. Higher strength premium over HSLA 340.', confidence: 'Low' },
    // ── Injection Moulding (resins) ────────────────────────────────────────
    // coolTimeFactorSPerMm2: PP=3.16, ABS=2.0, PA66=2.0, PC=2.5, HDPE=3.5, POM=2.8, TPU=4.0
    { id: 'mat-pp', grade: 'PP Copolymer', category: 'Thermoplastic', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025', confidence: 'Medium' },
    { id: 'mat-abs', grade: 'ABS', category: 'Thermoplastic', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025', confidence: 'Medium' },
    { id: 'mat-pa66gf30', grade: 'PA66 GF30', category: 'Thermoplastic', pricePerKg: 2.95, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025', confidence: 'Medium' },
    { id: 'mat-pc', grade: 'PC (Lexan)', category: 'Thermoplastic', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025', confidence: 'Medium' },
    { id: 'mat-hdpe', grade: 'HDPE', category: 'Thermoplastic', pricePerKg: 1.00, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 960, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025', confidence: 'Medium' },
    { id: 'mat-pom', grade: 'POM / Acetal (Delrin)', category: 'Thermoplastic', pricePerKg: 1.95, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025. coolFactor ~2.8 s/mm²', confidence: 'Medium' },
    { id: 'mat-pbt-gf30', grade: 'PBT GF30', category: 'Thermoplastic', pricePerKg: 2.95, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK resin distributor, Jan 2025. Common connector/housing material.', confidence: 'Medium' },
    { id: 'mat-tpu-shore85', grade: 'TPU Shore 85A', category: 'Thermoplastic Elastomer', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024. coolFactor ~4.0 s/mm²', confidence: 'Low' },
    // ── Polyethylene family ────────────────────────────────────────────────────
    { id: 'mat-ldpe', grade: 'LDPE (2426H)', category: 'Thermoplastic', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 910, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. EBM film bags. coolFactor ~3.5 s/mm²', confidence: 'Medium' },
    { id: 'mat-lldpe', grade: 'LLDPE C6', category: 'Thermoplastic', pricePerKg: 0.88, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 920, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Stretch/packaging film, rotomoulding. coolFactor ~3.5 s/mm²', confidence: 'Medium' },
    // ── PP grades ──────────────────────────────────────────────────────────────
    { id: 'mat-pp-homo', grade: 'PP Homopolymer (MFI 12)', category: 'Thermoplastic', pricePerKg: 0.90, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. High stiffness housings, caps. coolFactor ~3.16 s/mm²', confidence: 'Medium' },
    { id: 'mat-pp-impact', grade: 'PP Impact Copolymer (PP-B)', category: 'Thermoplastic', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Bumpers, battery cases. coolFactor ~3.16 s/mm²', confidence: 'Medium' },
    // ── PET ────────────────────────────────────────────────────────────────────
    { id: 'mat-pet-bg', grade: 'PET Bottle Grade (1101)', category: 'Thermoplastic', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1380, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. SBM beverage bottles. coolFactor ~3.0 s/mm²', confidence: 'Medium' },
    { id: 'mat-pet-gf30', grade: 'PET GF30 (Engineering)', category: 'Thermoplastic', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Gears, precision parts. coolFactor ~2.5 s/mm²', confidence: 'Medium' },
    // ── PVC ────────────────────────────────────────────────────────────────────
    { id: 'mat-upvc', grade: 'Rigid PVC (uPVC pipe grade)', category: 'Thermoplastic', pricePerKg: 0.78, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Pipes, window profiles. coolFactor ~2.5 s/mm²', confidence: 'Medium' },
    { id: 'mat-fpvc', grade: 'Flexible PVC (fPVC plasticised)', category: 'Thermoplastic', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Cables, hoses, medical tubing. coolFactor ~3.0 s/mm²', confidence: 'Medium' },
    // ── PS grades ──────────────────────────────────────────────────────────────
    { id: 'mat-gpps', grade: 'GPPS (Crystal PS)', category: 'Thermoplastic', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Clear, rigid, brittle. CD cases, cutlery. coolFactor ~2.0 s/mm²', confidence: 'Medium' },
    { id: 'mat-hips', grade: 'HIPS (High Impact PS)', category: 'Thermoplastic', pricePerKg: 0.92, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1040, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. TV housings, fridge liners, thermoforming sheet. coolFactor ~2.0 s/mm²', confidence: 'Medium' },
    // ── PC/ABS Blend ───────────────────────────────────────────────────────────
    { id: 'mat-pc-abs', grade: 'PC/ABS Blend (automotive grade)', category: 'Thermoplastic', pricePerKg: 1.85, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Automotive interior, electronics housings. coolFactor ~2.2 s/mm²', confidence: 'Medium' },
    // ── Polyamide (PA) grades ──────────────────────────────────────────────────
    { id: 'mat-pa6', grade: 'PA6 Unfilled', category: 'Thermoplastic', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Gears, under-hood. Moisture sensitive — dry before moulding. coolFactor ~2.0 s/mm²', confidence: 'Medium' },
    { id: 'mat-pa6-gf30', grade: 'PA6 GF30', category: 'Thermoplastic', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1280, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Structural PA6 with glass fill. coolFactor ~2.0 s/mm²', confidence: 'Medium' },
    { id: 'mat-pa66', grade: 'PA66 Unfilled', category: 'Thermoplastic', pricePerKg: 1.80, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor Jan 2024. Higher temp than PA6. Connectors, structural. coolFactor ~2.0 s/mm²', confidence: 'Medium' },
    // ── High-Performance ───────────────────────────────────────────────────────
    { id: 'mat-peek', grade: 'PEEK Unfilled', category: 'High-Performance Thermoplastic', pricePerKg: 72.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK speciality resin supplier Jan 2024. Aerospace/medical/oil&gas. High temp (Tg~143°C, use to 250°C). coolFactor ~2.5 s/mm²', confidence: 'Low' },
    { id: 'mat-peek-gf30', grade: 'PEEK GF30', category: 'High-Performance Thermoplastic', pricePerKg: 88.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1430, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK speciality resin supplier Jan 2024. High-stiffness structural PEEK.', confidence: 'Low' },
    // ── Casting alloys ─────────────────────────────────────────────────────
    { id: 'mat-adc12', grade: 'ADC12 / A383', category: 'Die Cast Aluminium', pricePerKg: 2.65, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK Al alloy ingot, Jan 2025', confidence: 'Medium' },
    { id: 'mat-a380', grade: 'A380', category: 'Die Cast Aluminium', pricePerKg: 2.70, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK Al alloy ingot, Jan 2025', confidence: 'Medium' },
    { id: 'mat-gjl250', grade: 'EN-GJL-250', category: 'Grey Cast Iron', pricePerKg: 0.60, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK iron foundry, Jan 2025', confidence: 'Low' },
    // ── Additional casting alloys (Cast+Machine module) ────────────────────
    { id: 'mat-lm25', grade: 'LM25 / A356', category: 'Gravity/Sand Aluminium', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK Al alloy ingot, Jan 2025', confidence: 'Medium' },
    { id: 'mat-gjl350', grade: 'EN-GJL-350', category: 'Grey Cast Iron', pricePerKg: 0.70, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK iron foundry, Jan 2025', confidence: 'Low' },
    { id: 'mat-bronze-c905', grade: 'C905 Phosphor Bronze', category: 'Copper Alloy', pricePerKg: 8.20, scrapRecoveryPricePerKg: 2.80, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK copper alloy distributor, Jan 2025', confidence: 'Low' },
    { id: 'mat-mag-az91', grade: 'AZ91D Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.80, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 1810, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Mg alloy ingot, Jan 2024', confidence: 'Low' },
    { id: 'mat-ss304-cast', grade: 'CF8 / 304 Cast Stainless', category: 'Cast Stainless Steel', pricePerKg: 4.80, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK stainless foundry, Jan 2024', confidence: 'Low' },
    // ── Additional alloys ─────────────────────────────────────────────────
    { id: 'mat-adc12-secondary', grade: 'ADC12 Secondary (recycled)', category: 'Die Cast Aluminium', pricePerKg: 1.95, scrapRecoveryPricePerKg: 0.45, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK secondary Al alloy ingot — lower purity, suitable for non-structural castings', confidence: 'Low' },
    { id: 'mat-alsi10mg', grade: 'AlSi10Mg (A360/Scalmalloy)', category: 'Die Cast Aluminium', pricePerKg: 2.80, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'Premium structural HPDC alloy, T5 heat treated. UK Al alloy ingot Jan 2024', confidence: 'Medium' },
    { id: 'mat-a365', grade: 'A365 / AlSi7Mg', category: 'Die Cast Aluminium', pricePerKg: 2.70, scrapRecoveryPricePerKg: 0.52, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'Structural automotive HPDC alloy (EDU housings, battery trays). UK Jan 2024', confidence: 'Medium' },
    { id: 'mat-zamak3', grade: 'Zamak 3 (Zinc Die Cast)', category: 'Zinc Die Cast', pricePerKg: 2.35, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'Zamak 3 zinc alloy ingot, UK distributor Jan 2025', confidence: 'Medium' },
    { id: 'mat-zamak5', grade: 'Zamak 5 (Zinc Die Cast, Hi-Strength)', category: 'Zinc Die Cast', pricePerKg: 2.40, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'Zamak 5 zinc alloy ingot, higher strength than Zamak 3. UK Jan 2025', confidence: 'Medium' },
    { id: 'mat-gjs400', grade: 'EN-GJS-400-15 (Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 0.78, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'Spheroidal graphite cast iron — highest volume casting material globally. UK foundry Jan 2025', confidence: 'Low' },
    { id: 'mat-gjs600', grade: 'EN-GJS-600-3 (Ductile Iron Hi-Strength)', category: 'Ductile Cast Iron', pricePerKg: 0.86, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'High-strength ductile iron for crankshafts, diff housings. UK foundry Jan 2025', confidence: 'Low' },
    // ── Forging billets ────────────────────────────────────────────────────
    { id: 'mat-steel1020', grade: '1020 / S20C', category: 'Carbon Steel Billet', pricePerKg: 0.78, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK steel billet, Jan 2025', confidence: 'Medium' },
    { id: 'mat-steel4340', grade: '4340', category: 'Alloy Steel Billet', pricePerKg: 1.38, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK alloy billet, Jan 2025', confidence: 'Medium' },
    // ── Paint / coating materials (price per kg wet paint) ─────────────────
    { id: 'mat-paint-ecoat', grade: 'E-coat (Cathodic)', category: 'Paint', pricePerKg: 3.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-primer', grade: '2K Primer', category: 'Paint', pricePerKg: 5.80, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-basecoat', grade: 'Waterborne Basecoat', category: 'Paint', pricePerKg: 8.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-clearcoat', grade: '2K Clearcoat', category: 'Paint', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-powder', grade: 'Powder Coat (Polyester)', category: 'Paint', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK powder coat supplier, Jan 2024', confidence: 'Medium' },
    // ── Rubber Compounds ─────────────────────────────────────────────────────
    { id: 'mat-epdm', grade: 'EPDM 70 Shore A', category: 'Rubber', pricePerKg: 1.80, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK rubber compounder 2025. EPDM seals, hoses, weatherstrips. Shore 70A.', confidence: 'Medium' },
    { id: 'mat-nbr', grade: 'NBR 70 Shore A', category: 'Rubber', pricePerKg: 2.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK rubber compounder 2025. Nitrile rubber — oil/fuel seals, O-rings. Shore 70A.', confidence: 'Medium' },
    { id: 'mat-silicone-hcr', grade: 'HCR Silicone 60 Shore A', category: 'Rubber', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK silicone supplier 2025. High Consistency Rubber — compression/transfer moulding. Shore 60A.', confidence: 'Low' },
    { id: 'mat-lsr', grade: 'LSR 40 Shore A', category: 'Rubber', pricePerKg: 15.00, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK silicone supplier 2025. Liquid Silicone Rubber — injection moulding, medical/auto seals. Shore 40A.', confidence: 'Low' },
    { id: 'mat-nr', grade: 'Natural Rubber SMR20', category: 'Rubber', pricePerKg: 1.50, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 920, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK rubber importer 2025. Natural rubber SMR20 grade — tyre compounds, anti-vibration mounts.', confidence: 'Low' },
    { id: 'mat-viton-fkm', grade: 'FKM Viton 75 Shore A', category: 'Rubber', pricePerKg: 22.00, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1850, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK fluoroelastomer supplier 2025. FKM Viton — high-temp/chemical seals (>200°C). Shore 75A.', confidence: 'Low' },
    // ── Composite fibre and resin materials ────────────────────────────────────
    { id: 'mat-cfrp-prepreg-t700', grade: 'T700 CF/Epoxy Prepreg (125°C cure)', category: 'Composite', pricePerKg: 32.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1560, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. T700/250F prepreg — structural automotive/aerospace hand layup. Vf~0.60.', confidence: 'Low' },
    { id: 'mat-gfrp-prepreg-e', grade: 'E-glass/Epoxy Prepreg (120°C cure)', category: 'Composite', pricePerKg: 7.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. E-glass/epoxy prepreg — semi-structural panels, marine. Vf~0.55.', confidence: 'Low' },
    { id: 'mat-cf-dry-3k', grade: 'Carbon Fibre 3K Twill Dry Fabric', category: 'Composite', pricePerKg: 24.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1750, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. 3K 2×2 twill dry CF — RTM, VARTM, filament winding. Pair with infusion resin.', confidence: 'Low' },
    { id: 'mat-gf-dry-e', grade: 'E-glass Woven Dry Fabric (600 g/m²)', category: 'Composite', pricePerKg: 3.80, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. Woven E-glass 600 g/m² — marine, wind, automotive GFRP.', confidence: 'Medium' },
    { id: 'mat-epoxy-infusion', grade: 'Epoxy Infusion Resin System (LT cure)', category: 'Composite', pricePerKg: 13.00, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. Low-temp infusion epoxy (Gurit / Hexion). RTM/VARTM. Vf 0.50–0.60.', confidence: 'Low' },
    { id: 'mat-vinylester-rtm', grade: 'Vinyl Ester RTM Resin', category: 'Composite', pricePerKg: 5.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. Vinyl ester RTM resin — marine, pipes, corrosion-resistant structures.', confidence: 'Medium' },
    { id: 'mat-aramid-k49', grade: 'Aramid (Kevlar 49) Woven Fabric', category: 'Composite', pricePerKg: 30.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1440, region: 'UK', effectiveDate: '2025-06-01', sourceNote: 'UK composite supplier 2025. Kevlar 49 — ballistic protection, aircraft flooring, helmets.', confidence: 'Low' },
  ],

  machines: [
    makeMachine(
      'mach-lathe-cnc',
      'CNC Lathe (2-axis)',
      {
        annualDepreciation: 18000,
        maintenance: 4000,
        energy: 3500,
        floorSpace: 2000,
        indirectSupport: 3000,
        financeCost: 1500,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'Internal benchmark, UK Tier-2 machining shop'
    ),
    makeMachine(
      'mach-vmc3',
      'CNC VMC 3-axis',
      {
        annualDepreciation: 28000,
        maintenance: 6000,
        energy: 5000,
        floorSpace: 3000,
        indirectSupport: 4500,
        financeCost: 2500,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'Internal benchmark, UK Tier-2 machining shop'
    ),
    makeMachine(
      'mach-vmc5',
      'CNC VMC 5-axis',
      {
        annualDepreciation: 55000,
        maintenance: 10000,
        energy: 7000,
        floorSpace: 4000,
        indirectSupport: 8000,
        financeCost: 5000,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'Internal benchmark, UK Tier-1 precision shop'
    ),
    makeMachine(
      'mach-drill',
      'CNC Drilling Centre',
      {
        annualDepreciation: 10000,
        maintenance: 2500,
        energy: 2000,
        floorSpace: 1500,
        indirectSupport: 2000,
        financeCost: 900,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'Internal benchmark, UK Tier-2 machining shop'
    ),
    makeMachine(
      'mach-grind',
      'CNC Cylindrical Grinder',
      {
        annualDepreciation: 30000,
        maintenance: 7000,
        energy: 4000,
        floorSpace: 3000,
        indirectSupport: 5000,
        financeCost: 2800,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'Internal benchmark, UK precision grinding shop'
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
    makeMachine('press-100t', '100T Mechanical Press',
      { annualDepreciation: 18000, maintenance: 9000, energy: 5000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK press shop benchmark, Jan 2024'),
    makeMachine('press-200t', '200T Mechanical Press',
      { annualDepreciation: 28000, maintenance: 14000, energy: 7500, floorSpace: 7500, indirectSupport: 6000, financeCost: 3500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK press shop benchmark, Jan 2024'),
    makeMachine('press-400t', '400T Servo Transfer Press',
      { annualDepreciation: 50000, maintenance: 22000, energy: 11000, floorSpace: 10000, indirectSupport: 9000, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK press shop benchmark, Jan 2024'),
    makeMachine('press-630t', '630T Transfer Press',
      { annualDepreciation: 75000, maintenance: 35000, energy: 15000, floorSpace: 15000, indirectSupport: 14000, financeCost: 9375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK press shop benchmark, Jan 2024'),
    // ── Injection Moulding Machines ────────────────────────────────────────
    // IMM energy: corrected to reflect actual running power (hydraulic pump + heaters + cooling)
    // 100T ~20 kW avg × 4000 hr × £0.25/kWh ≈ £20k/yr; 200T ~35 kW; 400T ~60 kW; 800T ~105 kW
    makeMachine('imm-100t', '100T Injection Moulding Machine',
      { annualDepreciation: 14000, maintenance: 7000, energy: 20000, floorSpace: 3500, indirectSupport: 3000, financeCost: 1750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-200t', '200T Injection Moulding Machine',
      { annualDepreciation: 22000, maintenance: 11000, energy: 35000, floorSpace: 5000, indirectSupport: 4500, financeCost: 2750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-400t', '400T Injection Moulding Machine',
      { annualDepreciation: 40000, maintenance: 18000, energy: 60000, floorSpace: 8000, indirectSupport: 8000, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-800t', '800T Injection Moulding Machine',
      { annualDepreciation: 70000, maintenance: 32000, energy: 105000, floorSpace: 14000, indirectSupport: 14000, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    // ── HPDC Machines ─────────────────────────────────────────────────────
    makeMachine('hpdc-500t', 'HPDC 500T',
      { annualDepreciation: 50000, maintenance: 25000, energy: 40000, floorSpace: 12000, indirectSupport: 10000, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('hpdc-800t', 'HPDC 800T',
      { annualDepreciation: 80000, maintenance: 38000, energy: 55000, floorSpace: 18000, indirectSupport: 15000, financeCost: 10000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('hpdc-1600t', 'HPDC 1600T',
      { annualDepreciation: 140000, maintenance: 65000, energy: 100000, floorSpace: 28000, indirectSupport: 25000, financeCost: 17500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('sand-cast-line', 'Sand Casting Moulding Line',
      { annualDepreciation: 25000, maintenance: 12000, energy: 25000, floorSpace: 10000, indirectSupport: 8000, financeCost: 3125, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('hpdc-160t', 'HPDC 160T (Zinc/Small Al)',
      { annualDepreciation: 18000, maintenance: 9000, energy: 14000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'Small HPDC / zinc die casting machine, UK foundry benchmark'),
    // ── Forging Machines ──────────────────────────────────────────────────
    // Forge energy: hydraulic press ~55 kW avg; pneumatic hammer + compressor ~50 kW avg
    // Induction heating is a separate per-part cost (heatingEnergyKwhPerKg input field)
    makeMachine('forge-press-500t', '500T Forge Press',
      { annualDepreciation: 45000, maintenance: 22000, energy: 55000, floorSpace: 12000, indirectSupport: 10000, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jan 2024'),
    makeMachine('forge-hammer-5t', '5T Pneumatic Forge Hammer',
      { annualDepreciation: 35000, maintenance: 18000, energy: 45000, floorSpace: 15000, indirectSupport: 9000, financeCost: 4375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jan 2024'),
    // ── Painting ──────────────────────────────────────────────────────────
    makeMachine('paint-line-std', 'Standard Paint Line (E-coat + Topcoat)',
      { annualDepreciation: 120000, maintenance: 50000, energy: 80000, floorSpace: 40000, indirectSupport: 30000, financeCost: 15000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK OEM paint line benchmark, Jan 2024'),
    // ── BIW / Assembly ────────────────────────────────────────────────────
    makeMachine('robot-weld-station', 'Robot Welding Station',
      { annualDepreciation: 35000, maintenance: 14000, energy: 6000, floorSpace: 8000, indirectSupport: 7000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK body shop benchmark, Jan 2024'),
    // ── Electronics ───────────────────────────────────────────────────────
    makeMachine('smt-line', 'SMT Pick & Place + Reflow Line',
      { annualDepreciation: 80000, maintenance: 30000, energy: 15000, floorSpace: 20000, indirectSupport: 20000, financeCost: 10000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK EMS benchmark, Jan 2024'),
    makeMachine('smt-high-speed-line', 'High-Speed SMT Line (Fuji/Juki/ASM)',
      { annualDepreciation: 180000, maintenance: 80000, energy: 55000, floorSpace: 30000, indirectSupport: 100000, financeCost: 47000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'High-speed SMT line 80000+ CPH. Automotive EMS benchmark. Target £150/hr. Jan 2024'),
    makeMachine('laser-drill-75um', 'Laser Drill — 75 µm Microvia (CO₂/UV)',
      { annualDepreciation: 150000, maintenance: 60000, energy: 40000, floorSpace: 25000, indirectSupport: 80000, financeCost: 38600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'CO₂/UV laser drill for HDI microvias (≥75 µm). UK PCB fab benchmark. Target £120/hr. Jan 2024'),
    makeMachine('xray-bga-inspection', 'X-Ray BGA Inspection Cell (2D/3D AXI)',
      { annualDepreciation: 120000, maintenance: 45000, energy: 25000, floorSpace: 20000, indirectSupport: 65000, financeCost: 20200, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', '2D/3D automated X-ray inspection for BGA solder joints. EMS automotive benchmark. Target £90/hr. Jan 2024'),
    makeMachine('ict-automotive', 'ICT Bed-of-Nails Test System (Automotive)',
      { annualDepreciation: 130000, maintenance: 55000, energy: 30000, floorSpace: 25000, indirectSupport: 85000, financeCost: 36600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'In-circuit test fixture for IATF 16949 automotive boards. Target £110/hr. Jan 2024'),
    // ── Blow Moulding ─────────────────────────────────────────────────────────
    makeMachine('blow-ebm-100l', 'EBM Blow Moulder (up to 5L)',
      { annualDepreciation: 25000, maintenance: 12000, energy: 18000, floorSpace: 6000, indirectSupport: 5000, financeCost: 3125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for bottles/containers up to 5L. Jan 2024'),
    makeMachine('blow-ebm-500l', 'EBM Blow Moulder (5–100L tanks/drums)',
      { annualDepreciation: 45000, maintenance: 20000, energy: 30000, floorSpace: 12000, indirectSupport: 9000, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for large industrial containers, automotive fuel tanks. Jan 2024'),
    // ── Extrusion Lines ────────────────────────────────────────────────────────
    makeMachine('extruder-75mm', 'Single Screw Extruder 75mm',
      { annualDepreciation: 20000, maintenance: 8000, energy: 35000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2500, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. 75mm SSE for profile/pipe/sheet. ~200–400 kg/hr. Jan 2024'),
    makeMachine('extruder-150mm', 'Twin Screw Compounding/Extrusion Line 150mm',
      { annualDepreciation: 80000, maintenance: 30000, energy: 70000, floorSpace: 15000, indirectSupport: 15000, financeCost: 10000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. 150mm TSE compounding/extrusion line. ~800–1500 kg/hr. Jan 2024'),
    // ── Thermoforming ──────────────────────────────────────────────────────────
    makeMachine('thermoform-small', 'Thermoformer (Small/Single Station)',
      { annualDepreciation: 15000, maintenance: 6000, energy: 12000, floorSpace: 4000, indirectSupport: 3000, financeCost: 1875, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. Single-station vacuum former, up to 800×600mm sheet. Jan 2024'),
    makeMachine('thermoform-large', 'Thermoformer (Inline/Rotary, Large)',
      { annualDepreciation: 45000, maintenance: 18000, energy: 28000, floorSpace: 10000, indirectSupport: 9000, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. Inline rotary thermoformer, 1200×1000mm+ sheet. Jan 2024'),
    // ── Rotational Moulding ────────────────────────────────────────────────────
    makeMachine('rotomould-biaxial', 'Biaxial Rotational Moulder (3-arm)',
      { annualDepreciation: 30000, maintenance: 14000, energy: 40000, floorSpace: 20000, indirectSupport: 8000, financeCost: 3750, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK plastics benchmark. 3-arm biaxial carousel. Large tanks/playground equip. Jan 2024'),
    // ── Plastic Joining / Welding ──────────────────────────────────────────────
    makeMachine('ultrasonic-welder', 'Ultrasonic Welder',
      { annualDepreciation: 8000, maintenance: 3000, energy: 2000, floorSpace: 1500, indirectSupport: 2000, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. 3kW+ ultrasonic welder, small–medium plastic parts. Jan 2024'),
    makeMachine('hot-plate-welder', 'Hot Plate Welder',
      { annualDepreciation: 12000, maintenance: 4000, energy: 3000, floorSpace: 3000, indirectSupport: 2500, financeCost: 1500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Hot plate welding for tanks and manifolds. Jan 2024'),
    makeMachine('vibration-welder', 'Vibration Welder',
      { annualDepreciation: 18000, maintenance: 7000, energy: 4000, floorSpace: 4000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Vibration welding, large flat interfaces (automotive ducts). Jan 2024'),
    // ── Sheet Metal Fab — Laser Cutters (named brands) ──────────────────────────
    makeMachine('laser-trumpf-3030', 'Trumpf TruLaser 3030 (6kW Fiber)',
      { annualDepreciation: 90000, maintenance: 65000, energy: 32000, floorSpace: 10000, indirectSupport: 40000, financeCost: 18000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Trumpf TruLaser 3030, 6kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £85/hr. Jan 2024'),
    makeMachine('laser-bystronic-3015', 'Bystronic BySmart 3015 (4kW Fiber)',
      { annualDepreciation: 68000, maintenance: 50000, energy: 24000, floorSpace: 9000, indirectSupport: 35000, financeCost: 24000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Bystronic BySmart 3015, 4kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £70/hr. Jan 2024'),
    // ── Sheet Metal Fab — Turret Punches ──────────────────────────────────────────
    makeMachine('punch-amada-emz3610', 'Amada EMZ 3610 Turret Punch (30T)',
      { annualDepreciation: 58000, maintenance: 45000, energy: 18000, floorSpace: 9000, indirectSupport: 30000, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Amada EMZ 3610, 30T, 58-tool capacity. UK fab shop benchmark. Target £65/hr. Jan 2024'),
    makeMachine('punch-trumpf-5000', 'Trumpf TruPunch 5000 (30T)',
      { annualDepreciation: 68000, maintenance: 55000, energy: 22000, floorSpace: 10000, indirectSupport: 33000, financeCost: 22000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Trumpf TruPunch 5000, 30T, 72-tool capacity. UK fab shop benchmark. Target £75/hr. Jan 2024'),
    // ── Sheet Metal Fab — Press Brakes ────────────────────────────────────────────
    makeMachine('brake-amada-hfe100', 'Amada HFE 100T Press Brake (3m)',
      { annualDepreciation: 48000, maintenance: 38000, energy: 14000, floorSpace: 9000, indirectSupport: 22000, financeCost: 14000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Amada HFE3i 100T, 3000mm. UK fab shop benchmark. Target £55/hr. Jan 2024'),
    makeMachine('brake-trumpf-5230', 'Trumpf TruBend 5230 (230T)',
      { annualDepreciation: 62000, maintenance: 48000, energy: 18000, floorSpace: 10000, indirectSupport: 28000, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Trumpf TruBend 5230, 230T, 3230mm. UK fab shop benchmark. Target £70/hr. Jan 2024'),
    // ── Sheet Metal Fab — High-Volume Stamping Presses ────────────────────────────
    makeMachine('press-schuler-400t', 'Schuler 400T Stamping Press',
      { annualDepreciation: 145000, maintenance: 84500, energy: 55000, floorSpace: 20000, indirectSupport: 65000, financeCost: 40000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Schuler 400T mechanical stamping press. UK automotive press shop. Target £150/hr. Jan 2024'),
    makeMachine('press-aida-200t', 'AIDA 200T Stamping Press',
      { annualDepreciation: 110000, maintenance: 70000, energy: 40000, floorSpace: 18000, indirectSupport: 55000, financeCost: 35000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'AIDA 200T servo stamping press. UK press shop benchmark. Target £120/hr. Jan 2024'),
    // ── Sheet Metal Fab — Roll Forming ────────────────────────────────────────────
    makeMachine('rollform-dimeco-20st', 'Dimeco Roll Forming Line (20 stations)',
      { annualDepreciation: 150000, maintenance: 95000, energy: 55000, floorSpace: 35000, indirectSupport: 70000, financeCost: 40000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'Dimeco 20-station roll forming line. UK fabricator. Target £110/hr. Jan 2024'),
    // ── Sheet Metal Fab — Joining ──────────────────────────────────────────────────
    makeMachine('robot-spotweld-kuka', 'KUKA Spot Welding Robot Cell',
      { annualDepreciation: 90000, maintenance: 55000, energy: 25000, floorSpace: 15000, indirectSupport: 65000, financeCost: 38000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'KUKA robot spot weld cell. UK automotive body shop. Target £90/hr. Jan 2024'),
    makeMachine('mig-welder-manual', 'Manual MIG/MAG Welder Station',
      { annualDepreciation: 4000, maintenance: 2000, energy: 4000, floorSpace: 2000, indirectSupport: 2000, financeCost: 500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual MIG/MAG station. Machine rate low — cost dominated by operator labour. UK fab shop. Jan 2024'),
    makeMachine('tig-welder-manual', 'Manual TIG Welder Station',
      { annualDepreciation: 5000, maintenance: 2500, energy: 3500, floorSpace: 2000, indirectSupport: 2000, financeCost: 700, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual TIG station. Machine rate low — cost dominated by skilled operator labour. UK fab shop. Jan 2024'),
    // ── Rubber Processing ─────────────────────────────────────────────────────
    makeMachine('compression-mould-std', 'Compression Moulding Press 250T',
      { annualDepreciation: 18000, maintenance: 8000, energy: 10000, floorSpace: 5000, indirectSupport: 4000, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK rubber moulding benchmark 2025. 250T compression press — EPDM/NR/NBR gaskets, mounts.'),
    makeMachine('transfer-mould-std', 'Transfer Moulding Press 200T',
      { annualDepreciation: 22000, maintenance: 10000, energy: 12000, floorSpace: 6000, indirectSupport: 5000, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK rubber moulding benchmark 2025. 200T transfer press — bonded rubber-metal parts, complex geometry.'),
    makeMachine('lsr-injection-machine', 'LSR Injection Moulding Machine',
      { annualDepreciation: 35000, maintenance: 14000, energy: 20000, floorSpace: 7000, indirectSupport: 7000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK silicone moulding benchmark 2025. Liquid silicone rubber injection (Engel/Arburg/Sumitomo). Medical/auto seals.'),
    makeMachine('cure-oven-rubber', 'Rubber Cure / Vulcanisation Oven',
      { annualDepreciation: 10000, maintenance: 4000, energy: 25000, floorSpace: 6000, indirectSupport: 3000, financeCost: 1250, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK rubber benchmark 2025. Salt-bath or hot-air oven for EPDM/NBR extrusion vulcanisation.'),
    makeMachine('extruder-rubber-60mm', 'Rubber Extruder 60mm (Cold-feed)',
      { annualDepreciation: 15000, maintenance: 6000, energy: 18000, floorSpace: 4000, indirectSupport: 3500, financeCost: 1875, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK rubber benchmark 2025. 60mm cold-feed rubber extruder — EPDM seals, hose profiles.'),
    // ── Composite Manufacturing Equipment ────────────────────────────────────
    makeMachine('autoclave-1200mm', 'Production Autoclave 1200mm dia',
      { annualDepreciation: 60000, maintenance: 25000, energy: 50000, floorSpace: 20000, indirectSupport: 15000, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'UK composites benchmark 2025. 1200mm × 3000mm production autoclave. CFRP aerospace/auto structures.'),
    makeMachine('oven-composite-cure', 'Composite Cure Oven (Fan-Assisted)',
      { annualDepreciation: 18000, maintenance: 6000, energy: 30000, floorSpace: 12000, indirectSupport: 5000, financeCost: 2250, annualAvailableHours: 5000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark 2025. Fan-assisted oven cure — prepreg (no autoclave pressure), wet layup post-cure.'),
    makeMachine('rtm-press-std', 'RTM / VARTM Injection Press',
      { annualDepreciation: 22000, maintenance: 9000, energy: 12000, floorSpace: 8000, indirectSupport: 6000, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK composites benchmark 2025. Resin Transfer Moulding injection press. Structural automotive CFRP/GFRP.'),
    makeMachine('waterjet-5ax-composite', '5-Axis Waterjet Trim System',
      { annualDepreciation: 35000, maintenance: 14000, energy: 20000, floorSpace: 12000, indirectSupport: 10000, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark 2025. 5-axis waterjet trim/drill for CFRP panels. 380 MPa, 0.4mm orifice.'),
    // ── Wiring Harness Equipment ───────────────────────────────────────────
    makeMachine('harness-test-sys', 'Electrical Harness Test System (Continuity + HiPot)',
      { annualDepreciation: 18000, maintenance: 5000, energy: 3000, floorSpace: 4000, indirectSupport: 5000, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK harness benchmark 2025. Automated electrical test: continuity, insulation resistance, HiPot. IATF-compliant.'),
  ],

  labour: [
    {
      id: 'lab-uk-skilled',
      region: 'UK',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 24.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK AMT wage survey 2025, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-semiskilled',
      region: 'UK',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 18.50,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK AMT wage survey 2025, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-engineer',
      region: 'UK',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 40.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK engineering salary benchmark 2025',
      confidence: 'Medium',
    },
    {
      id: 'lab-in-skilled',
      region: 'India',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 4.80,
      effectiveDate: '2025-06-01',
      sourceNote: 'India manufacturing wage benchmark 2025',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-skilled',
      region: 'China',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.50,
      effectiveDate: '2025-06-01',
      sourceNote: 'China manufacturing wage benchmark 2025',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-foundry',
      region: 'UK',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 17.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK foundry/casting operator wage survey 2025, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-inspector',
      region: 'UK',
      skillLevel: 'CMM / Quality Inspector',
      fullyLoadedRatePerHr: 26.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK quality/inspection wage benchmark 2025, incl. NI + benefits',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-skilled',
      region: 'Germany',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 38.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'Germany IG Metall wage survey 2025, incl. social costs',
      confidence: 'Medium',
    },
    {
      id: 'lab-pl-skilled',
      region: 'Poland',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 11.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'Poland manufacturing wage benchmark 2025, incl. social costs',
      confidence: 'Low',
    },
    {
      id: 'lab-mx-skilled',
      region: 'Mexico',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.00,
      effectiveDate: '2025-06-01',
      sourceNote: 'Mexico manufacturing wage benchmark 2025 (IMSS included)',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-electronics',
      region: 'UK',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 16.50,
      effectiveDate: '2025-06-01',
      sourceNote: 'UK EMS operator wage benchmark 2025, incl. NI + benefits',
      confidence: 'Medium',
    },
  ],

  energy: [
    {
      id: 'energy-uk',
      region: 'UK',
      electricityPerKwh: 0.22,
      gasPerKwh: 0.07,
      effectiveDate: '2025-06-01',
      sourceNote: 'Ofgem industrial tariff Q1 2025',
      confidence: 'High',
    },
    {
      id: 'energy-eu',
      region: 'EU',
      electricityPerKwh: 0.18,
      gasPerKwh: 0.06,
      effectiveDate: '2025-06-01',
      sourceNote: 'Eurostat industrial energy Q1 2025',
      confidence: 'Medium',
    },
  ],

  fx: [
    { id: 'fx-gbp-eur', fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.18, effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-usd', fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.28, effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-inr', fromCurrency: 'GBP', toCurrency: 'INR', rate: 107.0, effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-cny', fromCurrency: 'GBP', toCurrency: 'CNY', rate: 9.20, effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-mxn', fromCurrency: 'GBP', toCurrency: 'MXN', rate: 23.0,    effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-thb', fromCurrency: 'GBP', toCurrency: 'THB', rate: 44.0,    effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-vnd', fromCurrency: 'GBP', toCurrency: 'VND', rate: 32500.0, effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-brl', fromCurrency: 'GBP', toCurrency: 'BRL', rate: 6.50,    effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
    { id: 'fx-gbp-krw', fromCurrency: 'GBP', toCurrency: 'KRW', rate: 1720.0,  effectiveDate: '2025-06-01', sourceNote: 'BOE spot Jun 2025' },
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
