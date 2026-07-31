import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BirthForm } from '@/components/BirthForm';
import { FirstRun } from '@/components/FirstRun';
import { DENSITY_COOKIE, parseDensity } from '@/lib/density';

/**
 * The home screen: the occasion, then the action (REVIEW-360 §1).
 *
 * POSITIONING.md fixes the occasion — a jyotishi has just been handed a birth
 * and wants the patrika — so this screen is the one-line statement of what the
 * product does, one question on first run, and the birth form. Nothing else
 * competes: the legal lines stay, demoted to fine print, because CLAUDE.md 10
 * requires them, not because they earn attention.
 *
 * The five-second test (§1 A1.5) is what the masthead exists for: a first-time
 * reader should know what this is and what to tap before the fold.
 *
 * CLAUDE.md 10: "no third-party analytics on the birth-input screens." There are
 * none anywhere in this app, and the CSP in `middleware.ts` makes that structural
 * rather than a promise — no third-party script can load.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ui = await getTranslations({ locale, namespace: 'ui' });
  const chart = await getTranslations({ locale, namespace: 'chart' });
  const legal = await getTranslations({ locale, namespace: 'legal' });
  const density = parseDensity((await cookies()).get(DENSITY_COOKIE)?.value);

  return (
    <div className="page page--form">
      <header className="page__head">
        <h1>{chart('kundali')}</h1>
        <p className="tagline">{ui('tagline')}</p>
      </header>
      <FirstRun initialDensity={density}>
        <BirthForm locale={locale} />
      </FirstRun>
      <p className="fine">{legal('traditional_interpretation')}</p>
      <p className="fine">{legal('data_consent')}</p>
      <p className="fine">{legal('numerology_not_jyotish')}</p>
    </div>
  );
}
