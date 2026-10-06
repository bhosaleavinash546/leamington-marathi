/**
 * The comparison table's rows: the part as it would be costed if that country were
 * SELECTED — not the costed country's inputs re-priced.
 *
 * WHY. The table re-priced the stack (labour, machine, material, energy lines) in each
 * country's book and moved the tooling £ by the toolroom factor. Everything else the
 * costed country had decided — heat treatment, cores, NDT, consumables, a composite's
 * fibre price, a CAD rule's die cost, the forms' £ defaults — rode into every other
 * row unchanged, and a whole die was scaled as if it were all toolroom labour. Against
 * the true per-country costing of the 40 real parts that was up to 68% off (median
 * 0.8%, worst decile 16%; all-39-countries audit, Oct 2026).
 *
 * WHAT A ROW IS NOW. For each country the form is put, for a moment, into the state
 * selecting that country gives it, then collected and costed in that country's book:
 *  - a £ default (tools, NRE, services, cores) → its UK basis × that country's factor;
 *  - a value CAD apply wrote that the engineer has not changed → what CAD apply writes
 *    when that country is selected: the server returns the part's rules-only analysis in
 *    each comparison country (`analysisByRegion`), and the screen draws and fills the form
 *    with each one, recording the result (main.ts captureCountryFills);
 *  - overhead / packaging / logistics → that country's shop defaults;
 *  - anything typed (a quote) → as typed.
 * The form is then restored exactly, including the active rate book. No event fires,
 * so nothing the engineer did is marked as edited.
 */
import type { RateLibrary, UniversalStackInput, PartCostResult } from '../engine/types.js';
import { computeUniversalStack } from '../engine/core.js';
import { buildRegionalLibrary, type ManufacturingRegion } from '../engine/regional-rates.js';
import { withRates } from '../engine/rate-context.js';
import { countryDefaultValue } from './country-money-defaults.js';

/** How the rule applier writes a number into a field — the comparison must match it exactly. */
export function formatRuleValue(v: unknown): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v)
      : v.toFixed(Math.abs(v) < 0.01 ? 6 : 4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return String(v);
}

export interface RecostDeps {
  /** The commodity form. */
  root: HTMLElement;
  /** The costed country and the UK-basis book its rates were rebuilt from. */
  sourceRegion: ManufacturingRegion;
  baseLibrary: RateLibrary;
  /** The screen's active book, restored afterwards. */
  currentLibrary: RateLibrary;
  /** Points the screen's `library` (and the active rate context) at a book. */
  setLibrary: (lib: RateLibrary) => void;
  /** The screen's own collector — the form → the stack input. */
  collect: () => UniversalStackInput;
  /** What the screen adds after collecting (the learning curve), unchanged. */
  finish?: (input: UniversalStackInput) => UniversalStackInput;
  /**
   * What CAD apply wrote into the form in the costed country, and what it writes in
   * each comparison country (the form drawn and filled with that country's analysis).
   * Empty when the form was not filled from CAD.
   */
  fillSource: Record<string, string>;
  fillsByRegion: Record<string, Record<string, string>>;
  /**
   * The controls a country switch also sets, by element id → value: the two country
   * pickers (the gear heat treat and the paint line read the country off the page)
   * and the PCB market pickers (pcb-country-sync.ts).
   */
  countryControls?: (r: ManufacturingRegion) => Record<string, string>;
  /** Overhead %, packaging and logistics for a country (country-fields.ts). */
  shopFor: (r: ManufacturingRegion) => { overheadPct: number; packagingPerPart: number; logisticsPerPart: number };
}

export interface CountryCosting { input: UniversalStackInput; result: PartCostResult; }

type Field = HTMLInputElement | HTMLSelectElement;

/** The part costed as if each of `regions` were selected. A country whose collection fails is left out. */
export function recostInCountries(regions: ManufacturingRegion[], d: RecostDeps): Map<ManufacturingRegion, CountryCosting> {
  const out = new Map<ManufacturingRegion, CountryCosting>();
  // A file input (the PCB photos, BOM and Gerber pickers) holds the chosen file's path, which a
  // page may not write back — restoring it threw "This input element accepts a filename…" and
  // failed Calculate on the PCB form. Files never enter a cost, so they are neither changed nor restored.
  const fields = Array.from(d.root.querySelectorAll<Field>('input[id], select[id]'))
    .filter(f => !(f instanceof HTMLInputElement && (f.type === 'file' || f.type === 'button' || f.type === 'submit')));
  const shopIds = ['overhead-pct', 'packaging', 'logistics'];
  const shop = shopIds.map(id => document.getElementById(id) as HTMLInputElement | null);
  const saved = new Map<Field, { value: string; checked?: boolean }>();
  for (const f of [...fields, ...shop.filter((x): x is HTMLInputElement => !!x)]) {
    saved.set(f, { value: f.value, ...(f instanceof HTMLInputElement && f.type === 'checkbox' ? { checked: f.checked } : {}) });
  }
  // A field still holds what CAD apply wrote unless the engineer changed it since.
  const untouched = (f: Field): boolean => f.id in d.fillSource && saved.get(f)?.value === d.fillSource[f.id];
  const controls = new Map<Field, string>();
  for (const id of Object.keys(d.countryControls?.(d.sourceRegion) ?? {})) {
    const c = document.getElementById(id) as Field | null;
    if (c) controls.set(c, c.value);
  }
  const restore = () => {
    for (const [c, v] of controls) c.value = v;
    for (const [f, v] of saved) {
      if (f.value !== v.value) f.value = v.value;
      if (v.checked !== undefined) (f as HTMLInputElement).checked = v.checked;
    }
    d.setLibrary(d.currentLibrary);
  };

  for (const X of regions) {
    if (X === d.sourceRegion) continue;
    const book = X === 'UK' ? d.baseLibrary : buildRegionalLibrary(d.baseLibrary, X);
    try {
      d.setLibrary(book);   // a library-material factor reads the active book
      const filled = d.fillsByRegion[X];
      for (const f of fields) {
        // CAD-filled and unchanged → what CAD apply writes in X (its rules, its £ defaults).
        if (filled && f.id in filled && untouched(f)) {
          const want = filled[f.id];
          if (f instanceof HTMLInputElement && f.type === 'checkbox') { f.checked = want === 'true'; continue; }
          if (f instanceof HTMLSelectElement && !Array.from(f.options).some(o => o.value === want)) continue;
          f.value = want;
          continue;
        }
        // A £ default nobody changed → that default in X.
        if (f instanceof HTMLInputElement && f.type === 'number') {
          const v = countryDefaultValue(f, X);
          if (v !== null) f.value = v;
        }
      }
      for (const [id, v] of Object.entries(d.countryControls?.(X) ?? {})) {
        const c = document.getElementById(id) as Field | null;
        if (!c) continue;
        if (c instanceof HTMLSelectElement && !Array.from(c.options).some(o => o.value === v)) continue;
        c.value = v;
      }
      const s = d.shopFor(X);
      if (shop[0]) shop[0].value = String(Math.round(s.overheadPct * 1000) / 10);
      if (shop[1]) shop[1].value = String(Math.round(s.packagingPerPart * 10_000) / 10_000);
      if (shop[2]) shop[2].value = String(Math.round(s.logisticsPerPart * 10_000) / 10_000);
      let input = withRates(book, () => d.collect());
      if (d.finish) input = d.finish(input);
      const result = withRates(book, () => computeUniversalStack(input, book));
      out.set(X, { input, result });
    } catch (e) {
      console.warn(`[comparison] ${X}: the form could not be costed there — ${(e as Error).message}`);
    } finally {
      restore();
    }
  }
  return out;
}
