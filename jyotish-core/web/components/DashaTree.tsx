'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DashaPeriod } from '@/lib/api';
import { applyNumerals, localDate, type NumeralSystem } from '@/lib/format';

/**
 * The dasha timeline (CLAUDE.md 8).
 *
 * > Dasha timeline: collapsible 4-level tree, with "today" marker.
 *
 * Only level 1 arrives with the chart. A four-level tree is 7380 nodes
 * (9 + 81 + 729 + 6561), which is small enough to compute and much too large to
 * ship on every request — so deeper levels are fetched on expand. That is why the
 * engine exposes `subperiods()` as a function of a parent rather than materialising
 * the whole tree.
 *
 * The "today" marker compares the period bounds with the current instant. That is a
 * comparison, not a computation: the dates come from the engine, and no date is
 * derived here (CLAUDE.md N1).
 */
export function DashaTree({
  timeline,
  current,
  timeZone,
  locale,
  numerals,
}: {
  timeline: DashaPeriod[];
  current: Record<string, DashaPeriod>;
  timeZone: string;
  locale: string;
  numerals: NumeralSystem;
}) {
  const t = useTranslations('dasha');
  const tGraha = useTranslations('graha');
  const now = Date.now();

  const isCurrent = (period: DashaPeriod): boolean => {
    if (!period.start_utc || !period.end_utc) return false;
    return Date.parse(period.start_utc) <= now && now < Date.parse(period.end_utc);
  };

  return (
    <section className="card" aria-labelledby="dasha-heading">
      <header className="card__head">
        <h2 id="dasha-heading">{t('dasha')}</h2>
        <p className="card__sub">
          {(['maha', 'antar', 'pratyantar', 'sookshma'] as const)
            .filter((level) => current[level])
            .map((level) => `${t(level)}: ${tGraha(current[level]!.lord)}`)
            .join(' · ')}
        </p>
      </header>

      <ol className="dasha">
        {timeline.map((period) => (
          <DashaNode
            key={`${period.lord}-${period.start_utc}`}
            period={period}
            level={1}
            isCurrent={isCurrent(period)}
            timeZone={timeZone}
            locale={locale}
            numerals={numerals}
          />
        ))}
      </ol>
    </section>
  );
}

function DashaNode({
  period,
  level,
  isCurrent,
  timeZone,
  locale,
  numerals,
}: {
  period: DashaPeriod;
  level: number;
  isCurrent: boolean;
  timeZone: string;
  locale: string;
  numerals: NumeralSystem;
}) {
  const t = useTranslations('dasha');
  const tGraha = useTranslations('graha');
  const [children, setChildren] = useState<DashaPeriod[] | null>(null);
  const [loading, setLoading] = useState(false);
  const canExpand = level < 4;

  async function expand() {
    if (children || loading || !canExpand) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lord: period.lord,
        start_utc: period.start_utc ?? '',
        end_utc: period.end_utc ?? '',
        level: String(level),
      });
      const response = await fetch(`/api/dasha/subperiods?${params}`);
      setChildren(response.ok ? ((await response.json()) as DashaPeriod[]) : []);
    } finally {
      setLoading(false);
    }
  }

  const label = `${tGraha(period.lord)} — ${applyNumerals(
    `${localDate(period.start_utc, timeZone, locale)} → ${localDate(period.end_utc, timeZone, locale)}`,
    numerals,
  )}`;

  if (!canExpand) {
    return (
      <li className={isCurrent ? 'dasha__leaf is-current' : 'dasha__leaf'}>
        {label}
        {isCurrent ? <span className="today-marker">← {t('today')}</span> : null}
      </li>
    );
  }

  return (
    <li className={isCurrent ? 'dasha__node is-current' : 'dasha__node'}>
      <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void expand()}>
        <summary>
          <span className="dasha__label">{label}</span>
          {isCurrent ? <span className="today-marker">← {t('today')}</span> : null}
        </summary>
        {loading ? <p className="dasha__loading">…</p> : null}
        {children && children.length > 0 ? (
          <ol className="dasha dasha--nested">
            {children.map((child) => (
              <DashaNode
                key={`${child.lord}-${child.start_utc}`}
                period={child}
                level={level + 1}
                isCurrent={
                  !!child.start_utc &&
                  !!child.end_utc &&
                  Date.parse(child.start_utc) <= Date.now() &&
                  Date.now() < Date.parse(child.end_utc)
                }
                timeZone={timeZone}
                locale={locale}
                numerals={numerals}
              />
            ))}
          </ol>
        ) : null}
      </details>
    </li>
  );
}
