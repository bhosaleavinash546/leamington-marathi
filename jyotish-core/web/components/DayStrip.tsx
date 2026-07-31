'use client';

import { useTranslations } from 'next-intl';
import type { ChartFacts } from '@/lib/api';
import { applyNumerals, localRange, type NumeralSystem } from '@/lib/format';

/**
 * Sunrise to sunset, with the inauspicious periods marked (DESIGN.md §4.3).
 *
 * > Rahu Kaal, Gulika and Yamaganda render as `--sindoor` bands on a day strip.
 * > Bands fade in; they do not pulse. **A pulsing inauspicious-time warning is
 * > manipulative.**
 *
 * That last sentence is the whole design of this component. The bands are static
 * the moment they arrive: they carry a fact about the day, and animating them
 * would be the interface leaning on the reader. There is no `animation` here at
 * all — the fade is the enter, and then it stops.
 *
 * The strip is positioned from the engine's own timestamps. The one arithmetic
 * here is turning an instant into a percentage of the daylight span, which is
 * the same class of operation as `localTime` — a coordinate on screen, not a
 * quantity about the sky.
 */
type Band = { key: string; start: string | null; end: string | null };

function offset(instant: string | null, dayStart: number, daySpan: number): number | null {
  if (!instant || daySpan <= 0) return null;
  const at = Date.parse(instant);
  if (Number.isNaN(at)) return null;
  return Math.min(100, Math.max(0, ((at - dayStart) / daySpan) * 100));
}

export function DayStrip({
  facts,
  numerals,
  locale,
}: {
  facts: ChartFacts;
  numerals: NumeralSystem;
  locale: string;
}) {
  const p = useTranslations('panchang');
  const { panchang } = facts;
  const tz = facts.input.place.iana_tz;

  const sunrise = panchang.sunrise_utc ? Date.parse(panchang.sunrise_utc) : NaN;
  const sunset = panchang.sunset_utc ? Date.parse(panchang.sunset_utc) : NaN;
  if (Number.isNaN(sunrise) || Number.isNaN(sunset) || sunset <= sunrise) return null;
  const span = sunset - sunrise;

  const bands: Band[] = [
    { key: 'rahu_kaal', start: panchang.rahu_kaal?.start_utc, end: panchang.rahu_kaal?.end_utc },
    {
      key: 'gulika_kaal',
      start: panchang.gulika_kaal?.start_utc,
      end: panchang.gulika_kaal?.end_utc,
    },
    { key: 'yamaganda', start: panchang.yamaganda?.start_utc, end: panchang.yamaganda?.end_utc },
  ];

  return (
    <div className="day-strip">
      <div className="day-strip__track" aria-hidden="true">
        {bands.map((band, index) => {
          const from = offset(band.start ?? null, sunrise, span);
          const to = offset(band.end ?? null, sunrise, span);
          if (from === null || to === null) return null;
          return (
            <span
              key={band.key}
              className="day-strip__band"
              style={{
                left: `${from}%`,
                width: `${Math.max(0.5, to - from)}%`,
                // Staggered like the arcs, so the three arrive as a group rather
                // than at once.
                animationDelay: `calc(var(--dur-enter) * ${index * 0.3})`,
              }}
            />
          );
        })}
      </div>
      {/*
        The bands are decoration for a sighted reader; the list is the content.
        §8: colour is never the sole channel, and a band with no label is a
        coloured smear that means nothing to anyone who cannot see it.
      */}
      <ul className="day-strip__legend">
        {bands.map((band) => {
          if (!band.start || !band.end) return null;
          return (
            <li key={band.key}>
              <span className="day-strip__swatch" aria-hidden="true" />
              {p(band.key)} ·{' '}
              {applyNumerals(localRange({ start_utc: band.start, end_utc: band.end }, tz, locale), numerals)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
