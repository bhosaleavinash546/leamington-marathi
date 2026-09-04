// ─────────────────────────────────────────────────────────────────────────────
// THE MOTION LANGUAGE OF BRAINSPARK.
//
// Written for the DFM / DFA Studio and Prism first, promoted to the whole
// product in the September 2026 UX review (docs/UX-REVIEW-2026-09.md). The
// same numbers are exposed to CSS as --ease-out / --dur-* in index.css and to
// Tailwind as ease-out-house / duration-micro|enter|draw, so a CSS transition
// and a framer-motion transition cannot disagree about how fast a card moves.
//
// This tool is read by cost engineers and their directors, and it argues about
// money. So the motion has a job description, and decoration is not on it:
//
//   1. MOTION EXPLAINS STATE. A card that slides in is new information
//      arriving; a stage that ticks is work that genuinely finished; a gauge
//      that sweeps is a number being measured. Nothing here animates to look
//      busy — the SSE stage list, for instance, only ever animates events the
//      engine actually emitted.
//   2. MEASURED, NOT BOUNCY. A precision instrument does not wobble. Every
//      curve below is a decelerating ease with no overshoot, and the whole
//      vocabulary lives between 0.16 s and 0.5 s: fast enough to feel
//      responsive on a 2000-row analysis, slow enough to be read.
//   3. NEVER MISREPRESENT A NUMBER. A count-up lands on the true value and a
//      gauge sweeps to the measured score; neither invents progress it does
//      not have. Where a figure is ABSENT the component renders the absence,
//      because a 0 that animated in would read as a measurement.
//   4. THE USER'S PREFERENCE WINS. Every export here takes `reduced` from
//      framer-motion's `useReducedMotion()`, and under it transforms collapse
//      to a plain cross-fade or to nothing at all. The repo already holds this
//      discipline in innovation.css; this is its TypeScript counterpart.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { useReducedMotion, type TargetAndTransition, type Transition, type Variants } from 'framer-motion';

/** Decelerating expo — the house entrance curve. No overshoot, ever. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Symmetric ease for things that MOVE rather than arrive (layout, sorting). */
export const EASE_MOVE = [0.65, 0, 0.35, 1] as const;

export const DUR = {
  /** Hovers, presses, colour changes. Below this a change is not perceived. */
  micro: 0.16,
  /** A card, row or panel arriving. */
  enter: 0.28,
  /** A gauge sweeping, a rail drawing — the longest thing we allow. */
  draw: 0.5,
} as const;

/** Per-child delay in a staggered list. 45 ms reads as a cascade, not a queue. */
export const STAGGER = 0.045;

export interface DfmMotion {
  reduced: boolean;
  /** Spring for anything the hand touches — presses, chips, toggles. */
  spring: Transition;
  /** A softer spring for panels and layout moves. */
  springSoft: Transition;
  /**
   * ORCHESTRATION. A results screen has an order of importance, and the
   * reveal should follow it: the dial before the numbers, the numbers before
   * the bars, the bars before the list. `beat(n)` returns the delay for the
   * nth beat of that sequence, so every component reads its position from one
   * place instead of each carrying a magic number.
   */
  beat: (n: number) => number;
  /** Standard entrance: rise + fade. Under reduced motion, fade only. */
  rise: Variants;
  /** A list container that cascades its children in. */
  stagger: (delayChildren?: number) => Variants;
  /** A child of `stagger`. */
  staggerItem: Variants;
  /** Panels that appear and disappear (AnimatePresence). */
  panel: Variants;
  /** A row sliding in from the leading edge — used by the stage list. */
  slideIn: Variants;
  /** Hover/press feedback for a control. Empty objects under reduced motion. */
  press: { whileHover: TargetAndTransition; whileTap: TargetAndTransition };
  /** Transition for layout/`layoutId` animations. */
  layout: Transition;
  /** Convenience: a transition of the given duration in the house curve. */
  t: (duration?: number, delay?: number) => Transition;
}

/**
 * The one place motion is defined for this feature. Components take what they
 * need from here rather than hand-rolling durations, so the page cannot drift
 * into three different ideas of how fast a card should arrive.
 */
export function useDfmMotion(): DfmMotion {
  return useHouseMotion();
}

/** Product-wide name. `useDfmMotion` stays as an alias for the two studios. */
export function useHouseMotion(): DfmMotion {
  const reduced = !!useReducedMotion();

  return useMemo(() => {
    const t = (duration: number = DUR.enter, delay = 0): Transition =>
      reduced
        ? { duration: 0.12, delay: 0, ease: 'linear' }
        : { duration, delay, ease: EASE_OUT as unknown as number[] };

    const rise: Variants = {
      hidden: { opacity: 0, y: reduced ? 0 : 14 },
      show: { opacity: 1, y: 0, transition: t() },
      exit: { opacity: 0, y: reduced ? 0 : -8, transition: t(DUR.micro) },
    };

    // Tuned rather than defaulted: stiffness 380 / damping 30 lands in ~260 ms
    // with no perceptible overshoot on a small element, which is the "solid
    // object, no bounce" feel a measuring tool should have. Under reduced
    // motion both collapse to an instant transition.
    const spring: Transition = reduced
      ? { duration: 0 }
      : { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 };
    const springSoft: Transition = reduced
      ? { duration: 0 }
      : { type: 'spring', stiffness: 210, damping: 26, mass: 0.9 };

    return {
      reduced,
      spring,
      springSoft,
      beat: (n: number) => (reduced ? 0 : n * 0.09),
      rise,
      stagger: (delayChildren = 0): Variants => ({
        hidden: {},
        show: {
          transition: reduced
            ? { staggerChildren: 0, delayChildren: 0 }
            : { staggerChildren: STAGGER, delayChildren },
        },
      }),
      staggerItem: rise,
      panel: {
        hidden: { opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.995 },
        show: { opacity: 1, y: 0, scale: 1, transition: t() },
        exit: { opacity: 0, y: reduced ? 0 : -6, scale: 1, transition: t(DUR.micro) },
      },
      slideIn: {
        hidden: { opacity: 0, x: reduced ? 0 : -10 },
        show: { opacity: 1, x: 0, transition: t(DUR.micro * 1.4) },
        exit: { opacity: 0, transition: t(DUR.micro) },
      },
      press: reduced
        ? { whileHover: {}, whileTap: {} }
        : { whileHover: { y: -1 }, whileTap: { scale: 0.985 } },
      layout: reduced
        ? { duration: 0 }
        : { duration: DUR.enter, ease: EASE_MOVE as unknown as number[] },
      t,
    };
  }, [reduced]);
}

// ── ONE SCORE SCALE, NOT THREE ───────────────────────────────────────────────
//
// The page graded scores at 80/50 on the per-process header and at 70/40 in
// the routes and batch tables, so the same 62 was amber in one place and green
// two inches below it. A score is one quantity; it gets one scale, and the
// legend that names the bands is rendered from this function.
export type ScoreTone = 'good' | 'watch' | 'poor' | 'none';

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'none';
  if (score >= 80) return 'good';
  if (score >= 50) return 'watch';
  return 'poor';
}

/** Tailwind text/stroke/border classes per tone, so colour never drifts either. */
export const TONE_TEXT: Record<ScoreTone, string> = {
  good: 'text-emerald-400',
  watch: 'text-amber-400',
  poor: 'text-red-400',
  none: 'text-slate-500',
};
export const TONE_STROKE: Record<ScoreTone, string> = {
  good: 'stroke-emerald-400',
  watch: 'stroke-amber-400',
  poor: 'stroke-red-400',
  none: 'stroke-slate-600',
};
export const TONE_LABEL: Record<ScoreTone, string> = {
  good: 'Good',
  watch: 'Watch',
  poor: 'At risk',
  none: 'Not scored',
};
