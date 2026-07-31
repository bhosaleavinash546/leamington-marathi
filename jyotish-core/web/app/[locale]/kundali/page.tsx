import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ConfidenceBanner } from '@/components/ConfidenceBanner';
import { DashaTree } from '@/components/DashaTree';
import { FindingsList } from '@/components/FindingsList';
import { GrahaSpashta } from '@/components/GrahaSpashta';
import { ChartPair } from '@/components/ChartPair';
import { PanchangCard } from '@/components/PanchangCard';
import { ChartToolbar } from '@/components/ChartToolbar';
import { ApiError, fetchChart, fetchChartSvg, type BirthInput, type ChartStyle } from '@/lib/api';
import { applyNumerals, type NumeralSystem } from '@/lib/format';
import { DEFAULT_DENSITY, DENSITY_COOKIE, parseDensity } from '@/lib/density';

/**
 * The main kundali view.
 *
 * A server component: the chart is fetched and rendered on the server, so the
 * birth input never sits in a client bundle and the first paint carries the whole
 * reading. CLAUDE.md 8 wants "Rashi and Navamsa charts side by side on the main
 * kundali view", which is what the two figures below are.
 */
export default async function KundaliPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const ui = await getTranslations({ locale, namespace: 'ui' });
  const chartT = await getTranslations({ locale, namespace: 'chart' });
  const panchangT = await getTranslations({ locale, namespace: 'panchang' });

  const one = (key: string): string => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  };

  // A patrika URL without a birth is not an error — nothing went wrong. It is
  // the empty state, and REVIEW-360 §1 A2 wants it to be an invitation to act.
  // Sending the empty input to the API instead produced a 422 in engineering
  // English, which is a dead end wearing an error's clothes.
  const hasBirth = Boolean(one('date') && one('lat') && one('lon') && one('tz'));
  if (!hasBirth) {
    return (
      <div className="page">
        <section className="empty-state">
          <h1>{ui('no_birth_yet')}</h1>
          <p>{ui('no_birth_body')}</p>
          <a className="button-link" href={`/${locale}`}>
            {ui('enter_birth')}
          </a>
        </section>
      </div>
    );
  }

  const density =
    parseDensity((await cookies()).get(DENSITY_COOKIE)?.value) ?? DEFAULT_DENSITY;

  const time = one('time');
  const birth: BirthInput = {
    name: one('name') || '—',
    date: one('date'),
    time: time || null,
    time_accuracy: (time ? one('time_accuracy') || 'exact' : 'unknown') as BirthInput['time_accuracy'],
    place: {
      name: one('place'),
      latitude: Number(one('lat')),
      longitude: Number(one('lon')),
      iana_tz: one('tz'),
    },
    locale: locale as BirthInput['locale'],
  };

  const style = (one('style') || 'north_indian') as ChartStyle;
  const chartKey = [birth.date, birth.time, birth.place.latitude, birth.place.longitude, style].join(
    '|',
  );
  const numerals = (one('numerals') || (locale === 'en' ? 'latin' : 'devanagari')) as NumeralSystem;

  let response;
  try {
    response = await fetchChart(birth);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    return (
      <div className="page">
        {/* An undefined sunrise or a rejected input is explained, not swallowed. */}
        <h1>{chartT('kundali')}</h1>
        <p className="error" role="alert">
          {message}
        </p>
      </div>
    );
  }

  const { facts } = response;
  const hasChart = Boolean(facts.chart);

  // Both charts and both accessible tables are rendered server-side by the same
  // Python module the PDF uses, so the printed and on-screen geometry are identical.
  const [rashiSvg, rashiTable, navamsaSvg, navamsaTable] = hasChart
    ? await Promise.all([
        fetchChartSvg(birth, { style, varga: 'D1', degrees: false, numerals }),
        fetchChartSvg(birth, { style, varga: 'D1', table: true, numerals }),
        fetchChartSvg(birth, { style, varga: 'D9', numerals }),
        fetchChartSvg(birth, { style, varga: 'D9', table: true, numerals }),
      ])
    : ['', '', '', ''];

  return (
    <div className="page">
      <header className="page__head">
        <h1>{facts.input.name}</h1>
        <p className="lede">
          {applyNumerals(facts.input.date, numerals)}
          {facts.input.time
            ? ` · ${applyNumerals(facts.input.time, numerals)}`
            : ` · ${ui('birth_time_unknown')}`}{' '}
          · {facts.input.place.name}
        </p>
      </header>

      <ConfidenceBanner facts={facts} />

      <ChartToolbar locale={locale} style={style} numerals={numerals} birth={birth} />

      {hasChart ? (
        /*
          `chartKey` carries the birth and the varga but not the locale or the
          numeral system: switching language is not a new chart, and §4.1 forbids
          replaying the draw-in for it.
        */
        <ChartPair
          rashiSvg={rashiSvg}
          rashiTable={rashiTable}
          navamsaSvg={navamsaSvg}
          navamsaTable={navamsaTable}
          style={style}
          chartKey={chartKey}
        />
      ) : (
        <p className="note">
          {/* No ascendant means no chart. Said plainly rather than shown empty. */}
          {ui('birth_time_unknown')} — {chartT('lagna')}, {chartT('house')}: {ui('not_available')}
        </p>
      )}

      <GrahaSpashta facts={facts} numerals={numerals} defaultOpen={density === 'practitioner'} />

      <PanchangCard facts={facts} numerals={numerals} locale={locale} />

      {facts.dasha ? (
        <DashaTree
          timeline={facts.dasha.timeline}
          current={facts.dasha.current}
          timeZone={facts.input.place.iana_tz}
          locale={locale}
          numerals={numerals}
        />
      ) : null}

      <FindingsList yogas={facts.yogas_present ?? []} doshas={facts.doshas ?? []} />

      <section className="card provenance">
        <details className="disclose" open={density === 'practitioner'}>
          <summary>
            <h2>{chartT('ayanamsa')}</h2>
          </summary>
          {/*
          Provenance is shown, not hidden in a debug panel. A reader comparing this
          against a printed panchang needs to know which conventions produced it,
          and CLAUDE.md 2.3 requires the ayanamsa used to be logged in every output.
        */}
        <dl className="kv kv--compact">
          <div className="kv__row">
            <dt>{chartT('ayanamsa')}</dt>
            <dd>
              {facts.ephemeris.ayanamsa} · {facts.ephemeris.ayanamsa_value_deg.toFixed(4)}° ·{' '}
              <code>{facts.ephemeris.ayanamsa_constant}</code>
            </dd>
          </div>
          <div className="kv__row">
            {/* These three labels were English on every page, including the two
                that are entirely Devanagari (CLAUDE.md N5). */}
            <dt>{chartT('reference_panchang')}</dt>
            {/* The label was English and the value is a machine key. Localising
                one and not the other reads worse than localising neither. */}
            <dd>{panchangT.has(facts.authority) ? panchangT(facts.authority) : facts.authority}</dd>
          </div>
          <div className="kv__row">
            <dt>{chartT('sunrise_convention')}</dt>
            <dd>
              <code>{facts.ephemeris.rise_set_convention}</code>
            </dd>
          </div>
          <div className="kv__row">
            <dt>{chartT('engine_version')}</dt>
            <dd>
              {facts.engine_version} · schema {facts.schema_version} ·{' '}
              <code>{facts.ephemeris.provider}</code>
            </dd>
          </div>
          </dl>
        </details>
      </section>
    </div>
  );
}
