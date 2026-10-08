export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type ToastType = 'error' | 'warning' | 'info';

const TOAST_MAX = 3;
const TOAST_MS: Record<ToastType, number> = { info: 6000, warning: 8000, error: 10000 };
const TOAST_ICON: Record<ToastType, string> = { info: 'ℹ', warning: '⚠', error: '✕' };

function toastRegion(): HTMLElement {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'cv-toasts';
    c.setAttribute('role', 'region');
    c.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(c);
  }
  return c;
}

function closeToast(t: HTMLElement): void {
  if (t.classList.contains('is-leaving')) return;
  window.clearTimeout(Number(t.dataset.timer));
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { t.remove(); return; }
  t.classList.add('is-leaving');
  t.addEventListener('animationend', () => t.remove(), { once: true });
  window.setTimeout(() => t.remove(), 400);   // in case no animation runs
}

/**
 * ONE toast for the whole app (motion review, Oct 2026). There were two copies — this one and main.ts's — with
 * hard-coded hex colours, no screen-reader announcement, no way to close one and no limit. Now: theme colours, an
 * error is an `alert` and the rest are `status` (announced), a close button, the timer pauses while the pointer or
 * focus is on it, at most three at once, and the same message again restarts its timer instead of stacking.
 */
export function showToast(message: string, type: ToastType = 'info'): void {
  const region = toastRegion();
  const same = Array.from(region.querySelectorAll<HTMLElement>('.cv-toast:not(.is-leaving)'))
    .find(t => t.dataset.msg === message && t.dataset.type === type);
  const arm = (t: HTMLElement) => {
    window.clearTimeout(Number(t.dataset.timer));
    t.dataset.timer = String(window.setTimeout(() => closeToast(t), TOAST_MS[type]));
  };
  if (same) { arm(same); return; }

  const t = document.createElement('div');
  t.className = `cv-toast cv-toast--${type}`;
  t.dataset.msg = message;
  t.dataset.type = type;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.innerHTML = `<span class="cv-toast-icon" aria-hidden="true">${TOAST_ICON[type]}</span>`
    + `<span class="cv-toast-msg">${escHtml(message)}</span>`
    + '<button type="button" class="cv-toast-close" aria-label="Dismiss notification">×</button>';
  t.querySelector('.cv-toast-close')!.addEventListener('click', () => closeToast(t));
  const pause = () => window.clearTimeout(Number(t.dataset.timer));
  t.addEventListener('mouseenter', pause);
  t.addEventListener('focusin', pause);
  t.addEventListener('mouseleave', () => arm(t));
  t.addEventListener('focusout', () => arm(t));
  region.appendChild(t);
  arm(t);
  const live = region.querySelectorAll<HTMLElement>('.cv-toast:not(.is-leaving)');
  for (let i = 0; i < live.length - TOAST_MAX; i++) closeToast(live[i]);
}
