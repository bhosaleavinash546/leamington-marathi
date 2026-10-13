/**
 * Software-engineering rate book generator (Chief Engineer review, Oct 2026).
 *
 *   npx tsx scripts/sw-rate-book.ts           write src/engine/sw-country-rates.ts + the register
 *   npx tsx scripts/sw-rate-book.ts --check   fail when the generated file is out of date
 *
 * Reads scripts/rate-refresh/2026-10-sw-rates.json (built by scripts/sw-research/2026-10-13/build-config.py from the
 * agents' sourced research in raw/) and builds, for each software engineering HUB — a country (or US state) where
 * automotive software is actually developed — its OWN cost of an engineer per person-month:
 *
 *   salary   mid  = median of the hub's central salary observations (annual gross, local currency)
 *            senior = median of its senior / upper-quartile observations (or the mid when it has none — said so)
 *   + employer statutory on-cost  Σ component % × the salary inside that component's floor / ceiling
 *   ÷ productive hours            (260 weekdays − statutory leave − public holidays) × normal weekly hours ÷ 5
 *   × 152 hours                   the COCOMO II person-month the effort model counts
 *   ÷ FX                          REGIONAL_DATA[country].fxToGBP, the app's one dated rate (local units per £)
 *
 * No UK multiplier anywhere: every hub is priced from its own salaries, its own on-costs and its own hours.
 * Programme overhead (facilities, IT, management) is NOT in the book — the engine applies the programme's overhead
 * multiplier on top, as before. Edit the config (or the research), never the generated file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'scripts/rate-refresh/2026-10-sw-rates.json');
const OUT = join(ROOT, 'src/engine/sw-country-rates.ts');
const REGISTER = join(ROOT, 'scripts/sw-research/2026-10-13/register.csv');
export const COCOMO_PM_HOURS = 152;

interface Obs {
  value: number; period: string; annualFactor: number; currency: string; statistic: string; dataYear: number | null;
  source: string; url: string; seenIn: string; note?: string; role?: string; level?: string;
}
interface OnCostComponent { name: string; pct: number; floorAnnual?: number; ceilingAnnual?: number }
interface HubCfg {
  id: string; label: string; country: string; cities: string[]; currency: string;
  evidence: { claim: string; url: string }[];
  mid: Obs[]; senior: Obs[]; seniorBasis: string; excluded: { what: string; why: string }[];
  onCost: { components: OnCostComponent[]; inSalary?: boolean; source: string; url: string; note: string };
  hours: { weeklyHours: number; leaveDays: number; publicHolidays: number; leaveIncludesHolidays?: boolean; source: string; url?: string; note?: string };
  confidence: 'High' | 'Medium' | 'Low';
  notes: string;
  /** The retired "UK × multiplier" £/PM this hub was costed at (old hub key), for the register. */
  legacy?: { key: string; perPMGBP: number };
}
interface Config { version: string; researched: string; method: string; hubs: HubCfg[] }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

export function onCostOf(salary: number, comps: OnCostComponent[]): number {
  return comps.reduce((a, c) => {
    const top = Math.min(salary, c.ceilingAnnual ?? Infinity);
    return a + (c.pct / 100) * Math.max(0, top - (c.floorAnnual ?? 0));
  }, 0);
}

export function productiveHours(h: HubCfg['hours']): number {
  const days = 260 - h.leaveDays - (h.leaveIncludesHolidays ? 0 : h.publicHolidays);
  return days * h.weeklyHours / 5;
}

function build(cfg: Config) {
  return cfg.hubs.map(h => {
    const fx = REGIONAL_DATA[h.country as keyof typeof REGIONAL_DATA]?.fxToGBP;
    if (!fx) throw new Error(`${h.id}: no REGIONAL_DATA fx for ${h.country}`);
    if (!h.mid.length) throw new Error(`${h.id}: no mid salary observation`);
    for (const o of [...h.mid, ...h.senior]) if (o.currency !== h.currency) throw new Error(`${h.id}: ${o.source} is in ${o.currency}, hub is ${h.currency}`);
    const annual = (o: Obs) => o.value * o.annualFactor;
    const midS = median(h.mid.map(annual));
    const senS = h.senior.length ? median(h.senior.map(annual)) : midS;
    const hours = productiveHours(h.hours);
    const at = (s: number) => {
      const on = h.onCost.inSalary ? 0 : onCostOf(s, h.onCost.components);
      const loaded = s + on;
      const perPMLocal = loaded / hours * COCOMO_PM_HOURS;
      return { salary: s, onCost: on, loaded, perPMLocal, perPMGBP: perPMLocal / fx };
    };
    return { h, fx, hours, mid: at(midS), senior: at(senS) };
  });
}

const r0 = (n: number) => Math.round(n);
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const q = (s: string) => JSON.stringify(s);

function emit(cfg: Config, built: ReturnType<typeof build>): string {
  const ids = built.map(b => q(b.h.id)).join(' | ');
  const hubs = built.map(({ h, fx, hours, mid, senior }) => {
    const obs = (o: Obs) => `{ value: ${o.value}, period: ${q(o.period)}, annualFactor: ${o.annualFactor}, statistic: ${q(o.statistic)}, dataYear: ${o.dataYear ?? 'null'}, source: ${q(o.source ?? "")}, url: ${q(o.url ?? "")}, seenIn: ${q(o.seenIn ?? "search-snippet")} }`;
    const onCostPct = mid.salary > 0 ? mid.onCost / mid.salary * 100 : 0;
    return `  ${q(h.id)}: {
    id: ${q(h.id)}, label: ${q(h.label)}, country: ${q(h.country)}, cities: ${JSON.stringify(h.cities)}, currency: ${q(h.currency)},
    fxToGBP: ${fx}, confidence: ${q(h.confidence)},
    midAnnualSalary: ${r0(mid.salary)}, seniorAnnualSalary: ${r0(senior.salary)}, seniorBasis: ${q(h.seniorBasis)}, onCostInSalary: ${!!h.onCost.inSalary},
    employerOnCostPctAtMid: ${onCostPct.toFixed(2)}, onCostBasis: ${q(h.onCost.inSalary ? `already in the salary figure — ${h.onCost.note}` : `${h.onCost.components.map(c => `${c.name} ${c.pct}%${c.ceilingAnnual ? ` to ${fmt(c.ceilingAnnual)}` : ''}${c.floorAnnual ? ` above ${fmt(c.floorAnnual)}` : ''}`).join(' + ')} — ${h.onCost.source}${h.onCost.note ? `; ${h.onCost.note}` : ''}`)},
    onCostUrl: ${q(h.onCost.url)},
    productiveHours: ${r0(hours)}, hoursBasis: ${q(`(260 − ${h.hours.leaveDays} leave${h.hours.leaveIncludesHolidays ? ' incl. public holidays' : ` − ${h.hours.publicHolidays} public holidays`}) × ${h.hours.weeklyHours} h ÷ 5 — ${h.hours.source}${h.hours.note ? `; ${h.hours.note}` : ''}`)},
    midPerPMLocal: ${r0(mid.perPMLocal)}, seniorPerPMLocal: ${r0(senior.perPMLocal)},
    midPerPMGBP: ${r0(mid.perPMGBP)}, seniorPerPMGBP: ${r0(senior.perPMGBP)},
    build: ${q(`${h.currency} ${fmt(mid.salary)} mid / ${fmt(senior.salary)} senior ${h.onCost.inSalary ? 'employer cost a year (on-cost already inside)' : `gross a year + employer on-cost ${onCostPct.toFixed(1)}% at mid = ${fmt(mid.loaded)} / ${fmt(senior.loaded)}`}; ÷ ${fmt(hours)} productive h × ${COCOMO_PM_HOURS} h = ${h.currency} ${fmt(mid.perPMLocal)} / ${fmt(senior.perPMLocal)} per person-month ÷ ${fx} = £${fmt(mid.perPMGBP)} / £${fmt(senior.perPMGBP)}`)},
    evidence: ${JSON.stringify(h.evidence.map(e => e.claim))},
    mid: [
      ${h.mid.map(obs).join(',\n      ')},
    ],
    senior: [
      ${h.senior.map(obs).join(',\n      ')}${h.senior.length ? ',' : ''}
    ],
    notes: ${q(h.notes)},
  },`;
  }).join('\n');
  return `// GENERATED by scripts/sw-rate-book.ts from scripts/rate-refresh/2026-10-sw-rates.json — do not edit by hand.
/* eslint-disable */
/**
 * Software-engineering rate book ${cfg.version} — each hub's OWN cost of an automotive / embedded software engineer
 * per person-month (${COCOMO_PM_HOURS} h), built from that country's salaries, statutory employer on-costs and
 * working hours. No UK multiplier. Programme overhead is applied by the engine on top.
 * Method: ${cfg.method}
 */

export type SWHubId = ${ids};

export interface SWObservation {
  value: number; period: string; annualFactor: number; statistic: string; dataYear: number | null;
  source: string; url: string; seenIn: string;
}

export interface SWHubRate {
  id: SWHubId; label: string; country: string; cities: string[]; currency: string;
  fxToGBP: number; confidence: 'High' | 'Medium' | 'Low';
  midAnnualSalary: number; seniorAnnualSalary: number; seniorBasis: string;
  /** The salary figure is already the employer's cost (KOSA, TÜİK labour cost, Indian CTC) — no on-cost added. */
  onCostInSalary: boolean;
  employerOnCostPctAtMid: number; onCostBasis: string; onCostUrl: string;
  productiveHours: number; hoursBasis: string;
  midPerPMLocal: number; seniorPerPMLocal: number;
  midPerPMGBP: number; seniorPerPMGBP: number;
  /** The arithmetic, one line. */
  build: string;
  evidence: string[];
  mid: SWObservation[]; senior: SWObservation[];
  notes: string;
}

export const SW_RATE_BOOK_VERSION = ${q(cfg.version)};
export const SW_RATE_BOOK_RESEARCHED = ${q(cfg.researched)};
export const SW_PM_HOURS = ${COCOMO_PM_HOURS};

export const SW_HUB_RATES: Record<SWHubId, SWHubRate> = {
${hubs}
};
`;
}

function register(built: ReturnType<typeof build>): string {
  const rows = [['hub', 'label', 'currency', 'mid salary', 'senior salary', 'on-cost % at mid', 'productive h', 'mid £/PM', 'senior £/PM', 'blended £/PM (50% senior)',
    'retired hub', 'retired £/PM (UK £28,000 × multiplier × 0.975)', 'new ÷ old', 'confidence']];
  for (const { h, hours, mid, senior } of built) {
    const blend = (mid.perPMGBP + senior.perPMGBP) / 2;
    rows.push([h.id, h.label, h.currency, r0(mid.salary), r0(senior.salary), (mid.onCost / mid.salary * 100).toFixed(1), r0(hours),
      r0(mid.perPMGBP), r0(senior.perPMGBP), r0(blend), h.legacy?.key ?? '—', h.legacy ? r0(h.legacy.perPMGBP) : '—',
      h.legacy ? (blend / h.legacy.perPMGBP).toFixed(2) : '—', h.confidence].map(String));
  }
  return rows.map(r => r.map(c => /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n') + '\n';
}

const cfg = JSON.parse(readFileSync(CONFIG, 'utf8')) as Config;
const built = build(cfg);
const ts = emit(cfg, built);
const csv = register(built);
if (process.argv.includes('--check')) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== ts) { console.error('src/engine/sw-country-rates.ts is out of date — run npx tsx scripts/sw-rate-book.ts'); process.exit(1); }
  console.log('sw-country-rates.ts is up to date');
} else {
  writeFileSync(OUT, ts);
  writeFileSync(REGISTER, csv);
  for (const { h, mid, senior } of built) console.log(`${h.id.padEnd(6)} mid £${fmt(mid.perPMGBP).padStart(7)}  senior £${fmt(senior.perPMGBP).padStart(7)}  /PM  (${h.confidence})`);
  console.log(`wrote ${OUT} and ${REGISTER}`);
}
