/**
 * The live harness's pass / fail predicates as pure functions, so each one is proven able to FAIL
 * (tests/trace-checks.test.ts). A check that compared a money string with 0 never ran for weeks (country review,
 * 30 Oct 2026) — a predicate with no failing test is not a check.
 */

/** The amount of the first displayed money figure, without its symbol (£ € $ ¥ ₹ Ft zł); '' when none. */
// every display symbol the tool prints (insights.ts CURRENCY_SYMBOL), longest first so "JP¥" wins over "¥" and "R$" over
// "R"; a letter symbol ("R", "kr", "lei", "din") must not be the tail of a word (world round, 30 Oct 2026: Kč was missed)
const SYMBOLS = ['JP¥', 'NT$', 'R$', 'C$', 'S$', 'E£', '$M', 'Kč', 'zł', 'Ft', 'kr', 'lei', 'din', 'DH', 'DT', 'RM', 'Rp', '£', '€', '$', '¥', '₹', '฿', '₫', '₩', '₺', '₱', 'R']
  .sort((a, b) => b.length - a.length).map(x => x.replace(/[$]/g, '\\$&'));
const MONEY_RE = new RegExp(`(?<![A-Za-zÀ-ž])(?:${SYMBOLS.join('|')})\\s?([\\d,]+\\.\\d{2})`);
export function money(t: string): string {
  return t.match(MONEY_RE)?.[1] ?? '';
}

/** Two displayed amounts are the same costing to the penny — compared in £ (display units ÷ fx), so a forint or
 *  yuan rounding is not a difference. fx = display units per £ (1 for £). */
export function samePenny(a: string, b: string, fx = 1): boolean {
  const ma = money(a), mb = money(b);
  if (ma === '' || mb === '') return false;
  if (fx === 1) return ma === mb;
  return Math.abs(Number(ma.replace(/,/g, '')) - Number(mb.replace(/,/g, ''))) / fx < 0.006;
}

/** The costed alternative routes in the route comparison's HTML: rows carrying a "Cost this route" button. The
 *  nested build-up rows (Material, Process…) are not routes. */
export function costedAlternatives(html: string): number {
  return (html.match(/data-cost-route="/g) ?? []).length;
}

/** CR4: every costed alternative states its crossover (or there is none to state). */
export function crossoverStated(html: string): boolean {
  return costedAlternatives(html) === 0 || /class="cad-compare-cross"/.test(html);
}

/** Within a £ tolerance expressed in display units. */
export function near(a: number, b: number, tolGbp = 0.0006, fx = 1): boolean {
  return Math.abs(a - b) <= tolGbp * fx;
}

/** The Basis row of a supplier margin the engineer TYPED at `pct` % — "Typed Supplier margin (% of subtotal) 10%".
 *  The "(% of subtotal)" holds a % of its own, so the figure is read at the END of the row. */
export const marginTypedRe = (pct: number): RegExp => new RegExp(`Typed Supplier margin.*(?<![\\d.])${pct}%$`);
export const marginTyped = (row: string, pct: number): boolean => marginTypedRe(pct).test(row.replace(/\s+/g, ' ').trim());
