/**
 * Builds a report REQUEST (src/engine/sw-report-model.ts) the same way on screen, in scripts and in tests: the hub's rate
 * build-up and its sources from the rate book, the costing-step rate line, the rate-book version. The caller adds what
 * only it knows — the title, the checked vehicle text, the page's countries, the supplier quote, the currency and the
 * user's report options. Pure.
 */
import { swRateBasis, swLoadedRate, swOverhead, type SWProgramResult } from '../engine/sw-should-cost.js';
import { SW_HUB_RATES } from '../engine/sw-country-rates.js';
import { SW_REPORT_GBP_FORMAT, type SWReportRequest, type SWReportHubRate, type SWReportProfile, type SWBodyType, type SWReportMeta,
  type SWReportCountry, type SWReportFormat } from '../engine/sw-report-model.js';
import type { SWCategory } from '../engine/sw-should-cost.js';
import type { SWQuote } from '../engine/sw-cockpit.js';
import type { StepRate } from '../engine/sw-costing-steps.js';

export interface SWReportOptions {
  profile:    SWReportProfile;
  domains?:   SWCategory[];
  moduleIds?: string[];
  bodyType?:  SWBodyType;
  meta?:      SWReportMeta;
}

export const hubLabelOf = (hub: string): string => SW_HUB_RATES[hub as keyof typeof SW_HUB_RATES]?.label ?? hub;

/** The hub's salary observations, on-cost and hours with their pages (printed in the rates section). */
export function hubRateFor(hub: string): SWReportHubRate | undefined {
  const raw = SW_HUB_RATES[hub as keyof typeof SW_HUB_RATES];
  if (!raw) return undefined;
  // A monthly observation is shown with its year (× its annual factor) beside the annual ones (review M19).
  // Each observation with its period and the factor that annualises it, rounded for print (review: raw floats such as
  // 16.25845936562114 were printed): "a month × 12", "a month × 14 salaries", "an hour × 2,080 h", a net-to-gross monthly
  // factor to 3 dp (its statistic names the net / gross ratio).
  const f3 = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
  const obs = (o: { value: number; source: string; url: string; statistic?: string; annualFactor?: number; period?: string }) => {
    const k = o.annualFactor ?? 1, v = `${raw.currency} ${o.value.toLocaleString('en-GB')}`, yr = `${Math.round(o.value * k).toLocaleString('en-GB')} a year`;
    const label = k === 1 ? `${v} a year`
      : o.period === 'hourly' || k === 2080 ? `${v} an hour × ${f3(k)} h = ${yr}`
      : k === 14 ? `${v} a month × 14 salaries = ${yr}`
      : `${v} a month × ${f3(k)} = ${yr}`;
    return [label, `${o.source}${o.statistic ? ` (${o.statistic})` : ''}`, o.url] as const;
  };
  return {
    build: raw.build, confidence: raw.confidence, median: hubMedianNote(raw) ?? undefined,
    sources: [
      ...raw.mid.map(o => { const x = obs(o); return [`Mid: ${x[0]}`, x[1], x[2]] as [string, string, string]; }),
      ...raw.senior.map(o => { const x = obs(o); return [`Senior: ${x[0]}`, x[1], x[2]] as [string, string, string]; }),
      ['Employer on-cost', raw.onCostBasis, raw.onCostUrl ?? ''], ['Working hours', raw.hoursBasis, ''],
    ],
  };
}

/** The costing-step rate line (the studio's own wording) from the rate book. */
export function stepRateFor(result: SWProgramResult, money: (n: number, dp?: number) => string = SW_REPORT_GBP_FORMAT.money): StepRate {
  const p = result.inputs;
  const hub = SW_HUB_RATES[p.region as keyof typeof SW_HUB_RATES];
  const used = swRateBasis(p).find(([k]) => k === 'Engineer rate used')?.[1] ?? '';
  return { perPMGBP: swLoadedRate(p), hubLabel: hubLabelOf(p.region),
    build: `${used.replace(/^£[\d,]+ — /, '')}${hub ? `; mid ${money(hub.midPerPMGBP, 0)} / senior ${money(hub.seniorPerPMGBP, 0)} per person-month (salary + statutory on-cost ÷ productive hours × 152 h)` : ''}, × development source price × ${swOverhead(p).toFixed(2)} engineering burden.` };
}

export function buildSWReportRequest(result: SWProgramResult, o: {
  options:      SWReportOptions;
  title:        string;
  vehicleDesc?: string;
  facts?:       Array<[string, string]>;
  countries?:   SWReportCountry[];
  quote?:       SWQuote;
  currency?:    { code: string; sym: string; perGbp: number };
  fmt?:         SWReportFormat;
  stepRate?:    StepRate;
  generatedAt?: Date;
}): SWReportRequest {
  const p = result.inputs;
  const fmt = o.fmt ?? SW_REPORT_GBP_FORMAT;
  return {
    profile: o.options.profile, domains: o.options.domains, moduleIds: o.options.moduleIds, bodyType: o.options.bodyType, meta: o.options.meta,
    title: o.title, vehicleDesc: o.vehicleDesc, facts: o.facts,
    hubLabel: hubLabelOf(p.region), hubRate: hubRateFor(p.region), stepRate: o.stepRate ?? stepRateFor(result, fmt.money),
    countries: o.countries, quote: o.quote, currency: o.currency ?? { code: 'GBP', sym: '£', perGbp: 1 }, fmt,
    generatedAt: o.generatedAt ?? new Date(), bookVersion: swRateBasis(p).find(([k]) => k === 'Rate book')?.[1] ?? '',
  };
}

/** How the book's mid / senior salary follows from the listed observations: their median (each × its annual factor).
 *  Returns null when the median does not reproduce the book (the note would then be wrong — it is left out). */
export function hubMedianNote(raw: { currency: string; midAnnualSalary: number; seniorAnnualSalary: number;
  mid: Array<{ value: number; annualFactor: number }>; senior: Array<{ value: number; annualFactor: number }> }): string | null {
  const med = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };
  const mids = raw.mid.map(o => o.value * o.annualFactor), seniors = raw.senior.map(o => o.value * o.annualFactor);
  const m = med(mids), s = seniors.length ? med(seniors) : NaN;
  const f = (n: number) => Math.round(n).toLocaleString('en-GB');
  if (Math.abs(m - raw.midAnnualSalary) > 1) return null;
  const seniorOk = seniors.length && Math.abs(s - raw.seniorAnnualSalary) <= 1;
  return `The book takes the median of the observations below: mid = median of ${mids.length} (${mids.map(f).join(', ')}) = ${raw.currency} ${f(m)}`
    + (seniorOk ? `; senior = median of ${seniors.length} (${seniors.map(f).join(', ')}) = ${raw.currency} ${f(s)}.` : `; senior ${raw.currency} ${f(raw.seniorAnnualSalary)} as stated in the book.`);
}
