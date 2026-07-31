import { useTranslations } from 'next-intl';
import type { ChartFacts } from '@/lib/api';
import { applyNumerals, localRange, localTime, type NumeralSystem } from '@/lib/format';
import { LimbArc } from './LimbArc';
import { DayStrip } from './DayStrip';

/**
 * The panchang card (CLAUDE.md 8).
 *
 * > Panchang card for the birth date: five limbs with start/end times, Shaka year
 * > and Amanta month, Rahu Kaal, Ishtakaal.
 *
 * Two things this card is careful about:
 *
 * - **Both tithis.** When the tithi at birth differs from the tithi at sunrise it
 *   shows both, labelled, with a note that the Hindu day begins at sunrise
 *   (CLAUDE.md 4.3, N4). Showing only one would be the single most misleading
 *   simplification available here.
 * - **Ishtakaal is not optional.** CLAUDE.md 3.2: omitting it "will read as amateur
 *   to a Marathi user". It is absent only when there is no birth time to measure it
 *   from.
 */
export function PanchangCard({
  facts,
  numerals,
  locale,
}: {
  facts: ChartFacts;
  numerals: NumeralSystem;
  locale: string;
}) {
  const p = useTranslations('panchang');
  const tTithi = useTranslations('tithi');
  const tNak = useTranslations('nakshatra');
  const tYoga = useTranslations('yoga');
  const tKarana = useTranslations('karana');
  const tVara = useTranslations('vara');
  const tMonth = useTranslations('month');
  const ui = useTranslations('ui');

  const { panchang } = facts;
  const tz = facts.input.place.iana_tz;
  const n = (text: string) => applyNumerals(text, numerals);
  const time = (utc: string | null) => n(localTime(utc, tz, locale));
  const hd = panchang.hindu_date;

  const rows: Array<[string, string]> = [
    [p('tithi'), `${tTithi(hd.paksha === 'krishna' && hd.tithi_index === 30 ? 'amavasya' : panchang.tithi_at_sunrise.key)} · ${time(panchang.tithi_at_sunrise.end_utc)}`],
    [p('nakshatra'), `${tNak(panchang.nakshatra_at_sunrise.key)} ${n(String(panchang.nakshatra_at_sunrise.pada))} · ${time(panchang.nakshatra_at_sunrise.end_utc)}`],
    [p('yoga'), `${tYoga(panchang.yoga_at_sunrise.key)} · ${time(panchang.yoga_at_sunrise.end_utc)}`],
    [p('karana'), `${tKarana(panchang.karana_at_sunrise.key)} · ${time(panchang.karana_at_sunrise.end_utc)}`],
    [p('vara'), tVara(panchang.vara.key)],
    [p('sunrise'), time(panchang.sunrise_utc)],
    [p('sunset'), time(panchang.sunset_utc)],
    [p('rahu_kaal'), n(localRange(panchang.rahu_kaal, tz, locale))],  // rendered in --sindoor below
    [p('abhijit_muhurta'), n(localRange(panchang.abhijit_muhurta, tz, locale))],
    [p('ritu'), p(panchang.ritu.key)],
    [p('ayana'), p(panchang.ayana)],
  ];

  if (panchang.ishtakaal) {
    rows.push([
      p('ishtakaal'),
      `${n(String(panchang.ishtakaal.ghati))} ${p('ghati')} ${n(String(panchang.ishtakaal.pala))} ${p('pala')}`,
    ]);
  }

  return (
    <section className="card" aria-labelledby="panchang-heading">
      <header className="card__head">
        <h2 id="panchang-heading">{p('panchang')}</h2>
        <p className="card__sub">
          {p('shaka_year')} {n(String(hd.shaka_year))} · {tMonth(hd.month_display_key)} ·{' '}
          {p(hd.paksha)}
          {hd.month_anomaly !== 'none' ? (
            <>
              {' '}
              <mark className="tag">{p(hd.month_anomaly === 'adhika' ? 'adhika_masa' : 'kshaya_masa')}</mark>
            </>
          ) : null}
          {panchang.tithi_anomaly !== 'none' ? (
            <>
              {' '}
              <mark className="tag">
                {p(panchang.tithi_anomaly === 'vriddhi' ? 'vriddhi_tithi' : 'kshaya_tithi')}
              </mark>
            </>
          ) : null}
        </p>
      </header>

      {panchang.tithi_at_birth && panchang.tithi_at_birth_differs_from_sunrise ? (
        // CLAUDE.md 4.3: both are reported, separately labelled.
        // DESIGN.md §1 reserves --sindoor for "the currently-active tithi",
        // among a short list. This is that tithi.
        <p className="note note--signal">
          {p('tithi')} ({ui('time_of_birth')}): <strong>{tTithi(panchang.tithi_at_birth.key)}</strong>
          {' — '}
          {p('panchang')}: {p('sunrise')} → {p('sunrise')}
        </p>
      ) : null}

      {/*
        The three limbs as arcs (DESIGN.md §4.3), filled to the fraction the
        engine reports. Tithi, nakshatra and yoga — not karana, which is half a
        tithi and would make the group read as four equal things.
      */}
      <div className="limb-arcs">
        {(
          [
            ['tithi', panchang.tithi_at_sunrise?.fraction_elapsed],
            ['nakshatra', panchang.nakshatra_at_sunrise?.fraction_elapsed],
            ['yoga', panchang.yoga_at_sunrise?.fraction_elapsed],
          ] as const
        ).map(([key, fraction], index) =>
          typeof fraction === 'number' ? (
            <div className="limb-arcs__item" key={key}>
              <LimbArc fraction={fraction} label={p(key)} index={index} />
              <span className="limb-arcs__label">{p(key)}</span>
            </div>
          ) : null,
        )}
      </div>

      <DayStrip facts={facts} numerals={numerals} locale={locale} />

      <dl className="kv">
        {rows.map(([label, value]) => (
          <div
            className={`kv__row${label === p('rahu_kaal') ? ' kv__row--signal' : ''}`}
            key={label}
          >
            {/*
              राहूकाळ in --sindoor. DESIGN.md §1 gives red exactly one job —
              "auspicious/inauspicious periods, the currently-active tithi,
              festival days, and warnings" — and this is the only inauspicious
              period on the card. It is a colour *and* a labelled row, never
              colour alone (§8), and it does not pulse: §4.3 calls a pulsing
              inauspicious-time warning manipulative, and it is right.
            */}
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
