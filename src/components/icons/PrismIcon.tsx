import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * The Prism mark: a beam enters the prism and leaves as three refracted
 * bands — which is literally what the entitlement waterfall does to a quote.
 *
 * Drawn stroke-based on the lucide 24×24 grid with lucide's default stroke
 * conventions, so it drops in anywhere a lucide icon does (nav registry,
 * masthead, chips) and inherits `currentColor` theming. The three exit rays
 * fan at distinct angles so the mark stays legible at 10 px chip size.
 */
const PrismIcon = forwardRef<SVGSVGElement, LucideProps>(function PrismIcon(
  { size = 24, strokeWidth = 2, className = '', ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* the prism */}
      <path d="M12 4.5 19 17.5H5L12 4.5Z" />
      {/* entering beam */}
      <path d="M2 9.5 8.6 11" />
      {/* refracted spectrum */}
      <path d="M14.8 11.5 21.5 9.8" />
      <path d="M15.4 13.8 22 13.8" />
      <path d="M14.8 16 21 18.6" />
    </svg>
  );
});

export default PrismIcon;
