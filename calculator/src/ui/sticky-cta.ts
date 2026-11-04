/**
 * The form's sticky action bar (Calculate, More) covers whatever scrolls under it. CAD to COST's "Get cost" row is made
 * sticky just above it (saas-polish.css `.cad-get-cost-row`), which needs the bar's real height: it wraps and changes
 * with the buttons shown, so it is measured, not assumed (fresh review, Nov 2026 — the button showed only its top edge).
 */
export function watchActionBarHeight(doc: Document = document): void {
  const bar = doc.querySelector<HTMLElement>('.input-panel .cv-sticky-actions');
  if (!bar) return;
  const set = () => doc.documentElement.style.setProperty('--cv-actions-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  set();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(set).observe(bar);
}
