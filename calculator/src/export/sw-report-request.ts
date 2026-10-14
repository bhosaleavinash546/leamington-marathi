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
import { hubMedianNote } from './sw-report-pdf.js';

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
  const obs = (o: { value: number; source: string; url: string; statistic?: string }) => [`${raw.currency} ${o.value.toLocaleString('en-GB')}`, `${o.source}${o.statistic ? ` (${o.statistic})` : ''}`, o.url] as const;
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
