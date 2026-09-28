/**
 * Accessibility glue for markup the app generates.
 *
 * 1. Field names. Every commodity form puts a visible <label> beside its input
 *    inside a .field-group, but without `for`, so a screen reader announced
 *    "edit text" and "combo box" — 18 unnamed fields and 8 unnamed selects on
 *    the machining form alone (axe: label, select-name). The forms are built
 *    as template strings in ~200 places; rather than touch each one, any field
 *    with no accessible name is tied to the label in its field group when it
 *    appears. A field that already has a name is never changed.
 *
 * 2. Escape closes the topmost open dialog, through that dialog's own close
 *    button so its close logic runs. The Help Centre ignored Escape.
 */

const FIELDS = 'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea';
let seq = 0;

function hasName(f: HTMLElement): boolean {
  if (f.getAttribute('aria-label')?.trim() || f.getAttribute('aria-labelledby')) return true;
  if (f.closest('label')) return true;
  const id = f.id;
  return !!id && !!document.querySelector(`label[for="${CSS.escape(id)}"]`);
}

function nameField(f: HTMLElement): void {
  if (hasName(f)) return;
  const group = f.closest('.field-group, .form-group, .field');
  const label = group?.querySelector('label');
  if (label && !label.contains(f) && label.textContent?.trim()) {
    if (!label.id) label.id = `cv-lbl-${++seq}`;
    f.setAttribute('aria-labelledby', label.id);
    return;
  }
  // Editable tables (PCBA BOM, paint coats): named by the column header and
  // the row, e.g. "Ref Des, row 2".
  const cell = f.closest('td');
  const table = cell?.closest('table');
  if (cell && table) {
    const col = Array.from(cell.parentElement!.children).indexOf(cell);
    const head = table.querySelector('thead tr')?.children[col]?.textContent?.trim();
    const body = cell.parentElement!.parentElement!;
    const row = Array.from(body.children).indexOf(cell.parentElement!) + 1;
    if (head) { f.setAttribute('aria-label', `${head}, row ${row}`); return; }
  }
  const fallback = f.getAttribute('placeholder') || f.getAttribute('title');
  if (fallback) f.setAttribute('aria-label', fallback);
}

export function nameFields(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(FIELDS).forEach(nameField);
  if (root instanceof HTMLElement && root.matches(FIELDS)) nameField(root);
}

let pending = false;
const added: Node[] = [];
function schedule(nodes: NodeList): void {
  nodes.forEach(n => { if (n.nodeType === 1) added.push(n); });
  if (pending || !added.length) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    for (const n of added.splice(0)) if ((n as Element).isConnected) nameFields(n as Element);
  });
}

/** The visible dialog on top: the last matching one in the document. */
function topDialog(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]'))
    .filter(d => getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().height > 0);
  return open[open.length - 1] ?? null;
}

function closeButtonOf(d: HTMLElement): HTMLElement | null {
  return d.querySelector<HTMLElement>(
    '[id^="close-"], [id$="-close"], [id$="-close-btn"], [aria-label^="Close" i], [title^="Close" i], .modal-close');
}

export function initA11y(): void {
  nameFields();
  new MutationObserver(ms => ms.forEach(m => schedule(m.addedNodes)))
    .observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const d = topDialog();
    const close = d && closeButtonOf(d);
    if (close) { close.click(); e.preventDefault(); }
  });
}
