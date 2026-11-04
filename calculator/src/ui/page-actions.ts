/**
 * Page actions without inline handlers (CAD to COST fresh review, Nov 2026 — P0).
 *
 * The server sends helmet's default Content-Security-Policy, whose `script-src-attr 'none'` blocks every inline event
 * handler attribute (`onclick="…"`, `oninput="…"`). On auth.html "Create a free account" and the OTP "Verify Code" were
 * inline `onclick` handlers: in production they did nothing ("Executing inline event handler violates the following
 * Content Security Policy directive…") and a new user could not get in.
 *
 * A control names its action in data attributes instead, and ONE delegated listener per page runs it:
 *   - `data-cv-action="name"` (+ any `data-*` arguments) — run on click;
 *   - `data-cv-input="name"` — run on every input event of that field.
 * The handlers are passed in by the page (auth-page.ts, main.ts), so this module knows no page.
 * `tests/no-inline-handlers.test.ts` fails on any inline handler in a served page or a template string.
 */

export type PageActionHandler = (el: HTMLElement, ev: Event) => void;

/** The action a click (or input) event asks for, read off the nearest element that names one. */
export function actionTarget(ev: Event, attr: 'cv-action' | 'cv-input'): { name: string; el: HTMLElement } | null {
  const t = ev.target as Element | null;
  const el = t && typeof (t as Element).closest === 'function'
    ? (t as Element).closest<HTMLElement>(`[data-${attr}]`) : null;
  if (!el) return null;
  const name = attr === 'cv-action' ? el.dataset.cvAction : el.dataset.cvInput;
  return name ? { name, el } : null;
}

/**
 * Wire the page's actions with one delegated listener for clicks and one for input. Returns a function that removes
 * them. An action with no handler is ignored (a page lists only the actions it has).
 */
export function installPageActions(
  handlers: Readonly<Record<string, PageActionHandler>>,
  root: Document | HTMLElement = document,
): () => void {
  const onClick = (ev: Event): void => {
    const hit = actionTarget(ev, 'cv-action');
    if (!hit) return;
    const h = handlers[hit.name];
    if (!h) return;
    // A link used as a button must not navigate (the inline handlers ended with `return false`).
    if (hit.el.tagName === 'A') ev.preventDefault();
    h(hit.el, ev);
  };
  const onInput = (ev: Event): void => {
    const hit = actionTarget(ev, 'cv-input');
    if (!hit) return;
    handlers[hit.name]?.(hit.el, ev);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
  };
}

/** Inline handler attributes (`onclick=`, `oninput=` …) in an HTML document or template — what the CSP blocks. */
export const INLINE_HANDLER_RE = /<[a-z][^<>]*\son(?:click|dblclick|submit|change|input|keydown|keyup|keypress|load|error|focus|blur|mouseover|mouseout|mouseenter|mouseleave|mousedown|mouseup)\s*=\s*["'\\]/gi;

export function inlineHandlers(html: string): string[] {
  return [...html.matchAll(INLINE_HANDLER_RE)].map(m => m[0].slice(0, 120));
}
