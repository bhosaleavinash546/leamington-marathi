import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * The text input. One radius, one border, one focus treatment, a label that
 * is always associated, and a place for the hint or error so a page never
 * has to invent where it goes. 40 px tall on pointer devices, 44 px on touch.
 */
export const FIELD_CLASS =
  'w-full rounded-xl border border-hairline bg-navy-900 px-3.5 text-sm text-white placeholder:text-slate-500 ' +
  'min-h-[44px] sm:min-h-[40px] transition-ui duration-micro ease-house ' +
  'hover:border-hairline-strong focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger-500/60';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small unit or icon rendered inside the field on the right. */
  suffix?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, Props>(function Input({ label, hint, error, suffix, id, className = '', ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${FIELD_CLASS} ${suffix ? 'pr-12' : ''}`}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-xs text-danger-400">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
