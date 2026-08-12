import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDfmMotion } from './motion';

export interface NavSection {
  id: string;
  label: string;
  /** A live count shown beside the label — findings, routes, rows. */
  count?: number | null;
  /** Draws the count in the alert colour: something here needs attention. */
  alert?: boolean;
}

/**
 * THE RESULTS NAVIGATOR.
 *
 * A finished analysis is four screens of scrolling — findings, geometry,
 * routes, the drawing check, DFA. Everything was reachable and nothing was
 * FINDABLE: a reader in a review could not jump to the routes table without
 * hunting for it, and could not tell from any one screen what else the report
 * held.
 *
 * This bar names every section with its real count, jumps to it, and tracks
 * the scroll position so the reader always knows where they are. The moving
 * pill is one shared-layout element rather than four toggling highlights,
 * which is what makes the transit read as travel.
 */
export default function SectionNav({ sections }: { sections: NavSection[] }) {
  const m = useDfmMotion();
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    if (!sections.length) return;
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => !!n);
    if (!nodes.length) return;

    // Scroll-spy: the topmost section intersecting the band just under the
    // sticky chrome wins. `rootMargin` moves the trip-wire down past the app
    // header + this bar so the highlight changes when a section reaches the
    // reading position, not when it grazes the viewport edge.
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActive(visible[0].target.id);
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 },
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    // 128px clears the app header and this bar. `smooth` is the browser's own
    // scroll behaviour, which already honours the reduced-motion setting.
    const top = el.getBoundingClientRect().top + window.scrollY - 128;
    window.scrollTo({ top, behavior: m.reduced ? 'auto' : 'smooth' });
  };

  if (sections.length < 2) return null;

  return (
    <nav aria-label="Report sections" className="flex items-center gap-1 overflow-x-auto">
      {sections.map((s) => {
        const on = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            aria-current={on ? 'true' : undefined}
            className="relative px-2.5 py-1.5 rounded-lg shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
          >
            {on && (
              <motion.span
                layoutId="dfm-section-active"
                transition={m.layout}
                className="absolute inset-0 rounded-lg bg-white/[0.07] ring-1 ring-white/10"
                aria-hidden="true"
              />
            )}
            <span className={`relative text-xs font-medium whitespace-nowrap ${on ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {s.label}
              {s.count !== null && s.count !== undefined && (
                <span className={`ml-1.5 dfm-num ${s.alert ? 'text-red-400' : 'text-slate-600'}`}>{s.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
