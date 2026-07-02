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
import type { SWProgramInputs, SWRegion, DevSource } from './sw-should-cost.js';

export interface SWValidationCase {
  programme:          string;
  source:             string;
  publishedTotalGBP:  number;   // published total SW investment
  publishedPerVehicle: number;  // published £/vehicle
  confidence:         'High' | 'Medium' | 'Low';
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
}

/**
 * Reference programmes. Macro configs are public approximations; published
 * figures carry their source. These are deliberately NOT tuned to minimise
 * variance — the harness reports whatever the model produces.
 */
export const SW_VALIDATION_CASES: SWValidationCase[] = [
  {
    programme: 'BMW iX', source: 'Berylls Strategy Advisors estimate, 2023',
    publishedTotalGBP: 620e6, publishedPerVehicle: 4_800, confidence: 'Medium',
    config: { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 70_000, programLifeYears: 9,
      note: 'German OEM in-house full-stack flagship' },
  },
  {
    programme: 'Porsche Taycan', source: 'SBD Automotive teardown + SW analysis',
    publishedTotalGBP: 480e6, publishedPerVehicle: 5_200, confidence: 'Medium',
    config: { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 40_000, programLifeYears: 8,
      note: 'Lower volume premium sports EV' },
  },
  {
    programme: 'Mercedes EQS', source: 'Analyst estimate (MBUX Hyperscreen programme)',
    publishedTotalGBP: 710e6, publishedPerVehicle: 5_500, confidence: 'Low',
    config: { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 55_000, programLifeYears: 9,
      note: 'Flagship infotainment-heavy programme' },
  },
  {
    programme: 'Range Rover L460', source: 'JLR programme estimate (Tier-1 heavy)',
    publishedTotalGBP: 390e6, publishedPerVehicle: 3_800, confidence: 'Low',
    config: { region: 'UK', devSource: 'Tier1_Supplier', annualProductionVolume: 75_000, programLifeYears: 8,
      note: 'UK OEM with heavy Tier-1 outsourcing' },
  },
  {
    programme: 'Tesla Model S HW4', source: 'Morgan Stanley Research, annualised amortised',
    publishedTotalGBP: 850e6, publishedPerVehicle: 3_200, confidence: 'Medium',
    config: { region: 'USA_Detroit', devSource: 'OEM_Internal', annualProductionVolume: 100_000, programLifeYears: 10,
      note: 'US in-house, highest absolute SW investment, high volume' },
  },
  {
    programme: 'Audi Q8 e-tron', source: 'VW Group Annual Report + EY SW cost model',
    publishedTotalGBP: 520e6, publishedPerVehicle: 4_600, confidence: 'Medium',
    config: { region: 'EU', devSource: 'OEM_Internal', annualProductionVolume: 65_000, programLifeYears: 9,
      note: 'VW Group platform-reuse benefits' },
  },
  {
    programme: 'Lucid Air', source: 'Low-volume amortisation — Lucid investor notes',
    publishedTotalGBP: 380e6, publishedPerVehicle: 7_800, confidence: 'Low',
    config: { region: 'USA_SV', devSource: 'Startup_OSS', annualProductionVolume: 8_000, programLifeYears: 6,
      note: 'Silicon Valley startup, very low volume → high £/vehicle' },
  },
];

const DEFAULT_BAND_PCT = 35;

/** Run the back-test and return the variance report. */
export function runValidation(band = DEFAULT_BAND_PCT, cases = SW_VALIDATION_CASES): SWValidationReport {
  const results: SWValidationResult[] = cases.map(c => {
    const inputs: SWProgramInputs = {
      ...defaultSWProgramInputs(),
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
  };
}
