/**
 * A loading state that is the SHAPE of what is coming, not a spinner. Uses
 * the shimmer keyframe from tailwind.config.js; under reduced motion the
 * global rule in index.css collapses it to a still block.
 */
interface Props { className?: string; lines?: number; }

export default function Skeleton({ className = '', lines = 1 }: Props) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          // Shimmer ends are TOKENS, not white alphas: on a light page an
          // alpha of white is invisible, which is exactly how the loading
          // state disappeared in the light-theme sweep.
          className={`rounded-lg bg-[linear-gradient(90deg,var(--shimmer-base)_25%,var(--shimmer-hi)_50%,var(--shimmer-base)_75%)] bg-[length:200%_100%] animate-shimmer h-4 ${i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'} ${className}`}
        />
      ))}
    </div>
  );
}

/** A card-shaped skeleton: title line, two body lines, a chip row. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-hairline bg-navy-900 p-5 ${className}`} aria-hidden="true">
      <Skeleton className="h-5 w-3/5" />
      <div className="mt-3"><Skeleton lines={2} /></div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}
