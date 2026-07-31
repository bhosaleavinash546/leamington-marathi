'use client';

import { DURATION, EASE } from './motion';

/**
 * The kundali draw-in (DESIGN.md §4.1).
 *
 * > 1. Outer square strokes in via `pathLength` 0→1, 380ms, `--ease-out`.
 * > 2. Internal diagonals follow, 220ms, offset 120ms.
 * > 3. House numbers fade in together, 160ms.
 * > 4. Graha glyphs stagger in **by house order 1→12**, 40ms apart, 180ms each,
 * >    opacity + 4px y-offset.
 *
 * Driven with the Web Animations API against the *server-rendered* SVG rather
 * than by re-authoring the chart in React. `render/chart_svg.py` is the single
 * implementation of the diamond geometry and the PDF shares it; a second one in
 * JSX would eventually disagree about where house 7 is, which is the reason the
 * chart is injected markup in the first place. Motion is not used here for the
 * same reason it is not used for page transitions — see `PageTransition`.
 *
 * Only `opacity`, `transform` and `stroke-dashoffset` are animated. The first two
 * are what §3.3 permits; `stroke-dashoffset` is the property `pathLength` exists
 * to drive, it is what "strokes in" means, and it composites without layout.
 */

/** §4.1's own timings. */
const FRAME_MS = 380;
const DIAGONAL_MS = 220;
const DIAGONAL_DELAY_MS = 120;
const NUMBERS_MS = 160;
const GLYPH_MS = 180;
const IDEAL_STAGGER_MS = 40;
const GLYPH_RISE_PX = 4;

/**
 * The four steps, laid end to end, do not fit the budget they are given.
 *
 * 380 + (120 + 220) + 160 + (11 × 40 + 180) leaves the last glyph landing near
 * 1120ms against `--dur-chart-draw`'s 800ms. So the glyph stagger begins as the
 * diagonals finish and overlaps the number fade, and the step is compressed if a
 * chart has enough occupied houses to overrun even then. The ceiling is the
 * token; 40ms is the intent.
 */
const GLYPH_START_MS = DIAGONAL_DELAY_MS + DIAGONAL_MS;

function staggerStep(count: number): number {
  if (count < 2) return IDEAL_STAGGER_MS;
  const available = DURATION.chartDraw - GLYPH_START_MS - GLYPH_MS;
  return Math.min(IDEAL_STAGGER_MS, Math.max(0, available / (count - 1)));
}

const EASE_OUT = `cubic-bezier(${EASE.out.join(',')})`;

/** Strokes a geometry element in from nothing. */
function strokeIn(element: SVGGeometryElement, duration: number, delay: number): Animation | null {
  // `getTotalLength` is the honest length for a rect, polygon or line in every
  // current engine; `pathLength="1"` is the fallback for anything that refuses,
  // and normalises the dasharray to the same 0..1 the spec describes.
  let length = 0;
  try {
    length = element.getTotalLength();
  } catch {
    length = 0;
  }
  if (!Number.isFinite(length) || length <= 0) {
    element.setAttribute('pathLength', '1');
    length = 1;
  }
  element.style.strokeDasharray = String(length);
  return element.animate(
    [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
    { duration, delay, easing: EASE_OUT, fill: 'backwards' },
  );
}

function fadeIn(element: Element, duration: number, delay: number, rise = 0): Animation {
  const from: Keyframe = { opacity: 0 };
  const to: Keyframe = { opacity: 1 };
  if (rise) {
    from.transform = `translateY(${rise}px)`;
    to.transform = 'translateY(0px)';
  }
  return (element as SVGElement).animate([from, to], {
    duration,
    delay,
    easing: EASE_OUT,
    fill: 'backwards',
  });
}

/**
 * Run the draw-in over an injected chart. Returns a cancel function.
 *
 * Does nothing and reports `false` when the reader has asked for reduced motion:
 * §3.4 says the chart "renders complete, instantly", which is what the SVG
 * already does without being touched.
 */
export function drawInChart(root: HTMLElement, reduced: boolean): () => void {
  if (reduced) return () => undefined;

  const animations: Animation[] = [];
  const frame = root.querySelector<SVGGeometryElement>('.k-frame');
  if (frame) {
    const animation = strokeIn(frame, FRAME_MS, 0);
    if (animation) animations.push(animation);
  }

  root.querySelectorAll<SVGGeometryElement>('.k-line').forEach((line) => {
    const animation = strokeIn(line, DIAGONAL_MS, DIAGONAL_DELAY_MS);
    if (animation) animations.push(animation);
  });

  // The rashi numbers and Ashtakavarga totals arrive together — they are the
  // chart's coordinates, and staggering them would imply an order they lack.
  root.querySelectorAll('.k-rashi, .k-sav, .k-lagna, .k-title').forEach((element) => {
    animations.push(fadeIn(element, NUMBERS_MS, GLYPH_START_MS));
  });

  // By house, ascending. The order is the reading sequence, so it is sorted
  // explicitly rather than left to document order.
  const glyphs = [...root.querySelectorAll<SVGElement>('.k-graha')].sort(
    (a, b) => Number(a.dataset.house ?? 0) - Number(b.dataset.house ?? 0),
  );
  const step = staggerStep(glyphs.length);
  glyphs.forEach((glyph, index) => {
    animations.push(fadeIn(glyph, GLYPH_MS, GLYPH_START_MS + index * step, GLYPH_RISE_PX));
  });

  return () => animations.forEach((animation) => animation.cancel());
}

/**
 * Whether this chart has already been drawn (§4.1's "Guard it").
 *
 * > fire only on first mount per chart id. Re-render, tab return, locale switch
 * > and theme switch must not replay it.
 *
 * `sessionStorage`, not a module-level Set, because a locale switch is a full
 * document navigation in this app — the locale links are plain anchors — and a
 * module variable does not survive that. It would replay on exactly one of the
 * four cases the spec names, which is the kind of guard that looks right until
 * someone changes their language.
 *
 * The key must not include the locale or the numeral system: those change the
 * glyphs, not the chart, and a reader switching language is not looking at a new
 * chart.
 */
const STORAGE_PREFIX = 'kundali:drawn:';

export function markDrawn(chartId: string): boolean {
  try {
    const key = STORAGE_PREFIX + chartId;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    // Private mode, or storage disabled. Drawing once per mount is a better
    // failure than never drawing at all.
    return true;
  }
}
