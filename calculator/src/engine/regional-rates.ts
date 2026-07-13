import type { RateLibrary, MaterialRate, Breakdown8Bucket } from './types.js';
import { computeMachineRatePerHr } from './rate-library-merge.js';

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
    technician: number;    // maintenance / mould-setter / process technician
    supervisor: number;    // shift / production supervisor / team leader
  };
  /** Industrial energy rates £/kWh (2026 Q2) */
  energy: {
    electricityPerKwh: number;
    gasPerKwh: number;
  };
  /**
   * Family-aware material price factors vs UK (1.0 = same as UK base).
   * A single flat multiplier is wrong for polymers: commodity resins track
   * regional oil/feedstock and vary widely, while high-performance specialities
   * (PEEK/PEI/LCP/PPS) trade on a near-global market and barely move by country.
   * The builder picks the factor by resin family; metals and everything
   * non-resin fall back to `materialMultiplier`.
   */
  materialFactors: {
    commodityResin: number;    // PP/PE/PS/PVC — feedstock-linked, widest regional spread
    engineeringResin: number;  // ABS/PC/PA/POM/PBT — moderate (blended regional index)
    highPerfResin: number;     // PEEK/PEI/LCP/PPS/PPA — globally traded, ~flat by region
  };
  /** Multiplier applied to metal & non-resin material base prices vs UK (1.0 = same) */
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
    labour: { skilled: 26.00, semiskilled: 19.80, engineer: 42.50, foundry: 18.50, electronics: 17.50, inspector: 27.50, technician: 28.60, supervisor: 35.10 },
    energy: { electricityPerKwh: 0.23, gasPerKwh: 0.065 },
    materialFactors: { commodityResin: 1.000, engineeringResin: 1.00, highPerfResin: 1.000 },
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
    labour: { skilled: 40.50, semiskilled: 32.00, engineer: 65.00, foundry: 28.00, electronics: 30.00, inspector: 35.00, technician: 44.55, supervisor: 54.68 },
    energy: { electricityPerKwh: 0.20, gasPerKwh: 0.08 },
    materialFactors: { commodityResin: 1.042, engineeringResin: 1.03, highPerfResin: 1.008 },
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
    labour: { skilled: 30.00, semiskilled: 23.00, engineer: 48.00, foundry: 22.00, electronics: 20.00, inspector: 28.00, technician: 33.00, supervisor: 40.50 },
    energy: { electricityPerKwh: 0.16, gasPerKwh: 0.07 },
    materialFactors: { commodityResin: 1.028, engineeringResin: 1.02, highPerfResin: 1.005 },
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
    labour: { skilled: 24.00, semiskilled: 18.00, engineer: 42.00, foundry: 17.00, electronics: 16.00, inspector: 24.00, technician: 26.40, supervisor: 32.40 },
    energy: { electricityPerKwh: 0.26, gasPerKwh: 0.09 },
    materialFactors: { commodityResin: 1.028, engineeringResin: 1.02, highPerfResin: 1.005 },
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
    labour: { skilled: 19.00, semiskilled: 14.50, engineer: 34.00, foundry: 13.50, electronics: 13.00, inspector: 20.00, technician: 20.90, supervisor: 25.65 },
    energy: { electricityPerKwh: 0.19, gasPerKwh: 0.07 },
    materialFactors: { commodityResin: 1.000, engineeringResin: 1.00, highPerfResin: 1.000 },
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
    labour: { skilled: 12.00, semiskilled: 9.00, engineer: 20.00, foundry: 8.00, electronics: 10.50, inspector: 12.00, technician: 13.20, supervisor: 16.20 },
    energy: { electricityPerKwh: 0.14, gasPerKwh: 0.06 },
    materialFactors: { commodityResin: 0.958, engineeringResin: 0.97, highPerfResin: 0.993 },
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
    labour: { skilled: 13.00, semiskilled: 10.00, engineer: 22.00, foundry: 9.50, electronics: 9.00, inspector: 14.00, technician: 14.30, supervisor: 17.55 },
    energy: { electricityPerKwh: 0.13, gasPerKwh: 0.05 },
    materialFactors: { commodityResin: 0.958, engineeringResin: 0.97, highPerfResin: 0.993 },
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
    labour: { skilled: 7.50, semiskilled: 5.80, engineer: 13.00, foundry: 5.50, electronics: 5.20, inspector: 8.50, technician: 8.25, supervisor: 10.13 },
    energy: { electricityPerKwh: 0.11, gasPerKwh: 0.05 },
    materialFactors: { commodityResin: 0.944, engineeringResin: 0.96, highPerfResin: 0.990 },
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
    labour: { skilled: 9.50, semiskilled: 7.50, engineer: 17.00, foundry: 7.00, electronics: 6.80, inspector: 11.00, technician: 10.45, supervisor: 12.83 },
    energy: { electricityPerKwh: 0.12, gasPerKwh: 0.05 },
    materialFactors: { commodityResin: 0.958, engineeringResin: 0.97, highPerfResin: 0.993 },
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
    labour: { skilled: 40.00, semiskilled: 32.00, engineer: 62.00, foundry: 30.00, electronics: 28.00, inspector: 38.00, technician: 44.00, supervisor: 54.00 },
    energy: { electricityPerKwh: 0.09, gasPerKwh: 0.04 },
    materialFactors: { commodityResin: 1.056, engineeringResin: 1.04, highPerfResin: 1.010 },
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
    labour: { skilled: 34.00, semiskilled: 27.00, engineer: 52.00, foundry: 25.00, electronics: 23.00, inspector: 32.00, technician: 37.40, supervisor: 45.90 },
    energy: { electricityPerKwh: 0.22, gasPerKwh: 0.08 },
    materialFactors: { commodityResin: 1.028, engineeringResin: 1.02, highPerfResin: 1.005 },
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
    labour: { skilled: 6.50, semiskilled: 5.00, engineer: 12.00, foundry: 4.80, electronics: 4.50, inspector: 7.00, technician: 7.15, supervisor: 8.78 },
    energy: { electricityPerKwh: 0.09, gasPerKwh: 0.04 },
    materialFactors: { commodityResin: 0.860, engineeringResin: 0.90, highPerfResin: 0.975 },
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
    labour: { skilled: 7.90, semiskilled: 5.50, engineer: 18.00, foundry: 5.00, electronics: 6.50, inspector: 8.00, technician: 8.69, supervisor: 10.67 },
    energy: { electricityPerKwh: 0.07, gasPerKwh: 0.03 },
    materialFactors: { commodityResin: 0.832, engineeringResin: 0.88, highPerfResin: 0.970 },
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
    labour: { skilled: 5.10, semiskilled: 3.50, engineer: 12.00, foundry: 3.00, electronics: 4.50, inspector: 5.50, technician: 5.61, supervisor: 6.89 },
    energy: { electricityPerKwh: 0.07, gasPerKwh: 0.03 },
    materialFactors: { commodityResin: 0.860, engineeringResin: 0.90, highPerfResin: 0.975 },
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
    labour: { skilled: 7.50, semiskilled: 5.80, engineer: 12.00, foundry: 4.80, electronics: 6.50, inspector: 7.50, technician: 8.25, supervisor: 10.13 },
    energy: { electricityPerKwh: 0.08, gasPerKwh: 0.04 },
    materialFactors: { commodityResin: 0.930, engineeringResin: 0.95, highPerfResin: 0.988 },
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
    labour: { skilled: 34.00, semiskilled: 26.00, engineer: 58.00, foundry: 24.00, electronics: 24.00, inspector: 32.00, technician: 37.40, supervisor: 45.90 },
    energy: { electricityPerKwh: 0.10, gasPerKwh: 0.04 },
    materialFactors: { commodityResin: 1.000, engineeringResin: 1.00, highPerfResin: 1.000 },
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
    labour: { skilled: 5.80, semiskilled: 4.20, engineer: 10.00, foundry: 3.80, electronics: 4.00, inspector: 6.00, technician: 6.38, supervisor: 7.83 },
    energy: { electricityPerKwh: 0.08, gasPerKwh: 0.04 },
    materialFactors: { commodityResin: 0.902, engineeringResin: 0.93, highPerfResin: 0.983 },
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
    labour: { skilled: 3.80, semiskilled: 2.80, engineer: 7.50, foundry: 2.50, electronics: 3.00, inspector: 4.50, technician: 4.18, supervisor: 5.13 },
    energy: { electricityPerKwh: 0.06, gasPerKwh: 0.03 },
    materialFactors: { commodityResin: 0.916, engineeringResin: 0.94, highPerfResin: 0.985 },
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
    labour: { skilled: 8.50, semiskilled: 6.50, engineer: 16.00, foundry: 6.00, electronics: 6.50, inspector: 9.50, technician: 9.35, supervisor: 11.48 },
    energy: { electricityPerKwh: 0.11, gasPerKwh: 0.05 },
    materialFactors: { commodityResin: 1.028, engineeringResin: 1.02, highPerfResin: 1.005 },
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
    labour: { skilled: 22.00, semiskilled: 17.00, engineer: 38.00, foundry: 16.00, electronics: 17.00, inspector: 24.00, technician: 24.20, supervisor: 29.70 },
    energy: { electricityPerKwh: 0.13, gasPerKwh: 0.06 },
    materialFactors: { commodityResin: 1.000, engineeringResin: 1.00, highPerfResin: 1.000 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 0.80,
    overheadMultiplier: 0.90,
    packagingMultiplier: 0.92,
    logisticsMultiplier: 1.35,
  },
};

// ─── Authentic country prices — Extrusion grades ───────────────────────────────

/**
 * Authentic per-country prices (£/kg, 2026 Q2) for extrusion-grade materials.
 * These REPLACE the family multiplier for the listed (material, region) pairs, so
 * a China PE100 price is the real China price — not "UK × 0.83". Each grade carries
 * its OWN regional spread: commodity resins (PE/PVC/PP) swing ±20% on regional
 * feedstock/energy (US shale-ethane cheapest, EU energy-costly, Asia low), while
 * globally-traded specialities (PC/PMMA/PA12/TPU/XLPE) barely move by country.
 * UK is the library base and is intentionally omitted here. Confidence: Low —
 * index/benchmark anchored, ready to be replaced by a live polymer-price feed.
 */
export const EXTRUSION_COUNTRY_PRICES: Record<string, Partial<Record<ManufacturingRegion, number>>> = {
  //                    US     DE     PL     CN     IN     MX     TH     VN
  'mat-pe100-pipe':      { US: 1.14, DE: 1.44, PL: 1.27, CN: 1.08, IN: 1.19, MX: 1.16, TH: 1.21, VN: 1.23 },
  'mat-pe80-pipe':       { US: 1.08, DE: 1.37, PL: 1.21, CN: 1.03, IN: 1.13, MX: 1.10, TH: 1.15, VN: 1.17 },
  'mat-upvc-pipe':       { US: 0.77, DE: 0.98, PL: 0.85, CN: 0.71, IN: 0.79, MX: 0.81, TH: 0.83, VN: 0.85 },
  'mat-pvc-cable':       { US: 1.19, DE: 1.44, PL: 1.27, CN: 1.11, IN: 1.21, MX: 1.23, TH: 1.25, VN: 1.27 },
  'mat-xlpe-cable':      { US: 1.95, DE: 2.18, PL: 2.02, CN: 1.88, IN: 1.99, MX: 2.00, TH: 2.03, VN: 2.05 },
  'mat-gpps-ext':        { US: 1.14, DE: 1.39, PL: 1.23, CN: 1.09, IN: 1.18, MX: 1.20, TH: 1.21, VN: 1.23 },
  'mat-abs-ext-sheet':   { US: 1.66, DE: 1.94, PL: 1.76, CN: 1.55, IN: 1.68, MX: 1.71, TH: 1.70, VN: 1.72 },
  'mat-pmma-ext-sheet':  { US: 2.44, DE: 2.70, PL: 2.52, CN: 2.30, IN: 2.48, MX: 2.50, TH: 2.49, VN: 2.51 },
  'mat-pc-ext-sheet':    { US: 3.02, DE: 3.33, PL: 3.10, CN: 2.85, IN: 3.02, MX: 3.08, TH: 3.05, VN: 3.07 },
  'mat-pvc-medical-tube':{ US: 1.82, DE: 2.03, PL: 1.90, CN: 1.70, IN: 1.86, MX: 1.88, TH: 1.88, VN: 1.90 },
  'mat-tpu-medical-tube':{ US: 6.25, DE: 6.70, PL: 6.40, CN: 6.00, IN: 6.30, MX: 6.35, TH: 6.30, VN: 6.35 },
  'mat-tpe-profile':     { US: 2.22, DE: 2.50, PL: 2.32, CN: 2.10, IN: 2.28, MX: 2.30, TH: 2.30, VN: 2.32 },
  'mat-pvc-foam':        { US: 1.02, DE: 1.24, PL: 1.09, CN: 0.94, IN: 1.03, MX: 1.05, TH: 1.06, VN: 1.08 },
  'mat-pp-ext-sheet':    { US: 0.96, DE: 1.24, PL: 1.08, CN: 0.92, IN: 1.02, MX: 1.00, TH: 1.05, VN: 1.07 },
  'mat-pa12-ext-tube':   { US: 6.00, DE: 6.40, PL: 6.10, CN: 5.80, IN: 6.05, MX: 6.10, TH: 6.05, VN: 6.10 },
};

// ─── Authentic country prices — Thermoforming sheet grades ─────────────────────

/**
 * Authentic per-country prices (£/kg, 2026 Q2) for thermoforming-sheet materials.
 * These REPLACE the family multiplier for the listed (material, region) pairs — a
 * China APET sheet price is the real China price, not "UK × factor". Commodity sheet
 * (HIPS/PP/PE/PVC/PET) swings ±~20% on regional feedstock/energy (US shale-ethane
 * cheapest, EU energy-costly, Asia low); engineering/multilayer/high-perf specialities
 * (PMMA/PC/PEI/PPS/co-ex) barely move by country. UK is the library base and omitted.
 * Confidence: Low — index/benchmark anchored, ready for a live sheet-price feed.
 */
export const THERMOFORMING_COUNTRY_PRICES: Record<string, Partial<Record<ManufacturingRegion, number>>> = {
  //                     US      DE      PL      CN      IN      MX      TH      VN
  'mat-hips-tf':          { US: 0.92,  DE: 1.16,  PL: 1.02,  CN: 0.85,  IN: 0.94,  MX: 0.90,  TH: 0.95,  VN: 0.97 },
  'mat-abs-tf':           { US: 1.78,  DE: 2.22,  PL: 1.96,  CN: 1.70,  IN: 1.86,  MX: 1.82,  TH: 1.88,  VN: 1.90 },
  'mat-petg-tf':          { US: 1.62,  DE: 2.02,  PL: 1.78,  CN: 1.55,  IN: 1.72,  MX: 1.68,  TH: 1.74,  VN: 1.76 },
  'mat-apet-tf':          { US: 1.36,  DE: 1.70,  PL: 1.49,  CN: 1.28,  IN: 1.42,  MX: 1.40,  TH: 1.45,  VN: 1.47 },
  'mat-cpet-tf':          { US: 1.55,  DE: 1.90,  PL: 1.68,  CN: 1.48,  IN: 1.62,  MX: 1.60,  TH: 1.65,  VN: 1.67 },
  'mat-rpvc-tf':          { US: 1.20,  DE: 1.50,  PL: 1.30,  CN: 1.12,  IN: 1.24,  MX: 1.26,  TH: 1.28,  VN: 1.30 },
  'mat-pp-tf':            { US: 1.10,  DE: 1.44,  PL: 1.24,  CN: 1.05,  IN: 1.16,  MX: 1.14,  TH: 1.19,  VN: 1.21 },
  'mat-hdpe-tf':          { US: 1.05,  DE: 1.38,  PL: 1.18,  CN: 1.00,  IN: 1.11,  MX: 1.09,  TH: 1.14,  VN: 1.16 },
  'mat-ldpe-tf':          { US: 1.12,  DE: 1.44,  PL: 1.22,  CN: 1.05,  IN: 1.16,  MX: 1.14,  TH: 1.19,  VN: 1.21 },
  'mat-ps-foam-tf':       { US: 1.42,  DE: 1.76,  PL: 1.55,  CN: 1.34,  IN: 1.48,  MX: 1.46,  TH: 1.51,  VN: 1.53 },
  'mat-pmma-tf':          { US: 2.72,  DE: 3.08,  PL: 2.85,  CN: 2.60,  IN: 2.82,  MX: 2.84,  TH: 2.82,  VN: 2.85 },
  'mat-pc-tf':            { US: 3.20,  DE: 3.60,  PL: 3.34,  CN: 3.05,  IN: 3.30,  MX: 3.32,  TH: 3.30,  VN: 3.33 },
  'mat-pei-tf':           { US: 27.00, DE: 28.80, PL: 28.00, CN: 26.50, IN: 27.60, MX: 27.80, TH: 27.60, VN: 27.80 },
  'mat-pps-tf':           { US: 13.40, DE: 14.60, PL: 14.00, CN: 13.00, IN: 13.80, MX: 13.90, TH: 13.80, VN: 13.90 },
  'mat-abs-pmma-tf':      { US: 2.40,  DE: 2.84,  PL: 2.56,  CN: 2.28,  IN: 2.48,  MX: 2.46,  TH: 2.50,  VN: 2.52 },
  'mat-abs-pc-tf':        { US: 2.88,  DE: 3.36,  PL: 3.06,  CN: 2.78,  IN: 3.00,  MX: 2.98,  TH: 3.02,  VN: 3.04 },
  'mat-pp-tpo-tf':        { US: 1.68,  DE: 2.10,  PL: 1.84,  CN: 1.60,  IN: 1.78,  MX: 1.74,  TH: 1.80,  VN: 1.82 },
  'mat-petg-barrier-tf':  { US: 2.18,  DE: 2.62,  PL: 2.36,  CN: 2.10,  IN: 2.30,  MX: 2.28,  TH: 2.32,  VN: 2.34 },
};

// ─── Regional Library Builder ──────────────────────────────────────────────────

/**
 * UK electricity tariff (£/kWh) that machine build-up `energy` lines in the base
 * library are expressed against. Regional machine rates back annual kWh out of
 * the base energy figure using this basis, then re-tariff at the region's actual
 * electricity price — so a region's `electricityPerKwh` genuinely drives machine
 * cost instead of being dead data. Keep in sync with REGIONAL_DATA.UK.
 */
const UK_ELECTRICITY_BASIS_PER_KWH = 0.23;

/** Resin family used to select the country price factor. */
export type ResinFamily = 'commodity' | 'engineering' | 'highPerformance';
/** Full material family: resins, plus metal sub-types, rubber and a catch-all. */
export type MaterialFamily = ResinFamily | 'exchangeMetal' | 'millSteel' | 'rubber' | 'other';

// Commodity (feedstock/oil-linked) resins by material-id stem. Everything else in
// a plastic category that isn't high-performance is treated as an engineering resin.
const COMMODITY_RESIN_RE =
  /^mat-(pp|hdpe|ldpe|lldpe|upvc|fpvc|pvc|gpps|hips|ps|pet-bg|pcr-pp)(-|$)/;

// Exchange-traded metals (LME/producer + surcharge) — priced on a near-global
// market, so they barely vary by country. Non-ferrous + Ti/Ni superalloys.
const EXCHANGE_METAL_RE = /alumin|titanium|nickel|superalloy|copper|brass|bronze|magnesium|zinc/;
// Steel/iron mill products — conversion cost is regional, so wider country spread.
const MILL_STEEL_RE = /steel|stainless|iron|\btool\b/;

/**
 * Classify a material for country pricing.
 *   - Resins: commodity / engineering (by id) / high-performance (by category).
 *   - Metals: exchange-traded (Al/Ti/Ni/Cu/Mg — ~flat globally) vs mill steel
 *     (carbon/alloy/stainless/tool — wider regional spread).
 *   - Everything else (paint, composite, consumables) → 'other'.
 * A single flat multiplier is wrong for global alloys: it would discount a
 * China-forged Inconel billet's material ~12% when nickel is exchange-priced.
 */
export function classifyMaterialFamily(m: Pick<MaterialRate, 'id' | 'category'>): MaterialFamily {
  const cat = m.category.toLowerCase();
  const isPlastic =
    cat.includes('thermoplastic') || cat.includes('plastic') ||
    cat.includes('moulding') || cat.includes('resin') || cat.includes('elastomer');
  if (isPlastic) {
    if (cat.includes('high-performance') || cat.includes('high performance')) return 'highPerformance';
    return COMMODITY_RESIN_RE.test(m.id) ? 'commodity' : 'engineering';
  }
  if (cat.includes('rubber')) return 'rubber';   // gum rubber is globally traded → near-flat by country
  if (EXCHANGE_METAL_RE.test(cat)) return 'exchangeMetal';
  if (MILL_STEEL_RE.test(cat)) return 'millSteel';
  return 'other';
}

/**
 * Build a rate library for a specific manufacturing region.
 * Takes the UK base library and adjusts:
 *   1. Labour rates  → replaced with the region's actual per-category rate
 *   2. Machine rates → capex/overhead scaled by machineRateMultiplier AND energy
 *                      re-tariffed at the region's actual £/kWh (rate recomputed)
 *   3. Material prices → resin family-aware factor (commodity/engineering/high-perf);
 *                        metals & non-resin use materialMultiplier
 *   4. Energy rates  → replaced with regional energy rates
 */
export function buildRegionalLibrary(baseLibrary: RateLibrary, region: ManufacturingRegion): RateLibrary {
  const rd = REGIONAL_DATA[region];

  // Derive labour rates from the ID suffix (lab-{region}-{category} → rd.labour[category]).
  // Any ID whose suffix matches a known category gets the target region's rate for that category;
  // unrecognised suffixes fall back to the proportional formula below.
  const labourCategoryRates: Record<string, number> = {
    skilled:     rd.labour.skilled,
    semiskilled: rd.labour.semiskilled,
    engineer:    rd.labour.engineer,
    foundry:     rd.labour.foundry,
    electronics: rd.labour.electronics,
    inspector:   rd.labour.inspector,
    technician:  rd.labour.technician,
    supervisor:  rd.labour.supervisor,
  };

  // Family-aware material factor: resins priced by family; exchange-traded metals
  // (Al/Ti/Ni/Cu/Mg) use the near-flat global compression (same as high-perf resin);
  // mill steel and everything else use the regional index.
  const materialFactorFor = (m: MaterialRate): number => {
    switch (classifyMaterialFamily(m)) {
      case 'commodity':       return rd.materialFactors.commodityResin;
      case 'engineering':     return rd.materialFactors.engineeringResin;
      case 'highPerformance': return rd.materialFactors.highPerfResin;
      case 'exchangeMetal':   return rd.materialFactors.highPerfResin; // global market → ~flat
      case 'rubber':          return rd.materialFactors.highPerfResin; // globally-traded gum → ~flat
      case 'millSteel':       return rd.materialMultiplier;
      default:                return rd.materialMultiplier;
    }
  };

  return {
    ...baseLibrary,
    version: `${baseLibrary.version}-${region}`,
    lastModified: new Date().toISOString().slice(0, 10),

    // Adjust labour rates: extract category suffix from ID (lab-{region}-{category})
    // and map to the target region's rate for that category.
    labour: baseLibrary.labour.map(l => ({
      ...l,
      fullyLoadedRatePerHr: labourCategoryRates[l.id.split('-').at(-1) ?? ''] ?? l.fullyLoadedRatePerHr * (rd.labour.skilled / 26.00),
      region: rd.name,
      sourceNote: `Regional benchmark ${rd.name} — 2026 Q2`,
      confidence: 'Low' as const,
    })),

    // Adjust material prices. Extrusion grades with an authentic per-country
    // price use it directly (a real regional quote, not "UK × factor"); scrap
    // recovery is scaled by the same authentic/UK ratio so the recovery credit
    // tracks the local resin value. Everything else uses the resin family-aware
    // factor (metals/other flat).
    materials: baseLibrary.materials.map(m => {
      const authentic = EXTRUSION_COUNTRY_PRICES[m.id]?.[region] ?? THERMOFORMING_COUNTRY_PRICES[m.id]?.[region];
      if (authentic !== undefined) {
        const ratio = m.pricePerKg > 0 ? authentic / m.pricePerKg : 1;
        return {
          ...m,
          pricePerKg: authentic,
          scrapRecoveryPricePerKg: m.scrapRecoveryPricePerKg * ratio,
          region: rd.name,
          sourceNote: `${m.sourceNote} | ${rd.name} authentic 2026 Q2 price £${authentic.toFixed(2)}/kg (country-specific, not multiplier-scaled)`,
          confidence: 'Low' as const,
        };
      }
      const f = materialFactorFor(m);
      return {
        ...m,
        pricePerKg: m.pricePerKg * f,
        scrapRecoveryPricePerKg: m.scrapRecoveryPricePerKg * f,
        region: rd.name,
        sourceNote: `${m.sourceNote} | Regional adj. ×${f.toFixed(3)} (${classifyMaterialFamily(m)})`,
      };
    }),

    // Adjust machine rates: scale capex/overhead by machineRateMultiplier, and
    // re-tariff the energy component at the region's actual electricity price so
    // a cheap-power region (e.g. DE 0.20 vs UK 0.23) is genuinely cheaper to run.
    // The £/hr is recomputed from the rebuilt build-up (single source of truth).
    machines: baseLibrary.machines.map(m => {
      if (!m.buildup) {
        // No build-up to rebuild from — fall back to the flat capex scale.
        return {
          ...m,
          computedRatePerHr: m.computedRatePerHr * rd.machineRateMultiplier,
          region: rd.name,
          sourceNote: `${m.sourceNote} | Regional adj. ×${rd.machineRateMultiplier}`,
          confidence: 'Low' as const,
        };
      }
      const b = m.buildup;
      const annualKwh = b.energy / UK_ELECTRICITY_BASIS_PER_KWH;      // back out kWh from UK-basis £
      const regionalEnergy = annualKwh * rd.energy.electricityPerKwh; // re-tariff at region £/kWh
      const rebuilt = {
        ...b,
        annualDepreciation: b.annualDepreciation * rd.machineRateMultiplier,
        maintenance:        b.maintenance        * rd.machineRateMultiplier,
        floorSpace:         b.floorSpace          * rd.machineRateMultiplier,
        indirectSupport:    b.indirectSupport     * rd.machineRateMultiplier,
        financeCost:        b.financeCost         * rd.machineRateMultiplier,
        energy:             regionalEnergy,
      };
      return {
        ...m,
        buildup: rebuilt,
        computedRatePerHr: computeMachineRatePerHr(rebuilt),
        region: rd.name,
        sourceNote: `${m.sourceNote} | Regional: capex/overhead ×${rd.machineRateMultiplier}, energy re-tariffed @£${rd.energy.electricityPerKwh}/kWh`,
        confidence: 'Low' as const,
      };
    }),

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

// ─── Regional cost comparison ───────────────────────────────────────────────────
// Scales an 8-bucket should-cost across regions using the per-region multipliers,
// so the same figures back the on-screen table and the PDF export. Ex-Works by
// default; pass { landed: true } to add import duty + international freight.

export interface RegionalComparisonRow {
  code: ManufacturingRegion;
  name: string;
  currency: string;
  material: number; process: number; labour: number; tooling: number; overhead: number;
  exWorks: number; packaging: number; logistics: number; margin: number; total: number;
  vsBasePct: number;   // (baseTotal − total) / baseTotal × 100 — positive = cheaper than base
  isBase: boolean;
}

/** Import duty + international shipping as a fraction of Ex-Works, for landed cost. */
const LANDED_ADDERS: Partial<Record<ManufacturingRegion, { duty: number; shipping: number }>> = {
  UK: { duty: 0, shipping: 0 },     DE: { duty: 0, shipping: 0.020 }, FR: { duty: 0, shipping: 0.022 },
  ES: { duty: 0, shipping: 0.025 }, PL: { duty: 0, shipping: 0.030 }, TR: { duty: 0.035, shipping: 0.040 },
  CN: { duty: 0.065, shipping: 0.070 }, IN: { duty: 0.065, shipping: 0.065 }, MX: { duty: 0.050, shipping: 0.060 }, US: { duty: 0, shipping: 0.045 },
};

const DEFAULT_RC_REGIONS: ManufacturingRegion[] = ['UK', 'DE', 'FR', 'ES', 'PL', 'TR', 'CN', 'IN', 'MX', 'US'];

export function computeRegionalComparison(
  bkd: Breakdown8Bucket,
  opts: { regions?: ManufacturingRegion[]; baseRegion?: ManufacturingRegion; landed?: boolean } = {},
): RegionalComparisonRow[] {
  const regions = opts.regions ?? DEFAULT_RC_REGIONS;
  const base = opts.baseRegion ?? 'UK';
  const ukSemi = REGIONAL_DATA['UK'].labour.semiskilled;
  const rows = regions.map((code): RegionalComparisonRow | null => {
    const rd = REGIONAL_DATA[code];
    if (!rd) return null;
    const material = bkd.rawMaterial * rd.materialMultiplier;
    const process = bkd.process * rd.machineRateMultiplier;
    const labour = bkd.labour * (rd.labour.semiskilled / ukSemi);
    const tooling = bkd.tooling;
    const overhead = bkd.overhead * rd.overheadMultiplier;
    const exWorks = material + process + labour + tooling + overhead;
    const packaging = bkd.packaging * rd.packagingMultiplier;
    const logistics = bkd.logistics * rd.logisticsMultiplier;
    const adder = opts.landed ? (LANDED_ADDERS[code] ?? { duty: 0.05, shipping: 0.05 }) : { duty: 0, shipping: 0 };
    const total = exWorks + packaging + logistics + bkd.margin + exWorks * adder.duty + exWorks * adder.shipping;
    return { code, name: rd.name, currency: rd.currency, material, process, labour, tooling, overhead, exWorks, packaging, logistics, margin: bkd.margin, total, vsBasePct: 0, isBase: code === base };
  }).filter((r): r is RegionalComparisonRow => r !== null);
  const baseTotal = rows.find(r => r.code === base)?.total ?? rows[0]?.total ?? 0;
  rows.forEach(r => { r.vsBasePct = baseTotal > 0 ? ((baseTotal - r.total) / baseTotal) * 100 : 0; });
  return rows;
}
