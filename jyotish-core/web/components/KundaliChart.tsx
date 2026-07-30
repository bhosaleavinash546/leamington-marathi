'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChartStyle } from '@/lib/api';

/**
 * A kundali chart, drawn from server-supplied SVG.
 *
 * The SVG comes from `render/chart_svg.py` — the same module the PDF sheet uses.
 * That is the point: CLAUDE.md 8 requires both layouts to print at A4 *and* to
 * appear on screen, and two implementations of the diamond geometry would
 * eventually disagree about where house 7 is. One implementation, two consumers.
 *
 * This component adds what a static image cannot: a house becomes selectable, and
 * the selection is announced. It does not redraw anything.
 *
 * `dangerouslySetInnerHTML` is used with server-generated markup that contains no
 * script (asserted by a Python test) and is served under a CSP that blocks
 * `script-src` from anywhere but self. The alternative — parsing the SVG into
 * React elements — would buy nothing and could silently drop attributes.
 */
export function KundaliChart({
  svg,
  tableHtml,
  style,
  onSelectHouse,
}: {
  svg: string;
  tableHtml: string;
  style: ChartStyle;
  onSelectHouse?: (house: number) => void;
}) {
  const t = useTranslations('ui');
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // The server marks each region with data-house; attach behaviour to those
    // rather than to coordinates, so a change to the geometry cannot break it.
    const regions = Array.from(root.querySelectorAll<SVGElement>('[data-house]'));
    const cleanups: Array<() => void> = [];

    for (const region of regions) {
      const house = Number(region.dataset.house);
      if (!Number.isFinite(house) || house < 1) continue;
      region.style.cursor = 'pointer';
      region.setAttribute('tabindex', '0');
      region.setAttribute('role', 'button');

      const activate = () => {
        setSelected(house);
        onSelectHouse?.(house);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      };
      region.addEventListener('click', activate);
      region.addEventListener('keydown', onKey);
      cleanups.push(() => {
        region.removeEventListener('click', activate);
        region.removeEventListener('keydown', onKey);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [svg, onSelectHouse]);

  // Reflect the selection into the markup so CSS can highlight it without a
  // re-render of the SVG string.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll<SVGElement>('[data-house]').forEach((region) => {
      region.classList.toggle('is-selected', Number(region.dataset.house) === selected);
    });
  }, [selected]);

  return (
    <figure className="kundali-figure">
      <div
        ref={containerRef}
        className={`kundali-svg kundali-svg--${style}`}
        // eslint-disable-next-line react/no-danger -- server-generated, script-free, CSP-guarded
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/*
        CLAUDE.md 8: "the diamond chart needs a semantic table alternative for
        screen readers." The table is always in the DOM so assistive technology
        reaches it regardless of the toggle; the toggle only controls visual
        display for sighted users who prefer it.
      */}
      <div className="kundali-table-wrap">
        <button
          type="button"
          className="link-button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((v) => !v)}
        >
          {t('screen_reader_table')}
        </button>
        <div
          id={tableId}
          className={showTable ? 'kundali-table' : 'kundali-table visually-hidden'}
          // eslint-disable-next-line react/no-danger -- server-generated table markup
          dangerouslySetInnerHTML={{ __html: tableHtml }}
        />
      </div>
    </figure>
  );
}
