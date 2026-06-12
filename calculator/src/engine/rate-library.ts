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
    effectiveDate: '2024-01-01',
    sourceNote,
    confidence: 'Medium',
  };
}

// UK default rate library — all rates editable at runtime
export const DEFAULT_RATE_LIBRARY: RateLibrary = {
  version: '1.0.0',
  lastModified: '2024-01-01',

  materials: [
    // ── Machining ──────────────────────────────────────────────────────────
    {
      id: 'mat-al6061',
      grade: '6061-T6',
      category: 'Aluminium',
      pricePerKg: 3.20,
      scrapRecoveryPricePerKg: 0.50,
      densityKgPerM3: 2700,
      region: 'UK',
      effectiveDate: '2024-01-01',
      sourceNote: 'LME + UK processor premium, Jan 2024',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel1045',
      grade: '1045',
      category: 'Carbon Steel',
      pricePerKg: 0.85,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2024-01-01',
      sourceNote: 'UK steel stockholder, Jan 2024',
      confidence: 'Medium',
    },
    {
      id: 'mat-ss316l',
      grade: '316L',
      category: 'Stainless Steel',
      pricePerKg: 3.50,
      scrapRecoveryPricePerKg: 0.80,
      densityKgPerM3: 7990,
      region: 'UK',
      effectiveDate: '2024-01-01',
      sourceNote: 'UK stainless distributor, Jan 2024',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel4140',
      grade: '4140',
      category: 'Alloy Steel',
      pricePerKg: 1.10,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2024-01-01',
      sourceNote: 'UK steel stockholder, Jan 2024',
      confidence: 'Medium',
    },
    {
      id: 'mat-ti6al4v',
      grade: 'Ti-6Al-4V',
      category: 'Titanium',
      pricePerKg: 42.00,
      scrapRecoveryPricePerKg: 15.00,
      densityKgPerM3: 4430,
      region: 'UK',
      effectiveDate: '2024-01-01',
      sourceNote: 'Titanium distributor UK, Jan 2024',
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
    { id: 'mat-dc01', grade: 'DC01', category: 'Mild Steel Sheet', pricePerKg: 0.75, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK steel coil, Jan 2024', confidence: 'Medium' },
    { id: 'mat-dp600', grade: 'DP600', category: 'AHSS Sheet', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK AHSS coil, Jan 2024', confidence: 'Medium' },
    { id: 'mat-hsla340', grade: 'HSLA 340', category: 'High Strength Steel Sheet', pricePerKg: 1.00, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK HSLA coil, Jan 2024', confidence: 'Medium' },
    { id: 'mat-aa5182', grade: 'AA5182', category: 'Aluminium Sheet', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.45, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al sheet, Jan 2024', confidence: 'Medium' },
    // ── Injection Moulding (resins) ────────────────────────────────────────
    { id: 'mat-pp', grade: 'PP Copolymer', category: 'Thermoplastic', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024', confidence: 'Medium' },
    { id: 'mat-abs', grade: 'ABS', category: 'Thermoplastic', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024', confidence: 'Medium' },
    { id: 'mat-pa66gf30', grade: 'PA66 GF30', category: 'Thermoplastic', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024', confidence: 'Medium' },
    { id: 'mat-pc', grade: 'PC (Lexan)', category: 'Thermoplastic', pricePerKg: 2.25, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024', confidence: 'Medium' },
    { id: 'mat-hdpe', grade: 'HDPE', category: 'Thermoplastic', pricePerKg: 0.90, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 960, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK resin distributor, Jan 2024', confidence: 'Medium' },
    // ── Casting alloys ─────────────────────────────────────────────────────
    { id: 'mat-adc12', grade: 'ADC12 / A383', category: 'Die Cast Aluminium', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al alloy ingot, Jan 2024', confidence: 'Medium' },
    { id: 'mat-a380', grade: 'A380', category: 'Die Cast Aluminium', pricePerKg: 2.45, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al alloy ingot, Jan 2024', confidence: 'Medium' },
    { id: 'mat-gjl250', grade: 'EN-GJL-250', category: 'Grey Cast Iron', pricePerKg: 0.55, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK iron foundry, Jan 2024', confidence: 'Low' },
    // ── Additional casting alloys (Cast+Machine module) ────────────────────
    { id: 'mat-lm25', grade: 'LM25 / A356', category: 'Gravity/Sand Aluminium', pricePerKg: 2.65, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Al alloy ingot, Jan 2024', confidence: 'Medium' },
    { id: 'mat-gjl350', grade: 'EN-GJL-350', category: 'Grey Cast Iron', pricePerKg: 0.65, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK iron foundry, Jan 2024', confidence: 'Low' },
    { id: 'mat-bronze-c905', grade: 'C905 Phosphor Bronze', category: 'Copper Alloy', pricePerKg: 7.50, scrapRecoveryPricePerKg: 2.50, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK copper alloy distributor, Jan 2024', confidence: 'Low' },
    { id: 'mat-mag-az91', grade: 'AZ91D Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.80, scrapRecoveryPricePerKg: 0.80, densityKgPerM3: 1810, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK Mg alloy ingot, Jan 2024', confidence: 'Low' },
    { id: 'mat-ss304-cast', grade: 'CF8 / 304 Cast Stainless', category: 'Cast Stainless Steel', pricePerKg: 4.80, scrapRecoveryPricePerKg: 1.20, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK stainless foundry, Jan 2024', confidence: 'Low' },
    // ── Forging billets ────────────────────────────────────────────────────
    { id: 'mat-steel1020', grade: '1020 / S20C', category: 'Carbon Steel Billet', pricePerKg: 0.72, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK steel billet, Jan 2024', confidence: 'Medium' },
    { id: 'mat-steel4340', grade: '4340', category: 'Alloy Steel Billet', pricePerKg: 1.30, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK alloy billet, Jan 2024', confidence: 'Medium' },
    // ── Paint / coating materials (price per kg wet paint) ─────────────────
    { id: 'mat-paint-ecoat', grade: 'E-coat (Cathodic)', category: 'Paint', pricePerKg: 3.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-primer', grade: '2K Primer', category: 'Paint', pricePerKg: 5.80, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-basecoat', grade: 'Waterborne Basecoat', category: 'Paint', pricePerKg: 8.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-clearcoat', grade: '2K Clearcoat', category: 'Paint', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK coating supplier, Jan 2024', confidence: 'Low' },
    { id: 'mat-paint-powder', grade: 'Powder Coat (Polyester)', category: 'Paint', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2024-01-01', sourceNote: 'UK powder coat supplier, Jan 2024', confidence: 'Medium' },
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
    makeMachine('imm-100t', '100T Injection Moulding Machine',
      { annualDepreciation: 14000, maintenance: 7000, energy: 9000, floorSpace: 3500, indirectSupport: 3000, financeCost: 1750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-200t', '200T Injection Moulding Machine',
      { annualDepreciation: 22000, maintenance: 11000, energy: 13000, floorSpace: 5000, indirectSupport: 4500, financeCost: 2750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-400t', '400T Injection Moulding Machine',
      { annualDepreciation: 40000, maintenance: 18000, energy: 20000, floorSpace: 8000, indirectSupport: 8000, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    makeMachine('imm-800t', '800T Injection Moulding Machine',
      { annualDepreciation: 70000, maintenance: 32000, energy: 35000, floorSpace: 14000, indirectSupport: 14000, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark, Jan 2024'),
    // ── HPDC Machines ─────────────────────────────────────────────────────
    makeMachine('hpdc-500t', 'HPDC 500T',
      { annualDepreciation: 50000, maintenance: 25000, energy: 18000, floorSpace: 12000, indirectSupport: 10000, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('hpdc-800t', 'HPDC 800T',
      { annualDepreciation: 80000, maintenance: 38000, energy: 25000, floorSpace: 18000, indirectSupport: 15000, financeCost: 10000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('hpdc-1600t', 'HPDC 1600T',
      { annualDepreciation: 140000, maintenance: 65000, energy: 42000, floorSpace: 28000, indirectSupport: 25000, financeCost: 17500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    makeMachine('sand-cast-line', 'Sand Casting Moulding Line',
      { annualDepreciation: 25000, maintenance: 12000, energy: 8000, floorSpace: 10000, indirectSupport: 8000, financeCost: 3125, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK foundry benchmark, Jan 2024'),
    // ── Forging Machines ──────────────────────────────────────────────────
    makeMachine('forge-press-500t', '500T Forge Press',
      { annualDepreciation: 45000, maintenance: 22000, energy: 15000, floorSpace: 12000, indirectSupport: 10000, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jan 2024'),
    makeMachine('forge-hammer-5t', '5T Pneumatic Forge Hammer',
      { annualDepreciation: 35000, maintenance: 18000, energy: 12000, floorSpace: 15000, indirectSupport: 9000, financeCost: 4375, annualAvailableHours: 3500, machineUtilization: 0.78 },
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
  ],

  labour: [
    {
      id: 'lab-uk-skilled',
      region: 'UK',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 22.00,
      effectiveDate: '2024-01-01',
      sourceNote: 'UK AMT wage survey 2024, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-semiskilled',
      region: 'UK',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 17.00,
      effectiveDate: '2024-01-01',
      sourceNote: 'UK AMT wage survey 2024, incl. NI + benefits',
      confidence: 'High',
    },
    {
      id: 'lab-uk-engineer',
      region: 'UK',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 35.00,
      effectiveDate: '2024-01-01',
      sourceNote: 'UK engineering salary benchmark 2024',
      confidence: 'Medium',
    },
    {
      id: 'lab-in-skilled',
      region: 'India',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 4.50,
      effectiveDate: '2024-01-01',
      sourceNote: 'India manufacturing wage benchmark 2024',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-skilled',
      region: 'China',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.00,
      effectiveDate: '2024-01-01',
      sourceNote: 'China manufacturing wage benchmark 2024',
      confidence: 'Low',
    },
  ],

  energy: [
    {
      id: 'energy-uk',
      region: 'UK',
      electricityPerKwh: 0.25,
      gasPerKwh: 0.08,
      effectiveDate: '2024-01-01',
      sourceNote: 'Ofgem industrial tariff Q1 2024',
      confidence: 'High',
    },
    {
      id: 'energy-eu',
      region: 'EU',
      electricityPerKwh: 0.20,
      gasPerKwh: 0.07,
      effectiveDate: '2024-01-01',
      sourceNote: 'Eurostat industrial energy Q1 2024',
      confidence: 'Medium',
    },
  ],

  fx: [
    { id: 'fx-gbp-eur', fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.17, effectiveDate: '2024-01-01', sourceNote: 'BOE spot Jan 2024' },
    { id: 'fx-gbp-usd', fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.27, effectiveDate: '2024-01-01', sourceNote: 'BOE spot Jan 2024' },
    { id: 'fx-gbp-inr', fromCurrency: 'GBP', toCurrency: 'INR', rate: 105.0, effectiveDate: '2024-01-01', sourceNote: 'BOE spot Jan 2024' },
    { id: 'fx-gbp-cny', fromCurrency: 'GBP', toCurrency: 'CNY', rate: 9.10, effectiveDate: '2024-01-01', sourceNote: 'BOE spot Jan 2024' },
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
