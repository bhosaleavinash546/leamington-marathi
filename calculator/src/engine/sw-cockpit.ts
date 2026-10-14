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
  SW_MODULES, SW_CLOUD_REFERENCE_FLEET, SW_DEFAULT_DEVELOPMENT_MONTHS, SW_DEFAULT_SUBSCRIPTION_YEARS, SW_DEFAULT_SERVICE_YEARS,
  buildPhases, swLoadedRate, swOverhead, swEvidenceLines, computeSWProgram,
  type SWProgramResult, type SWCategory, type SWEvidenceGrade, type SWEvidenceLine, type DevSource, type SWRegion, type SWProgramInputs,
} from './sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY, resolveRateLibrary } from './sw-rate-library.js';
import { SW_HUB_RATES, SW_PM_HOURS } from './sw-country-rates.js';

export interface SWSpendYear {
  label:       string;            // 'Dev 1' … / 'Year 1' … / 'Service 1' …
  phase:       'development' | 'production' | 'service';
  engineering: number;            // NRE spread over the development months by phase
  maintenance: number;
  licences:    number;            // annual IP / embedded licences
  royalties:   number;            // per vehicle built + per-vehicle subscriptions
  cloud:       number;            // per connected vehicle in service + the fixed platform
  total:       number;
  cumulative:  number;
}

export interface SWSpendProfile {
  years:         SWSpendYear[];
  sopIndex:      number;          // index of the first production year
  nominalTotal:  number;
  note:          string;
}

/** Nominal spend by year: engineering over the development months by phase, then each module's own yearly streams
 *  (the same arrays the engine discounts into its totals) through the service tail. */
export function swSpendProfile(result: SWProgramResult): SWSpendProfile {
  const prog = result.inputs;
  const life = prog.programLifeYears;
  const r = (prog.discountRatePct ?? 0) / 100;
  const devMonths = prog.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS;

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

  const H = result.summary.horizonYears;
  const prod = Array.from({ length: H }, (_, i) => ({ maintenance: 0, licences: 0, royalties: 0, cloud: result.summary.cloudFixedYearly[i] ?? 0 }));
  for (const m of result.modules) {
    for (let i = 0; i < H; i++) {
      prod[i].maintenance += m.yearly.maintenance[i] ?? 0;
      prod[i].licences += m.yearly.licences[i] ?? 0;
      prod[i].royalties += m.yearly.royalties[i] ?? 0;
      prod[i].cloud += m.yearly.cloud[i] ?? 0;
    }
  }
  const years: SWSpendYear[] = [];
  let cum = 0;
  dev.forEach((v, i) => { cum += v; years.push({ label: `Dev ${i + 1}`, phase: 'development', engineering: v, maintenance: 0, licences: 0, royalties: 0, cloud: 0, total: v, cumulative: cum }); });
  prod.forEach((y, i) => {
    const total = y.maintenance + y.licences + y.royalties + y.cloud;
    if (i >= life && total === 0) return;
    cum += total;
    years.push({ label: i < life ? `Year ${i + 1}` : `Service ${i + 1 - life}`, phase: i < life ? 'production' : 'service', engineering: 0, ...y, total, cumulative: cum });
  });
  return {
    years, sopIndex: devYears, nominalTotal: cum,
    note: `Nominal £ (no discounting). Engineering over ${devMonths} development months by phase share; maintenance in full `
      + `for 3 years after SOP then a tail; royalties per vehicle built and for ${prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS} `
      + `subscription years; cloud for ${prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS} years per connected vehicle, so service years run past the last build year.`
      + (r > 0 ? ` The headline is discounted at ${prog.discountRatePct} %, so it is lower than this nominal sum.` : ''),
  };
}

// ── Unit economics ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The figures purchasing compares (costing review #9): ONE-OFF engineering, the royalty in each vehicle's piece price,
 * the RECURRING rates per vehicle in service (map subscription, cloud), and the fixed £ a year (IP licences,
 * maintenance, cloud platform). The programme total is derived from them — exact at a 0 % discount (tested):
 *   total = NRE + built × vehicles built + subscription × subscription vehicle-years + cloud × service vehicle-years + fixed × years
 */
export interface SWUnitEconomics {
  nre:                   number;
  perVehicleBuilt:       number;
  /** Map / per-vehicle-year royalty rate + cloud rate, £ per vehicle in service per year. */
  perVehicleYear:        number;
  subscriptionPerYear:   number;
  cloudPerYear:          number;
  subscriptionYears:     number;
  serviceYears:          number;
  /** Fixed £ a year, averaged over the production years. */
  fixedPerYear:          number;
  vehiclesBuilt:         number;
  subscriptionVehicleYears: number;
  serviceVehicleYears:   number;
  total:                 number;
}

export function swUnitEconomics(result: SWProgramResult): SWUnitEconomics {
  const prog = result.inputs;
  const life = prog.programLifeYears, vol = prog.annualProductionVolume;
  const N = prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS;
  const S = prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS;
  const connected = prog.connectedVehicleShare ?? 1;
  let built = 0, sub = 0, cloud = 0, fixedNominal = 0;
  for (const m of result.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    if (!def) continue;
    built += def.perVehicleRoyaltyGBP ?? 0;
    sub += def.perVehiclePerYearGBP ?? 0;
    if (prog.includeCloudCost && def.annualCloudCostGBP) cloud += def.annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * connected;
    fixedNominal += m.yearly.maintenance.reduce((a, b) => a + b, 0) + m.yearly.licences.reduce((a, b) => a + b, 0);
  }
  fixedNominal += result.summary.cloudFixedYearly.reduce((a, b) => a + b, 0);
  return {
    nre: result.summary.nreTotal, perVehicleBuilt: built, perVehicleYear: sub + cloud, subscriptionPerYear: sub, cloudPerYear: cloud,
    subscriptionYears: N, serviceYears: S, fixedPerYear: fixedNominal / life,
    vehiclesBuilt: vol * life, subscriptionVehicleYears: vol * life * N, serviceVehicleYears: vol * life * S,
    total: result.summary.grandTotal,
  };
}

// ── Supplier quote check ────────────────────────────────────────────────────────────────────────────────────────────

export interface SWQuote {
  /** The supplier's quoted engineering / NRE for the scope costed, £. */
  nreGBP?:             number;
  /** Quoted royalty per vehicle BUILT (in the piece price), £. */
  perVehicleGBP?:      number;
  /** Quoted subscription / service per vehicle per year, £. */
  perVehicleYearGBP?:  number;
  /** Quoted fixed £ a year (sustaining, platform). */
  fixedPerYearGBP?:    number;
  /** The supplier's own person-months for the NRE, when it states them — splits the gap into rate and effort. */
  quotedPM?:           number;
  /** Optional quotes by software domain (category A–G), NRE £. */
  byCategory?:         Partial<Record<SWCategory, number>>;
}

export interface SWQuoteRow { key: string; label: string; should: number; quoted: number; gap: number; gapPct: number; unit: 'total' | 'perVehicle' | 'perYear' }

export interface SWQuoteCheck {
  nre?:               SWQuoteRow;
  perVehicle?:        SWQuoteRow;
  perVehicleYear?:    SWQuoteRow;
  fixedPerYear?:      SWQuoteRow;
  byCategory:         SWQuoteRow[];
  /** £ per person-month the NRE quote implies for the costed engineering effort (tools and homologation taken out). */
  impliedRatePerPM?:  number;
  /** The engine's own loaded £ / PM for this hub and source. */
  loadedRatePerPM:    number;
  rateMultiple?:      number;
  /** A fair Tier-1 price for this scope: the should-cost re-costed as a Tier-1 supplier (its margin included). */
  target:             { nre: number; ratePerPM: number; basis: string };
  /** With the supplier's person-months: quote − target = effort gap + rate gap (+ other). */
  gapSplit?:          { effortGap: number; rateGap: number; other: number; quotedRatePerPM: number };
  lines:              string[];
}

const row = (key: string, label: string, should: number, quoted: number, unit: SWQuoteRow['unit']): SWQuoteRow =>
  ({ key, label, should, quoted, gap: quoted - should, gapPct: should > 0 ? (quoted / should - 1) * 100 : 0, unit });

export function swQuoteCheck(result: SWProgramResult, quote: SWQuote): SWQuoteCheck {
  const s = result.summary;
  const prog = result.inputs;
  const loaded = swLoadedRate(prog);
  const t1 = prog.devSource === 'Tier1_Supplier' ? result : computeSWProgram({ ...prog, devSource: 'Tier1_Supplier' }, { summaryOnly: true });
  const t1Rate = swLoadedRate({ ...prog, devSource: 'Tier1_Supplier' });
  const margin = resolveRateLibrary(prog.rateLibrary).supplierMargin?.value ?? DEFAULT_SW_RATE_LIBRARY.supplierMargin?.value ?? 0;
  const out: SWQuoteCheck = {
    byCategory: [], loadedRatePerPM: loaded, lines: [],
    target: { nre: t1.summary.nreTotal, ratePerPM: t1Rate, basis: `should-cost re-costed as a Tier-1 supplier: its effort factor ÷ (1 − ${(margin * 100).toFixed(1)} % margin)` },
  };
  const u = swUnitEconomics(result);
  if (quote.nreGBP && quote.nreGBP > 0) {
    out.nre = row('nre', 'Engineering (NRE)', s.nreTotal, quote.nreGBP, 'total');
    const other = s.totalToolchain + s.totalHomologation;
    const engineering = quote.nreGBP - other;
    if (s.totalEffortPersonMonths > 0 && engineering > 0) {
      out.impliedRatePerPM = engineering / s.totalEffortPersonMonths;
      out.rateMultiple = out.impliedRatePerPM / loaded;
    }
    if (quote.quotedPM && quote.quotedPM > 0) {
      const qRate = engineering / quote.quotedPM;
      const effortGap = (quote.quotedPM - s.totalEffortPersonMonths) * t1Rate;
      const rateGap = (qRate - t1Rate) * quote.quotedPM;
      out.gapSplit = { effortGap, rateGap, other: quote.nreGBP - out.target.nre - effortGap - rateGap, quotedRatePerPM: qRate };
    }
  }
  // Like for like (independent review, Oct 2026): a quoted £ per vehicle is the royalty in the piece price — it was
  // compared with ALL licensing ÷ vehicles, which carried the map annuity and fixed IP and showed a false gap.
  if (quote.perVehicleGBP && quote.perVehicleGBP > 0) out.perVehicle = row('perVehicle', 'Royalty per vehicle built', u.perVehicleBuilt, quote.perVehicleGBP, 'perVehicle');
  if (quote.perVehicleYearGBP && quote.perVehicleYearGBP > 0) out.perVehicleYear = row('perVehicleYear', 'Subscription + cloud per vehicle-year', u.perVehicleYear, quote.perVehicleYearGBP, 'perVehicle');
  if (quote.fixedPerYearGBP && quote.fixedPerYearGBP > 0) out.fixedPerYear = row('fixedPerYear', 'Fixed per year (sustaining, licences, platform)', u.fixedPerYear, quote.fixedPerYearGBP, 'perYear');
  for (const [cat, q] of Object.entries(quote.byCategory ?? {}) as [SWCategory, number][]) {
    if (!(q > 0)) continue;
    const mods = result.modules.filter(m => m.category === cat);
    const should = mods.reduce((a, m) => a + m.totalNonRecurring, 0);
    out.byCategory.push(row(cat, mods[0]?.categoryLabel ?? cat, should, q, 'total'));
  }
  return out;
}

// ── Make v buy ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SWMakeBuyRow { category: SWCategory; label: string; make: number; tier1: number; startup: number }
export interface SWMakeBuy { rows: SWMakeBuyRow[]; breakEvenEffortShare: number; margin: number; basis: string }

// ── Every hub (president review, 14 Oct 2026) ───────────────────────────────────────────────────────────────────────

export interface SWHubRow {
  hub: SWRegion; label: string; confidence: string; loadedRatePerPM: number;
  nre: number; lifecycle: number; total: number; perVehicle: number; deltaTotal: number; selected: boolean;
}

/** The SAME programme re-costed at every hub in the active book (each at its own book rate — a typed rate is this hub's
 *  figure only, so it never travels). Lifecycle lines that are not labour (cloud, royalties, IP) do not move with the hub. */
export function swHubComparison(result: SWProgramResult): SWHubRow[] {
  const prog = result.inputs;
  const lib = resolveRateLibrary(prog.rateLibrary);
  const base = result.summary.grandTotal;
  return (Object.keys(lib.hubRates) as SWRegion[]).map(hub => {
    const p: SWProgramInputs = { ...prog, region: hub, baseRateGBP: hub === prog.region ? prog.baseRateGBP : undefined };
    const s = hub === prog.region ? result.summary : computeSWProgram(p, { summaryOnly: true }).summary;
    return { hub, label: SW_HUB_RATES[hub as keyof typeof SW_HUB_RATES]?.label ?? hub, confidence: SW_HUB_RATES[hub as keyof typeof SW_HUB_RATES]?.confidence ?? '—',
      loadedRatePerPM: swLoadedRate(p), nre: s.nreTotal, lifecycle: s.grandTotal - s.nreTotal, total: s.grandTotal, perVehicle: s.perVehicle,
      deltaTotal: s.grandTotal - base, selected: hub === prog.region };
  }).sort((a, b) => a.total - b.total);
}


/** Engineering (NRE) per domain made in-house v bought from a Tier-1 or a start-up, each the engine re-costed with that
 *  source. A bought source is cheaper only when its effort is at most (1 − margin) × the in-house effort. Lifecycle
 *  (royalties, cloud, maintenance) is the same either way in this model and is left out. */
export function swMakeBuy(result: SWProgramResult): SWMakeBuy {
  const prog = result.inputs;
  const by = (d: DevSource) => d === prog.devSource ? result : computeSWProgram({ ...prog, devSource: d }, { summaryOnly: true });
  const make = by('OEM_Internal'), t1 = by('Tier1_Supplier'), st = by('Startup_OSS');
  const nre = (r: SWProgramResult, c: SWCategory) => r.modules.filter(m => m.category === c).reduce((a, m) => a + m.totalNonRecurring, 0);
  const cats = [...new Set(result.modules.map(m => m.category))] as SWCategory[];
  const lib = resolveRateLibrary(prog.rateLibrary);
  const margin = lib.supplierMargin?.value ?? 0;
  const effIn = lib.devSourceMultipliers.OEM_Internal.value;
  return {
    rows: cats.map(c => ({ category: c, label: result.modules.find(m => m.category === c)!.categoryLabel, make: nre(make, c), tier1: nre(t1, c), startup: nre(st, c) })),
    breakEvenEffortShare: (1 - margin) * effIn,
    margin,
    basis: `Each column re-costs the scope with that development source. A supplier's price = its effort factor ÷ (1 − ${(margin * 100).toFixed(1)} % margin), so buying is cheaper only if the supplier needs ≤ ${((1 - margin) * effIn * 100).toFixed(1)} % of the in-house effort (reuse, a cheaper hub mix).`,
  };
}

// ── Evidence ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SWEvidence {
  byGrade:      Record<SWEvidenceGrade, number>;
  total:        number;
  unsourcedShare: number;
  /** The largest unsourced lines, grouped by kind. */
  topUnsourced: Array<{ kind: string; label: string; amount: number }>;
  /** Engineering the default reuse removes: NRE at Fresh − NRE as costed, and the modules on the default 'Medium'. */
  reuse:        { removedNRE: number; modulesAtMedium: number; modules: number };
  lines:        SWEvidenceLine[];
}

const KIND_LABEL: Record<string, string> = {
  effort: 'Engineering effort (module catalogue)', tools: 'Development tools', maintenance: 'Maintenance',
  licences: 'IP licences (module catalogue)', royalties: 'Royalties', cloud: 'Cloud (per connected vehicle-year)',
  homologation: 'Homologation', cloudFixed: 'Cloud platform (fixed)', postSupport: 'Security support after the last build (share assumed)',
};

export function swEvidence(result: SWProgramResult): SWEvidence {
  const lines = swEvidenceLines(result.inputs, result.modules, result.summary);
  const byGrade = { entered: 0, calibrated: 0, sourced: 0, estimate: 0, unsourced: 0 } as Record<SWEvidenceGrade, number>;
  const unsourcedByKind = new Map<string, number>();
  for (const l of lines) {
    byGrade[l.grade] += l.amount;
    if (l.grade === 'unsourced') unsourcedByKind.set(l.kind, (unsourcedByKind.get(l.kind) ?? 0) + l.amount);
  }
  const total = Object.values(byGrade).reduce((a, b) => a + b, 0);
  const fresh = computeSWProgram({ ...result.inputs, modules: result.inputs.modules.map(m => ({ ...m, reuse: 'Fresh' as const })) }, { summaryOnly: true });
  const on = result.inputs.modules.filter(m => m.enabled);
  return {
    byGrade, total, unsourcedShare: total > 0 ? byGrade.unsourced / total : 0,
    topUnsourced: [...unsourcedByKind.entries()].sort((a, b) => b[1] - a[1]).map(([kind, amount]) => ({ kind, label: KIND_LABEL[kind] ?? kind, amount })),
    reuse: { removedNRE: fresh.summary.nreTotal - result.summary.nreTotal, modulesAtMedium: on.filter(m => m.reuse === 'Medium').length, modules: on.length },
    lines,
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
  // IT Jobs Watch: "Embedded Systems" UK contracts, median £525 / day over the 6 months to 3 Oct 2026 (35 rates) —
  // the larger, newer sample; the "embedded software engineer" title page shows £600 on 6 rates to Jan 2026 and £500 on
  // 11 to May 2025 (open-items round, re-checked 14 Oct 2026, search results).
  ukContractDay: { value: 525, source: 'IT Jobs Watch, UK "Embedded Systems" contract median £525 / day, 6 months to 3 Oct 2026, 35 rates (search result)' },
} as const;

export function swRateCheck(result: SWProgramResult): SWRateCheck {
  const prog = result.inputs;
  const loaded = swLoadedRate(prog);
  const hub = SW_HUB_RATES[prog.region];
  const perHour = loaded / SW_PM_HOURS;
  const statutory = hub ? (hub.onCostInSalary ? null : 1 + hub.employerOnCostPctAtMid / 100) : null;
  // Employment cost = the book's statutory on-cost × the employment layer (pension top-up, bonus, benefits).
  const mult = statutory != null ? statutory * (1 + (prog.burden?.employmentPct ?? 0) / 100) : null;
  const lines: string[] = [];
  if (mult != null && (mult < RATE_EVIDENCE.employment.low || mult > RATE_EVIDENCE.employment.high)) {
    lines.push(`Employment cost here is ×${mult.toFixed(2)} salary (statutory ×${statutory!.toFixed(2)}${prog.burden ? ` × employment layer +${prog.burden.employmentPct} %` : ''}); the published range is ×${RATE_EVIDENCE.employment.low}–${RATE_EVIDENCE.employment.high}. Adjust the employment layer on Setup.`);
  } else if (mult != null) {
    lines.push(`Employment cost ×${mult.toFixed(2)} salary — inside the published ×${RATE_EVIDENCE.employment.low}–${RATE_EVIDENCE.employment.high} (Hadzima, MIT).`);
  }
  lines.push(`Fully loaded: ×${swOverhead(prog).toFixed(2)} on the hub rate${prog.burden ? ` (employment +${prog.burden.employmentPct} %, company +${prog.burden.companyPct} %, capital +${prog.burden.capitalPct} %)` : ' (a single overhead saved with this configuration)'}.`);
  const ukDay = prog.region === 'UK' ? RATE_EVIDENCE.ukContractDay.value : null;
  if (ukDay) lines.push(`A UK embedded-software contractor costs about £${ukDay} a day (median, with the contractor's margin); this costing's in-house day is £${Math.round(perHour * 8)}.`);
  return { loadedPerPM: loaded, perHour, perDay: perHour * 8, employmentMultiple: mult, employmentLow: RATE_EVIDENCE.employment.low,
    employmentHigh: RATE_EVIDENCE.employment.high, contractDayGBP: ukDay, lines };
}
