import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * THE CHIP — a filter, a toggle, a suggestion.
 *
 * Chips were hand-rolled per page at 26–30 px tall (Marketplace, Horizon,
 * Results, Home), under the 32 px floor on a phone and each with its own
 * "selected" colour: Horizon alone used gold, emerald, violet and teal for
 * four segments of one control. One component, 36 px tall — the height of the
 * inputs it sits beside — and ONE selected colour, gold, because a selected
 * chip is the user's choice (colour has a job: gold = the user's action).
 *
 * `pressed` makes it a toggle (aria-pressed); omit it for a one-shot action
 * such as a suggestion. `to` renders a router Link instead of a button.
 */
interface Props {
  children: ReactNode;
  pressed?: boolean;
  onClick?: () => void;
  to?: string;
  icon?: ReactNode;
  /** A count shown after the label, de-emphasised. */
  count?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export default function Chip({ children, pressed, onClick, to, icon, count, disabled, title, className = '' }: Props) {
  const cls = `inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 ${
    pressed ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-tint border-hairline text-slate-400 hover:text-white'
  } ${className}`;
  const body = (<>
    {icon && <span className="shrink-0 inline-flex" aria-hidden="true">{icon}</span>}
    <span>{children}</span>
    {count !== undefined && <span className="text-slate-500">{count.toLocaleString('en-GB')}</span>}
  </>);
  if (to) return <Link to={to} title={title} className={cls}>{body}</Link>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={pressed === undefined ? undefined : pressed} className={cls}>
      {body}
    </button>
  );
}
