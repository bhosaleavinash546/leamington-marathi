/**
 * Page-shell behaviour from the UI/UX review (Oct 2026) — docs/ui/ui-ux-review-2026-10.md.
 *
 *  - The form's action bar showed up to 11 equal-weight buttons on two rows; it now keeps
 *    the primary action (Calculate) and Load Example in view and groups the rest — report,
 *    save, tools — in a "More" menu. The buttons are MOVED, not copied: their ids, handlers
 *    and the code that shows / hides them after a calculation are unchanged.
 *  - The header's bare "Sign Out" becomes an account menu (who is signed in, rate library,
 *    help, sign out), the SaaS convention.
 *  - Tables that scroll sideways get a keyboard stop and a name (WCAG 2.1.1 — axe
 *    `scrollable-region-focusable` on the operations, detail and insight tables).
 */

export const ACTION_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Report', ids: ['export-excel-btn', 'export-pdf-btn', 'export-all-pdf-btn', 'export-card-btn'] },
  { label: 'Save', ids: ['save-library-btn', 'save-scenario-btn', 'log-actual-btn'] },
  { label: 'Tools', ids: ['calibration-btn', 'rates-btn'] },
];

const isShown = (el: HTMLElement) => el.style.display !== 'none';

/** Group the action bar's secondary buttons into a "More" menu. Idempotent. */
export function initActionMenu(doc: Document = document): void {
  const bar = doc.querySelector<HTMLElement>('.cv-sticky-actions');
  if (!bar || bar.querySelector('.cv-more')) return;
  const wrap = doc.createElement('div');
  wrap.className = 'cv-more';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-secondary cv-more-btn';
  toggle.id = 'cv-more-btn';
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'cv-more-menu');
  toggle.innerHTML = 'More <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const menu = doc.createElement('div');
  menu.className = 'cv-more-menu';
  menu.id = 'cv-more-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'More actions');
  const labels: HTMLElement[] = [];
  ACTION_GROUPS.forEach((g, i) => {
    const btns = g.ids.map(id => doc.getElementById(id)).filter((b): b is HTMLElement => !!b);
    if (!btns.length) return;
    if (i > 0) { const sep = doc.createElement('div'); sep.className = 'cv-more-sep'; sep.dataset.group = g.label; menu.appendChild(sep); }
    const lab = doc.createElement('div');
    lab.className = 'cv-more-label'; lab.textContent = g.label; lab.dataset.group = g.label;
    labels.push(lab);
    menu.appendChild(lab);
    for (const b of btns) { b.setAttribute('role', 'menuitem'); b.dataset.group = g.label; menu.appendChild(b); }
  });
  wrap.append(toggle, menu);
  bar.appendChild(wrap);

  const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(isShown);
  const open = (v: boolean) => {
    // A group whose buttons are all hidden (exports before a result) shows no heading.
    for (const lab of labels) {
      const any = items().some(b => b.dataset.group === lab.dataset.group);
      lab.style.display = any ? '' : 'none';
      const sep = menu.querySelector<HTMLElement>(`.cv-more-sep[data-group="${lab.dataset.group}"]`);
      if (sep) sep.style.display = any ? '' : 'none';
    }
    menu.dataset.open = String(v);
    toggle.setAttribute('aria-expanded', String(v));
    if (v) items()[0]?.focus();
  };
  toggle.addEventListener('click', e => { e.stopPropagation(); open(menu.dataset.open !== 'true'); });
  menu.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[role="menuitem"]')) open(false); });
  doc.addEventListener('click', e => { if (!wrap.contains(e.target as Node)) open(false); });
  menu.addEventListener('keydown', e => {
    const list = items(); const i = list.indexOf(doc.activeElement as HTMLElement);
    if (e.key === 'Escape') { open(false); toggle.focus(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { list[(i + 1) % list.length]?.focus(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { list[(i - 1 + list.length) % list.length]?.focus(); e.preventDefault(); }
  });
}

/** Replace the header's bare "Sign Out" with an account menu. */
export function initAccountMenu(signOut: () => void, doc: Document = document): void {
  const old = doc.querySelector<HTMLElement>('header button[onclick="signOut()"], button[onclick="signOut()"]');
  if (!old || doc.querySelector('.cv-account')) return;
  let name = '', email = '';
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user') || '{}') as { fullName?: string; email?: string };
    name = (u.fullName ?? '').trim(); email = (u.email ?? '').trim();
  } catch { /* no stored user */ }
  const initials = (name || email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?';
  const wrap = doc.createElement('div');
  wrap.className = 'cv-account';
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  wrap.innerHTML = `
    <button type="button" class="cv-account-btn" id="cv-account-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="cv-account-menu" aria-label="Account: ${esc(name || email || 'signed in')}">
      <span class="cv-avatar" aria-hidden="true">${esc(initials)}</span><span class="cv-account-name">${esc(name.split(' ')[0] || 'Account')}</span>
    </button>
    <div class="cv-account-menu" id="cv-account-menu" role="menu" aria-label="Account">
      <div class="cv-account-head"><strong>${esc(name || 'Signed in')}</strong>${email ? `<span>${esc(email)}</span>` : ''}</div>
      <button type="button" role="menuitem" data-act="rates">Rate library</button>
      <button type="button" role="menuitem" data-act="help">Help centre</button>
      <button type="button" role="menuitem" data-act="signout">Sign out</button>
    </div>`;
  old.replaceWith(wrap);
  const btn = wrap.querySelector<HTMLButtonElement>('#cv-account-btn')!;
  const menu = wrap.querySelector<HTMLElement>('#cv-account-menu')!;
  const open = (v: boolean) => { menu.dataset.open = String(v); btn.setAttribute('aria-expanded', String(v)); if (v) menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); };
  btn.addEventListener('click', e => { e.stopPropagation(); open(menu.dataset.open !== 'true'); });
  doc.addEventListener('click', e => { if (!wrap.contains(e.target as Node)) open(false); });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { open(false); btn.focus(); } });
  menu.addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    open(false);
    if (act === 'signout') signOut();
    if (act === 'help') doc.getElementById('help-btn')?.click();
    if (act === 'rates') doc.getElementById('rates-btn')?.click();
  });
}

/** Give every sideways-scrolling table region a keyboard stop and a name. */
export function enhanceScrollRegions(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('table, [style*="overflow"], .ops-table, .detail-table').forEach(el => {
    if (el.hasAttribute('data-scroll-region')) return;
    const cs = getComputedStyle(el);
    const scrolls = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (!scrolls) return;
    if (el.querySelector('a, button, input, select, textarea, [tabindex]')) return;   // already reachable
    el.tabIndex = 0;
    el.setAttribute('data-scroll-region', '');
    if (!el.getAttribute('role')) el.setAttribute('role', 'region');
    if (!el.getAttribute('aria-label')) {
      const head = el.closest('section, .card, div')?.querySelector('h2, h3, h4, .section-title, caption');
      el.setAttribute('aria-label', (head?.textContent ?? 'Table').trim().slice(0, 80) + ' (scrolls sideways)');
    }
  });
}

/** Keep scroll regions accessible as results render (debounced). */
export function watchScrollRegions(doc: Document = document): void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => { t = null; enhanceScrollRegions(doc); };
  new MutationObserver(() => { if (!t) t = setTimeout(run, 300); }).observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => { if (!t) t = setTimeout(run, 300); });
}
