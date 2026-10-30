/**
 * The live harness's pass / fail predicates as pure functions, so each one is proven able to FAIL
 * (tests/trace-checks.test.ts). A check that compared a money string with 0 never ran for weeks (country review,
 * 30 Oct 2026) — a predicate with no failing test is not a check.
 */

/** The amount of the first displayed money figure, without its symbol (£ € $ ¥ ₹ Ft zł); '' when none. */
export function money(t: string): string {
  return t.match(/(?:£|€|\$|¥|₹|Ft|zł)\s?([\d,]+\.\d{2})/)?.[1] ?? '';
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
