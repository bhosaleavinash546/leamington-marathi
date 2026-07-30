import { useTranslations } from 'next-intl';
import type { ChartFacts } from '@/lib/api';

/**
 * The confidence banner (CLAUDE.md 8).
 *
 * > Confidence banner whenever `birth_time` is not exact, listing the affected
 * > fields.
 *
 * The listed fields come from the engine, which produced them by *recomputing the
 * chart across the stated window* and diffing (CLAUDE.md 4.6) — not from a
 * hard-coded list of things that are usually sensitive. So the banner tells the
 * user what actually moved for their birth, and for an unknown time it names what
 * was suppressed outright rather than defaulted.
 *
 * `role="status"` rather than `role="alert"`: an approximate birth time is
 * information about the reading, not an error, and an assertive live region would
 * interrupt a screen-reader user mid-sentence.
 */
export function ConfidenceBanner({ facts }: { facts: ChartFacts }) {
  const t = useTranslations('ui');
  const { birth_time, affected_fields, warnings } = facts.confidence;

  if (birth_time === 'exact' && warnings.length === 0) return null;

  const heading = birth_time === 'unknown' ? t('birth_time_unknown') : t('birth_time_approximate');

  return (
    <aside className="banner" role="status" aria-live="polite">
      <p className="banner__heading">{heading}</p>
      {affected_fields.length > 0 ? (
        <>
          <p className="banner__label">{t('affected_fields')}</p>
          <ul className="banner__list">
            {affected_fields.map((field) => (
              <li key={field}>
                <code>{field}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="banner__list banner__list--warnings">
          {warnings.map((warning) => (
            <li key={warning}>
              <code>{warning}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
