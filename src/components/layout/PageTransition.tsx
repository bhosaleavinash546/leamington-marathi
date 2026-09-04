import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode, Suspense } from 'react';
import { DUR, EASE_OUT } from '../../lib/motion';

// Lightweight fallback shown while a lazily-loaded route chunk is fetched. Kept
// inside the transition so route code-splitting never flashes a blank screen.
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32" role="status" aria-label="Loading">
      <span className="h-8 w-8 rounded-full border-2 border-gold-500/30 border-t-gold-400 animate-spin" />
    </div>
  );
}

/**
 * Route entrance on the house curve (src/lib/motion.ts) — the same rise every
 * card in the product makes, so a page arriving and a panel arriving read as
 * one vocabulary. Under reduced motion it is a plain cross-fade.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const reduced = !!useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -6 }}
      transition={reduced ? { duration: 0.12 } : { duration: DUR.enter, ease: EASE_OUT as unknown as number[] }}
      style={{ minHeight: '100%' }}
    >
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </motion.div>
  );
}
