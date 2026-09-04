import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { FIELD_CLASS } from './Input';

/**
 * The select. Same field treatment as Input, native element underneath (it
 * is the only select that works with every screen reader and every phone
 * keyboard), a drawn chevron so the control matches across browsers, and a
 * label that is always associated — the two Pipeline filters shipped without
 * one and axe rated it critical.
 */
interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  /** Use when the label must not take space (filter bars); still announced. */
  srLabel?: string;
  hint?: ReactNode;
  children: ReactNode;
}

const Select = forwardRef<HTMLSelectElement, Props>(function Select({ label, srLabel, hint, id, className = '', children, ...rest }, ref) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className={className}>
      {label && <label htmlFor={selectId} className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-label={!label ? srLabel : undefined}
          className={`${FIELD_CLASS} appearance-none pr-9`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
});

export default Select;
