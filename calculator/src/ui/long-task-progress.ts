/**
 * Progress for a long server step with no progress events of its own — the CAD kernel run (20 s – several minutes).
 *
 * The bar used to jump to "20 % Running OCCT geometry engine…" and sit there for the whole wait: no time, no way out.
 * A percentage the server never reported would be invented, so the bar runs indeterminate while the server works, and
 * the line beside it states what IS known: the step, the elapsed time, and the allowance the server gives a file this
 * size (geometry-timeout.ts). Cancel aborts the request.
 *
 * Screen readers hear the step (aria-live on the label) — not a once-a-second clock (the elapsed time is aria-hidden).
 */

export interface LongTaskEls {
  wrap: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
  elapsed?: HTMLElement | null;
  hint?: HTMLElement | null;
  cancel?: HTMLButtonElement | null;
}

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "4 min 6 s" — how long the server allows, in words. */
export const fmtAllowance = (ms: number): string => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${r} s` : ''}` : `${r} s`;
};

export interface LongTask {
  /** A step whose share of the work is known (upload, done): the bar shows it. */
  determinate(pct: number, text: string): void;
  /** A step the server runs without reporting progress: the bar moves without claiming a percentage. */
  waiting(text: string, hint?: string): void;
  /** Stop the clock and release Cancel (call in `finally`). */
  end(): void;
}

export function startLongTask(els: LongTaskEls, onCancel: () => void): LongTask {
  const t0 = performance.now();
  const { wrap, fill, label, elapsed, hint, cancel } = els;
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-labelledby', label.id);
  label.setAttribute('aria-live', 'polite');
  elapsed?.setAttribute('aria-hidden', 'true');
  const tick = () => { if (elapsed) elapsed.textContent = fmtDuration(performance.now() - t0); };
  tick();
  const timer = window.setInterval(tick, 1000);
  const cancelHandler = () => { if (cancel) cancel.disabled = true; onCancel(); };
  if (cancel) { cancel.hidden = false; cancel.disabled = false; cancel.addEventListener('click', cancelHandler); }

  return {
    determinate(pct, text) {
      fill.classList.remove('is-indeterminate');
      fill.style.width = `${pct}%`;
      wrap.setAttribute('aria-valuenow', String(Math.round(pct)));
      wrap.setAttribute('aria-valuemin', '0');
      wrap.setAttribute('aria-valuemax', '100');
      wrap.setAttribute('aria-valuetext', text);
      label.textContent = text;
      if (hint) hint.textContent = '';
    },
    waiting(text, h) {
      fill.classList.add('is-indeterminate');
      fill.style.width = '';
      wrap.removeAttribute('aria-valuenow');
      wrap.setAttribute('aria-valuetext', text);
      label.textContent = text;
      if (hint) hint.textContent = h ?? '';
    },
    end() {
      window.clearInterval(timer);
      tick();
      fill.classList.remove('is-indeterminate');
      if (cancel) { cancel.removeEventListener('click', cancelHandler); cancel.hidden = true; }
    },
  };
}
