'use client';

import { useState, useTransition } from 'react';
import { useSoftNavigate } from '@/lib/navigation';
import { useTranslations } from 'next-intl';

/**
 * Birth input.
 *
 * Three things this form does that a naive one would not:
 *
 * 1. **Time may be left blank, and says what that costs.** CLAUDE.md 4.6 forbids
 *    defaulting to noon, so an empty time submits `time_accuracy: unknown` and the
 *    form states which parts of the reading are then unavailable — before the user
 *    submits, not after.
 * 2. **Accuracy is a first-class field.** "Around 3pm" is a different input from
 *    "15:00", and the engine answers it differently (by recomputing across the
 *    window). Offering only an exact time would throw that information away.
 * 3. **The place carries its IANA zone.** Resolved from the coordinate by the
 *    server's offline tz lookup, never typed as an offset (CLAUDE.md 2.2).
 */
export function BirthForm({ locale }: { locale: string }) {
  const ui = useTranslations('ui');
  const navigate = useSoftNavigate();
  const [pending, startTransition] = useTransition();
  const [time, setTime] = useState('');
  const [accuracy, setAccuracy] = useState<'exact' | 'approx_15min' | 'approx_1hr'>('exact');
  const [place, setPlace] = useState<{ name: string; latitude: number; longitude: number; iana_tz: string } | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Array<{ name: string; latitude: number; longitude: number; iana_tz: string; state: string }>>([]);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    const response = await fetch(`/api/places?q=${encodeURIComponent(value)}`);
    if (response.ok) {
      const body = (await response.json()) as { results: typeof matches };
      setMatches(body.results);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!place) return;
    const search = new URLSearchParams({
      name: String(form.get('name') ?? ''),
      date: String(form.get('date') ?? ''),
      // An empty time means unknown, and the engine is told so explicitly.
      time: time || '',
      time_accuracy: time ? accuracy : 'unknown',
      place: place.name,
      lat: String(place.latitude),
      lon: String(place.longitude),
      tz: place.iana_tz,
    });
    startTransition(() => navigate(`/${locale}/kundali?${search}`));
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{ui('name')}</span>
        <input name="name" required maxLength={200} autoComplete="off" />
      </label>

      <label className="field">
        <span>{ui('date_of_birth')}</span>
        <input name="date" type="date" required min="1600-01-01" max="2300-01-01" />
      </label>

      <fieldset className="field field--group">
        <legend>{ui('time_of_birth')}</legend>
        <input
          name="time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-describedby="time-help"
        />
        {time ? (
          <select
            aria-label={ui('affected_fields')}
            value={accuracy}
            onChange={(e) => setAccuracy(e.target.value as typeof accuracy)}
          >
            <option value="exact">exact</option>
            <option value="approx_15min">± 15 min</option>
            <option value="approx_1hr">± 1 hr</option>
          </select>
        ) : null}
        <p id="time-help" className="fine">
          {/* Stated before submission: an unknown time is not a small loss. */}
          {time ? '' : `${ui('birth_time_unknown')} — ${ui('not_available')}: लग्न, भाव, दशा, इष्टकाल`}
        </p>
      </fieldset>

      <label className="field">
        <span>{ui('place_of_birth')}</span>
        <input
          value={query}
          onChange={(e) => void search(e.target.value)}
          autoComplete="off"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls="place-matches"
        />
      </label>
      {matches.length > 0 ? (
        <ul id="place-matches" className="matches" role="listbox">
          {matches.map((match) => (
            <li key={`${match.name}-${match.latitude}`}>
              <button
                type="button"
                onClick={() => {
                  setPlace(match);
                  setQuery(match.name);
                  setMatches([]);
                }}
              >
                {match.name}
                {match.state ? `, ${match.state}` : ''} <code>{match.iana_tz}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {place ? (
        <p className="fine">
          {place.name} · {place.latitude}, {place.longitude} · <code>{place.iana_tz}</code>
        </p>
      ) : null}

      <button className="primary" type="submit" disabled={pending || !place}>
        {pending ? ui('loading') : ui('compute')}
      </button>
    </form>
  );
}
