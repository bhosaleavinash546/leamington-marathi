import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl reads the request locale through this module (see i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  // CLAUDE.md 10 forbids third-party analytics on birth-input screens. There are
  // none anywhere in this app, and the CSP below makes that enforceable rather
  // than merely intended: no third-party script can load at all.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-inline' for styles only: the SVG the API returns carries
              // its own <style> block, which is what keeps one geometry
              // implementation shared between the web view and the PDF.
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
