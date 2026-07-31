'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useMotionPreferences } from './MotionProvider';
import { supportsViewTransitions } from '@/lib/navigation';

/**
 * The fallback half of §3.3's "View Transitions API where supported, Motion
 * fallback".
 *
 * **Deviation, stated rather than buried:** the fallback is CSS, not Motion.
 * §3.3 asks for a Motion fallback and the same section forbids an animation
 * library in the first-paint path; a page-level wrapper is the first-paint path
 * by definition. Measured, importing Motion here cost 53KB gzipped eagerly and
 * pushed the critical path to 180KB against §9's 120KB. A one-property opacity
 * crossfade does not justify that, so it is a keyframe in `globals.css` and
 * Motion stays behind `LazyMotionBoundary` for the component animations of Phase
 * D, where it earns its size.
 *
 * This runs *only* where the View Transitions API is missing. Where it exists the
 * browser drives the crossfade on the compositor and layering a second animation
 * on the same pixels would double it.
 *
 * Opacity only, never a transform: §3.3 restricts animation to `transform` and
 * `opacity`, and a page-level slide would fight scroll restoration and shift
 * Devanagari mid-render (§5.4).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { reduced } = useMotionPreferences();

  // Support is a browser fact, so it is read after mount. Assuming "supported"
  // until then would skip the fallback on the first navigation — the one a
  // reader is most likely to notice.
  const [native, setNative] = useState(true);
  useEffect(() => setNative(supportsViewTransitions()), []);

  if (reduced || native) return <>{children}</>;

  // Keyed by the full location: React remounts the subtree on navigation, which
  // is what restarts the keyframe. Without the key the element persists and the
  // animation runs once, on first load, and never again.
  return (
    <div key={`${pathname}?${search}`} className="page-enter">
      {children}
    </div>
  );
}
