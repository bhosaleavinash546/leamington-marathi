/**
 * The client attaches the session token to calls to our own API — and only
 * those. Sign-in now guards eleven more route files, and the interface's calls
 * to them never carried a token; this is the one place that makes them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let seen: Array<{ url: string; auth: string | null }> = [];

beforeEach(async () => {
  seen = [];
  const store = new Map([['auth_token', 'tok-123']]);
  (globalThis as any).window = {
    location: { href: 'http://localhost:3002/calculator/', origin: 'http://localhost:3002' },
    localStorage: { getItem: (k: string) => store.get(k) ?? null },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      seen.push({ url: input instanceof Request ? input.url : String(input), auth: h.get('Authorization') });
      return new Response('{}');
    },
  };
  vi.resetModules();
  await import('../src/ui/auth-fetch.js');
});

describe('which requests carry the token', () => {
  it('a relative call to our API', async () => {
    await window.fetch('/api/quotes');
    expect(seen[0].auth).toBe('Bearer tok-123');
  });

  it('keeps a header the caller already set', async () => {
    await window.fetch('/api/quotes', { headers: { Authorization: 'Bearer explicit' } });
    expect(seen[0].auth).toBe('Bearer explicit');
  });

  it('a Request object', async () => {
    await window.fetch(new Request('http://localhost:3002/api/bom/s1'));
    expect(seen[0].auth).toBe('Bearer tok-123');
  });

  it('never a third-party host', async () => {
    // The token must not leave for anyone else, even a URL that looks like ours.
    await window.fetch('https://evil.example/api/quotes');
    await window.fetch('http://localhost:9999/api/quotes');
    expect(seen.every(s => s.auth === null)).toBe(true);
  });

  it('not our own non-API files', async () => {
    await window.fetch('/calculator/assets/app.js');
    expect(seen[0].auth).toBeNull();
  });
});
