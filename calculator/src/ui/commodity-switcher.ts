/**
 * Searchable commodity switcher (UI/UX review, Oct 2026, item 5).
 *
 * The form opened under a row of 21+ commodity pills (two rows before the review,
 * then one scrolling row). The panel header's commodity name is now the switcher:
 * click it (or press Alt+C) and type to filter, then use ↑ ↓ and Enter.
 *
 * It lists the page's own `.ctab` buttons and clicks the chosen one, so a switch
 * runs exactly the code the pills ran. The pills stay in the DOM, hidden, while the
 * header is on screen; where the header is hidden the pills show as before.
 */

interface Item { id: string; label: string; hint: string; btn: HTMLElement }

const shown = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).display !== 'none';

export function initCommoditySwitcher(doc: Document = document): void {
  const head = doc.querySelector<HTMLElement>('#wf-panel-header .wf-panel-commodity');
  const icon = doc.getElementById('wf-panel-icon');
  const name = doc.getElementById('wf-panel-name');
  if (!head || !icon || !name || doc.getElementById('cv-switch-btn')) return;

  // The icon and the name move INTO the button — their ids stay, so the code that sets them still does.
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.id = 'cv-switch-btn';
  btn.className = 'cv-switch-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = 'Change commodity (Alt+C)';
  btn.append(icon, name);
  btn.insertAdjacentHTML('beforeend', '<svg class="cv-switch-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
  const pop = doc.createElement('div');
  pop.className = 'cv-switch-pop';
  pop.id = 'cv-switch-pop';
  pop.innerHTML = `
    <input type="search" class="cv-switch-q" id="cv-switch-q" placeholder="Search commodities…" autocomplete="off"
      role="combobox" aria-expanded="true" aria-controls="cv-switch-list" aria-autocomplete="list" aria-label="Search commodities">
    <ul class="cv-switch-list" id="cv-switch-list" role="listbox" aria-label="Commodities"></ul>`;
  head.replaceChildren(btn, pop);
  head.classList.add('cv-switch');
  doc.body.classList.add('cv-has-switcher');

  const q = pop.querySelector<HTMLInputElement>('#cv-switch-q')!;
  const list = pop.querySelector<HTMLUListElement>('#cv-switch-list')!;
  let items: Item[] = [];
  let cursor = 0;

  const collect = (): Item[] => Array.from(doc.querySelectorAll<HTMLElement>('#commodity-tabs .ctab[data-commodity]'))
    .filter(b => !b.classList.contains('ai-only') || shown(b))
    .map(b => ({ id: b.dataset.commodity!, label: (b.textContent ?? '').replace(/✦/g, '').trim(), hint: (b.title ?? '').split(/[—.]/)[0]!.trim(), btn: b }));

  const render = () => {
    const term = q.value.trim().toLowerCase();
    const active = doc.querySelector<HTMLElement>('#commodity-tabs .ctab.active')?.dataset.commodity;
    const match = items.filter(i => !term || i.label.toLowerCase().includes(term) || i.hint.toLowerCase().includes(term) || i.id.includes(term.replace(/\s+/g, '_')));
    cursor = Math.min(cursor, Math.max(0, match.length - 1));
    list.replaceChildren(...match.map((i, n) => {
      const li = doc.createElement('li');
      li.id = `cv-switch-opt-${i.id}`;
      li.setAttribute('role', 'option');
      li.dataset.commodity = i.id;
      li.setAttribute('aria-selected', String(n === cursor));
      if (i.id === active) li.classList.add('is-current');
      const t = doc.createElement('span'); t.className = 'cv-switch-label'; t.textContent = i.label;
      li.append(t);
      if (i.hint && i.hint.toLowerCase() !== i.label.toLowerCase()) {
        const h = doc.createElement('span'); h.className = 'cv-switch-hint'; h.textContent = i.hint; li.append(h);
      }
      if (i.id === active) { const c = doc.createElement('span'); c.className = 'cv-switch-cur'; c.textContent = 'current'; li.append(c); }
      return li;
    }));
    if (!match.length) {
      const li = doc.createElement('li'); li.className = 'cv-switch-empty'; li.textContent = 'No commodity matches';
      list.append(li);
    }
    const sel = list.querySelector<HTMLElement>('[aria-selected="true"]');
    q.setAttribute('aria-activedescendant', sel?.id ?? '');
    sel?.scrollIntoView({ block: 'nearest' });
  };

  const open = (v: boolean) => {
    pop.dataset.open = String(v);
    btn.setAttribute('aria-expanded', String(v));
    if (v) {
      items = collect();
      const active = doc.querySelector<HTMLElement>('#commodity-tabs .ctab.active')?.dataset.commodity;
      q.value = '';
      cursor = Math.max(0, items.findIndex(i => i.id === active));
      render();
      q.focus();
    }
  };
  const choose = (id: string | undefined) => {
    const it = items.find(i => i.id === id);
    open(false);
    btn.focus();
    if (it) it.btn.click();
  };

  btn.addEventListener('click', e => { e.stopPropagation(); open(pop.dataset.open !== 'true'); });
  q.addEventListener('input', () => { cursor = 0; render(); });
  q.addEventListener('keydown', e => {
    const n = list.querySelectorAll('[role="option"]').length;
    if (e.key === 'ArrowDown') { cursor = n ? (cursor + 1) % n : 0; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cursor = n ? (cursor - 1 + n) % n : 0; render(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(list.querySelector<HTMLElement>('[aria-selected="true"]')?.dataset.commodity); e.preventDefault(); }
    else if (e.key === 'Escape') { open(false); btn.focus(); e.preventDefault(); e.stopPropagation(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the search box
  list.addEventListener('click', e => choose((e.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.commodity));
  doc.addEventListener('click', e => { if (!head.contains(e.target as Node)) open(false); });
  doc.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && doc.body.classList.contains('cv-new-costing')) { e.preventDefault(); open(true); }
  });
}
