import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Load a locale's namespaces from `locales/<locale>/*.json` at the repository
 * root — the *same* files the Python API serves as its glossary.
 *
 * Deliberately not a copy under `web/messages/`. Two copies of 280 hand-curated
 * Devanagari terms would drift, and the drift would be invisible: the locale
 * audit in CI reads the root files, so a stale frontend copy would pass every
 * check while showing a Maharashtrian user Hindi-flavoured Marathi.
 */
const LOCALES_DIR = path.join(process.cwd(), '..', 'locales');

/** Namespaces the UI needs. `narrative` is server-side only (blocklist). */
export const NAMESPACES = [
  'rashi', 'nakshatra', 'graha', 'graha_abbr', 'tithi', 'yoga', 'karana',
  'vara', 'month', 'bhava', 'panchang', 'dasha', 'chart', 'milan', 'ui', 'legal',
] as const;

export type Messages = Record<string, Record<string, string>>;

export async function loadMessages(locale: string): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
      const raw = await fs.readFile(file, 'utf8');
      return [ns, JSON.parse(raw) as Record<string, string>] as const;
    }),
  );
  return Object.fromEntries(entries);
}
