'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useMotionPreferences } from '@/components/MotionProvider';

/**
 * Navigation that explains itself (DESIGN.md §3.3).
 *
 * > Page transitions: View Transitions API where supported, Motion fallback.
 *
 * Three paths, in order:
 *
 * 1. **Reduced motion** — a plain `router.push`. §3.4 wants the change to happen,
 *    not to be performed. The View Transition is skipped entirely rather than
 *    given a shorter duration, because the browser's default is a crossfade of
 *    the *whole page* and shortening that still animates it.
 * 2. **View Transitions supported** — `document.startViewTransition`, which the
 *    browser drives on the compositor. Styling lives in `globals.css`.
 * 3. **Neither** — a plain push, and `PageTransition` crossfades the incoming
 *    content with Motion. That component checks the same support flag, so exactly
 *    one of paths 2 and 3 ever runs.
 *
 * `startViewTransition` is called with the navigation inside it. React needs to
 * have committed before the browser takes its "after" snapshot, which is why the
 * callback awaits a frame rather than returning immediately.
 */
export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

type StartViewTransition = (callback: () => void | Promise<void>) => { finished: Promise<void> };

export function useSoftNavigate(): (href: string) => void {
  const router = useRouter();
  const { reduced } = useMotionPreferences();

  return useCallback(
    (href: string) => {
      if (reduced || !supportsViewTransitions()) {
        router.push(href);
        return;
      }
      const start = (document as unknown as { startViewTransition: StartViewTransition })
        .startViewTransition;
      start.call(document, async () => {
        router.push(href);
        // One frame, so the new tree is committed before the browser snapshots
        // it. Without this the transition captures the outgoing page twice and
        // nothing appears to change.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
    },
    [router, reduced],
  );
}
