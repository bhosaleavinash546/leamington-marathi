import { motion } from 'framer-motion';
import { ReactNode, Suspense } from 'react';

// Lightweight fallback shown while a lazily-loaded route chunk is fetched. Kept
// inside the transition so route code-splitting never flashes a blank screen.
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32" role="status" aria-label="Loading">
      <span className="h-8 w-8 rounded-full border-2 border-gold-500/30 border-t-gold-400 animate-spin" />
    </div>
  );
}

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{ minHeight: '100%' }}
    >
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </motion.div>
  );
}
