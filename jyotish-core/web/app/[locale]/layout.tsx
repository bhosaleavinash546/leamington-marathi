import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, isDevanagari } from '@/i18n/routing';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'chart' });
  const legal = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t('kundali'),
    // CLAUDE.md N6 / 10: the product describes itself as traditional
    // interpretation, never as prediction — including in its metadata, which is
    // what a search result and an app-store listing show.
    description: legal('traditional_interpretation'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={isDevanagari(locale) ? 'script-devanagari' : 'script-latin'}>
      <body>
        <NextIntlClientProvider>
          <a className="skip-link" href="#main">
            {locale === 'en' ? 'Skip to content' : 'मुख्य मजकुराकडे'}
          </a>
          <LeadDisclaimer locale={locale} />
          <main id="main">{children}</main>
          <Disclaimer locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * The persistent disclaimer (CLAUDE.md 10: "Lead with this in the product, do not
 * bury it"). In the layout, so no page can ship without it.
 *
 * It used to be *only* this footer - muted, 0.85rem, at the bottom of the page -
 * which is the exact placement AUDIT.md 7 names as the fail condition, sitting
 * directly under a code comment quoting "do not bury it" (audit F-015). The one
 * line that matters most now leads the page in `LeadDisclaimer`, and the full
 * text still closes it.
 */
async function LeadDisclaimer({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'legal' });
  return (
    <p className="lead-disclaimer" role="note">
      {t('not_a_forecast')}
    </p>
  );
}

async function Disclaimer({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'legal' });
  return (
    <footer className="disclaimer" role="contentinfo">
      <p>{t('disclaimer')}</p>
      <p>{t('not_a_forecast')}</p>
      <p>
        {t('not_medical_advice')} {t('not_legal_advice')} {t('not_financial_advice')}
      </p>
    </footer>
  );
}
