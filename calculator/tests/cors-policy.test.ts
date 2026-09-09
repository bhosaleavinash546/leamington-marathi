/**
 * The CORS policy, pinned.
 *
 * A single-origin deployment once had its own JavaScript refused: the browser
 * sends `Origin` on module-script and asset requests even when the page came
 * from this same server, and production only allowed an explicit list. Every
 * asset returned 500 and the app did not boot. It survived every check we had
 * because curl sends no Origin and so was always allowed — which is exactly why
 * these are unit tests on the decision rather than a smoke test with a client
 * that cannot reproduce the condition.
 */
import { describe, it, expect } from 'vitest';
import { isOriginAllowed, isSameOrigin } from '../server/utils/cors-policy.js';

const PROD = { isProd: true, allowed: ['https://costvision.example'] as const };

describe('CORS — same-origin is the app talking to its own server', () => {
  it('allows the app to fetch its own assets', () => {
    // The case that was broken: UI and API on one origin, no allow-list entry.
    expect(isOriginAllowed({
      origin: 'http://localhost:3002', host: 'localhost:3002', ...PROD,
    })).toBe(true);
  });

  it('allows it on a real hostname and https too', () => {
    expect(isOriginAllowed({
      origin: 'https://costvision.jlr.internal', host: 'costvision.jlr.internal', ...PROD,
    })).toBe(true);
  });

  it('still refuses a genuine cross-site caller', () => {
    // The attacker's browser sends THEIR origin with OUR host, so these differ.
    expect(isOriginAllowed({
      origin: 'https://evil.example', host: 'costvision.jlr.internal', ...PROD,
    })).toBe(false);
  });

  it('refuses the same host on a different port', () => {
    // Ports are part of the origin: localhost:9999 is not localhost:3002.
    expect(isOriginAllowed({
      origin: 'http://localhost:9999', host: 'localhost:3002', ...PROD,
    })).toBe(false);
  });

  it('refuses a look-alike host', () => {
    expect(isOriginAllowed({
      origin: 'https://costvision.jlr.internal.evil.example',
      host: 'costvision.jlr.internal', ...PROD,
    })).toBe(false);
  });
});

describe('CORS — the paths that already worked keep working', () => {
  it('allows a request with no Origin at all', () => {
    // Plain navigation, curl, server-to-server. Not a CORS request.
    expect(isOriginAllowed({ host: 'localhost:3002', ...PROD })).toBe(true);
  });

  it('allows anything in development', () => {
    expect(isOriginAllowed({
      origin: 'http://localhost:5174', host: 'localhost:3002',
      isProd: false, allowed: [],
    })).toBe(true);
  });

  it('honours the explicit allow-list in production', () => {
    expect(isOriginAllowed({
      origin: 'https://costvision.example', host: 'internal-8.local', ...PROD,
    })).toBe(true);
  });

  it('refuses an origin that is on no list and is not the host', () => {
    expect(isOriginAllowed({
      origin: 'https://somewhere.else', host: 'internal-8.local', ...PROD,
    })).toBe(false);
  });
});

describe('CORS — malformed input is refused, not thrown on', () => {
  it.each(['not-a-url', '', 'http://', '//evil.example'])(
    'treats %j as not same-origin', bad => {
      expect(isSameOrigin(bad, 'localhost:3002')).toBe(false);
    });

  it('is not same-origin when the request carries no Host', () => {
    expect(isSameOrigin('http://localhost:3002', undefined)).toBe(false);
  });

  it('refuses rather than throwing when Origin is junk in production', () => {
    expect(() => isOriginAllowed({
      origin: 'http://[malformed', host: 'localhost:3002', ...PROD,
    })).not.toThrow();
    expect(isOriginAllowed({
      origin: 'http://[malformed', host: 'localhost:3002', ...PROD,
    })).toBe(false);
  });
});
