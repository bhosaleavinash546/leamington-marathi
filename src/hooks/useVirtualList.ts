import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeRange, prefixOffsets, type VirtualRange } from '../lib/virtual-range';

/**
 * WINDOW-SCROLLED VIRTUAL LIST, VARIABLE ROW HEIGHTS.
 *
 * The marketplace holds ~1,600 idea cards of different heights (an expanded
 * card is taller). Rendering them all made ~3,000 DOM nodes and an 18,000 px
 * page, and the September 2026 review's "Show more" button was a stopgap.
 * This renders only the rows near the viewport plus an overscan band, with
 * two spacers standing in for the rest, so scrolling reads the same and the
 * scrollbar is honest.
 *
 * Heights are MEASURED, not assumed: each rendered row reports its border
 * box through one shared ResizeObserver, the cache is keyed by the row's id
 * (so a sort does not invalidate it), and unmeasured rows use the estimate.
 * The row element must carry its own gap as padding, because a margin is
 * outside the border box and would not be measured. The page itself scrolls
 * (window), not an inner box — the list sits below the filters.
 */
export function useVirtualList<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  { estimate = 240, overscan = 600 }: { estimate?: number; overscan?: number } = {},
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [version, setVersion] = useState(0);
  const [view, setView] = useState({ scrollTop: 0, viewport: typeof window !== 'undefined' ? window.innerHeight : 900 });

  // Where the reader is, relative to the list's top. rAF-throttled.
  useEffect(() => {
    let frame: number | null = null;
    const read = () => {
      frame = null;
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = { scrollTop: window.scrollY - top, viewport: window.innerHeight };
      setView(v => (v.scrollTop === next.scrollTop && v.viewport === next.viewport ? v : next));
    };
    const onScroll = () => { if (frame == null) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame != null) cancelAnimationFrame(frame); };
  }, []);

  // One observer for every rendered row. A changed height re-renders once
  // per frame, not once per row.
  const pending = useRef<number | null>(null);
  const observer = useMemo(() => {
    if (typeof ResizeObserver === 'undefined') return null;
    return new ResizeObserver(entries => {
      let changed = false;
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.vkey;
        if (!key) continue;
        const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).getBoundingClientRect().height);
        if (h > 0 && heightsRef.current.get(key) !== h) { heightsRef.current.set(key, h); changed = true; }
      }
      if (changed && pending.current == null) pending.current = requestAnimationFrame(() => { pending.current = null; setVersion(n => n + 1); });
    });
  }, []);
  useEffect(() => () => { observer?.disconnect(); if (pending.current != null) cancelAnimationFrame(pending.current); }, [observer]);

  // A stable callback ref per key, so React can tell us which node left.
  const refs = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const measure = useCallback((key: string) => {
    let fn = refs.current.get(key);
    if (!fn) {
      fn = (el) => {
        if (!observer) return;
        const prev = nodes.current.get(key);
        if (el) { if (prev !== el) { if (prev) observer.unobserve(prev); observer.observe(el); nodes.current.set(key, el); } }
        else if (prev) { observer.unobserve(prev); nodes.current.delete(key); }
      };
      refs.current.set(key, fn);
    }
    return fn;
  }, [observer]);

  const heights = useMemo(
    () => items.map(it => heightsRef.current.get(getKey(it)) ?? estimate),
    // `version` is the measurement generation: a new height must recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, getKey, estimate, version],
  );
  const offsets = useMemo(() => prefixOffsets(heights), [heights]);
  const range: VirtualRange = useMemo(() => computeRange(offsets, view.scrollTop, view.viewport, overscan), [offsets, view, overscan]);

  return { containerRef, range, measure, rows: items.slice(range.start, range.end) as T[] };
}
