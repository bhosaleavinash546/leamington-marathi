import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl reads the request locale through this module (see i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  // CLAUDE.md 10 forbids third-party analytics on birth-input screens. There are
  // none anywhere in this app, and the CSP makes that enforceable rather than
  // merely intended: no third-party script can load at all.
  //
  // The CSP for rendered routes is set in `middleware.ts`, not here, because it
  // carries a per-request nonce — a static `script-src 'self'` blocks the App
  // Router's own inline scripts and blanks every page. What stays here is the
  // policy for `/api/*`, which the middleware matcher deliberately skips: those
  // responses are JSON and SVG fetched by the app, never navigated to, so they
  // need no nonce, only a policy that permits nothing to run.
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"].join('; '),
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
