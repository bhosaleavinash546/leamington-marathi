import { defineRouting } from 'next-intl/routing';

/**
 * CLAUDE.md N5: all three locales are first-class. `mr` is the default
 * (CLAUDE.md 7), and it is *prefixed* like the others rather than served from the
 * bare root — an unprefixed default quietly becomes the "real" locale and the
 * other two become translations of it, which is the hierarchy N5 rules out.
 */
export const routing = defineRouting({
  locales: ['mr', 'hi', 'en'] as const,
  defaultLocale: 'mr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

/** Whether a locale is written in Devanagari, for font and numeral decisions. */
export function isDevanagari(locale: string): boolean {
  return locale === 'mr' || locale === 'hi';
}
