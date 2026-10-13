/**
 * Software costing cockpit — the views a costing manager reads after the headline (Oct 2026 review):
 *
 *  - `swSpendProfile`: the programme's NOMINAL spend year by year — engineering over the development months by phase,
 *    then maintenance, licences, royalties and cloud each production year. Built from the engine's own formulas and the
 *    result's module figures; at a 0 % discount rate the years add up EXACTLY to the programme total (tested).
 *  - `swQuoteCheck`: a supplier's quote against this should-cost — the gap, and the £ per person-month the quote implies
 *    for the engineering effort the model costs (the number a negotiation turns on).
 *
 * Nothing here prices anything new: every £ is the result's, re-arranged.
 */

import {
  SW_MODULES, SW_CLOUD_REFERENCE_FLEET, SW_DEFAULT_DEVELOPMENT_MONTHS, buildPhases, swLoadedRate,
  type SWProgramResult, type SWCategory,
} from './sw-should-cost.js';
import { SW_HUB_RATES, SW_PM_HOURS } from './sw-country-rates.js';

export interface SWSpendYear {
  label:       string;            // 'Dev 1' … / 'Year 1' …
  phase:       'development' | 'production';
  engineering: number;            // NRE spread over the development months by phase
  maintenance: number;
  licences:    number;            // annual IP / embedded licences
  royalties:   number;            // per vehicle built + per vehicle in service
  cloud:       number;
  total:       number;
  cumulative:  number;
}

export interface SWSpendProfile {
  years:         SWSpendYear[];
  sopIndex:      number;          // index of the first production year
  nominalTotal:  number;
  note:          string;
}

export function swSpendProfile(result: SWProgramResult): SWSpendProfile {
  const prog = result.inputs;
  const life = prog.programLifeYears;
  const vol = prog.annualProductionVolume;
  const r = (prog.discountRatePct ?? 0) / 100;
  const pv = r > 0 ? Array.from({ length: life }, (_, i) => 1 / Math.pow(1 + r, i + 1)).reduce((a, b) => a + b, 0) : life;
  const devMonths = prog.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS;

  // Development: each phase's NRE spread evenly over its months, gathered into development years.
  const phases = buildPhases(result.summary.nreTotal, devMonths);
  const ends = phases.map(p => Number(p.months.split('–M')[1]));
  const devYears = Math.max(1, Math.ceil(devMonths / 12));
  const dev = new Array(devYears).fill(0);
  let start = 1;
  phases.forEach((p, i) => {
    const months = Math.max(1, ends[i] - start + 1);
    for (let m = start; m <= ends[i]; m++) dev[Math.min(devYears - 1, Math.floor((m - 1) / 12))] += p.nreCost / months;
    start = ends[i] + 1;
  });

  // Production: per module, nominal £ per year from the engine's rules.
  const prod = Array.from({ length: life }, () => ({ maintenance: 0, licences: 0, royalties: 0, cloud: 0 }));
  const connected = prog.connectedVehicleShare ?? 1;
  for (const m of result.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    if (!def) continue;
    const built = def.perVehicleRoyaltyGBP ?? 0, perYear = def.perVehiclePerYearGBP ?? 0;
    let royaltyPV = 0;
    for (let t = 1; t <= life; t++) royaltyPV += (vol * built + vol * t * perYear) * (r > 0 ? 1 / Math.pow(1 + r, t) : 1);
    const ipPerYear = (m.licensingCost - royaltyPV) / pv;
    const maintPerYear = m.maintenanceCost / pv;
    const cloudPerVehYear = m.cloudCost > 0 ? def.annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * connected : 0;
    for (let t = 1; t <= life; t++) {
      const y = prod[t - 1];
      y.maintenance += maintPerYear;
      y.licences += ipPerYear;
      y.royalties += vol * built + vol * t * perYear;
      y.cloud += cloudPerVehYear * vol * t;
    }
  }

  const years: SWSpendYear[] = [];
  let cum = 0;
  dev.forEach((v, i) => { cum += v; years.push({ label: `Dev ${i + 1}`, phase: 'development', engineering: v, maintenance: 0, licences: 0, royalties: 0, cloud: 0, total: v, cumulative: cum }); });
  prod.forEach((y, i) => {
    const total = y.maintenance + y.licences + y.royalties + y.cloud;
    cum += total;
    years.push({ label: `Year ${i + 1}`, phase: 'production', engineering: 0, ...y, total, cumulative: cum });
  });
  return {
    years, sopIndex: devYears, nominalTotal: cum,
    note: `Nominal £ (no discounting) — engineering over ${devMonths} development months by phase share; maintenance and `
      + `licences flat each production year; royalties and cloud grow with the fleet in service.`
      + (r > 0 ? ` The headline is discounted at ${prog.discountRatePct} %, so it is lower than this nominal sum.` : ''),
  };
}

export interface SWQuote {
  /** The supplier's quoted engineering / NRE for the scope costed, £. */
  nreGBP?:        number;
  /** The supplier's quoted per-vehicle licence or royalty, £ per vehicle built. */
  perVehicleGBP?: number;
  /** Optional quotes by software domain (category A–G), NRE £. */
  byCategory?:    Partial<Record<SWCategory, number>>;
}

export interface SWQuoteRow { key: string; label: string; should: number; quoted: number; gap: number; gapPct: number }

export interface SWQuoteCheck {
  nre?:               SWQuoteRow;
  perVehicle?:        SWQuoteRow;
  byCategory:         SWQuoteRow[];
  /** £ per person-month the NRE quote implies for the costed engineering effort (tools and homologation taken out). */
  impliedRatePerPM?:  number;
  /** The engine's own loaded £ / PM for this hub. */
  loadedRatePerPM:    number;
  /** implied ÷ loaded — the supplier's effective mark-up on the should-cost engineering rate. */
  rateMultiple?:      number;
  lines:              string[];
}

const row = (key: string, label: string, should: number, quoted: number): SWQuoteRow =>
  ({ key, label, should, quoted, gap: quoted - should, gapPct: should > 0 ? (quoted / should - 1) * 100 : 0 });

export function swQuoteCheck(result: SWProgramResult, quote: SWQuote): SWQuoteCheck {
  const s = result.summary;
  const loaded = swLoadedRate(result.inputs);
  const out: SWQuoteCheck = { byCategory: [], loadedRatePerPM: loaded, lines: [] };
  if (quote.nreGBP && quote.nreGBP > 0) {
    out.nre = row('nre', 'Engineering (NRE)', s.nreTotal, quote.nreGBP);
    const engineering = quote.nreGBP - s.totalToolchain - s.totalHomologation;
    if (s.totalEffortPersonMonths > 0 && engineering > 0) {
      out.impliedRatePerPM = engineering / s.totalEffortPersonMonths;
      out.rateMultiple = out.impliedRatePerPM / loaded;
    }
  }
  if (quote.perVehicleGBP && quote.perVehicleGBP > 0) {
    const vol = result.inputs.annualProductionVolume * result.inputs.programLifeYears;
    const shouldPerVeh = vol > 0 ? s.totalLicensing / vol : 0;
    out.perVehicle = row('perVehicle', 'Licences & royalties per vehicle', shouldPerVeh, quote.perVehicleGBP);
  }
  for (const [cat, q] of Object.entries(quote.byCategory ?? {}) as [SWCategory, number][]) {
    if (!(q > 0)) continue;
    const mods = result.modules.filter(m => m.category === cat);
    const should = mods.reduce((a, m) => a + m.totalNonRecurring, 0);
    out.byCategory.push(row(cat, mods[0]?.categoryLabel ?? cat, should, q));
  }
  return out;
}

/**
 * The three figures purchasing compares (costing review #9, Oct 2026): ONE-OFF engineering, the VARIABLE price per
 * vehicle built (royalties in the piece price), and the RECURRING cost per vehicle in service per year (cloud, map data)
 * plus fixed £ a year (licences, maintenance). The programme total is derived from them:
 *   total = NRE + perVehicleBuilt × vehicles built + perVehicleYear × vehicle-years in service + fixedPerYear × years
 * — exact at a 0 % discount rate (tested).
 */
export interface SWUnitEconomics {
  nre:               number;
  perVehicleBuilt:   number;
  perVehicleYear:    number;
  fixedPerYear:      number;
  vehiclesBuilt:     number;
  vehicleYears:      number;
  total:             number;
}

export function swUnitEconomics(result: SWProgramResult): SWUnitEconomics {
  const prog = result.inputs;
  const life = prog.programLifeYears, vol = prog.annualProductionVolume;
  const r = (prog.discountRatePct ?? 0) / 100;
  const pv = r > 0 ? Array.from({ length: life }, (_, i) => 1 / Math.pow(1 + r, i + 1)).reduce((a, b) => a + b, 0) : life;
  const connected = prog.connectedVehicleShare ?? 1;
  let built = 0, perYear = 0, fixed = 0;
  for (const m of result.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    if (!def) continue;
    const b = def.perVehicleRoyaltyGBP ?? 0, y = def.perVehiclePerYearGBP ?? 0;
    let royaltyPV = 0;
    for (let t = 1; t <= life; t++) royaltyPV += (vol * b + vol * t * y) * (r > 0 ? 1 / Math.pow(1 + r, t) : 1);
    built += b;
    perYear += y + (m.cloudCost > 0 ? def.annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * connected : 0);
    fixed += (m.licensingCost - royaltyPV) / pv + m.maintenanceCost / pv;
  }
  return {
    nre: result.summary.nreTotal, perVehicleBuilt: built, perVehicleYear: perYear, fixedPerYear: fixed,
    vehiclesBuilt: vol * life, vehicleYears: vol * life * (life + 1) / 2, total: result.summary.grandTotal,
  };
}

/**
 * The rate in context (costing review #1): the loaded £ / PM as £ / h and £ / day, the hub book's employment-cost
 * multiple of salary against the published 1.25–1.4 × (Hadzima, MIT), and — for the UK hub — the embedded contract
 * day-rate median (IT Jobs Watch). Evidence, not a rate: it never changes the costing.
 */

export interface SWRateCheck {
  loadedPerPM:        number;
  perHour:            number;
  perDay:             number;
  employmentMultiple: number | null;     // the hub book's (salary + statutory on-cost) ÷ salary at mid
  employmentLow:      number;            // 1.25
  employmentHigh:     number;            // 1.4
  contractDayGBP:     number | null;     // UK only
  lines:              string[];
}

export const RATE_EVIDENCE = {
  employment: { low: 1.25, high: 1.4, source: 'Hadzima, "How much does an employee cost?", MIT — employment cost 1.25–1.4 × salary (search result)' },
  ukContractDay: { value: 600, source: 'IT Jobs Watch, embedded software contract median £600 / day (Jan 2026, search result)' },
} as const;

export function swRateCheck(result: SWProgramResult): SWRateCheck {
  const loaded = swLoadedRate(result.inputs);
  const hub = SW_HUB_RATES[result.inputs.region];
  const perHour = loaded / SW_PM_HOURS;
  const mult = hub ? (hub.onCostInSalary ? null : 1 + hub.employerOnCostPctAtMid / 100) : null;
  const lines: string[] = [];
  if (mult != null && mult < RATE_EVIDENCE.employment.low) {
    lines.push(`The hub rate carries statutory employer cost only (×${mult.toFixed(2)} salary); total employment cost is usually ×${RATE_EVIDENCE.employment.low}–${RATE_EVIDENCE.employment.high} (pension, insurance, holiday). Your overhead field must carry the rest.`);
  }
  const ukDay = result.inputs.region === 'UK' ? RATE_EVIDENCE.ukContractDay.value : null;
  if (ukDay) lines.push(`A UK embedded-software contractor costs about £${ukDay} a day (median); this costing's in-house day is £${Math.round(perHour * 8)}.`);
  return { loadedPerPM: loaded, perHour, perDay: perHour * 8, employmentMultiple: mult, employmentLow: RATE_EVIDENCE.employment.low,
    employmentHigh: RATE_EVIDENCE.employment.high, contractDayGBP: ukDay, lines };
}
