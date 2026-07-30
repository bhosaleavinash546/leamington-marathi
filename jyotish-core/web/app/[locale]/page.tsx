import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BirthForm } from '@/components/BirthForm';

/**
 * The birth-input screen.
 *
 * CLAUDE.md 10: "no third-party analytics on the birth-input screens." There are
 * none anywhere in this app, and the CSP in `next.config.ts` makes that structural
 * rather than a promise — no third-party script can load.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ui = await getTranslations({ locale, namespace: 'ui' });
  const chart = await getTranslations({ locale, namespace: 'chart' });
  const legal = await getTranslations({ locale, namespace: 'legal' });

  return (
    <div className="page page--form">
      <header className="page__head">
        <h1>{chart('kundali')}</h1>
        <p className="lede">{legal('traditional_interpretation')}</p>
      </header>
      <BirthForm locale={locale} />
      <p className="fine">{legal('data_consent')}</p>
      <p className="fine">{ui('why')} · {legal('numerology_not_jyotish')}</p>
    </div>
  );
}
