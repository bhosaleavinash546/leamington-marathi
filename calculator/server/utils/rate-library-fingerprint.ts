/**
 * A stable identity for a rate book, derived from its content.
 *
 * Every run records this. It is what makes a costing reproducible: the library's
 * own `version` field is author-supplied and not unique — an uploaded sheet is
 * always stamped `company-upload` — so two different books share it and a report
 * cannot say which one produced its numbers. A content hash can, and it works
 * the same for the built-in book, an uploaded sheet, and a resolved library with
 * cell overrides applied, because it hashes what was actually costed on.
 *
 * It lives under `server/` rather than beside the rest of the rate-library logic
 * in `src/engine/` because it needs `node:crypto`, and everything in `src/` is
 * bundled for the browser: importing it there made `npm run build` fail with
 * "createHash is not exported by __vite-browser-external". Nothing in the UI
 * fingerprints a library — only the server, the bulk run and the CLI do.
 */
import { createHash } from 'node:crypto';
import type { RateLibrary } from '../../src/engine/types.js';

/** Key order is normalised so a re-serialised library fingerprints identically. */
export function fingerprintRateLibrary(lib: RateLibrary): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, stable(val)]),
      );
    }
    return v;
  };
  // `lastModified` is a timestamp, not a rate: the upload route stamps it with
  // `now`, so including it would make the same sheet fingerprint differently on
  // every upload and defeat the whole point.
  const { lastModified: _ignored, ...rest } = lib as RateLibrary & { lastModified?: string };
  return createHash('sha256').update(JSON.stringify(stable(rest))).digest('hex').slice(0, 16);
}
