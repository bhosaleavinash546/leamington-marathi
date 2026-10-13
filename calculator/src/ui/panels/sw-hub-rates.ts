/**
 * Software engineering hubs on screen (Chief Engineer review, Oct 2026): the pickers and the rate table are built from
 * the ONE country book (src/engine/sw-country-rates.ts) — never hand-listed. Each hub shows its own rate and how it was
 * built: salary → statutory employer on-cost → productive hours → £ per 152-hour person-month.
 */

import { SW_HUB_RATES, SW_PM_HOURS, type SWHubId, type SWHubRate } from '../../engine/sw-country-rates.js';
import type { SWRateLibrary } from '../../engine/sw-rate-library.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

const AREA: Record<string, string> = {
  UK: 'Europe', DE: 'Europe', AT: 'Europe', SE: 'Europe', FR: 'Europe', IT: 'Europe', PT: 'Europe', ES: 'Europe',
  PL: 'Central & Eastern Europe', CZ: 'Central & Eastern Europe', RO: 'Central & Eastern Europe', HU: 'Central & Eastern Europe',
  RS: 'Central & Eastern Europe', TR: 'Middle East & Africa', EG: 'Middle East & Africa',
  IN: 'Asia', CN: 'Asia', VN: 'Asia', JP: 'Asia', KR: 'Asia',
  'US-MI': 'Americas', 'US-CA': 'Americas', CA: 'Americas', MX: 'Americas',
};
const AREA_ORDER = ['Europe', 'Central & Eastern Europe', 'Americas', 'Asia', 'Middle East & Africa'];

export function hubList(): SWHubRate[] { return Object.values(SW_HUB_RATES); }
export function hubLabel(id: string): string { return SW_HUB_RATES[id as SWHubId]?.label ?? id; }

/** `<option>`s grouped by area; each option names the hub, its cities and its blended rate in the display currency. */
export function hubOptionsHTML(selected: string, lib: SWRateLibrary, money: (gbp: number) => string, seniorShare = 0.5): string {
  const groups = new Map<string, SWHubRate[]>();
  for (const h of hubList()) {
    const a = AREA[h.id] ?? 'Other';
    groups.set(a, [...(groups.get(a) ?? []), h]);
  }
  return AREA_ORDER.filter(a => groups.has(a)).map(a => `<optgroup label="${esc(a)}">${groups.get(a)!.map(h => {
    const e = lib.hubRates[h.id];
    const blend = e ? seniorShare * e.senior.value + (1 - seniorShare) * e.mid.value : NaN;
    return `<option value="${esc(h.id)}"${h.id === selected ? ' selected' : ''}>${esc(h.label)} — ${esc(h.cities.slice(0, 2).join(', '))} · ${esc(money(blend))}/PM</option>`;
  }).join('')}</optgroup>`).join('');
}

const confClass = (c: string) => c === 'High' ? 'sw-conf-high' : c === 'Medium' ? 'sw-conf-med' : 'sw-conf-low';

/** The hub rate table: one row per hub, the build-up and every source behind a disclosure. */
export function hubRatesTableHTML(lib: SWRateLibrary, money: (gbp: number) => string, selected?: string): string {
  const rows = hubList().map(h => {
    const e = lib.hubRates[h.id];
    const company = e && (e.mid.value !== h.midPerPMGBP || e.senior.value !== h.seniorPerPMGBP);
    const obs = (title: string, list: SWHubRate['mid']) => list.length ? `<div class="sw-hub-obs"><strong>${title}</strong><ul>${list.map(o =>
      `<li>${esc(o.source)} — ${esc(h.currency)} ${o.value.toLocaleString('en-GB')} ${esc(o.period)}${o.annualFactor !== 1 ? ` × ${o.annualFactor}` : ''} (${esc(o.statistic)}${o.dataYear ? `, ${o.dataYear}` : ''}) ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}${o.seenIn === 'search-snippet' ? ' <span class="sw-hub-snip" title="Read from a search result of this page; the page itself could not be opened">search result</span>' : ''}</li>`).join('')}</ul></div>` : '';
    return `<tr class="${h.id === selected ? 'sw-hub-sel' : ''}">
      <td><strong>${esc(h.label)}</strong><div class="sw-hub-cities">${esc(h.cities.join(' · '))}</div></td>
      <td class="sw-num">${e ? esc(money(e.mid.value)) : '—'}</td>
      <td class="sw-num">${e ? esc(money(e.senior.value)) : '—'}</td>
      <td class="sw-num">${esc(h.currency)} ${h.midAnnualSalary.toLocaleString('en-GB')}<div class="sw-hub-cities">senior ${h.seniorAnnualSalary.toLocaleString('en-GB')}</div></td>
      <td class="sw-num">${h.onCostInSalary ? '<span title="The salary figure is already the employer\'s cost">incl.</span>' : `${h.employerOnCostPctAtMid.toFixed(1)}%`}</td>
      <td class="sw-num">${h.productiveHours.toLocaleString('en-GB')}</td>
      <td><span class="sw-conf ${confClass(h.confidence)}">${esc(h.confidence)}</span>${company ? ' <span class="sw-conf sw-conf-co">company</span>' : ''}</td>
      <td><details class="sw-hub-more"><summary>How it is built</summary>
        <p>${esc(h.build)}</p>
        <p><strong>Senior:</strong> ${esc(h.seniorBasis)}</p>
        <p><strong>Employer on-cost:</strong> ${esc(h.onCostBasis)}${h.onCostUrl ? ` <a href="${esc(h.onCostUrl)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</p>
        <p><strong>Hours:</strong> ${esc(h.hoursBasis)}</p>
        ${obs('Mid-level salary figures', h.mid)}${obs('Senior salary figures', h.senior)}
        <p><strong>Automotive software here:</strong> ${esc(h.evidence.join(' · '))}</p>
        ${h.notes ? `<p>${esc(h.notes)}</p>` : ''}
      </details></td>
    </tr>`;
  }).join('');
  return `<table class="sw-data-table sw-hub-table">
    <caption class="sw-hub-cap">Each hub's own cost of a software engineer per person-month (${SW_PM_HOURS} h): salary + statutory employer on-cost ÷ productive hours. No UK multiplier. Programme overhead and the development-source factor are applied on top.</caption>
    <thead><tr><th scope="col">Hub</th><th scope="col" class="sw-num">Mid / PM</th><th scope="col" class="sw-num">Senior / PM</th><th scope="col" class="sw-num">Salary (gross / yr)</th><th scope="col" class="sw-num">On-cost</th><th scope="col" class="sw-num">Hours / yr</th><th scope="col">Confidence</th><th scope="col">Basis &amp; sources</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export const HUB_RATES_CSS = `
.sw-hub-table td{vertical-align:top}
.sw-hub-cap{caption-side:top;text-align:left;font-size:.72rem;color:var(--sw-text-secondary);padding:0 0 8px}
.sw-hub-cities{font-size:.66rem;color:var(--sw-text-secondary);font-weight:400}
.sw-hub-sel td{background:var(--sw-accent-bg)}
.sw-hub-more summary{cursor:pointer;font-size:.7rem;color:var(--sw-accent);white-space:nowrap}
.sw-hub-more p,.sw-hub-obs{font-size:.7rem;color:var(--sw-text-secondary);margin:6px 0;max-width:70ch}
.sw-hub-obs ul{margin:2px 0 0 16px;padding:0}
.sw-hub-snip{font-size:.6rem;border:1px solid var(--sw-border);border-radius:3px;padding:0 3px;color:var(--sw-text-muted)}
.sw-conf{font-size:.62rem;font-weight:700;border-radius:3px;padding:1px 5px;border:1px solid currentColor}
.sw-conf-high{color:var(--sw-good)}.sw-conf-med{color:var(--sw-warn,#b45309)}.sw-conf-low{color:var(--sw-bad)}.sw-conf-co{color:var(--sw-accent)}
`;
