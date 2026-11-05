/**
 * The screen's rate book follows the SERVER's resolved book (rates flow review R1, Nov 2026).
 *
 * - The screen adopts `/api/rate-library/active` whatever its source. It used to adopt it only when the source was
 *   "company", so admin cell overrides on the built-in book never reached the screen, and after an admin switched back
 *   to built-in (or reset) an open tab kept costing on the company book until it was reloaded.
 * - An open tab re-checks the book's fingerprint on focus (`/status`, cheap) and re-fetches `/active` only when it moved.
 * - Browser-local rate copies are retired: a saved copy in localStorage outranked the server and kept pre-October rates
 *   (and lacked the November machines) in that browser. It is moved to a backup key once and never read again.
 * - Per-browser rate EDITS are removed (decision, R1): the rate table is read only. A costing on screen can never
 *   silently differ from the company book; a rate is changed by an administrator, for everyone, and audited.
 */
import type { RateLibrary } from '../engine/types.js';

/** What the server says about the book it resolves: its fingerprint and a plain label. */
export interface ServerBookInfo {
  fingerprint: string;
  label: string;
  source: 'builtin' | 'company';
  overrideCount: number;
}

/** The localStorage key the retired per-browser copy lived under. */
export const LOCAL_RATE_COPY_KEY = 'shouldCostRateLibrary';

/**
 * Retire a browser-local rate copy: moved to `<key>.backup-<version>` and removed, so it can never outrank the server's
 * book again. Returns the notice to show (empty when there was none).
 */
export function retireLocalRateCopy(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined): string {
  if (!storage) return '';
  let raw: string | null = null;
  try { raw = storage.getItem(LOCAL_RATE_COPY_KEY); } catch { return ''; }
  if (!raw) return '';
  let version = 'old';
  try { version = String((JSON.parse(raw) as { version?: string; lastModified?: string }).version ?? 'old'); } catch { /* unreadable — still retired */ }
  try { storage.setItem(`${LOCAL_RATE_COPY_KEY}.backup-${version}`, raw); } catch { /* storage full — the copy is dropped */ }
  try { storage.removeItem(LOCAL_RATE_COPY_KEY); } catch { /* blocked */ }
  return `Rates now always come from the server's rate book. This browser's saved rate copy (${version}) is no longer used; it is kept as a backup.`;
}

/** A usable book in an `/active` reply (materials, machines and labour present). */
export function isUsableBook(lib: unknown): lib is RateLibrary {
  const l = lib as Partial<RateLibrary> | null | undefined;
  return !!l && Array.isArray(l.materials) && l.materials.length > 0 && Array.isArray(l.machines) && Array.isArray(l.labour)
    && Array.isArray(l.energy);
}

/** The `/active` reply as the screen adopts it: ALWAYS the server's book, whatever its source. Null when unusable. */
export function adoptServerBook(data: { library?: unknown; source?: string; fingerprint?: string; label?: string; overrideCount?: number }):
  { library: RateLibrary; info: ServerBookInfo } | null {
  if (!isUsableBook(data.library)) return null;
  return {
    library: data.library,
    info: {
      fingerprint: String(data.fingerprint ?? ''),
      label: String(data.label ?? (data.source === 'company' ? 'company book' : 'built-in')),
      source: data.source === 'company' ? 'company' : 'builtin',
      overrideCount: Number(data.overrideCount) || 0,
    },
  };
}

/** The first 8 characters of a fingerprint — enough to tell books apart on a stamp; `/versions/:id` takes the full 16. */
export const shortPrint = (fp: string): string => fp.slice(0, 8);

/**
 * The rate-book part of the reproducibility stamp: "United Kingdom rate book v2.2.0 · company book: 3 changed, 1 added ·
 * book 1a2b3c4d". The version stays first and unchanged (`trace-checks.ts::stampNamesBook` reads it); the label and the
 * fingerprint say WHICH book — `company-upload-CN` could not.
 */
export function rateBookStampLabel(country: string, version: string, info: ServerBookInfo | null): string {
  const head = `${country} rate book v${version}`;
  if (!info || !info.fingerprint) return `${head} · not checked against a server book`;
  return `${head} · ${info.label} · book ${shortPrint(info.fingerprint)}`;
}

/** The read-only rate table's heading note. */
export function readOnlyRateNote(info: ServerBookInfo | null): string {
  const which = info?.fingerprint ? `${info.label}, book ${shortPrint(info.fingerprint)}` : 'the built-in book (no server reached)';
  return `Read only. Every costing uses the server's rate book (${which}). Rates are changed by an administrator — by `
    + 'uploading the company workbook below — for everyone, and every change is audited. Per-browser rate edits were '
    + 'removed so a costing on this screen can never silently differ from the company book.';
}

/** Ask the server which book is active (fingerprint only) — the focus check. Null when it cannot be reached. */
export async function fetchServerBookFingerprint(headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch('/api/rate-library/status', { headers });
    if (!res.ok) return null;
    const s = await res.json() as { fingerprint?: string };
    return typeof s.fingerprint === 'string' ? s.fingerprint : null;
  } catch { return null; }
}
