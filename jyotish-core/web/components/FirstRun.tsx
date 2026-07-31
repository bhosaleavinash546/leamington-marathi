'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DENSITY_COOKIE, parseDensity, type Density } from '@/lib/density';

/**
 * The first-run experience (REVIEW-360 §1 A2).
 *
 * > One plain-language question ("Are you an astrologer, or looking at your own
 * > chart?") that sets density mode, then straight into the primary action. No
 * > carousel, no tour.
 *
 * So: one question, two equal buttons, and the birth form appears the moment one
 * is pressed — no confirmation step, no second screen. The choice is a cookie so
 * the server renders the right density from the next request onward, and a small
 * "change view" link keeps it reversible; a persistent choice with no way back
 * is a trap, and there is no settings screen to bury it in.
 *
 * The question is skipped entirely when a choice already exists — a returning
 * reader goes straight to the form, which is the whole point of asking only once.
 */
export function FirstRun({
  initialDensity,
  children,
}: {
  initialDensity: Density | null;
  children: ReactNode;
}) {
  const ui = useTranslations('ui');
  const [density, setDensity] = useState<Density | null>(initialDensity);

  const choose = (value: Density | null) => {
    document.cookie =
      value === null
        ? `${DENSITY_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${DENSITY_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    setDensity(parseDensity(value));
  };

  if (density === null) {
    return (
      <div className="first-run" role="group" aria-labelledby="first-run-question">
        <p id="first-run-question" className="first-run__question">
          {ui('first_run_question')}
        </p>
        <div className="first-run__options">
          <button type="button" className="primary" onClick={() => choose('practitioner')}>
            {ui('first_run_practitioner')}
          </button>
          <button type="button" className="primary" onClick={() => choose('seeker')}>
            {ui('first_run_seeker')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <p className="fine">
        {ui(density === 'practitioner' ? 'first_run_practitioner' : 'first_run_seeker')} ·{' '}
        <button type="button" className="link-button" onClick={() => choose(null)}>
          {ui('density_change')}
        </button>
      </p>
    </>
  );
}
