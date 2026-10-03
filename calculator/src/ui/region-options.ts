/**
 * The country and currency pickers, filled from the engine's own tables.
 *
 * They used to be typed into index.html: the header listed the 20 regions, the
 * "Country" bar only 8 of them and the currency picker 12 currencies — three
 * hand lists for one table. Now each country in `REGIONAL_DATA` appears in both
 * country pickers and each currency in `CURRENCY_SYMBOL` in the currency picker,
 * so a country added to the rate library (scripts/region-expand.ts) is offered
 * the moment it exists.
 */
import { REGIONAL_DATA, type ManufacturingRegion } from '../engine/regional-rates.js';
import { CURRENCY_SYMBOL } from '../engine/insights.js';

/** Display group of each region, for the pickers' option groups. */
export const REGION_GROUP: Record<ManufacturingRegion, string> = {
  UK: 'Europe', DE: 'Europe', FR: 'Europe', IT: 'Europe', ES: 'Europe', PL: 'Europe', CZ: 'Europe',
  RO: 'Europe', HU: 'Europe', SE: 'Europe', NL: 'Europe', TR: 'Europe', AT: 'Europe', BE: 'Europe',
  PT: 'Europe', SK: 'Europe', SI: 'Europe', LT: 'Europe', BG: 'Europe', RS: 'Europe',
  US: 'Americas', MX: 'Americas', BR: 'Americas', CA: 'Americas',
  CN: 'Asia-Pacific', IN: 'Asia-Pacific', TH: 'Asia-Pacific', VN: 'Asia-Pacific', KR: 'Asia-Pacific',
  JP: 'Asia-Pacific', TW: 'Asia-Pacific', MY: 'Asia-Pacific', ID: 'Asia-Pacific', PH: 'Asia-Pacific', SG: 'Asia-Pacific',
  MA: 'Africa', TN: 'Africa', EG: 'Africa', ZA: 'Africa',
};
const GROUP_ORDER = ['Europe', 'Americas', 'Asia-Pacific', 'Africa'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** `<optgroup>` HTML of every region, UK first, then by group and name. */
export function regionOptionsHtml(): string {
  const codes = Object.keys(REGIONAL_DATA) as ManufacturingRegion[];
  return GROUP_ORDER.map(g => {
    const inGroup = codes.filter(c => REGION_GROUP[c] === g)
      .sort((a, b) => (a === 'UK' ? -1 : b === 'UK' ? 1 : REGIONAL_DATA[a].name.localeCompare(REGIONAL_DATA[b].name)));
    if (!inGroup.length) return '';
    return `<optgroup label="${g}">` + inGroup.map(c => `<option value="${c}">${esc(REGIONAL_DATA[c].name)}</option>`).join('') + '</optgroup>';
  }).join('');
}

/** Every display currency, in the symbol table's order. */
export function currencyOptionsHtml(): string {
  return Object.entries(CURRENCY_SYMBOL).map(([code, sym]) => `<option value="${code}">${esc(sym)} ${code}</option>`).join('');
}

/** Fill the country, currency and region-filter pickers, keeping whatever each had selected. */
export function populateRegionPickers(doc: Document = document): void {
  const fill = (id: string, html: string) => {
    const sel = doc.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === keep)) sel.value = keep;
  };
  fill('mfg-region-selector', regionOptionsHtml());
  fill('costing-country-sel', regionOptionsHtml());
  fill('currency-selector', currencyOptionsHtml());
  // The dashboard's region filter keeps its "all" option first.
  fill('filter-region', '<option value="">Region: All</option>' + regionOptionsHtml());
}
