/**
 * Attach the signed-in user's token to every call this app makes to its own API.
 *
 * WHY THIS EXISTS. The server used to leave eleven route files open, and the
 * interface's calls to them carried no token — the token was added by hand,
 * call by call, only where a route happened to demand it. Putting sign-in on
 * those routes without this would have broken every one of those calls
 * silently, and hunting them through a 20,000-line file is how one gets
 * missed. So the rule lives here, once: any request to our API that does not
 * already carry an Authorization header gets the current session's.
 *
 * "Our API" is the page's own origin, or — in the mobile shell — the origin in
 * VITE_API_BASE. A request to anywhere else is left exactly as it was, so the
 * token never leaks to a third party.
 *
 * Must be imported before anything that fetches.
 */
import { apiBase } from '../api-base.js';

const TOKEN_KEY = 'auth_token';

function isOurApi(url: URL): boolean {
  if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) return true;
  if (!apiBase) return false;
  try {
    const base = new URL(apiBase, window.location.href);
    return url.origin === base.origin && url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/api/');
  } catch { return false; }
}

function token(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !(window.fetch as { __cvAuth?: boolean }).__cvAuth) {
  const original = window.fetch.bind(window);
  const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const href = input instanceof Request ? input.url : String(input);
      const url = new URL(href, window.location.href);
      const t = token();
      if (t && isOurApi(url)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${t}`);
          if (input instanceof Request && !init) return original(new Request(input, { headers }));
          return original(input, { ...init, headers });
        }
      }
    } catch { /* anything unexpected: send the request untouched */ }
    return original(input, init);
  };
  (wrapped as { __cvAuth?: boolean }).__cvAuth = true;
  window.fetch = wrapped as typeof window.fetch;
}

export {};
