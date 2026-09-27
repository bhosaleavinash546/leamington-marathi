/**
 * MONEY AT THE DISPLAY BOUNDARY.
 *
 * The house rule: engines compute in EUR; conversion happens where a figure
 * is shown, never inside an engine. The server half of that rule has lived
 * in fx-rates.mjs since the start; this is the client half. Until it
 * existed, every engine figure a page rendered — the Results engine badge,
 * the DFM priced impact, the Prism waterfall, the harness total — was
 * printed with a hard-coded "€" while the saving beside it said "£", so a
 * GBP run read two currencies on one line (DECISIONS 76).
 *
 * Three honesty rules, in code rather than in a tooltip that might be
 * missed:
 *   1. A converted figure NAMES ITS RATE AND DATE (the `note`), because a
 *      figure that silently moved with the market is one a director cannot
 *      quote back.
 *   2. With no rates in hand, the figure is shown in the engine's EUR and
 *      SAYS SO — never a stale guess dressed as a conversion. The client
 *      keeps no fallback table: the server's fallback is already labelled
 *      "static reference", and a second copy would drift.
 *   3. Absent stays absent. A non-finite figure renders "—", not £0.
 *
 * Pure functions here (tested in tests/money.test.mjs); the hook and the
 * components that use them are in src/hooks/useFx.ts and
 * src/components/ui/Money.tsx.
 */

export interface FxSnapshot {
  base: 'EUR';
  rates: Record<string, number>;
  symbols: Record<string, string>;
  live: boolean;
  date: string | null;
  stale: boolean;
  source: string;
}

export interface Converted {
  /** The figure to show, in `currency`. NaN when the input was not a number. */
  value: number;
  currency: string;
  symbol: string;
  /** Units of `currency` per EUR that were applied (1 when unconverted). */
  rate: number;
  /** false when the figure is still the engine's EUR — the label says why. */
  converted: boolean;
  /** One line a reader can quote: what was converted, at what rate, from where, when. */
  note: string;
}

export const ENGINE_CURRENCY = 'EUR';
export const ENGINE_SYMBOL = '€';
/** The app's display default (CLAUDE.md): GBP, with EUR/USD/CNY selectable. */
export const DEFAULT_DISPLAY_CURRENCY = 'GBP';

const FALLBACK_SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' };

export function symbolFor(currency: string, fx?: FxSnapshot | null): string {
  return fx?.symbols?.[currency] ?? FALLBACK_SYMBOLS[currency] ?? currency;
}

function fmtRate(rate: number): string {
  // Enough digits to reproduce the conversion, not so many the line is noise.
  return rate >= 100 ? rate.toFixed(0) : rate >= 10 ? rate.toFixed(2) : rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** The sentence a page prints once beside its converted figures. */
export function fxNote(currency: string, fx: FxSnapshot | null | undefined): string {
  if (!currency || currency === ENGINE_CURRENCY) return 'Engine figures in EUR.';
  if (!fx || !(Number(fx.rates?.[currency]) > 0)) {
    return `Live rates unreachable — figures shown in the engine's EUR, not converted to ${currency}.`;
  }
  const rate = fx.rates[currency];
  const when = fx.date ? `, ${fx.date}` : '';
  const stale = fx.stale ? ' · rates may be outdated' : '';
  return `Converted from EUR at 1 EUR = ${fmtRate(rate)} ${currency} · ${fx.source}${when}${stale}.`;
}

/**
 * Convert one engine figure. The result carries everything a caller needs to
 * render it honestly: the value, the symbol that belongs to it, and the note.
 */
export function convertEur(eur: number | null | undefined, currency: string, fx: FxSnapshot | null | undefined): Converted {
  const n = Number(eur);
  if (eur === null || eur === undefined || !Number.isFinite(n)) {
    return { value: NaN, currency: ENGINE_CURRENCY, symbol: ENGINE_SYMBOL, rate: 1, converted: false, note: 'No figure.' };
  }
  const want = (currency || ENGINE_CURRENCY).toUpperCase();
  const rate = Number(fx?.rates?.[want]);
  if (want === ENGINE_CURRENCY || !fx || !(rate > 0)) {
    return { value: n, currency: ENGINE_CURRENCY, symbol: ENGINE_SYMBOL, rate: 1, converted: false, note: fxNote(want, fx) };
  }
  return {
    value: n * rate,
    currency: want,
    symbol: symbolFor(want, fx),
    rate,
    converted: true,
    note: `Converted from €${formatNumber(n, 2)} at 1 EUR = ${fmtRate(rate)} ${want} · ${fx.source}${fx.date ? `, ${fx.date}` : ''}${fx.stale ? ' · rates may be outdated' : ''}.`,
  };
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 432,000 → "432K"; 1,080,000 → "1.08M". Below 10,000 the plain figure is clearer. */
export function formatCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return formatNumber(n, a >= 100 ? 0 : 2);
}

export interface FmtOptions {
  decimals?: number;
  compact?: boolean;
  /** Text after the number, e.g. "/yr" or "/part". */
  suffix?: string;
  /** Shown when the figure is absent. */
  fallback?: string;
}

/** One-call formatter for prose and titles: "£367.20", "£432K/yr", "—". */
export function fmtMoney(eur: number | null | undefined, currency: string, fx: FxSnapshot | null | undefined, opts: FmtOptions = {}): string {
  const c = convertEur(eur, currency, fx);
  if (!Number.isFinite(c.value)) return opts.fallback ?? '—';
  const body = opts.compact ? formatCompact(c.value) : formatNumber(c.value, opts.decimals ?? 2);
  return `${c.symbol}${body}${opts.suffix ?? ''}`;
}
