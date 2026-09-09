/**
 * Who is allowed to call this server, decided as a pure function.
 *
 * This lived inline in `server/index.ts`, where it could not be tested without
 * booting the app — and it was wrong in a way that only a browser could reveal.
 *
 * ## The bug this exists to prevent coming back
 *
 * A browser omits `Origin` on a plain navigation but SENDS it on module-script,
 * stylesheet, font and fetch requests — including when the page was served by
 * this very process. A single-origin deployment (the UI on `/calculator`, the
 * API on `/api`, one server) therefore had its own bundle refused: every asset
 * returned 500 `Not allowed by CORS` and the app did not boot at all. It passed
 * every check we had because curl sends no Origin and so was always allowed.
 *
 * ## Why same-origin is safe to admit
 *
 * The comparison is the request's own `Host` against the `Origin` the browser
 * asserts. A cross-site attacker's page sends *their* origin with *our* host, so
 * the two differ and the request is refused exactly as before. The only case
 * this admits is a page talking to the server that served it — which is not a
 * cross-origin request in any meaningful sense.
 *
 * Behind a reverse proxy that rewrites Host, the public origin will not match;
 * that is what ALLOWED_ORIGINS is for, and it is still consulted first.
 */

export interface OriginDecision {
  /** The browser-asserted `Origin` header, if any. */
  origin?: string;
  /** The request's own `Host` header, e.g. `localhost:3002`. */
  host?: string;
  isProd: boolean;
  /** Explicit allow-list, from ALLOWED_ORIGINS. */
  allowed: readonly string[];
}

/** True when `origin`'s host is the host the request was addressed to. */
export function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;   // a malformed Origin is not same-origin
  }
}

export function isOriginAllowed({ origin, host, isProd, allowed }: OriginDecision): boolean {
  if (!origin) return true;             // same-origin navigation, curl, server-to-server
  if (!isProd) return true;             // dev: anything, so localhost ports are free
  if (allowed.includes(origin)) return true;
  return isSameOrigin(origin, host);    // the app fetching its own assets
}
