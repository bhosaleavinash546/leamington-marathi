/**
 * A country switch on a finished result (CAD to COST fresh review, Nov 2026).
 *
 * Switching the header country re-runs the rules in the new country's book and re-costs; that takes 3–8 s on a CAD
 * part. Meanwhile the screen redrew the OLD costing converted to the new currency (the bracket read ¥81.16 — £9.14 at the
 * yuan rate — before the China costing's ¥37.69), then a blank headline while the form was refilled, and a stamp that
 * mixed the two ("United Kingdom rate book v2.2.0-CN"). A figure that is wrong for seconds gets screenshotted.
 *
 * While the re-cost is in flight every money figure of the result is hidden behind one labelled placeholder
 * ("Re-costing in China…", an indeterminate bar and the elapsed time — never a percentage nobody reported), and the
 * final figure appears once, when the costing in the new book has been drawn. Money never animates (motion policy).
 */
import { startLongTask, type LongTask } from './long-task-progress.js';

const ID = 'cv-recost-pending';

/** The placeholder's markup (pure — the label is escaped). */
export function recostPlaceholderHtml(countryName: string): string {
  const name = String(countryName).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `<div class="cv-recost-h"><span id="${ID}-label">Re-costing in ${name}…</span>`
    + `<span class="cv-recost-elapsed" id="${ID}-elapsed"></span></div>`
    + `<div class="cv-recost-bar" id="${ID}-bar"><div class="cad-progress-fill cv-recost-fill is-indeterminate" id="${ID}-fill"></div></div>`
    + `<p class="cv-recost-note">The figures will show once the part has been costed with the ${name} rate book — `
    + 'the rules re-run in that country (tools, services, energy), then the cost. Nothing from the previous country is shown meanwhile.</p>';
}

let task: LongTask | null = null;
let token = 0;

/** Hide the result's money and show the placeholder. Returns a token: only the matching `endRecost` clears it. */
export function beginRecost(countryName: string, doc: Document = document): number {
  token++;
  const panel = doc.querySelector<HTMLElement>('.results-panel');
  doc.documentElement.dataset.recosting = '1';
  let box = doc.getElementById(ID);
  if (!box && panel) {
    box = doc.createElement('div');
    box.id = ID;
    box.className = 'cv-recost';
    box.setAttribute('role', 'status');
    panel.insertBefore(box, panel.firstChild);
  }
  if (box) {
    task?.end();
    box.innerHTML = recostPlaceholderHtml(countryName);
    const wrap = doc.getElementById(`${ID}-bar`), fill = doc.getElementById(`${ID}-fill`), label = doc.getElementById(`${ID}-label`);
    if (wrap && fill && label) {
      task = startLongTask({ wrap, fill, label, elapsed: doc.getElementById(`${ID}-elapsed`) }, () => {});
      task.waiting(label.textContent ?? '');
    }
  }
  return token;
}

/** Show the result again — only for the re-cost that is still the latest (a second switch supersedes the first). */
export function endRecost(t: number, doc: Document = document): void {
  if (t !== token) return;
  task?.end();
  task = null;
  delete doc.documentElement.dataset.recosting;
  doc.getElementById(ID)?.remove();
}

/** True while a country re-cost is in flight. */
export function recosting(doc: Document = document): boolean {
  return doc.documentElement.dataset.recosting === '1';
}
