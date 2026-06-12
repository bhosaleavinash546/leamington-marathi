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
    { id: 'oh-machining-t2', commodityType: 'machining', supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-machining-t1', commodityType: 'machining', supplierTier: 'Tier 1', overheadPct: 0.15, marginPct: 0.10, sourceNote: 'Industry benchmark' },
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
