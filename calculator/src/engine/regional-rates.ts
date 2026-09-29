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
  /** Fully-loaded labour rates in £/hr equivalent (2026-09) */
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
  /** Industrial energy rates £/kWh (2026-09) */
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
    labour: { skilled: 26.19, semiskilled: 19.94, engineer: 42.80, foundry: 18.63, electronics: 17.63, inspector: 27.70, technician: 28.81, supervisor: 35.35 },
    energy: { electricityPerKwh: 0.268, gasPerKwh: 0.067 },
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
    fxToGBP: 1.165,
    labour: { skilled: 40.77, semiskilled: 32.21, engineer: 65.43, foundry: 28.19, electronics: 30.20, inspector: 35.23, technician: 44.85, supervisor: 55.04 },
    energy: { electricityPerKwh: 0.199, gasPerKwh: 0.068 },
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
    fxToGBP: 1.165,
    labour: { skilled: 30.07, semiskilled: 23.05, engineer: 48.11, foundry: 22.05, electronics: 20.04, inspector: 28.06, technician: 33.07, supervisor: 40.59 },
    energy: { electricityPerKwh: 0.159, gasPerKwh: 0.091 },
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
    fxToGBP: 1.165,
    labour: { skilled: 24.08, semiskilled: 18.06, engineer: 42.14, foundry: 17.05, electronics: 16.05, inspector: 24.08, technician: 26.49, supervisor: 32.50 },
    energy: { electricityPerKwh: 0.259, gasPerKwh: 0.111 },
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
    fxToGBP: 1.165,
    labour: { skilled: 19.08, semiskilled: 14.56, engineer: 34.13, foundry: 13.55, electronics: 13.05, inspector: 20.08, technician: 20.98, supervisor: 25.75 },
    energy: { electricityPerKwh: 0.189, gasPerKwh: 0.091 },
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
    fxToGBP: 5.096,
    labour: { skilled: 11.90, semiskilled: 8.92, engineer: 19.83, foundry: 7.93, electronics: 10.41, inspector: 11.90, technician: 13.09, supervisor: 16.06 },
    energy: { electricityPerKwh: 0.137, gasPerKwh: 0.08 },
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
    fxToGBP: 28.43,
    labour: { skilled: 13.08, semiskilled: 10.06, engineer: 22.13, foundry: 9.56, electronics: 9.05, inspector: 14.08, technician: 14.39, supervisor: 17.66 },
    energy: { electricityPerKwh: 0.129, gasPerKwh: 0.07 },
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
    fxToGBP: 6.151,
    labour: { skilled: 7.45, semiskilled: 5.76, engineer: 12.92, foundry: 5.47, electronics: 5.17, inspector: 8.45, technician: 8.20, supervisor: 10.07 },
    energy: { electricityPerKwh: 0.109, gasPerKwh: 0.07 },
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
    fxToGBP: 428.2,
    labour: { skilled: 9.30, semiskilled: 7.34, engineer: 16.63, foundry: 6.85, electronics: 6.65, inspector: 10.76, technician: 10.23, supervisor: 12.55 },
    energy: { electricityPerKwh: 0.115, gasPerKwh: 0.069 },
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
    fxToGBP: 13.21,
    labour: { skilled: 39.31, semiskilled: 31.45, engineer: 60.93, foundry: 29.48, electronics: 27.52, inspector: 37.34, technician: 43.24, supervisor: 53.07 },
    energy: { electricityPerKwh: 0.088, gasPerKwh: 0.06 },
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
    fxToGBP: 1.165,
    labour: { skilled: 34.13, semiskilled: 27.10, engineer: 52.19, foundry: 25.09, electronics: 23.09, inspector: 32.12, technician: 37.54, supervisor: 46.07 },
    energy: { electricityPerKwh: 0.219, gasPerKwh: 0.101 },
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
    fxToGBP: 64.86,
    labour: { skilled: 6.62, semiskilled: 5.09, engineer: 12.22, foundry: 4.89, electronics: 4.58, inspector: 7.13, technician: 7.28, supervisor: 8.94 },
    energy: { electricityPerKwh: 0.086, gasPerKwh: 0.038 },
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
    fxToGBP: 8.88,
    labour: { skilled: 8.08, semiskilled: 5.62, engineer: 18.40, foundry: 5.11, electronics: 6.64, inspector: 8.18, technician: 8.88, supervisor: 10.91 },
    energy: { electricityPerKwh: 0.071, gasPerKwh: 0.03 },
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
    fxToGBP: 127.2,
    labour: { skilled: 5.14, semiskilled: 3.52, engineer: 12.08, foundry: 3.02, electronics: 4.53, inspector: 5.54, technician: 5.65, supervisor: 6.94 },
    energy: { electricityPerKwh: 0.069, gasPerKwh: 0.03 },
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
    fxToGBP: 23.84,
    labour: { skilled: 7.39, semiskilled: 5.71, engineer: 11.82, foundry: 4.73, electronics: 6.40, inspector: 7.39, technician: 8.13, supervisor: 9.98 },
    energy: { electricityPerKwh: 0.078, gasPerKwh: 0.039 },
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
    fxToGBP: 1.324,
    labour: { skilled: 34.25, semiskilled: 26.19, engineer: 58.43, foundry: 24.18, electronics: 24.18, inspector: 32.24, technician: 37.68, supervisor: 46.24 },
    energy: { electricityPerKwh: 0.1, gasPerKwh: 0.04 },
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
    fxToGBP: 44.52,
    labour: { skilled: 5.74, semiskilled: 4.15, engineer: 9.89, foundry: 3.76, electronics: 3.96, inspector: 5.93, technician: 6.31, supervisor: 7.74 },
    energy: { electricityPerKwh: 0.079, gasPerKwh: 0.04 },
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
    fxToGBP: 34350,
    labour: { skilled: 3.92, semiskilled: 2.89, engineer: 7.73, foundry: 2.58, electronics: 3.09, inspector: 4.64, technician: 4.31, supervisor: 5.29 },
    energy: { electricityPerKwh: 0.061, gasPerKwh: 0.03 },
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
    fxToGBP: 6.916,
    labour: { skilled: 8.44, semiskilled: 6.45, engineer: 15.88, foundry: 5.96, electronics: 6.45, inspector: 9.43, technician: 9.28, supervisor: 11.40 },
    energy: { electricityPerKwh: 0.109, gasPerKwh: 0.05 },
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
    fxToGBP: 1798,
    labour: { skilled: 25.44, semiskilled: 19.66, engineer: 43.94, foundry: 18.50, electronics: 19.66, inspector: 27.75, technician: 27.98, supervisor: 34.34 },
    energy: { electricityPerKwh: 0.148, gasPerKwh: 0.068 },
    materialFactors: { commodityResin: 1.000, engineeringResin: 1.00, highPerfResin: 1.000 },
    materialMultiplier: 1.00,
    machineRateMultiplier: 0.80,
    overheadMultiplier: 0.90,
    packagingMultiplier: 0.92,
    logisticsMultiplier: 1.35,
  },
};

// ─── Surface treatment — the factors coating cost turns on ────────────────────

/**
 * Effluent and chemistry factors for surface treatment, UK = 1.00.
 *
 * These exist because **labour is a smaller share of coating cost than most cost
 * engineers assume, and effluent is a much larger one.** Waste-water treatment,
 * sludge disposal, heavy-metal discharge limits, VOC abatement, IED permitting
 * and REACH authorisation are where the EU and UK genuinely carry structural
 * cost against China and India — and `machineRateMultiplier` cannot express it,
 * because it is not a machine cost. Modelling it inside a labour factor, which
 * is the usual shortcut, gets both the size and the direction of the gap wrong.
 *
 * Proprietary coating chemistry (Atotech/MKS, Chemetall, Coventya, Axalta, Akzo,
 * PPG) is priced GLOBALLY with only a modest local discount, which is why the
 * chemical factor moves far less than labour does — India in particular loses
 * most of its labour advantage here.
 *
 * ANCHORS (Surface Treatment & Coating Should-Cost Model workbook, sheet 03,
 * rebased from its Europe = 1.00 to our UK = 1.00): UK 1.00, Europe 0.95,
 * China 0.52, India 0.57 on effluent; UK 1.00, Europe 0.95, China 0.71,
 * India 0.90 on chemistry. Every OTHER region here is interpolated from those
 * four by regulatory regime and is an estimate, not a sourced figure.
 */
export interface SurfaceRegionalFactors {
  /** Effluent treatment, sludge disposal, permitting and EHS vs UK. */
  effluent: number;
  /** Proprietary coating and plating chemistry vs UK. */
  chemical: number;
}

export const SURFACE_REGIONAL_FACTORS: Record<ManufacturingRegion, SurfaceRegionalFactors> = {
  // Anchored by the workbook
  UK: { effluent: 1.00, chemical: 1.00 },
  DE: { effluent: 0.95, chemical: 0.95 },
  CN: { effluent: 0.52, chemical: 0.71 },
  IN: { effluent: 0.57, chemical: 0.90 },
  // Interpolated — EU/EEA members carry the same IED and REACH burden as Germany,
  // discounted for lower gate fees and enforcement cost in the east.
  FR: { effluent: 0.95, chemical: 0.95 },
  NL: { effluent: 1.00, chemical: 0.95 },
  SE: { effluent: 0.98, chemical: 0.95 },
  IT: { effluent: 0.90, chemical: 0.95 },
  ES: { effluent: 0.88, chemical: 0.95 },
  PL: { effluent: 0.80, chemical: 0.92 },
  CZ: { effluent: 0.80, chemical: 0.92 },
  HU: { effluent: 0.78, chemical: 0.92 },
  RO: { effluent: 0.72, chemical: 0.90 },
  // Outside REACH: lower compliance cost, but chemistry is still bought globally.
  TR: { effluent: 0.60, chemical: 0.88 },
  US: { effluent: 0.75, chemical: 0.90 },
  KR: { effluent: 0.72, chemical: 0.90 },
  BR: { effluent: 0.62, chemical: 0.92 },
  MX: { effluent: 0.58, chemical: 0.88 },
  TH: { effluent: 0.55, chemical: 0.85 },
  VN: { effluent: 0.50, chemical: 0.85 },
};

/** Surface factors for a region, defaulting to UK rather than to 1.0 by accident. */
export function surfaceFactors(region: string): SurfaceRegionalFactors {
  return SURFACE_REGIONAL_FACTORS[region as ManufacturingRegion]
    ?? SURFACE_REGIONAL_FACTORS.UK;
}

// ─── Authentic country prices — Extrusion grades ───────────────────────────────

/**
 * Authentic per-country prices (£/kg, 2026-09) for extrusion-grade materials.
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
  'mat-pe100-pipe':      { US: 1.13, DE: 1.43, PL: 1.26, CN: 1.07, IN: 1.18, MX: 1.15, TH: 1.20, VN: 1.22 },
  'mat-pe80-pipe':       { US: 1.07, DE: 1.36, PL: 1.20, CN: 1.02, IN: 1.12, MX: 1.09, TH: 1.14, VN: 1.16 },
  'mat-upvc-pipe':       { US: 0.70, DE: 0.91, PL: 0.78, CN: 0.64, IN: 0.72, MX: 0.74, TH: 0.76, VN: 0.78 },
  'mat-pvc-cable':       { US: 1.14, DE: 1.39, PL: 1.22, CN: 1.06, IN: 1.16, MX: 1.18, TH: 1.20, VN: 1.22 },
  'mat-xlpe-cable':      { US: 2.17, DE: 2.40, PL: 2.24, CN: 2.10, IN: 2.21, MX: 2.22, TH: 2.25, VN: 2.27 },
  'mat-gpps-ext':        { US: 1.51, DE: 1.76, PL: 1.60, CN: 1.46, IN: 1.55, MX: 1.57, TH: 1.58, VN: 1.60 },
  'mat-abs-ext-sheet':   { US: 1.60, DE: 1.88, PL: 1.70, CN: 1.49, IN: 1.62, MX: 1.65, TH: 1.64, VN: 1.66 },
  'mat-pmma-ext-sheet':  { US: 2.44, DE: 2.70, PL: 2.52, CN: 2.30, IN: 2.48, MX: 2.50, TH: 2.49, VN: 2.51 },
  'mat-pc-ext-sheet':    { US: 3.02, DE: 3.33, PL: 3.10, CN: 2.85, IN: 3.02, MX: 3.08, TH: 3.05, VN: 3.07 },
  'mat-pvc-medical-tube':{ US: 1.77, DE: 1.98, PL: 1.85, CN: 1.65, IN: 1.81, MX: 1.83, TH: 1.83, VN: 1.85 },
  'mat-tpu-medical-tube':{ US: 6.25, DE: 6.70, PL: 6.40, CN: 6.00, IN: 6.30, MX: 6.35, TH: 6.30, VN: 6.35 },
  'mat-tpe-profile':     { US: 2.22, DE: 2.50, PL: 2.32, CN: 2.10, IN: 2.28, MX: 2.30, TH: 2.30, VN: 2.32 },
  'mat-pvc-foam':        { US: 0.95, DE: 1.17, PL: 1.02, CN: 0.87, IN: 0.96, MX: 0.98, TH: 0.99, VN: 1.01 },
  'mat-pp-ext-sheet':    { US: 0.99, DE: 1.27, PL: 1.11, CN: 0.95, IN: 1.05, MX: 1.03, TH: 1.08, VN: 1.10 },
  'mat-pa12-ext-tube':   { US: 6.00, DE: 6.40, PL: 6.10, CN: 5.80, IN: 6.05, MX: 6.10, TH: 6.05, VN: 6.10 },
};

// ─── Authentic country prices — Thermoforming sheet grades ─────────────────────

/**
 * Authentic per-country prices (£/kg, 2026-09) for thermoforming-sheet materials.
 * These REPLACE the family multiplier for the listed (material, region) pairs — a
 * China APET sheet price is the real China price, not "UK × factor". Commodity sheet
 * (HIPS/PP/PE/PVC/PET) swings ±~20% on regional feedstock/energy (US shale-ethane
 * cheapest, EU energy-costly, Asia low); engineering/multilayer/high-perf specialities
 * (PMMA/PC/PEI/PPS/co-ex) barely move by country. UK is the library base and omitted.
 * Confidence: Low — index/benchmark anchored, ready for a live sheet-price feed.
 */
export const THERMOFORMING_COUNTRY_PRICES: Record<string, Partial<Record<ManufacturingRegion, number>>> = {
  //                     US      DE      PL      CN      IN      MX      TH      VN
  'mat-hips-tf':          { US: 1.32,  DE: 1.56,  PL: 1.42,  CN: 1.25,  IN: 1.34,  MX: 1.30,  TH: 1.35,  VN: 1.37 },
  'mat-abs-tf':           { US: 1.72,  DE: 2.16,  PL: 1.90,  CN: 1.64,  IN: 1.80,  MX: 1.76,  TH: 1.82,  VN: 1.84 },
  'mat-petg-tf':          { US: 1.62,  DE: 2.02,  PL: 1.78,  CN: 1.55,  IN: 1.72,  MX: 1.68,  TH: 1.74,  VN: 1.76 },
  'mat-apet-tf':          { US: 1.36,  DE: 1.70,  PL: 1.49,  CN: 1.28,  IN: 1.42,  MX: 1.40,  TH: 1.45,  VN: 1.47 },
  'mat-cpet-tf':          { US: 1.55,  DE: 1.90,  PL: 1.68,  CN: 1.48,  IN: 1.62,  MX: 1.60,  TH: 1.65,  VN: 1.67 },
  'mat-rpvc-tf':          { US: 1.13,  DE: 1.43,  PL: 1.23,  CN: 1.05,  IN: 1.17,  MX: 1.19,  TH: 1.21,  VN: 1.23 },
  'mat-pp-tf':            { US: 1.13,  DE: 1.47,  PL: 1.27,  CN: 1.08,  IN: 1.19,  MX: 1.17,  TH: 1.22,  VN: 1.24 },
  'mat-hdpe-tf':          { US: 1.04,  DE: 1.37,  PL: 1.17,  CN: 0.99,  IN: 1.10,  MX: 1.08,  TH: 1.13,  VN: 1.15 },
  'mat-ldpe-tf':          { US: 1.34,  DE: 1.66,  PL: 1.44,  CN: 1.27,  IN: 1.38,  MX: 1.36,  TH: 1.41,  VN: 1.43 },
  'mat-ps-foam-tf':       { US: 1.79,  DE: 2.13,  PL: 1.92,  CN: 1.71,  IN: 1.85,  MX: 1.83,  TH: 1.88,  VN: 1.90 },
  'mat-pmma-tf':          { US: 2.72,  DE: 3.08,  PL: 2.85,  CN: 2.60,  IN: 2.82,  MX: 2.84,  TH: 2.82,  VN: 2.85 },
  'mat-pc-tf':            { US: 3.20,  DE: 3.60,  PL: 3.34,  CN: 3.05,  IN: 3.30,  MX: 3.32,  TH: 3.30,  VN: 3.33 },
  'mat-pei-tf':           { US: 27.00, DE: 28.80, PL: 28.00, CN: 26.50, IN: 27.60, MX: 27.80, TH: 27.60, VN: 27.80 },
  'mat-pps-tf':           { US: 13.40, DE: 14.60, PL: 14.00, CN: 13.00, IN: 13.80, MX: 13.90, TH: 13.80, VN: 13.90 },
  'mat-abs-pmma-tf':      { US: 2.36,  DE: 2.80,  PL: 2.52,  CN: 2.24,  IN: 2.44,  MX: 2.42,  TH: 2.46,  VN: 2.48 },
  'mat-abs-pc-tf':        { US: 2.85,  DE: 3.33,  PL: 3.03,  CN: 2.75,  IN: 2.97,  MX: 2.95,  TH: 2.99,  VN: 3.01 },
  'mat-pp-tpo-tf':        { US: 1.70,  DE: 2.12,  PL: 1.86,  CN: 1.62,  IN: 1.80,  MX: 1.76,  TH: 1.82,  VN: 1.84 },
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
const UK_ELECTRICITY_BASIS_PER_KWH = 0.268;

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
/**
 * A user's region string → the code the rate model uses, or null.
 *
 * Derived from REGION_NAMES rather than a second hand-written table, so it
 * cannot drift out of step with the regions that actually exist. Accepts the
 * code ("PL"), the display name ("Poland") and the handful of spellings people
 * genuinely type. Returns null rather than guessing: a part list saying
 * "Polandd" must be refused, not costed in the UK and reported as Poland.
 *
 * (`resolveRegion` in rate-library.ts is a different thing — an 11-entry table
 *  for the region-FILTERING path, returning display names. It does not cover
 *  all twenty and is not interchangeable with this.)
 */
const REGION_SPELLINGS: Partial<Record<ManufacturingRegion, string[]>> = {
  UK: ['gb', 'gbr', 'great britain', 'britain', 'england'],
  US: ['usa', 'united states', 'united states of america', 'america'],
  CZ: ['czechia', 'czech'],
  KR: ['korea', 'republic of korea'],
  VN: ['viet nam'],
  DE: ['deutschland'],
  TR: ['turkiye', 'türkiye'],
  NL: ['holland'],
};

export function resolveManufacturingRegion(input: string | undefined | null): ManufacturingRegion | null {
  const q = (input ?? '').trim().toLowerCase();
  if (!q) return null;
  for (const code of Object.keys(REGION_NAMES) as ManufacturingRegion[]) {
    if (code.toLowerCase() === q) return code;
    if (REGION_NAMES[code].toLowerCase() === q) return code;
    if ((REGION_SPELLINGS[code] ?? []).includes(q)) return code;
  }
  return null;
}

/** Every region a part list may name, for an error message worth reading. */
export function supportedRegions(): string[] {
  return (Object.keys(REGION_NAMES) as ManufacturingRegion[])
    .map(c => `${c} (${REGION_NAMES[c]})`);
}

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
      fullyLoadedRatePerHr: labourCategoryRates[l.id.split('-').at(-1) ?? ''] ?? l.fullyLoadedRatePerHr * (rd.labour.skilled / REGIONAL_DATA.UK.labour.skilled),
      region: rd.name,
      sourceNote: `Regional benchmark ${rd.name} — 2026-09`,
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
          sourceNote: `${m.sourceNote} | ${rd.name} authentic 2026-09 price £${authentic.toFixed(2)}/kg (country-specific, not multiplier-scaled)`,
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
        sourceNote: `${rd.name} industrial energy benchmark 2026-09`,
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
  opts: { regions?: ManufacturingRegion[]; baseRegion?: ManufacturingRegion; landed?: boolean; sourceRegion?: ManufacturingRegion } = {},
): RegionalComparisonRow[] {
  const regions = opts.regions ?? DEFAULT_RC_REGIONS;
  const ukSemi = REGIONAL_DATA['UK'].labour.semiskilled;
  // The multipliers below are defined RELATIVE TO UK. But the breakdown passed in
  // was computed for `sourceRegion` (e.g. a China should-cost), so we must first
  // normalise it back to a UK-equivalent baseline — otherwise the UK row wrongly
  // shows the source-region cost and the source region gets discounted twice (a
  // China ¥80 headline came out as ¥58 in this table). Default 'UK' → no-op, so
  // existing callers are unchanged.
  const source = opts.sourceRegion ?? 'UK';
  const base = opts.baseRegion ?? source;   // compare against the region we costed in
  const srcRD = REGIONAL_DATA[source] ?? REGIONAL_DATA['UK'];
  const srcLab = (srcRD.labour.semiskilled / ukSemi) || 1;
  const uk: Breakdown8Bucket = {
    rawMaterial: bkd.rawMaterial / (srcRD.materialMultiplier || 1),
    process: bkd.process / (srcRD.machineRateMultiplier || 1),
    labour: bkd.labour / srcLab,
    tooling: bkd.tooling / (srcRD.machineRateMultiplier || 1),
    overhead: bkd.overhead / (srcRD.overheadMultiplier || 1),
    packaging: bkd.packaging / (srcRD.packagingMultiplier || 1),
    logistics: bkd.logistics / (srcRD.logisticsMultiplier || 1),
    margin: bkd.margin,
  };
  const rows = regions.map((code): RegionalComparisonRow | null => {
    const rd = REGIONAL_DATA[code];
    if (!rd) return null;
    // The source region reproduces the actual computed breakdown exactly (it IS
    // the headline) — no round-trip through the multiplier model.
    if (code === source) {
      const exW = bkd.rawMaterial + bkd.process + bkd.labour + bkd.tooling + bkd.overhead;
      const add = opts.landed ? (LANDED_ADDERS[code] ?? { duty: 0.05, shipping: 0.05 }) : { duty: 0, shipping: 0 };
      const tot = exW + bkd.packaging + bkd.logistics + bkd.margin + exW * add.duty + exW * add.shipping;
      return { code, name: rd.name, currency: rd.currency, material: bkd.rawMaterial, process: bkd.process, labour: bkd.labour, tooling: bkd.tooling, overhead: bkd.overhead, exWorks: exW, packaging: bkd.packaging, logistics: bkd.logistics, margin: bkd.margin, total: tot, vsBasePct: 0, isBase: code === base };
    }
    const material = uk.rawMaterial * rd.materialMultiplier;
    const process = uk.process * rd.machineRateMultiplier;
    const labour = uk.labour * (rd.labour.semiskilled / ukSemi);
    // Tooling is bought where the parts are made — scale by the machine-rate
    // multiplier as a regional capex proxy instead of exporting UK tooling £.
    const tooling = uk.tooling * rd.machineRateMultiplier;
    // Overhead and margin are PERCENTAGES in the core stack. Carrying the UK
    // absolute £ into a cheaper region overstates both — re-base them on the
    // region's own costs so each row stays internally consistent.
    const ukFactoryBase = uk.rawMaterial + uk.process + uk.labour + uk.tooling;
    const factoryBase = material + process + labour + tooling;
    const overhead = (ukFactoryBase > 0 ? uk.overhead * (factoryBase / ukFactoryBase) : uk.overhead) * rd.overheadMultiplier;
    const exWorks = material + process + labour + tooling + overhead;
    const packaging = uk.packaging * rd.packagingMultiplier;
    const logistics = uk.logistics * rd.logisticsMultiplier;
    const ukMarginBase = ukFactoryBase + uk.overhead + uk.packaging + uk.logistics;
    const marginBase = exWorks + packaging + logistics;
    const margin = ukMarginBase > 0 ? uk.margin * (marginBase / ukMarginBase) : uk.margin;
    const adder = opts.landed ? (LANDED_ADDERS[code] ?? { duty: 0.05, shipping: 0.05 }) : { duty: 0, shipping: 0 };
    const total = exWorks + packaging + logistics + margin + exWorks * adder.duty + exWorks * adder.shipping;
    return { code, name: rd.name, currency: rd.currency, material, process, labour, tooling, overhead, exWorks, packaging, logistics, margin, total, vsBasePct: 0, isBase: code === base };
  }).filter((r): r is RegionalComparisonRow => r !== null);
  const baseTotal = rows.find(r => r.code === base)?.total ?? rows[0]?.total ?? 0;
  rows.forEach(r => { r.vsBasePct = baseTotal > 0 ? ((baseTotal - r.total) / baseTotal) * 100 : 0; });
  return rows;
}
