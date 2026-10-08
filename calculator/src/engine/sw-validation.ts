/**
 * Model validation harness.
 *
 * The weakest link in any should-cost model is "are the outputs actually right?"
 * This back-tests the engine against published premium-EV software investment
 * figures: for each reference programme we configure the engine with that
 * programme's known macro parameters (region, dev source, volume, life) and
 * report the variance between the model and the published figure.
 *
 * HONESTY NOTE: the published figures are third-party *estimates* (analyst
 * reports, teardown studies), not audited internal actuals, and the per-programme
 * configs are public approximations — so this is *envelope* validation, not a
 * proof of point accuracy. The value is that the model now reports its own error
 * instead of presenting a single number as truth. The structure is ready to
 * ingest real actuals (swap publishedTotalGBP for a measured value) the moment
 * one is available. See docs/sw-cost-validation.md.
 */

import { computeSWProgram, defaultSWProgramInputs } from './sw-should-cost.js';
import { SW_PUBLISHED_PROGRAMMES } from './sw-benchmarks.js';
import type { SWProgramInputs, SWRegion, DevSource } from './sw-should-cost.js';

export interface SWValidationCase {
  programme:          string;
  source:             string;
  publishedTotalGBP:  number;   // published total SW investment
  publishedPerVehicle: number;  // published £/vehicle
  confidence:         'High' | 'Medium' | 'Low';
  /** False until the published figure carries a source link. */
  verified:           boolean;
  /** Public approximation of the programme's macro cost drivers. */
  config: {
    region:                 SWRegion;
    devSource:              DevSource;
    annualProductionVolume: number;
    programLifeYears:       number;
    note:                   string;
  };
}

export interface SWValidationResult {
  programme:          string;
  source:             string;
  publishedTotalGBP:  number;
  modelledTotalGBP:   number;
  totalVariancePct:   number;   // (modelled − published) / published × 100
  publishedPerVehicle: number;
  modelledPerVehicle: number;
  perVehicleVariancePct: number;
  withinBand:         boolean;
  confidence:         'High' | 'Medium' | 'Low';
}

export interface SWValidationReport {
  band:                number;   // ± tolerance band used (%)
  cases:               SWValidationResult[];
  mapeTotal:           number;   // mean absolute % error on total
  mapePerVehicle:      number;   // mean absolute % error on £/vehicle
  withinBandCount:     number;
  caseCount:           number;
  /** How many published figures are sourced (0 today) — the screen states it beside the MAPE. */
  verifiedCount:       number;
  /** Cases whose published £/vehicle does not equal published total ÷ (volume × life) within 10 %. */
  perVehicleInconsistent: number;
}

/**
 * Reference programmes: the published figures come from the ONE list in sw-benchmarks.ts (none verified — see there);
 * the macro configs are public approximations. The model is NOT tuned to these figures and no test asserts that it
 * matches them — matching unverified figures is not evidence of accuracy (software review P1 #6, Oct 2026).
 */
const CONFIGS: SWValidationCase['config'][] = [
  { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 70_000, programLifeYears: 9, note: 'German OEM in-house full-stack flagship' },  // BMW iX
  { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 40_000, programLifeYears: 8, note: 'Lower volume premium sports EV' },  // Porsche Taycan
  { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 55_000, programLifeYears: 9, note: 'Flagship infotainment-heavy programme' },  // Mercedes EQS
  { region: 'UK', devSource: 'Tier1_Supplier', annualProductionVolume: 75_000, programLifeYears: 8, note: 'UK OEM with heavy Tier-1 outsourcing' },  // Range Rover L460
  { region: 'USA_Detroit', devSource: 'OEM_Internal', annualProductionVolume: 100_000, programLifeYears: 10, note: 'US in-house, high volume' },  // Tesla Model S HW4
  { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 65_000, programLifeYears: 9, note: 'VW Group platform-reuse benefits' },  // Audi Q8 e-tron
  { region: 'USA_SV', devSource: 'Startup_OSS', annualProductionVolume: 8_000, programLifeYears: 6, note: 'Silicon Valley startup, very low volume' },  // Lucid Air
];

export const SW_VALIDATION_CASES: SWValidationCase[] = SW_PUBLISHED_PROGRAMMES.map((p, i) => ({
  programme: p.vehicle.replace(/ \(.*\)$/, ''),
  source: p.source,
  publishedTotalGBP: p.totalGBP,
  publishedPerVehicle: p.perVehicleGBP,
  confidence: 'Low' as const,
  verified: p.verified,
  config: CONFIGS[i],
}));

const DEFAULT_BAND_PCT = 35;

/** Run the back-test and return the variance report. */
export function runValidation(band = DEFAULT_BAND_PCT, cases = SW_VALIDATION_CASES,
                              rateLibrary?: SWProgramInputs['rateLibrary']): SWValidationReport {
  const results: SWValidationResult[] = cases.map(c => {
    const inputs: SWProgramInputs = {
      ...defaultSWProgramInputs(),
      // The ACTIVE book (company rates when set) — the panel showed the built-in book's figures (P2 #13).
      ...(rateLibrary ? { rateLibrary } : {}),
      region:                 c.config.region,
      devSource:              c.config.devSource,
      annualProductionVolume: c.config.annualProductionVolume,
      programLifeYears:       c.config.programLifeYears,
    };
    const r = computeSWProgram(inputs, { summaryOnly: true });
    const modelledTotal = r.summary.grandTotal;
    const modelledPV    = r.summary.perVehicle;
    const totalVar = (modelledTotal - c.publishedTotalGBP) / c.publishedTotalGBP * 100;
    const pvVar    = (modelledPV - c.publishedPerVehicle) / c.publishedPerVehicle * 100;
    return {
      programme: c.programme, source: c.source,
      publishedTotalGBP: c.publishedTotalGBP, modelledTotalGBP: modelledTotal,
      totalVariancePct: totalVar,
      publishedPerVehicle: c.publishedPerVehicle, modelledPerVehicle: modelledPV,
      perVehicleVariancePct: pvVar,
      withinBand: Math.abs(totalVar) <= band,
      confidence: c.confidence,
    };
  });

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    band,
    cases: results,
    mapeTotal:      mean(results.map(r => Math.abs(r.totalVariancePct))),
    mapePerVehicle: mean(results.map(r => Math.abs(r.perVehicleVariancePct))),
    withinBandCount: results.filter(r => r.withinBand).length,
    caseCount: results.length,
    verifiedCount: cases.filter(c => c.verified).length,
    perVehicleInconsistent: cases.filter(c => {
      const implied = c.publishedTotalGBP / (c.config.annualProductionVolume * c.config.programLifeYears);
      return Math.abs(implied - c.publishedPerVehicle) / c.publishedPerVehicle > 0.10;
    }).length,
  };
}
