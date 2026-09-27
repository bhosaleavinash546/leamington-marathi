/**
 * BROWSER STORAGE THAT CANNOT THROW.
 *
 * `localStorage.setItem` throws in three ordinary situations: Safari private
 * browsing (older versions), a quota exceeded by the ten full analyses this
 * tool keeps for offline results, and site data blocked by policy on a locked-
 * down corporate laptop — which is exactly the machine a cost engineer has.
 * Sign-in wrote its token with a bare setItem, so on that laptop the session
 * was thrown away by the write and the user was signed out on the next
 * navigation with no message (September 2026 review).
 *
 * Every read and write goes through here. A failed write returns false so a
 * caller that cares (sign-in, settings) can say so; a failed read returns the
 * fallback. Nothing here is a source of truth — server state is — so losing a
 * write is a degraded convenience, never a lost record.
 */

function store(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function readString(key: string, fallback = ''): string {
  try { return store()?.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writeString(key: string, value: string): boolean {
  const s = store();
  if (!s) return false;
  try { s.setItem(key, value); return true; } catch { return false; }
}

export function remove(key: string): void {
  try { store()?.removeItem(key); } catch { /* nothing to remove, or blocked */ }
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = readString(key, '');
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function writeJSON(key: string, value: unknown): boolean {
  try { return writeString(key, JSON.stringify(value)); } catch { return false; }
}

/**
 * A most-recent-first list capped at `max`, de-duplicated — the shape the
 * command palette's recents and the recent-analyses list both want.
 */
export function pushRecent<T>(key: string, item: T, max = 5, same: (a: T, b: T) => boolean = (a, b) => a === b): T[] {
  const prev = readJSON<T[]>(key, []);
  const next = [item, ...(Array.isArray(prev) ? prev : []).filter(x => !same(x, item))].slice(0, max);
  writeJSON(key, next);
  return next;
}
