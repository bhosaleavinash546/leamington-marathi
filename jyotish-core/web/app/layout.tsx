import type { ReactNode } from 'react';

/**
 * The root layout exists only to satisfy Next's App Router. Everything real —
 * `<html lang>`, direction, fonts — belongs to the locale layout, because none of
 * it can be decided before the locale is known (CLAUDE.md N5).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
