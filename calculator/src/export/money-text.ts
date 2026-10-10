/**
 * Money inside the TEXT of a report — rule bases, rate sources, consumable lines, notes — in the report's currency.
 *
 * The costing is held in £ and the reports convert every number to the display currency, but the explanatory text
 * was printed "as recorded, GBP": a China report read "die £3,056", "blast machine £8.61/h + operator £3.57/h" and
 * "capex £22,394" beside ¥ totals (demo review 2026-10-10). In a non-£ report these convert every £ AMOUNT and every
 * £ UNIT (£/kg, £/hr) at the report's own FX. An FX quote written "¥8.88/£" is left alone, and a £ report is
 * returned unchanged.
 */

const AMOUNT = /£(\d[\d,]*(?:\.\d+)?)(?:([–-])(\d[\d,]*(?:\.\d+)?))?/g;

function fmtLike(src: string, value: number): string {
  const dp = (src.split('.')[1] ?? '').length;
  // keep the recorded precision, but never print a converted pence figure with fewer than 2 decimals
  const d = dp === 0 ? 0 : Math.max(2, dp);
  return value.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** `text` with its £ amounts and £ units in the report currency (`fx` units per £, `sym` its symbol). */
export function localiseGbpText(text: string, fx: number, sym: string): string {
  if (!text || fx === 1 && sym === '£') return text;
  return text
    .replace(AMOUNT, (_m, a: string, dash?: string, b?: string) => {
      const conv = (s: string) => fmtLike(s, Number(s.replace(/,/g, '')) * fx);
      return `${sym}${conv(a)}${b ? `${dash}${conv(b)}` : ''}`;
    })
    .replace(/£\//g, `${sym}/`)
    .replace(/\(£\)/g, `(${sym})`);
}

/** A rule-table row whose field is in £ ("Die Cost (£)", "Heat Treatment (£/kg)"): the value converted, the label relabelled. */
export function localiseRuleValue(label: string, value: string, fx: number, sym: string): { label: string; value: string } {
  if (fx === 1 && sym === '£' || !/\(£/.test(label)) return { label: localiseGbpText(label, fx, sym), value: localiseGbpText(value, fx, sym) };
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || String(value).trim() === '') return { label: localiseGbpText(label, fx, sym), value: localiseGbpText(value, fx, sym) };
  const v = n * fx;
  const a = Math.abs(v);
  const dp = a < 1 ? 4 : a < 100 ? 2 : 0;
  return { label: label.replace(/\(£/g, `(${sym}`), value: v.toLocaleString('en-GB', { minimumFractionDigits: dp === 4 ? 2 : dp, maximumFractionDigits: dp }) };
}
