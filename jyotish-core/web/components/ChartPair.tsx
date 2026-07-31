'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { KundaliChart } from './KundaliChart';
import { useMotionPreferences } from './MotionProvider';
import { migrateGrahas } from '@/lib/migrate';
import type { ChartStyle } from '@/lib/api';

/**
 * राशी and नवमांश together, and the toggle that moves between them (§4.2).
 *
 * Both charts stay side by side: CLAUDE.md 8 requires it on the main view, and a
 * practitioner reads them as a pair. The toggle is an *additional* way to look —
 * §7 makes it the primary one on mobile, where the two do not fit — and it is
 * what carries the migration.
 *
 * "Compare" is the resting state. Choosing राशी or नवमांश flies each graha from
 * where it sits in one chart to where it sits in the other, then leaves that
 * chart alone. Grahas in the same house in both do not move; §4.2 is explicit
 * that holding still is itself information, and the count is announced so that
 * information is not carried by motion alone (§8).
 */
export function ChartPair({
  rashiSvg,
  rashiTable,
  navamsaSvg,
  navamsaTable,
  style,
  chartKey,
}: {
  rashiSvg: string;
  rashiTable: string;
  navamsaSvg: string;
  navamsaTable: string;
  style: ChartStyle;
  chartKey: string;
}) {
  const chart = useTranslations('chart');
  const { reduced } = useMotionPreferences();
  const [focus, setFocus] = useState<'both' | 'D1' | 'D9'>('both');
  const [flying, setFlying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const rashiRef = useRef<HTMLDivElement>(null);
  const navamsaRef = useRef<HTMLDivElement>(null);

  const show = async (next: 'both' | 'D1' | 'D9') => {
    if (next === focus || flying) return;
    const from = next === 'D9' ? rashiRef.current : navamsaRef.current;
    const to = next === 'D9' ? navamsaRef.current : rashiRef.current;

    // The migration is D1 <-> D9, and only that.
    //
    // Arriving from "compare" is a layout change, not a journey: the two charts
    // are side by side there and both move as the pair collapses to one column,
    // so every graha would appear to travel and the ones §4.2 wants to *hold*
    // would be indistinguishable. Once focused the two charts share a box, and a
    // graha in the same house in both genuinely does not move.
    const isMigration = focus !== 'both' && next !== 'both';
    if (isMigration && from && to) {
      setFlying(true);
      const { moved, held } = await migrateGrahas(from, to, reduced, () => {
        // Synchronous, so the destination is measured in the layout the glyphs
        // are actually flying into rather than the one they are leaving.
        flushSync(() => setFocus(next));
      });
      setAnnouncement(
        held.length
          ? `${moved.length} · ${held.length} ${chart('unchanged')}`
          : String(moved.length),
      );
      setFlying(false);
      return;
    }
    setFocus(next);
  };

  const options = [
    { key: 'both', label: chart('compare') },
    { key: 'D1', label: chart('rashi_chart') },
    { key: 'D9', label: chart('navamsa_chart') },
  ] as const;

  return (
    <>
      <fieldset className="toolbar__group varga-toggle">
        <legend>{chart('varga')}</legend>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={focus === option.key}
            onClick={() => void show(option.key)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      {/* The migration's outcome in words. Motion is never the only channel. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={`charts charts--${focus}`}>
        <div ref={rashiRef} className="charts__slot" data-varga="D1">
          <KundaliChart
            svg={rashiSvg}
            tableHtml={rashiTable}
            style={style}
            chartId={`${chartKey}:D1`}
          />
        </div>
        <div ref={navamsaRef} className="charts__slot" data-varga="D9">
          <KundaliChart
            svg={navamsaSvg}
            tableHtml={navamsaTable}
            style={style}
            chartId={`${chartKey}:D9`}
          />
        </div>
      </div>
    </>
  );
}
