/**
 * One headline (UI/UX review, Oct 2026 — docs/ui/ui-ux-review-2026-10.md, item 1).
 *
 * The result showed the total twice, one above the other: in the sticky summary bar
 * (part name, total, actions) and in the large "Total should-cost" card with its band.
 * The summary bar keeps its job, holding the part name and the actions in view, but
 * it shows the £ figure only once the large card has scrolled out of sight. While the
 * card is on screen there is one number.
 */

let observer: IntersectionObserver | null = null;

/** Show the bar's figure only while the large total card is out of view. Call after each render. */
export function linkHeadline(doc: Document = document): void {
  const bar = doc.getElementById('cv-result-hero');
  const card = doc.querySelector<HTMLElement>('.cv-rhero');
  observer?.disconnect();
  observer = null;
  if (!bar) return;
  if (!card || typeof IntersectionObserver === 'undefined') { bar.classList.remove('crh-card-visible'); return; }
  // The bar is sticky at the top of the result: the card counts as seen only below it.
  const top = Math.round(bar.getBoundingClientRect().height) + 8;
  observer = new IntersectionObserver(entries => {
    for (const e of entries) bar.classList.toggle('crh-card-visible', e.isIntersecting);
  }, { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
  observer.observe(card);
}
