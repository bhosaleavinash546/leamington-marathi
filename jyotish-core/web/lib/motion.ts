/**
 * The motion tokens, in JavaScript (DESIGN.md §3.2).
 *
 * `tokens.css` is the source of truth for anything CSS can express. These
 * constants exist for the things it cannot hand to Motion: a spring is an object,
 * not a length, and `motion/react` wants numbers rather than `"200ms"`.
 *
 * The two therefore have to be kept in step, and `tests/unit/test_design_gates.py`
 * asserts they are — it parses both files and fails if a duration or easing here
 * disagrees with the token it mirrors. Without that, this file is a copy that
 * drifts.
 *
 * Nothing here reads the DOM or the media query. Reduced motion is resolved at
 * the point of use by `useMotionPreferences`, so a component asks once and gets
 * values it can pass straight to Motion.
 */

/** §3.2. Milliseconds, because that is what the CSS tokens are written in. */
export const DURATION = {
  micro: 120,
  enter: 200,
  layout: 320,
  /** The ceiling for an orchestrated multi-element reveal. */
  orch: 500,
  /** The one permitted exception to `orch`: the one-time chart draw-in (§4.1). */
  chartDraw: 800,
  /** §4.3's panchang arc sweep. Not one of §3.2's five; see tokens.css. */
  arc: 420,
} as const;

/**
 * §3.2, as cubic-bezier control points.
 *
 * Typed as mutable 4-tuples rather than `as const`: Motion's `Easing` will not
 * accept a `readonly number[]`, and widening at the call site with a cast would
 * put the lie one layer further from the value.
 */
export type Bezier = [number, number, number, number];

export const EASE: Record<'out' | 'in' | 'inOut', Bezier> = {
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  inOut: [0.65, 0, 0.35, 1],
};

/**
 * `--spring-ui`. Lives here rather than in CSS because Motion takes an object and
 * CSS has no spring; the comment in `tokens.css` points at this constant so the
 * pair is discoverable from either end.
 */
export const SPRING_UI = { type: 'spring', stiffness: 320, damping: 32, mass: 1 } as const;

/**
 * What §3.4 replaces each kind of motion with when the preference is set.
 *
 * Not `transition: none`. A transform-based enter becomes an opacity crossfade of
 * the same perceived weight, so the interface still explains what changed — it
 * just stops moving to say it. The durations mirror the reduced-motion block in
 * `tokens.css` exactly.
 */
export const REDUCED_DURATION = {
  micro: 0,
  enter: 120,
  layout: 120,
  orch: 120,
  chartDraw: 0,
  arc: 0,
} as const;

export type MotionPreferences = {
  /** True when the reader has asked for reduced motion. */
  reduced: boolean;
  /** Durations in milliseconds, already resolved for the preference. */
  duration: typeof DURATION | typeof REDUCED_DURATION;
  /**
   * A Motion transition for an element entering or leaving.
   *
   * Under reduced motion this is a plain opacity tween: callers animate opacity
   * *and* a transform, and `transform` is what this returns as absent, so the
   * element crossfades in place rather than sliding.
   */
  enter: { duration: number; ease: Bezier | 'linear' };
  /** A layout/FLIP transition — a spring normally, a short tween when reduced. */
  layout: typeof SPRING_UI | { duration: number; ease: 'linear' };
  /** Whether a transform-based enter is permitted at all. */
  mayTransform: boolean;
};

/** Resolve the tokens for a preference. Pure, so it is testable without a DOM. */
export function motionPreferences(reduced: boolean): MotionPreferences {
  if (reduced) {
    return {
      reduced: true,
      duration: REDUCED_DURATION,
      enter: { duration: REDUCED_DURATION.enter / 1000, ease: 'linear' },
      layout: { duration: REDUCED_DURATION.layout / 1000, ease: 'linear' },
      mayTransform: false,
    };
  }
  return {
    reduced: false,
    duration: DURATION,
    enter: { duration: DURATION.enter / 1000, ease: EASE.out },
    layout: SPRING_UI,
    mayTransform: true,
  };
}
