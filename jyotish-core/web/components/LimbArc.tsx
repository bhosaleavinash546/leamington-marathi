'use client';

import { useEffect, useRef } from 'react';
import { useMotionPreferences } from './MotionProvider';
import { DURATION, EASE } from '@/lib/motion';

/**
 * One panchang limb as an arc filled to its elapsed fraction (DESIGN.md §4.3).
 *
 * > Tithi, nakshatra and yoga each render as an **arc filled to the elapsed
 * > fraction** at the birth moment … Arc sweeps 0→value once on mount, 420ms,
 * > `--ease-out`, staggered 60ms.
 *
 * The fraction comes from the engine (`fraction_elapsed` on each limb), not from
 * arithmetic here. CLAUDE.md N1 keeps every computed number in Python, and
 * `web/lib/format.ts` states the same rule for this layer: these functions format
 * values the engine produced, they never derive one. Deriving
 * `(birth - start) / (end - start)` in a component would be a small, reasonable-
 * looking breach of exactly that.
 *
 * A ring, not a bar: a tithi is a cycle that completes and restarts, and a bar
 * implies a journey with an end. `stroke-dashoffset` on a circle is the same
 * property the chart draw-in uses, composites without layout, and needs no
 * library.
 */
const SIZE = 34;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** §4.3's own stagger between the three arcs. */
export const ARC_STAGGER_MS = 60;

export function LimbArc({
  fraction,
  label,
  index = 0,
}: {
  /** From the engine, in [0, 1]. */
  fraction: number;
  /** Announced to a screen reader — the arc is not the only channel (§8). */
  label: string;
  /** Position in the group, for the stagger. */
  index?: number;
}) {
  const { reduced } = useMotionPreferences();
  const ref = useRef<SVGCircleElement>(null);
  const value = Math.min(1, Math.max(0, fraction));

  useEffect(() => {
    const circle = ref.current;
    if (!circle) return;
    const filled = CIRCUMFERENCE * (1 - value);
    if (reduced) {
      // §3.4: "All progress arcs render at their final value." Not a faster
      // sweep — no sweep.
      circle.style.strokeDashoffset = String(filled);
      return;
    }
    const animation = circle.animate(
      [{ strokeDashoffset: CIRCUMFERENCE }, { strokeDashoffset: filled }],
      {
        duration: DURATION.arc,
        delay: index * ARC_STAGGER_MS,
        easing: `cubic-bezier(${EASE.out.join(',')})`,
        fill: 'both',
      },
    );
    return () => animation.cancel();
  }, [value, reduced, index]);

  return (
    <svg
      className="limb-arc"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
    >
      <circle
        className="limb-arc__track"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        strokeWidth={STROKE}
        fill="none"
      />
      <circle
        ref={ref}
        className="limb-arc__fill"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        strokeWidth={STROKE}
        fill="none"
        strokeDasharray={CIRCUMFERENCE}
        // Starts empty and is filled by the effect, so the sweep begins from
        // nothing rather than snapping to the value and animating back.
        strokeDashoffset={CIRCUMFERENCE}
        // Twelve o'clock, clockwise — the direction a dial is read.
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </svg>
  );
}
