import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

/**
 * Locale routing and the Content-Security-Policy.
 *
 * The CSP lives here rather than in `next.config.ts` because it needs a
 * per-request nonce. The App Router delivers its RSC payload as inline
 * `<script>` tags; under a bare `script-src 'self'` the browser refuses every
 * one of them, React hydrates against an empty tree and **deletes the
 * server-rendered DOM**. The page arrives complete and then goes blank. That is
 * what the previous static header did on every route, and no test caught it
 * because nothing ever loaded a page in a browser.
 *
 * `'unsafe-inline'` would also fix it and is the usual shortcut. It is not
 * available here: `components/KundaliChart.tsx` mounts server-generated SVG and
 * the accessible table through `dangerouslySetInnerHTML`, so an inline
 * `<script>` reaching that markup would execute. The nonce keeps the policy
 * strict enough that it could not.
 *
 * Cost, stated rather than hidden: a per-request nonce cannot be baked into a
 * prerendered page, so the routes that carry one render per request instead of
 * at build time. See docs/design/DIRECTION.md.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'unsafe-inline' for styles only: the SVG the API returns carries its own
    // <style> block, which is what keeps one geometry implementation shared
    // between the web view and the PDF.
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

/**
 * Re-issue next-intl's decision so the *request* carries the CSP header too.
 *
 * Next reads the nonce off the incoming request, not off the response, so
 * setting it only on the way out would leave the inline scripts unsigned and
 * blocked. next-intl builds its own response, so the rewrite or continuation it
 * chose has to be replayed with the added request headers rather than mutated.
 */
function withRequestHeaders(decision: NextResponse, headers: Headers): NextResponse {
  // A redirect renders nothing, so it needs no nonce.
  if (decision.headers.has('location')) return decision;

  const rewrite = decision.headers.get('x-middleware-rewrite');
  const response = rewrite
    ? NextResponse.rewrite(new URL(rewrite), { request: { headers } })
    : NextResponse.next({ request: { headers } });

  decision.headers.forEach((value, key) => {
    // Skip Next's own control headers: the replayed response has just written
    // its own, and copying them over would undo the request headers.
    if (!key.startsWith('x-middleware-')) response.headers.set(key, value);
  });
  for (const cookie of decision.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export default function middleware(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const policy = contentSecurityPolicy(nonce);

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);

  // `/tokens` is the design token sheet (DESIGN.md §10 Phase A). It lives
  // outside `[locale]` on purpose — it is a design artifact, not a product
  // screen — so it needs the CSP but not the locale routing, which would
  // redirect it to `/mr/tokens` and 404.
  const isTokenSheet = request.nextUrl.pathname === '/tokens';
  const response = isTokenSheet
    ? NextResponse.next({ request: { headers } })
    : withRequestHeaders(handleI18nRouting(request), headers);

  response.headers.set('content-security-policy', policy);
  return response;
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
