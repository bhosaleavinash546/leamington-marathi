import type { HTMLAttributes, ReactNode } from 'react';

/**
 * The surface. Three elevations, one radius. `interactive` adds the house
 * hover — a one-pixel lift and a deeper shadow, never a scale — and the
 * keyboard focus ring comes from the global rule in index.css.
 */
type Elevation = 'flat' | 'raised' | 'floating';

const ELEVATION: Record<Elevation, string> = {
  flat:     'bg-navy-900 border border-hairline',
  raised:   'bg-navy-900 border border-hairline shadow-card',
  floating: 'bg-navy-800 border border-hairline shadow-card-lg',
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const PAD = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

export default function Card({ elevation = 'raised', interactive = false, padding = 'md', className = '', children, ...rest }: Props) {
  return (
    <div
      className={[
        'rounded-2xl', ELEVATION[elevation], PAD[padding],
        interactive ? 'transition-ui duration-micro ease-house hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-card-lg cursor-pointer' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
