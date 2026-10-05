/**
 * A visible "working" state for actions that take a second or more (UI/UX review,
 * Oct 2026, item 4). CAD "Apply to form" fills the form once per comparison country
 * before the costed one, which takes about 1–1.5 s. Nothing showed during that time,
 * and a Calculate pressed during it costed a half-filled form.
 *
 * The strip is announced to screen readers (role=status) and sits outside the
 * commodity form, which is redrawn several times while the fills run.
 */
export function beginBusy(message: string, doc: Document = document): () => void {
  const panel = doc.querySelector<HTMLElement>('#costing-view .input-panel') ?? doc.body;
  doc.getElementById('cv-busy')?.remove();
  const strip = doc.createElement('div');
  strip.id = 'cv-busy';
  strip.className = 'cv-busy';
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.innerHTML = `<span class="cv-busy-spin" aria-hidden="true"></span><span></span>`;
  (strip.lastElementChild as HTMLElement).textContent = message;
  panel.prepend(strip);
  panel.setAttribute('aria-busy', 'true');
  const calc = doc.getElementById('calc-btn') as HTMLButtonElement | null;
  const wasDisabled = calc?.disabled ?? false;
  if (calc) calc.disabled = true;
  return () => {
    strip.remove();
    panel.removeAttribute('aria-busy');
    if (calc) calc.disabled = wasDisabled;
  };
}
