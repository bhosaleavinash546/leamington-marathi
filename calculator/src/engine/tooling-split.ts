/**
 * Tooling the way it is contracted (report standard, Nov 2026, register #9).
 *
 * A module's tooling total mixes three kinds of money: the up-front investment a supplier invoices (the first set of
 * each tool, fixtures, programming), the sets bought because the first wears out over the programme, and perishable
 * cutting tools worn by every part. The stub axle's "£731,491 tooling" was £25,891 up front and £705,600 of replacement
 * pattern sets; the gear's £625,512 was £18,500 up front and £607,012 of hob and wheel wear.
 *
 * Nothing here changes a £: the items split what the module already charged, and they add up to its total.
 */
import type { ToolingInput, ToolingItem } from './types.js';

/** A set count as a reader says it: whole numbers plainly, fractions to 2 dp. */
export function fmtSets(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/**
 * The items of a tool bought by life: the first set (`initial`) and the sets that replace it as it wears out over the
 * amortised parts (`replacement`, only when more than one set is charged). The two add up to `setGbp × sets` — the
 * figure the module charges. A fraction of one set (a tool the programme does not wear out) is all `initial`.
 *
 * @param name      what the tool is ("Pattern equipment", "Forging die set") — no £ in it: the reports print the money
 * @param setGbp    £ of one set
 * @param sets      sets charged over the amortised parts (whole or fractional, as the module counts them)
 * @param wearBasis how the set count was reached, e.g. "life 16,000 castings each; 1,030,928 poured" — on the replacement line
 */
export function toolSetItems(name: string, setGbp: number, sets: number, wearBasis?: string): ToolingItem[] {
  const total = setGbp * sets;
  const firstSets = Math.min(1, sets);
  const first = setGbp * firstSets;
  const replacementSets = sets - firstSets;
  const out: ToolingItem[] = [{
    label: replacementSets > 1e-9 ? `${name} — first set` : name,
    gbp: first, kind: 'initial', firstSetGbp: setGbp, sets: firstSets,
  }];
  if (replacementSets > 1e-9) {
    out.push({
      label: `${name} — ${fmtSets(replacementSets)} replacement set${replacementSets === 1 ? '' : 's'} as it wears out `
        + `(${fmtSets(sets)} sets over the programme${wearBasis ? `; ${wearBasis}` : ''})`,
      // the remainder, so the two items add to exactly what the module charged
      gbp: total - first, kind: 'replacement', firstSetGbp: setGbp, sets: replacementSets,
    });
  }
  return out;
}

/** The tooling total by kind. */
export interface ToolingSplit {
  /** First sets of the tools (incl. the tools the volume needs in service). */
  initial: number;
  /** Fixtures, programming, first article, masters. */
  nre: number;
  /** Replacement sets as the first wears out, and tool upkeep (maintenance), over the amortised parts. */
  replacement: number;
  /** Cutting tools worn by every part (hob, wheel, inserts). */
  perishable: number;
  /** Items with no kind, plus any part of the total the items do not cover — read as up front (the old single figure). */
  unclassified: number;
  /** What a supplier invoices up front: initial + nre + unclassified. */
  upFront: number;
  /** What is consumed over the programme and carried in the piece price: replacement + perishable. */
  running: number;
  total: number;
}

/** Sum a tooling input's items by kind. The kinds add up to `totalToolingCost`. */
export function toolingSplit(t: Pick<ToolingInput, 'totalToolingCost' | 'items'>): ToolingSplit {
  const s = { initial: 0, nre: 0, replacement: 0, perishable: 0, unclassified: 0 };
  let itemised = 0;
  for (const i of t.items ?? []) {
    itemised += i.gbp;
    if (i.kind) s[i.kind] += i.gbp; else s.unclassified += i.gbp;
  }
  const total = t.totalToolingCost ?? 0;
  const gap = total - itemised;
  if (Math.abs(gap) > 0.005) s.unclassified += gap;
  return { ...s, upFront: s.initial + s.nre + s.unclassified, running: s.replacement + s.perishable, total };
}
