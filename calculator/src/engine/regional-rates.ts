import type { RateLibrary } from './types.js';

// ─── Manufacturing Regions ─────────────────────────────────────────────────────

export type ManufacturingRegion =
  | 'UK' | 'DE' | 'FR' | 'IT' | 'ES' | 'PL' | 'CZ' | 'RO' | 'HU' | 'SE' | 'NL'
  | 'TR' | 'CN' | 'IN' | 'MX' | 'US' | 'TH' | 'VN' | 'BR' | 'KR';

export const REGION_NAMES: Record<ManufacturingRegion, string> = {
  UK: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  PL: 'Poland',
  CZ: 'Czech Republic',
  RO: 'Romania',
  HU: 'Hungary',
  SE: 'Sweden',
  NL: 'Netherlands',
  TR: 'Turkey',
  CN: 'China',
  IN: 'India',
  MX: 'Mexico',
  US: 'United States',
  TH: 'Thailand',
  VN: 'Vietnam',
  BR: 'Brazil',
  KR: 'South Korea',
};

interface RegionalData {
  /** Display name */
  name: string;
  /** ISO currency code */
  currency: string;
  /** FX rate to GBP (1 GBP = X local currency) */
  fxToGBP: number;
  /** Fully-loaded labour rates in £/hr equivalent (2026 Q2) */
  labour: {
    skilled: number;       // machinist / toolmaker
    semiskilled: number;   // press operator / assembler
    engineer: number;      // process engineer
    foundry: number;       // foundry / casting operative
    electronics: number;   // SMT / EMS operator
    inspector: number;     // QA / CMM inspector
  };
  /** Industrial energy rates £/kWh (2026 Q2) */
  energy: {
    electricityPerKwh: number;
    gasPerKwh: number;
  };
  /** Multiplier applied to all material base prices vs UK (1.0 = same) */
  materialMultiplier: number;
  /** Multiplier applied to machine rates (capex + energy + labour overhead) vs UK */
  machineRateMultiplier: number;
  /** Multiplier applied to overhead % — accounts for regional administrative cost structures */
  overheadMultiplier: number;
  /** Default packaging £/part vs UK £0.15 */
  packagingMultiplier: number;
  /** Default logistics £/part relative to UK (UK domestic = 1.0) */
  logisticsMultiplier: number;
}

export const REGIONAL_DATA: Record<ManufacturingRegion, RegionalData> = {
  UK: {
    name: 'United Kingdom',
    currency: 'GBP',
    fxToGBP: 1.00,
    labour: { skilled: 26.00, semiskilled: 19.80, engineer: 42.50, foundry: 18.50, electronics: 17.50, inspector: 27.50 },
    energy: { electricityPerKwh: 0.23, gasPerKwh: 0.065 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 1.00,
    overheadMultiplier: 1.00,
    packagingMultiplier: 1.00,
    logisticsMultiplier: 1.00,
  },
  DE: {
    name: 'Germany',
    currency: 'EUR',
    fxToGBP: 1.16,
    labour: { skilled: 38.00, semiskilled: 29.00, engineer: 58.00, foundry: 28.00, electronics: 25.00, inspector: 35.00 },
    energy: { electricityPerKwh: 0.22, gasPerKwh: 0.08 },
    materialMultiplier: 1.03,
    machineRateMultiplier: 1.05,
    overheadMultiplier: 1.10,
    packagingMultiplier: 1.05,
    logisticsMultiplier: 1.15,
  },
  FR: {
    name: 'France',
    currency: 'EUR',
    fxToGBP: 1.16,
    labour: { skilled: 30.00, semiskilled: 23.00, engineer: 48.00, foundry: 22.00, electronics: 20.00, inspector: 28.00 },
    energy: { electricityPerKwh: 0.16, gasPerKwh: 0.07 },
    materialMultiplier: 1.02,
    machineRateMultiplier: 0.92,
    overheadMultiplier: 1.05,
    packagingMultiplier: 1.05,
    logisticsMultiplier: 1.15,
  },
  IT: {
    name: 'Italy',
    currency: 'EUR',
    fxToGBP: 1.16,
    labour: { skilled: 24.00, semiskilled: 18.00, engineer: 42.00, foundry: 17.00, electronics: 16.00, inspector: 24.00 },
    energy: { electricityPerKwh: 0.26, gasPerKwh: 0.09 },
    materialMultiplier: 1.02,
    machineRateMultiplier: 0.97,
    overheadMultiplier: 1.00,
    packagingMultiplier: 1.05,
    logisticsMultiplier: 1.15,
  },
  ES: {
    name: 'Spain',
    currency: 'EUR',
    fxToGBP: 1.16,
    labour: { skilled: 19.00, semiskilled: 14.50, engineer: 34.00, foundry: 13.50, electronics: 13.00, inspector: 20.00 },
    energy: { electricityPerKwh: 0.19, gasPerKwh: 0.07 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 0.88,
    overheadMultiplier: 0.95,
    packagingMultiplier: 1.02,
    logisticsMultiplier: 1.15,
  },
  PL: {
    name: 'Poland',
    currency: 'PLN',
    fxToGBP: 5.05,
    labour: { skilled: 11.00, semiskilled: 8.50, engineer: 20.00, foundry: 8.00, electronics: 7.50, inspector: 12.00 },
    energy: { electricityPerKwh: 0.14, gasPerKwh: 0.06 },
    materialMultiplier: 0.97,
    machineRateMultiplier: 0.72,
    overheadMultiplier: 0.85,
    packagingMultiplier: 0.90,
    logisticsMultiplier: 1.20,
  },
  CZ: {
    name: 'Czech Republic',
    currency: 'CZK',
    fxToGBP: 29.5,
    labour: { skilled: 13.00, semiskilled: 10.00, engineer: 22.00, foundry: 9.50, electronics: 9.00, inspector: 14.00 },
    energy: { electricityPerKwh: 0.13, gasPerKwh: 0.05 },
    materialMultiplier: 0.97,
    machineRateMultiplier: 0.74,
    overheadMultiplier: 0.87,
    packagingMultiplier: 0.90,
    logisticsMultiplier: 1.20,
  },
  RO: {
    name: 'Romania',
    currency: 'RON',
    fxToGBP: 5.8,
    labour: { skilled: 7.50, semiskilled: 5.80, engineer: 13.00, foundry: 5.50, electronics: 5.20, inspector: 8.50 },
    energy: { electricityPerKwh: 0.11, gasPerKwh: 0.05 },
    materialMultiplier: 0.96,
    machineRateMultiplier: 0.65,
    overheadMultiplier: 0.80,
    packagingMultiplier: 0.85,
    logisticsMultiplier: 1.25,
  },
  HU: {
    name: 'Hungary',
    currency: 'HUF',
    fxToGBP: 450,
    labour: { skilled: 9.50, semiskilled: 7.50, engineer: 17.00, foundry: 7.00, electronics: 6.80, inspector: 11.00 },
    energy: { electricityPerKwh: 0.12, gasPerKwh: 0.05 },
    materialMultiplier: 0.97,
    machineRateMultiplier: 0.70,
    overheadMultiplier: 0.83,
    packagingMultiplier: 0.88,
    logisticsMultiplier: 1.22,
  },
  SE: {
    name: 'Sweden',
    currency: 'SEK',
    fxToGBP: 13.8,
    labour: { skilled: 40.00, semiskilled: 32.00, engineer: 62.00, foundry: 30.00, electronics: 28.00, inspector: 38.00 },
    energy: { electricityPerKwh: 0.09, gasPerKwh: 0.04 },
    materialMultiplier: 1.04,
    machineRateMultiplier: 0.87,
    overheadMultiplier: 1.08,
    packagingMultiplier: 1.08,
    logisticsMultiplier: 1.20,
  },
  NL: {
    name: 'Netherlands',
    currency: 'EUR',
    fxToGBP: 1.16,
    labour: { skilled: 34.00, semiskilled: 27.00, engineer: 52.00, foundry: 25.00, electronics: 23.00, inspector: 32.00 },
    energy: { electricityPerKwh: 0.22, gasPerKwh: 0.08 },
    materialMultiplier: 1.02,
    machineRateMultiplier: 1.00,
    overheadMultiplier: 1.05,
    packagingMultiplier: 1.05,
    logisticsMultiplier: 1.15,
  },
  TR: {
    name: 'Turkey',
    currency: 'TRY',
    fxToGBP: 42.0,
    labour: { skilled: 6.50, semiskilled: 5.00, engineer: 12.00, foundry: 4.80, electronics: 4.50, inspector: 7.00 },
    energy: { electricityPerKwh: 0.09, gasPerKwh: 0.04 },
    materialMultiplier: 0.90,
    machineRateMultiplier: 0.60,
    overheadMultiplier: 0.78,
    packagingMultiplier: 0.80,
    logisticsMultiplier: 1.30,
  },
  CN: {
    name: 'China',
    currency: 'CNY',
    fxToGBP: 9.05,
    labour: { skilled: 7.50, semiskilled: 5.50, engineer: 13.00, foundry: 5.00, electronics: 5.20, inspector: 8.00 },
    energy: { electricityPerKwh: 0.07, gasPerKwh: 0.03 },
    materialMultiplier: 0.88,
    machineRateMultiplier: 0.55,
    overheadMultiplier: 0.75,
    packagingMultiplier: 0.70,
    logisticsMultiplier: 1.45,
  },
  IN: {
    name: 'India',
    currency: 'INR',
    fxToGBP: 109.5,
    labour: { skilled: 4.80, semiskilled: 3.20, engineer: 9.00, foundry: 3.00, electronics: 3.50, inspector: 5.50 },
    energy: { electricityPerKwh: 0.07, gasPerKwh: 0.03 },
    materialMultiplier: 0.90,
    machineRateMultiplier: 0.52,
    overheadMultiplier: 0.72,
    packagingMultiplier: 0.65,
    logisticsMultiplier: 1.50,
  },
  MX: {
    name: 'Mexico',
    currency: 'MXN',
    fxToGBP: 25.5,
    labour: { skilled: 7.00, semiskilled: 5.20, engineer: 12.00, foundry: 4.80, electronics: 5.00, inspector: 7.50 },
    energy: { electricityPerKwh: 0.08, gasPerKwh: 0.04 },
    materialMultiplier: 0.95,
    machineRateMultiplier: 0.60,
    overheadMultiplier: 0.78,
    packagingMultiplier: 0.75,
    logisticsMultiplier: 1.35,
  },
  US: {
    name: 'United States',
    currency: 'USD',
    fxToGBP: 1.27,
    labour: { skilled: 34.00, semiskilled: 26.00, engineer: 58.00, foundry: 24.00, electronics: 24.00, inspector: 32.00 },
    energy: { electricityPerKwh: 0.10, gasPerKwh: 0.04 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 0.85,
    overheadMultiplier: 0.95,
    packagingMultiplier: 0.95,
    logisticsMultiplier: 1.25,
  },
  TH: {
    name: 'Thailand',
    currency: 'THB',
    fxToGBP: 45.5,
    labour: { skilled: 5.80, semiskilled: 4.20, engineer: 10.00, foundry: 3.80, electronics: 4.00, inspector: 6.00 },
    energy: { electricityPerKwh: 0.08, gasPerKwh: 0.04 },
    materialMultiplier: 0.93,
    machineRateMultiplier: 0.58,
    overheadMultiplier: 0.75,
    packagingMultiplier: 0.72,
    logisticsMultiplier: 1.40,
  },
  VN: {
    name: 'Vietnam',
    currency: 'VND',
    fxToGBP: 33800,
    labour: { skilled: 3.80, semiskilled: 2.80, engineer: 7.50, foundry: 2.50, electronics: 3.00, inspector: 4.50 },
    energy: { electricityPerKwh: 0.06, gasPerKwh: 0.03 },
    materialMultiplier: 0.94,
    machineRateMultiplier: 0.52,
    overheadMultiplier: 0.70,
    packagingMultiplier: 0.68,
    logisticsMultiplier: 1.50,
  },
  BR: {
    name: 'Brazil',
    currency: 'BRL',
    fxToGBP: 6.85,
    labour: { skilled: 8.50, semiskilled: 6.50, engineer: 16.00, foundry: 6.00, electronics: 6.50, inspector: 9.50 },
    energy: { electricityPerKwh: 0.11, gasPerKwh: 0.05 },
    materialMultiplier: 1.02,
    machineRateMultiplier: 0.70,
    overheadMultiplier: 0.85,
    packagingMultiplier: 0.85,
    logisticsMultiplier: 1.45,
  },
  KR: {
    name: 'South Korea',
    currency: 'KRW',
    fxToGBP: 1790,
    labour: { skilled: 22.00, semiskilled: 17.00, engineer: 38.00, foundry: 16.00, electronics: 17.00, inspector: 24.00 },
    energy: { electricityPerKwh: 0.13, gasPerKwh: 0.06 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 0.80,
    overheadMultiplier: 0.90,
    packagingMultiplier: 0.92,
    logisticsMultiplier: 1.35,
  },
};

// ─── Regional Library Builder ──────────────────────────────────────────────────

/**
 * Build a rate library for a specific manufacturing region.
 * Takes the UK base library and adjusts:
 *   1. Labour rates → replaced with regional rates
 *   2. Machine rates → scaled by regional machineRateMultiplier
 *   3. Material prices → scaled by regional materialMultiplier
 *   4. Energy rates → replaced with regional energy rates
 */
export function buildRegionalLibrary(baseLibrary: RateLibrary, region: ManufacturingRegion): RateLibrary {
  const rd = REGIONAL_DATA[region];

  // Map UK labour IDs to regional equivalents
  const labourMap: Record<string, number> = {
    'lab-uk-skilled':     rd.labour.skilled,
    'lab-uk-semiskilled': rd.labour.semiskilled,
    'lab-uk-engineer':    rd.labour.engineer,
    'lab-uk-foundry':     rd.labour.foundry,
    'lab-uk-inspector':   rd.labour.inspector,
    'lab-in-skilled':     rd.labour.skilled,
    'lab-cn-skilled':     rd.labour.skilled,
    'lab-de-skilled':     rd.labour.skilled,
    'lab-pl-skilled':     rd.labour.skilled,
    'lab-mx-skilled':     rd.labour.skilled,
  };

  return {
    ...baseLibrary,
    version: `${baseLibrary.version}-${region}`,
    lastModified: new Date().toISOString().slice(0, 10),

    // Adjust labour rates
    labour: baseLibrary.labour.map(l => ({
      ...l,
      fullyLoadedRatePerHr: labourMap[l.id] !== undefined ? labourMap[l.id] : l.fullyLoadedRatePerHr * (rd.labour.skilled / 26.00),
      region: rd.name,
      sourceNote: `Regional benchmark ${rd.name} — 2026 Q2`,
      confidence: 'Low' as const,
    })),

    // Adjust material prices
    materials: baseLibrary.materials.map(m => ({
      ...m,
      pricePerKg: m.pricePerKg * rd.materialMultiplier,
      scrapRecoveryPricePerKg: m.scrapRecoveryPricePerKg * rd.materialMultiplier,
      region: rd.name,
      sourceNote: `${m.sourceNote} | Regional adj. ×${rd.materialMultiplier}`,
    })),

    // Adjust machine rates
    machines: baseLibrary.machines.map(m => ({
      ...m,
      computedRatePerHr: m.computedRatePerHr * rd.machineRateMultiplier,
      region: rd.name,
      sourceNote: `${m.sourceNote} | Regional adj. ×${rd.machineRateMultiplier}`,
      confidence: 'Low' as const,
    })),

    // Adjust energy rates
    energy: [
      {
        id: `energy-${region.toLowerCase()}`,
        region: rd.name,
        electricityPerKwh: rd.energy.electricityPerKwh,
        gasPerKwh: rd.energy.gasPerKwh,
        effectiveDate: new Date().toISOString().slice(0, 10),
        sourceNote: `${rd.name} industrial energy benchmark 2026 Q2`,
        confidence: 'Low' as const,
      },
    ],
  };
}

/**
 * Get per-region packaging and logistics defaults.
 * Includes cross-region shipping premium when manufacturing region differs from delivery (UK).
 */
export function getRegionalLogistics(
  mfgRegion: ManufacturingRegion,
  basePackaging: number,
  baseLogistics: number
): { packaging: number; logistics: number } {
  const rd = REGIONAL_DATA[mfgRegion];
  return {
    packaging: basePackaging * rd.packagingMultiplier,
    logistics: baseLogistics * rd.logisticsMultiplier,
  };
}
