/**
 * Full-width workspace when the result lives in the form (PCB review, Oct 2026).
 *
 * At ≥ 1280 px the costing workspace is two panes: inputs left, the 8-bucket result
 * right (saas-polish.css F1). The PCB photo → cost result, the CAD-to-cost analysis,
 * the AI agent and the automotive-software model render INSIDE the form area, so in
 * the two-pane layout they were squeezed into the ~460 px input column while the
 * right pane said "No costing yet". When the form area holds one of those, the
 * workspace goes back to one full-width column.
 */
const WIDE_COMMODITIES = new Set(['cad_analysis', 'ai_agent', 'automotive_software']);
const WIDE_RESULTS = ['#pcb-img-results', '#cad-results', '#agent-messages'];

export function updateFormWide(activeCommodity: string, doc: Document = document): void {
  const area = doc.getElementById('commodity-form-area');
  const hasResult = !!area && WIDE_RESULTS.some(sel => {
    const el = area.querySelector(sel);
    return !!el && el.children.length > 0;
  });
  doc.body.classList.toggle('cv-form-wide', WIDE_COMMODITIES.has(activeCommodity) || hasResult);
}

/** Keep the layout right as results are injected into, or cleared from, the form area. */
export function watchFormWide(getCommodity: () => string, doc: Document = document): void {
  const area = doc.getElementById('commodity-form-area');
  if (!area) return;
  let t: ReturnType<typeof setTimeout> | null = null;
  new MutationObserver(() => {
    if (t) return;
    t = setTimeout(() => { t = null; updateFormWide(getCommodity(), doc); }, 50);
  }).observe(area, { childList: true, subtree: true });
  updateFormWide(getCommodity(), doc);
}
