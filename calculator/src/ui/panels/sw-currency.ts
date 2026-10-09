/**
 * Display currency for the software should-cost panel and its exports (software review P3 #15).
 *
 * The engine prices in £. The page's currency picker (main.ts `_applyCurrency`) calls setSWCurrency with the same
 * code, symbol and FX rate every other result uses, so a non-UK user reads the software costing in their currency.
 * Inputs stay in £ (the app's money rule: a form input holds £ and says £); only results and rate tables convert.
 */
let code = 'GBP', sym = '£', perGbp = 1;

export function setSWCurrency(c: string, s: string, unitsPerGbp: number): void {
  code = c; sym = s; perGbp = Number.isFinite(unitsPerGbp) && unitsPerGbp > 0 ? unitsPerGbp : 1;
}
export const swCur = (): { code: string; sym: string; perGbp: number } => ({ code, sym, perGbp });
/** £ → display currency. */
export const swConv = (gbp: number): number => gbp * perGbp;
/** "€1,234" — grouped, `dp` decimals. */
export function swMoney(gbp: number, dp = 0): string {
  const v = swConv(gbp);
  if (!Number.isFinite(v)) return `${sym}—`;
  return `${v < 0 ? '−' : ''}${sym}${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
/** "€392.3M". */
export function swMoneyM(gbp: number): string {
  const v = swConv(gbp) / 1_000_000;
  if (!Number.isFinite(v)) return `${sym}—`;
  return `${v < 0 ? '−' : ''}${sym}${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
}
/** "€M" — a column unit. */
export const swUnitM = (): string => `${sym}M`;
