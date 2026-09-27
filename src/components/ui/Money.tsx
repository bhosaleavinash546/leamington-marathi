import TickNumber from '../dfm/TickNumber';
import { useDisplayCurrency, useFx } from '../../hooks/useFx';
import { convertEur, fxNote, formatCompact, formatNumber } from '../../lib/money';
import { CURRENCIES } from '../../constants/costing';

/**
 * AN ENGINE FIGURE, SHOWN IN THE READER'S CURRENCY.
 *
 * `eur` is what the engine computed. The component converts it at the shared
 * /api/fx snapshot and carries the rate and date in its title, so hovering
 * any figure answers "converted how?". With no snapshot it shows the euro
 * figure with a "€" — the honest state, never a guess. `currency` pins the
 * figure to a run's currency (Results); omitted, it follows the reader's
 * display preference (the tool pages).
 */
export function Money({
  eur, currency, decimals = 2, compact = false, suffix = '', tick = false, delay = 0, className = '', fallback = '—',
}: {
  eur: number | null | undefined;
  currency?: string;
  decimals?: number;
  compact?: boolean;
  suffix?: string;
  /** Count up with TickNumber (the KPI tiles) rather than print. */
  tick?: boolean;
  delay?: number;
  className?: string;
  fallback?: string;
}) {
  const fx = useFx();
  const [display] = useDisplayCurrency();
  const c = convertEur(eur, currency ?? display, fx);
  if (!Number.isFinite(c.value)) return <span className={className}>{fallback}</span>;
  const label = c.converted ? c.note : `${c.symbol}${formatNumber(c.value, decimals)} — ${c.note}`;
  if (tick) {
    return (
      <span className={className} title={label}>
        <TickNumber value={c.value} decimals={compact ? 0 : decimals} prefix={c.symbol} suffix={suffix} delay={delay} />
      </span>
    );
  }
  return (
    <span className={className} title={label}>
      {c.symbol}{compact ? formatCompact(c.value) : formatNumber(c.value, decimals)}{suffix}
    </span>
  );
}

/**
 * THE LINE UNDER THE FIGURES: which rate, from where, when — and, where the
 * page has no run currency, the picker that changes every figure on it.
 */
export function FxNote({ currency, pickable = false, className = '' }: { currency?: string; pickable?: boolean; className?: string }) {
  const fx = useFx();
  const [display, setDisplay] = useDisplayCurrency();
  const cur = currency ?? display;
  const note = fxNote(cur, fx);
  const unconverted = cur !== 'EUR' && !(fx && Number(fx.rates?.[cur]) > 0);
  return (
    <p className={`text-2xs flex flex-wrap items-center gap-x-2 gap-y-1 ${unconverted ? 'text-amber-400/90' : 'text-slate-500'} ${className}`}>
      <span>{note}</span>
      {pickable && (
        <label className="inline-flex items-center gap-1">
          <span className="sr-only">Display currency</span>
          <select
            value={cur}
            onChange={e => setDisplay(e.target.value)}
            aria-label="Display currency"
            className="bg-transparent border border-hairline rounded px-1 py-px text-2xs text-slate-300 focus:outline-none focus:border-gold-500/40"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
    </p>
  );
}
