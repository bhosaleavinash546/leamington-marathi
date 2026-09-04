import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import ButtonSpinner from './ButtonSpinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
  /**
   * WHY the button is disabled, in the user's terms ("Choose a system first").
   * A disabled gold button with no reason reads as broken; with one it reads
   * as "not yet". Rendered as the tooltip and announced to assistive tech.
   */
  disabledReason?: string;
}

const VARIANT: Record<Variant, string> = {
  primary:   'bg-gold-500 hover:bg-gold-400 text-navy-950 border border-transparent shadow-sm shadow-gold-500/20 hover:shadow-md hover:shadow-gold-500/25 hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-sm',
  secondary: 'bg-navy-800 hover:bg-navy-700 text-slate-200 border border-white/10',
  ghost:     'bg-transparent hover:bg-white/5 text-slate-300 border border-white/10',
  danger:    'bg-danger-600 hover:bg-danger-500 text-white border border-transparent',
};

// Heights are the touch-target floor: 32 px is the pointer minimum (with the
// 8 px gap the layout gives it), 40 and 48 clear 44 px on touch.
const SIZE: Record<Size, string> = {
  sm: 'min-h-[32px] px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'min-h-[40px] px-4 py-2.5 text-sm gap-2 rounded-xl',
  lg: 'min-h-[48px] px-6 py-3 text-base gap-2.5 rounded-xl',
};

/**
 * Shared button primitive — consistent styling, focus ring, disabled + loading
 * states, and accessible busy semantics. Prefer this over raw <button> in new code.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, fullWidth, disabled, children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center font-semibold transition-ui',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <ButtonSpinner size={size === 'lg' ? 18 : 15} /> : leftIcon}
      {children}
    </button>
  );
});

export default Button;
