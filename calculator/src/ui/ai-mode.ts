/**
 * Whether this installation has AI, and hiding what needs it when it does not.
 *
 * AI is usable when the air gap is off (AIR_GAPPED unset) and the server has an
 * ANTHROPIC_API_KEY. Until then the AI entry points are hidden and every costing
 * path works without them; AIR_GAPPED=1 still switches AI off deliberately.
 *
 * Before this module the interface could not tell — /api/health did not
 * report it — so the no-AI build led with AI start cards, a chat bubble and an
 * "AI Cost Intelligence" tagline, and every AI click ended in "add an API key",
 * the one thing the policy forbids.
 *
 * The server's answer sets <html data-ai="off">. CSS then hides everything
 * marked `.ai-only`, and text marked `data-ai-off-text` is swapped for that
 * text. Nothing is removed from the DOM, so switching AI back on is a server
 * setting, not a rebuild.
 *
 * The last answer is remembered in this browser so a reload does not flash the
 * AI entry points before the health check returns. The server stays the
 * authority: every AI route refuses on its own when air-gapped.
 */
import { apiBase } from '../api-base.js';

const STORE_KEY = 'cv-ai-off';

function remembered(): boolean {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

function remember(off: boolean): void {
  try { off ? localStorage.setItem(STORE_KEY, '1') : localStorage.removeItem(STORE_KEY); } catch { /* storage blocked */ }
}

let aiOff = remembered();

/** True when this installation has AI switched off. */
export function isAiOff(): boolean { return aiOff; }

function swapText(off: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-ai-off-text]').forEach(el => {
    if (el.dataset.aiOnText === undefined) el.dataset.aiOnText = el.textContent ?? '';
    el.textContent = off ? el.dataset.aiOffText! : el.dataset.aiOnText;
  });
}

/** Apply the current state to the page. Safe to call again after new markup renders. */
export function applyAiMode(): void {
  if (aiOff) document.documentElement.setAttribute('data-ai', 'off');
  else document.documentElement.removeAttribute('data-ai');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => swapText(aiOff), { once: true });
  } else {
    swapText(aiOff);
  }
}

applyAiMode();

/** Resolves once the server has answered (or failed to); the value is isAiOff(). */
export const aiModeReady: Promise<boolean> = fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(5000) })
  .then(r => (r.ok ? r.json() : null))
  .then((h: { airGapped?: boolean; aiAvailable?: boolean } | null) => {
    // No answer is not an answer: keep whatever was last known.
    if (!h || typeof h.airGapped !== 'boolean') return aiOff;
    // AI is off when it is switched off (air-gapped) OR not set up yet (no key).
    // Without the second half, an installation with the air gap removed but no key
    // led with AI buttons that each ended in "API key not configured". Add a key,
    // restart the server, and the AI entry points appear on the next load.
    const off = h.airGapped || h.aiAvailable === false;
    if (off !== aiOff) { aiOff = off; applyAiMode(); }
    remember(aiOff);
    return aiOff;
  })
  .catch(() => aiOff);
