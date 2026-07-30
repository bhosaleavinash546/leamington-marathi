'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { motionPreferences, type MotionPreferences } from '@/lib/motion';

/**
 * The reader's motion preference, resolved once (DESIGN.md §3.4).
 *
 * **This file imports nothing from `motion`, deliberately.** §3.3's hardest rule
 * is "No animation library in the first-paint path", and a provider that wraps
 * the whole layout *is* the first-paint path. The first version of this file
 * imported `LazyMotion` and `useReducedMotion` from `motion/react`; measured, that
 * put a 53KB gzipped chunk into the eager `<script>` set and took the critical
 * path to 180KB against §9's 120KB budget. `LazyMotion` defers the *features*
 * bundle, not its own core, so the lazy import was doing less than it looked.
 *
 * So the preference is read with `matchMedia` — six lines, no dependency — and
 * the library is loaded by `LazyMotionBoundary`, which mounts only around a
 * component that actually animates. Phase D's chart draw-in is the first caller.
 */

const PreferencesContext = createContext<MotionPreferences>(motionPreferences(true));

/**
 * The resolved motion tokens for the current reader.
 *
 * Components ask this rather than checking the media query themselves, so the
 * reduced-motion branch is decided once and everything agrees.
 */
export function useMotionPreferences(): MotionPreferences {
  return useContext(PreferencesContext);
}

const QUERY = '(prefers-reduced-motion: reduce)';

export function MotionProvider({ children }: { children: ReactNode }) {
  // Starts `true` — reduced — and narrows after mount. A reader who asked for
  // less motion must not get a burst of it in the frames before the preference
  // is known; the opposite mistake costs one frame of stillness and is invisible.
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setReduced(media.matches);
    sync();
    // The preference can change while the page is open, on every current
    // browser. Listening is what makes the setting take effect immediately
    // rather than on the next navigation.
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return (
    <PreferencesContext.Provider value={motionPreferences(reduced)}>
      {children}
    </PreferencesContext.Provider>
  );
}
