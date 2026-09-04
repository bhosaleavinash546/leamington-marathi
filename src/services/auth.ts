// ─────────────────────────────────────────────────────────────────────────────
// The one place that reads the auth store.
//
// `localStorage.brainspark_auth` holds `{ token, user }` — AuthContext writes
// it that way. Four surfaces read the key directly and sent the WHOLE JSON blob
// as the bearer token (Sept 2026 review, R-9): Team, API-key settings, Wiring
// Harness and the ⌘K content search. Each then swallowed the resulting 401, so
// three pages and a search had never worked and nothing said so.
//
// Read the token through here, or through useAuth() in a component. Nothing
// else should touch the storage key — the lint rule in eslint.config.js
// enforces that.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'brainspark_auth';

/** The bearer token, or null when signed out or the store is unreadable. */
export function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { token?: unknown };
    return typeof parsed?.token === 'string' && parsed.token ? parsed.token : null;
  } catch {
    return null;   // corrupt or unavailable storage reads as signed out
  }
}

/** Authorization header, or {} when signed out — safe to spread into any fetch. */
export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** JSON request headers with auth attached. */
export function authJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeader() };
}

/** True when a token is present. Not a claim that the token is still valid. */
export const isSignedIn = (): boolean => getAuthToken() !== null;
