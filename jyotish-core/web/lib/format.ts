/**
 * Presentation helpers.
 *
 * CLAUDE.md N1: no number is computed here. These functions *format* values the
 * engine produced — they never derive one. The two things that look like
 * arithmetic are deliberately not:
 *
 * - `toDevanagariNumerals` is a per-character digit substitution, the numeral
 *   toggle CLAUDE.md 7 requires. It changes the script of a digit, not its value.
 * - `localTime` renders an instant in a timezone using `Intl`, which is a display
 *   concern; the engine also supplies `*_local` fields for anything that reaches
 *   the narrative layer, so prose never depends on this path.
 */

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'] as const;

export type NumeralSystem = 'devanagari' | 'latin';

/** The CLAUDE.md 7 numeral toggle. A substitution, not a conversion. */
export function toDevanagariNumerals(text: string): string {
  return text.replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[Number(digit)] ?? digit);
}

export function applyNumerals(text: string, system: NumeralSystem): string {
  return system === 'devanagari' ? toDevanagariNumerals(text) : text;
}

/** `HH:MM` in the birth place's own zone. Returns an em dash for a null instant. */
export function localTime(utc: string | null, timeZone: string, locale: string): string {
  if (!utc) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(utc));
}

export function localDate(utc: string | null, timeZone: string, locale: string): string {
  if (!utc) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(utc));
}

export function localRange(interval: { start_utc: string | null; end_utc: string | null }, tz: string, locale: string): string {
  return `${localTime(interval.start_utc, tz, locale)}–${localTime(interval.end_utc, tz, locale)}`;
}

/** `12°34'` from a degree value the engine supplied. Formatting only. */
export function formatDegrees(deg: number): string {
  const whole = Math.trunc(deg);
  const minutes = Math.round((deg - whole) * 60);
  return `${whole}°${String(minutes).padStart(2, '0')}′`;
}

/**
 * Turn an evidence key into something readable without translating it.
 *
 * `jupiter_in_house_4_from_moon` becomes `jupiter in house 4 from moon`. The key
 * itself is still shown verbatim alongside, because CLAUDE.md 6.3 wants the user
 * to see the actual key that drove a claim, and a prettified version is not that.
 */
export function humaniseEvidence(key: string): string {
  return key.replace(/_/g, ' ');
}
