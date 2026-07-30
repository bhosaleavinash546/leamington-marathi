import type { ReactNode } from 'react';
import '../tokens.css';

/**
 * The token sheet lives outside `[locale]`, so it supplies its own document
 * shell. It cannot borrow the locale layout's: that one carries the disclaimer,
 * the skip link and the locale routing, none of which belong on a design
 * artifact.
 *
 * `lang="mr"` because every specimen on the page is Marathi, and a screen reader
 * needs the right voice to read कृत्तिका (DESIGN.md §8).
 *
 * Only `tokens.css` is imported — deliberately not `globals.css`. The sheet has
 * to show what the tokens alone produce; inheriting the current product styles
 * would hide whichever tokens are not yet wired into them.
 */
/** Per request, for the nonce CSP — see `app/[locale]/layout.tsx`. */
export const dynamic = 'force-dynamic';

export default function TokenSheetLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="mr">
      <body>{children}</body>
    </html>
  );
}
