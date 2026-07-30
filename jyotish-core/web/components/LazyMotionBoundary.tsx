'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Where the animation library is allowed to exist (DESIGN.md §3.3).
 *
 * > Library: Motion (`motion/react`). Import with `LazyMotion` + `domAnimation`
 * > to keep the bundle off the critical path. No animation library in the
 * > first-paint path.
 *
 * Two levels of deferral, and both are needed:
 *
 * 1. **The features** load through the dynamic `import()` below, so `domAnimation`
 *    is fetched after hydration. That is what `LazyMotion` is for.
 * 2. **This module** is itself reached only through `next/dynamic` from the
 *    component that animates — see `dynamicMotionBoundary` — so Motion's own core
 *    never lands in the eager script set either. Deferring only the features left
 *    a 53KB gzipped chunk in the first-paint path, which is the rule above being
 *    broken by the mechanism meant to keep it.
 *
 * Nothing mounts this yet: Phase C is the foundation, and the first real caller is
 * Phase D's chart draw-in. It is wired and measured now so that phase does not
 * have to discover the bundling problem again.
 *
 * `strict` makes a plain `motion.div` import throw, so a component that bypasses
 * this boundary fails loudly rather than silently pulling the full bundle in.
 * `reducedMotion="user"` is Motion's own honouring of the media query — necessary
 * but not sufficient, which is why the tokens collapse in CSS as well and why the
 * Playwright suite checks rendered output rather than configuration.
 */

const loadFeatures = () => import('motion/react').then((mod) => mod.domAnimation);

export default function LazyMotionBoundary({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
