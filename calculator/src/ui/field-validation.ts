/**
 * Inline field validation (UI/UX review, Oct 2026, item 6).
 *
 * The numeric fields carry `min` / `max` (518 of 530), but nothing read them until
 * Calculate, and then only the engine's own warnings came back, in a box above the
 * form. A value is now checked as it is typed and when the field is left. The field
 * is marked (`aria-invalid`), and a message under it, linked by `aria-describedby`,
 * says what is wrong and the allowed range.
 *
 * It advises and does not block. The engine and the Calculate-time checks stay the
 * authority on what can be costed; this only shows the same limits sooner.
 */

type Msg = string | null;

/** Cost-specific checks a min/max cannot express. */
const RULES: Array<{ test: (el: HTMLInputElement) => boolean; check: (v: number) => Msg }> = [
  // A cycle or labour time of 0 makes that operation free, which is never what is meant.
  { test: el => /-(ct|cycle|cycle-time)$/.test(el.id), check: v => (v === 0 ? 'A time of 0 makes this operation cost nothing. Enter the time, or remove the operation.' : null) },
  // A finished part has weight.
  { test: el => /(^|-)net-wt$|(^|-)net-weight$|part-weight$/.test(el.id), check: v => (v === 0 ? 'A part weight of 0 prices no material.' : null) },
  { test: el => /annual-volume$/.test(el.id), check: v => (v === 0 ? 'An annual volume of 0 spreads tooling over no parts.' : null) },
];

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-GB') : String(n));

/** The message for a field, or null when the value is acceptable. */
export function fieldMessage(el: HTMLInputElement): Msg {
  if (el.type !== 'number' || el.disabled || el.readOnly) return null;
  if (el.validity.badInput) return 'Enter a number.';
  const raw = el.value.trim();
  if (raw === '') return el.required ? 'Required.' : null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return 'Enter a number.';
  const min = el.min !== '' ? Number(el.min) : null;
  const max = el.max !== '' ? Number(el.max) : null;
  if (min !== null && v < min) return max !== null ? `Must be between ${fmt(min)} and ${fmt(max)}.` : `Must be at least ${fmt(min)}.`;
  if (max !== null && v > max) return min !== null ? `Must be between ${fmt(min)} and ${fmt(max)}.` : `Must be at most ${fmt(max)}.`;
  for (const r of RULES) if (r.test(el)) { const m = r.check(v); if (m) return m; }
  return null;
}

/** Mark or clear one field. Returns true when it is valid. */
export function showFieldState(el: HTMLInputElement, doc: Document = document): boolean {
  const msg = fieldMessage(el);
  const msgId = `${el.id || 'f'}-cvmsg`;
  let box = el.id ? doc.getElementById(msgId) : null;
  if (!msg) {
    if (el.getAttribute('aria-invalid') === 'true') el.removeAttribute('aria-invalid');
    el.classList.remove('cv-field-invalid');
    if (box) {
      box.remove();
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(x => x && x !== msgId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
    }
    return true;
  }
  el.setAttribute('aria-invalid', 'true');
  el.classList.add('cv-field-invalid');
  if (!box) {
    box = doc.createElement('div');
    box.className = 'cv-field-msg';
    if (el.id) {
      box.id = msgId;
      const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      ids.add(msgId);
      el.setAttribute('aria-describedby', [...ids].join(' '));
    }
    el.insertAdjacentElement('afterend', box);
  }
  box.textContent = msg;
  return false;
}

/** Check every numeric field under `root`; returns the invalid ones. */
export function validateAll(root: ParentNode = document): HTMLInputElement[] {
  const bad: HTMLInputElement[] = [];
  root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(el => {
    if (el.offsetParent === null) return;   // hidden fields are not the engineer's to fix now
    if (!showFieldState(el)) bad.push(el);
  });
  return bad;
}

/** Validate as the engineer types (after a field has been left once) and on leaving it. */
export function initFieldValidation(doc: Document = document): void {
  const panel = doc.querySelector<HTMLElement>('#costing-view .input-panel') ?? doc.body;
  const touched = new WeakSet<HTMLInputElement>();
  panel.addEventListener('focusout', e => {
    const el = e.target as HTMLInputElement;
    if (el instanceof HTMLInputElement && el.type === 'number') { touched.add(el); showFieldState(el, doc); }
  });
  panel.addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    // Only fields already left once update live — no red while someone is still typing their first value —
    // but a field that is marked clears as soon as it is fixed.
    if (el instanceof HTMLInputElement && el.type === 'number' && (touched.has(el) || el.getAttribute('aria-invalid') === 'true')) showFieldState(el, doc);
  });
  // On Calculate every visible field is checked and marked, so nothing out of range goes unseen.
  // (No scroll: Calculate scrolls to the result.)
  doc.getElementById('calc-btn')?.addEventListener('click', () => { validateAll(panel); }, true);
}
