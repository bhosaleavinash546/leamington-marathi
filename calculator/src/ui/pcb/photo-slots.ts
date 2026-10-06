/**
 * The eight PCB photo slots (top, bottom, six IC close-ups).
 *
 * They used to be eight identical dashed boxes: nothing said which one the analysis needs,
 * which helps, and which is optional. Now they are two groups — the board's two SIDES
 * (top required, bottom recommended; larger tiles, each with its own colour) and the IC
 * CLOSE-UPS (optional, numbered) — and every tile has an empty, hover / focus, drop-target
 * and filled state, styled from theme tokens for light and dark (pcb-photo-slots.css).
 *
 * The ids are unchanged (`pcb-img-slot-N`, `pcb-img-input-N`, `pcb-img-thumb-N`,
 * `pcb-img-remove-N`, `pcb-img-slot-empty-N`, `pcb-img-slot-filled-N`): main.ts and the e2e
 * harnesses drive them by id. Pure builder + two small state helpers; no main.ts state.
 */
import '../styles/pcb-photo-slots.css';

type Kind = 'top' | 'bottom' | 'closeup';
interface SlotDef { idx: number; kind: Kind; title: string; hint: string; badge: string; icon: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;

function defs(labels: string[]): SlotDef[] {
  return labels.map((label, idx) => idx === 0
    ? { idx, kind: 'top', title: label, hint: 'Component side — the main photo', badge: 'Required', icon: 'i-camera' }
    : idx === 1
      ? { idx, kind: 'bottom', title: label, hint: 'Flip the board over', badge: 'Recommended', icon: 'i-layers' }
      : { idx, kind: 'closeup', title: label, hint: 'IC markings, sharp', badge: String(idx - 1), icon: 'i-cpu' });
}

function tile(d: SlotDef): string {
  const what = d.kind === 'closeup' ? `${d.title} (optional) — a sharp photo of one chip's markings` : `${d.title} (${d.badge.toLowerCase()})`;
  return `
  <div id="pcb-img-slot-${d.idx}" class="pcb-slot pcb-slot--${d.kind}" data-kind="${d.kind}"
       role="button" tabindex="0" aria-label="Add ${esc(what)} photo" title="Click or drop a photo: ${esc(what)}">
    <input type="file" id="pcb-img-input-${d.idx}" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-hidden="true" style="display:none"/>
    <div id="pcb-img-slot-empty-${d.idx}" class="pcb-slot__empty">
      <span class="pcb-slot__badge">${esc(d.badge)}</span>
      <span class="pcb-slot__icon">${icon(d.icon)}</span>
      <span class="pcb-slot__title">${esc(d.title)}</span>
      ${d.kind === 'closeup' ? '' : `<span class="pcb-slot__hint">${esc(d.hint)}</span>`}
      <span class="pcb-slot__add">${icon('i-plus')}<span>${d.kind === 'closeup' ? 'Add' : 'Add photo'}</span></span>
    </div>
    <div id="pcb-img-slot-filled-${d.idx}" class="pcb-slot__filled" style="display:none">
      <img id="pcb-img-thumb-${d.idx}" alt="${esc(d.title)} photo" class="pcb-slot__thumb"/>
      <span class="pcb-slot__ok" aria-hidden="true">${icon('i-check-circle')}</span>
      <div class="pcb-slot__caption"><span>${esc(d.title)}</span><span class="pcb-slot__replace">Replace</span></div>
      <button type="button" id="pcb-img-remove-${d.idx}" class="pcb-slot__remove" title="Remove this photo" aria-label="Remove ${esc(d.title)} photo">×</button>
    </div>
  </div>`;
}

/** The slot groups. `labels` is PCB_SLOT_LABELS (slot 0 = top, 1 = bottom, 2–7 = close-ups). */
export function photoSlotsHtml(labels: string[]): string {
  const all = defs(labels);
  const sides = all.filter(d => d.kind !== 'closeup');
  const close = all.filter(d => d.kind === 'closeup');
  return `
  <div class="pcb-slots">
    <div role="group" class="pcb-slots__group" aria-labelledby="pcb-slots-sides-h">
      <div class="pcb-slots__head">
        <span id="pcb-slots-sides-h" class="pcb-slots__label">Board sides</span>
        <span class="pcb-slots__sub">Whole board, square on, filling the frame</span>
      </div>
      <div class="pcb-slots__row pcb-slots__row--sides">${sides.map(tile).join('')}</div>
    </div>
    <div role="group" class="pcb-slots__group" aria-labelledby="pcb-slots-close-h">
      <div class="pcb-slots__head">
        <span id="pcb-slots-close-h" class="pcb-slots__label">IC close-ups <em>optional</em></span>
        <span class="pcb-slots__sub">One chip per photo — readable part markings raise accuracy</span>
      </div>
      <div class="pcb-slots__row pcb-slots__row--close">${close.map(tile).join('')}</div>
    </div>
  </div>`;
}

/** Filled / empty look of a slot (replaces the old inline border colours). */
export function markPhotoSlot(slot: HTMLElement | null, filled: boolean): void {
  if (!slot) return;
  slot.classList.toggle('is-filled', filled);
  const title = slot.querySelector('.pcb-slot__title')?.textContent ?? 'photo';
  slot.setAttribute('aria-label', filled ? `${title} photo added — activate to replace` : `Add ${title} photo`);
}

/** Keyboard and per-slot drop: Enter / Space opens the picker; a photo dropped on a slot goes in THAT slot. */
export function wirePhotoSlot(slot: HTMLElement | null, open: () => void, put: (f: File) => void): void {
  if (!slot) return;
  slot.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === slot) { e.preventDefault(); open(); }
  });
  slot.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); slot.classList.add('is-drop'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('is-drop'));
  slot.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    slot.classList.remove('is-drop');
    const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith('image/'));
    if (f) put(f);
  });
}
