import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * A figure that counts up to its TRUE value and stops there.
 *
 * The count is cosmetic and must never be mistaken for a measurement in
 * progress, so three things are fixed: it always terminates on the exact value
 * it was given, it is over in under half a second, and under a reduced-motion
 * preference it never runs at all. A non-finite value renders the fallback
 * rather than counting to zero — absent is not zero anywhere in this tool.
 *
 * (The Horizon page carries a local twin of this; this is the shared one, so
 * the DFM Studio does not fork a second easing curve for the same job.)
 */
export default function TickNumber({
  value,
  decimals = 0,
  duration = 0.45,
  prefix = '',
  suffix = '',
  fallback = '—',
  className = '',
}: {
  value: number | null | undefined;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fallback?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const finite = value !== null && value !== undefined && Number.isFinite(Number(value));
  const target = finite ? Number(value) : 0;
  const [shown, setShown] = useState(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!finite) return;
    if (reduced || duration <= 0) { setShown(target); return; }
    const from = shown;
    const delta = target - from;
    if (delta === 0) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / (duration * 1000));
      // Cubic ease-out: fast off the mark, settling rather than braking.
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + delta * eased);
      if (k < 1) frame.current = requestAnimationFrame(step);
      else setShown(target);            // land on the exact value, always
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
    // `shown` is deliberately not a dependency: it is the animation's own
    // output, and depending on it would restart the tween every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, finite, reduced, duration]);

  if (!finite) return <span className={`dfm-num ${className}`}>{fallback}</span>;
  return (
    <span className={`dfm-num ${className}`}>
      {prefix}{shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
