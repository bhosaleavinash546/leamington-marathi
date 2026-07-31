'use client';

import { DURATION, EASE } from './motion';

/**
 * The राशी ⇄ नवमांश migration (DESIGN.md §4.2) — the app's one orchestrated moment.
 *
 * > When the user toggles between Rashi (D1) and Navamsa (D9), **each graha glyph
 * > travels from its D1 house to its D9 house**. Grahas whose house is unchanged
 * > do not move (they hold — which is itself information).
 *
 * §4.2 reaches for Motion's shared `layoutId`. That is not available here: the
 * chart is server-rendered SVG so that one implementation of the diamond geometry
 * serves both the screen and the PDF, and Motion cannot own elements it did not
 * render. The same FLIP is done directly — measure both states, then animate the
 * difference — which is what `layoutId` does underneath.
 *
 * The glyphs are cloned into an overlay rather than transformed in place. Two
 * reasons, and the second is the load-bearing one:
 *
 * 1. The grahas are `<tspan>`s inside an anchored `<text>`, and `transform` on a
 *    tspan is not something to rely on across engines.
 * 2. The two charts are separate SVG documents. A glyph has to leave one and
 *    arrive in the other, and nothing inside either can cross that boundary.
 *
 * So each travelling graha becomes an absolutely-positioned span over the page,
 * animated between two measured rectangles, and removed on arrival. The real
 * glyphs are hidden only while their clone is in flight.
 */

type Rect = { x: number; y: number };

/** Where each graha sits in a chart, in page coordinates. */
function positions(root: Element): Map<string, Rect> {
  const found = new Map<string, Rect>();
  for (const span of root.querySelectorAll<SVGTSpanElement>('.k-graha [data-graha]')) {
    const key = span.dataset.graha;
    if (!key) continue;
    const box = span.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    found.set(key, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }
  return found;
}

/** A glyph is "held" when its centre moves less than this. Sub-pixel jitter is not travel. */
const HOLD_EPSILON_PX = 1.5;

export type MigrationResult = {
  /** Grahas that travelled. */
  moved: string[];
  /** Grahas whose house was the same in both charts, and which therefore held. */
  held: string[];
};

/**
 * Fly each graha from where it is now to where it will be after `applyLayout`.
 *
 * The callback is the reason this is FLIP rather than a tween between two things
 * already on screen. Focusing one varga collapses the pair to a single column, so
 * the destination chart *moves* as part of the toggle. Measuring it beforehand
 * sends every graha to where D9 used to be and then snaps the layout underneath
 * them — which is what the first version did, and what the arrival assertion in
 * `migration.spec.ts` caught.
 *
 * So: measure First, let the layout settle, measure Last, then play. Under
 * reduced motion the layout still changes and nothing flies — §3.4 asks for "a
 * hard cut with a 120ms crossfade", which the slot's own opacity gives.
 */
export async function migrateGrahas(
  from: Element,
  to: Element,
  reduced: boolean,
  applyLayout: () => void,
): Promise<MigrationResult> {
  const start = positions(from);
  applyLayout();
  // One frame, so the collapsed layout is real before the destination is read.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const end = positions(to);
  const moved: string[] = [];
  const held: string[] = [];

  for (const [key, a] of start) {
    const b = end.get(key);
    if (!b) continue;
    const travelled = Math.hypot(b.x - a.x, b.y - a.y) > HOLD_EPSILON_PX;
    (travelled ? moved : held).push(key);
  }

  if (reduced || moved.length === 0) return { moved: [], held: [...held, ...moved] };

  const layer = document.createElement('div');
  layer.className = 'graha-flight';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  const flights: Animation[] = [];
  const hidden: SVGTSpanElement[] = [];

  for (const key of moved) {
    const a = start.get(key)!;
    const b = end.get(key)!;
    const source = from.querySelector<SVGTSpanElement>(`[data-graha="${CSS.escape(key)}"]`);
    const target = to.querySelector<SVGTSpanElement>(`[data-graha="${CSS.escape(key)}"]`);
    if (!source || !target) continue;

    const clone = document.createElement('span');
    clone.className = 'graha-flight__glyph';
    // Named, so a test (and a person with devtools open) can tell which graha is
    // in the air rather than counting anonymous spans.
    clone.dataset.graha = key;
    clone.textContent = source.textContent;
    clone.style.left = `${a.x + window.scrollX}px`;
    clone.style.top = `${a.y + window.scrollY}px`;
    layer.append(clone);

    // Both endpoints are hidden while the clone stands in for them, so the glyph
    // is never in two places at once.
    source.style.visibility = 'hidden';
    target.style.visibility = 'hidden';
    hidden.push(source, target);

    flights.push(
      clone.animate(
        [
          { transform: 'translate(-50%, -50%) translate(0px, 0px)' },
          { transform: `translate(-50%, -50%) translate(${b.x - a.x}px, ${b.y - a.y}px)` },
        ],
        {
          duration: DURATION.orch,
          easing: `cubic-bezier(${EASE.inOut.join(',')})`,
          fill: 'both',
        },
      ),
    );
  }

  await Promise.allSettled(flights.map((flight) => flight.finished));
  layer.remove();
  for (const element of hidden) element.style.visibility = '';
  return { moved, held };
}
