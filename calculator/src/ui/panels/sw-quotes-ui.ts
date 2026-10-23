/**
 * Supplier quotes, the licence register and your own modules (improvement round, 14 Oct 2026).
 *
 * The Range Rover review found 77 % of the total resting on unsourced catalogue figures — cloud, map data, the OS
 * placeholder, IP licences — and vehicle software the catalogue has no module for. Here the user replaces those with
 * figures they stand behind:
 *   · Quotes card (Setup): cloud £ per connected vehicle-year, each royalty, each IP licence — every value with its
 *     source (the engine refuses a quote without one). A set of quotes is saved as a reusable LICENCE REGISTER (a project
 *     of kind 'sw_licence_register') and applied to any programme.
 *   · Your modules card (Scope): a module the catalogue lacks, with the user's nominal effort and its source.
 * Both write `SWProgramInputs.quotes` / `customModules`; the engine (swModuleDefs) does the rest. Inputs are £.
 */
import { SW_MODULES, SW_CLOUD_REFERENCE_FLEET, swModuleDefs, type SWProgramInputs, type SWQuotes, type SWCustomModule, type SWCategory,
  type ASILLevel, type SWComplexity, type SWReuse, type SWCal } from '../../engine/sw-should-cost.js';
import { SW_CATALOGUE_GAP_DEFS } from '../../engine/sw-should-cost.js';
import { projectStore } from '../project-store.js';

export const SW_REGISTER_KIND = 'sw_licence_register';

export interface QuotesHost {
  get(): SWProgramInputs;
  /** Write a patch into the programme and re-cost. */
  set(patch: Partial<SWProgramInputs>): void;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (v: string): number | undefined => { const t = v.trim(); if (t === '') return undefined; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const CATS: Array<[SWCategory, string]> = (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as SWCategory[]).map(c => [c, SW_MODULES.find(m => m.category === c)?.categoryLabel ?? c]);

// ── Quotes and the licence register ─────────────────────────────────────────────────────────────────────────────────

/** Rows the card offers: the cloud rate, each in-scope royalty (built / per year), each in-scope IP licence. */
function quoteRows(p: SWProgramInputs) {
  const cat = new Map(SW_MODULES.map(m => [m.id, m]));
  const on = p.modules.filter(m => m.enabled && cat.has(m.moduleId)).map(m => cat.get(m.moduleId)!);
  const cloudCat = on.reduce((a, d) => a + d.annualCloudCostGBP, 0) / SW_CLOUD_REFERENCE_FLEET;
  return {
    cloudCat,
    royalties: on.flatMap(d => [
      ...(d.perVehicleRoyaltyGBP ? [{ id: d.id, name: d.name, kind: 'built' as const, cat: d.perVehicleRoyaltyGBP, unit: 'per vehicle built' }] : []),
      ...(d.perVehiclePerYearGBP ? [{ id: d.id, name: d.name, kind: 'year' as const, cat: d.perVehiclePerYearGBP, unit: 'per vehicle-year' }] : []),
    ]),
    ip: on.filter(d => d.annualIPLicenceGBP > 0).sort((a, b) => b.annualIPLicenceGBP - a.annualIPLicenceGBP).map(d => ({ id: d.id, name: d.name, kind: 'ip' as const, cat: d.annualIPLicenceGBP, unit: 'a year' })),
  };
}

function rowHTML(key: string, label: string, catalogue: string, value: number | undefined, source: string | undefined): string {
  return `<tr data-q-row="${esc(key)}">
    <th scope="row">${esc(label)}</th><td class="sw-num">${esc(catalogue)}</td>
    <td><label class="sr-only" for="swq-${esc(key)}-v">${esc(label)} — your quote, £</label><input id="swq-${esc(key)}-v" class="sw-config-inp swq-v" type="number" min="0" step="0.01" value="${value ?? ''}" placeholder="catalogue" data-no-live></td>
    <td><label class="sr-only" for="swq-${esc(key)}-s">${esc(label)} — source of the quote</label><input id="swq-${esc(key)}-s" class="sw-config-inp swq-s" type="text" value="${esc(source ?? '')}" placeholder="supplier, quote ref, date" data-no-live></td>
  </tr>`;
}

export function quotesCardHTML(p: SWProgramInputs): string {
  const q = p.quotes ?? {}, rows = quoteRows(p);
  const mq = (id: string) => q.modules?.[id];
  const nQuoted = (q.cloudPerVehicleYear ? 1 : 0) + Object.values(q.modules ?? {}).reduce((a, m) => a + (m.perVehicleBuilt ? 1 : 0) + (m.perVehicleYear ? 1 : 0) + (m.annualIP ? 1 : 0), 0);
  return `<h3 class="swk-h">Supplier quotes &amp; licence register</h3>
    <p class="swk-sub">A typed quote replaces the catalogue's unsourced figure and is reported as <strong>your figure</strong>, with its source. Leave a value blank to keep the catalogue. Values in £. <span id="swq-count">${nQuoted} quoted</span>.</p>
    <div class="swc-tw"><table class="sw-data-table swq-table">
      <thead><tr><th scope="col">Line</th><th scope="col" class="sw-num">Catalogue £</th><th scope="col">Your quote £</th><th scope="col">Source</th></tr></thead>
      <tbody>
        ${rowHTML('cloud', 'Cloud back-end, per connected vehicle-year', rows.cloudCat.toFixed(2), q.cloudPerVehicleYear?.value, q.cloudPerVehicleYear?.source)}
        ${rows.royalties.map(r => rowHTML(`${r.id}~${r.kind}`, `${r.name} — royalty ${r.unit}`, r.cat.toFixed(2), r.kind === 'built' ? mq(r.id)?.perVehicleBuilt?.value : mq(r.id)?.perVehicleYear?.value,
          r.kind === 'built' ? mq(r.id)?.perVehicleBuilt?.source : mq(r.id)?.perVehicleYear?.source)).join('')}
      </tbody></table></div>
    <details class="swq-ip"><summary>IP licences — ${rows.ip.length} modules in scope (£ a year)</summary>
      <div class="swc-tw"><table class="sw-data-table swq-table"><thead><tr><th scope="col">Module</th><th scope="col" class="sw-num">Catalogue £ / yr</th><th scope="col">Your quote £ / yr</th><th scope="col">Source</th></tr></thead>
      <tbody>${rows.ip.map(r => rowHTML(`${r.id}~ip`, r.name, r.cat.toLocaleString('en-GB'), mq(r.id)?.annualIP?.value, mq(r.id)?.annualIP?.source)).join('')}</tbody></table></div>
    </details>
    <div class="swk-row swq-reg">
      <label class="sw-label" for="swq-reg-name" style="margin:0">Licence register</label>
      <input id="swq-reg-name" class="sw-config-inp" type="text" placeholder="name, e.g. JLR 2026 licence register" style="max-width:260px" data-no-live>
      <button type="button" class="swk-btn" id="swq-reg-save">Save these quotes as a register</button>
      <label class="sr-only" for="swq-reg-pick">Saved registers</label>
      <select id="swq-reg-pick" class="sw-config-sel" style="max-width:240px" data-no-live><option value="">Saved registers…</option></select>
      <button type="button" class="swk-btn" id="swq-reg-apply">Apply</button>
      <span class="swk-sub" id="swq-reg-msg" role="status" style="margin:0"></span>
    </div>`;
}

/** Read every quote row back into an SWQuotes (a blank value drops the quote). */
export function readQuotes(root: HTMLElement): SWQuotes {
  const out: SWQuotes = {};
  root.querySelectorAll<HTMLTableRowElement>('tr[data-q-row]').forEach(tr => {
    const key = tr.dataset.qRow!, v = num(tr.querySelector<HTMLInputElement>('.swq-v')?.value ?? ''), source = tr.querySelector<HTMLInputElement>('.swq-s')?.value.trim() ?? '';
    if (v === undefined) return;
    const lq = { value: v, source };
    if (key === 'cloud') { out.cloudPerVehicleYear = lq; return; }
    const [id, kind] = key.split('~');
    const m = (out.modules ??= {})[id] ??= {};
    if (kind === 'built') m.perVehicleBuilt = lq; else if (kind === 'year') m.perVehicleYear = lq; else m.annualIP = lq;
  });
  return out;
}

export function wireQuotesCard(root: HTMLElement, host: QuotesHost): void {
  const commit = () => {
    const quotes = readQuotes(root);
    host.set({ quotes: Object.keys(quotes).length ? quotes : undefined });
    const c = root.querySelector('#swq-count');
    if (c) c.textContent = `${(quotes.cloudPerVehicleYear ? 1 : 0) + Object.values(quotes.modules ?? {}).reduce((a, m) => a + Object.keys(m).length, 0)} quoted`;
  };
  root.addEventListener('change', e => { if ((e.target as HTMLElement).closest('tr[data-q-row]')) commit(); });
  const msg = (t: string) => { const m = root.querySelector('#swq-reg-msg'); if (m) m.textContent = t; };
  const pick = root.querySelector<HTMLSelectElement>('#swq-reg-pick');
  let registers: Array<{ id: string; name: string; data: unknown }> = [];
  const loadRegisters = async () => {
    try { registers = await projectStore.list(SW_REGISTER_KIND); } catch { registers = []; }
    if (pick) pick.innerHTML = `<option value="">Saved registers…</option>${registers.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}`;
  };
  void loadRegisters();
  root.querySelector('#swq-reg-save')?.addEventListener('click', async () => {
    const name = root.querySelector<HTMLInputElement>('#swq-reg-name')?.value.trim() ?? '';
    const quotes = readQuotes(root);
    if (!name) { msg('Name the register first.'); return; }
    if (!Object.keys(quotes).length) { msg('Enter at least one quote first.'); return; }
    const missing = [quotes.cloudPerVehicleYear, ...Object.values(quotes.modules ?? {}).flatMap(m => Object.values(m))].filter(x => x && !x.source.trim()).length;
    if (missing) { msg(`${missing} quote${missing === 1 ? ' has' : 's have'} no source — add where each figure comes from.`); return; }
    try {
      await projectStore.save({ id: `swreg-${Date.now().toString(36)}`, kind: SW_REGISTER_KIND, name, data: quotes });
      msg(`Saved "${name}"${projectStore.mode() === 'cloud' ? ' to your account' : ' in this browser'}.`);
      await loadRegisters();
    } catch { msg('Could not save the register.'); }
  });
  root.querySelector('#swq-reg-apply')?.addEventListener('click', () => {
    const r = registers.find(x => x.id === pick?.value);
    if (!r) { msg('Pick a saved register.'); return; }
    // A register covers modules this programme may not have: only quotes for modules it can cost are kept.
    const reg = r.data as SWQuotes, p = host.get(), defs = swModuleDefs(p);
    const modules = Object.fromEntries(Object.entries(reg.modules ?? {}).filter(([id]) => defs.has(id)));
    host.set({ quotes: { ...(reg.cloudPerVehicleYear ? { cloudPerVehicleYear: reg.cloudPerVehicleYear } : {}), ...(Object.keys(modules).length ? { modules } : {}) } });
    root.innerHTML = quotesCardHTML(host.get());
    wireQuotesCard(root, host);
    const m2 = root.querySelector('#swq-reg-msg'); if (m2) m2.textContent = `Applied "${r.name}".`;
  });
}

// ── Your modules ────────────────────────────────────────────────────────────────────────────────────────────────────

const opt = (vals: readonly string[], sel: string) => vals.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

export function customModulesCardHTML(p: SWProgramInputs): string {
  const cm = p.customModules ?? [];
  const inp = (id: string) => p.modules.find(m => m.moduleId === id);
  const rows = cm.map((c, i) => {
    const m = inp(c.id);
    const f = (k: string, label: string, html: string) => `<td><label class="sr-only" for="swc-${i}-${k}">${esc(c.name)} — ${label}</label>${html}</td>`;
    return `<tr data-c-row="${esc(c.id)}">
      ${f('on', 'in scope', `<input id="swc-${i}-on" type="checkbox" class="swc-on"${m?.enabled ? ' checked' : ''}>`)}
      ${f('name', 'name', `<input id="swc-${i}-name" class="sw-config-inp swc-name" type="text" value="${esc(c.name)}">`)}
      ${f('cat', 'domain', `<select id="swc-${i}-cat" class="sw-config-sel swc-cat">${CATS.map(([v, l]) => `<option value="${v}"${v === c.category ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      ${f('pm', 'nominal person-months', `<input id="swc-${i}-pm" class="sw-config-inp swc-pm" type="number" min="0" step="1" value="${c.nominalPersonMonths}">`)}
      ${f('asil', 'ASIL', `<select id="swc-${i}-asil" class="sw-config-sel swc-asil">${opt(['QM', 'A', 'B', 'C', 'D'], m?.asil ?? c.defaultAsil)}</select>`)}
      ${f('cx', 'complexity', `<select id="swc-${i}-cx" class="sw-config-sel swc-cx">${opt(['Low', 'Medium', 'High', 'Very High'], m?.complexity ?? c.defaultComplexity)}</select>`)}
      ${f('reuse', 'reuse', `<select id="swc-${i}-reuse" class="sw-config-sel swc-reuse">${opt(['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'], m?.reuse ?? 'Fresh')}</select>`)}
      ${f('cal', 'cybersecurity CAL', `<select id="swc-${i}-cal" class="sw-config-sel swc-cal">${opt(['none', 'CAL1', 'CAL2', 'CAL3', 'CAL4'], m?.cal ?? c.defaultCal ?? 'none')}</select>`)}
      ${f('roy', 'royalty £ per vehicle', `<input id="swc-${i}-roy" class="sw-config-inp swc-roy" type="number" min="0" step="0.01" value="${c.perVehicleRoyaltyGBP ?? ''}" placeholder="0">`)}
      ${f('src', 'source of the effort figure', `<input id="swc-${i}-src" class="sw-config-inp swc-src" type="text" value="${esc(c.source)}">`)}
      ${f('gap', 'catalogue gap it covers', `<select id="swc-${i}-gap" class="sw-config-sel swc-gap"><option value="">— none —</option>${SW_CATALOGUE_GAP_DEFS.map(g => `<option value="${g.id}"${g.id === c.coversGap ? ' selected' : ''}>${esc(g.head)}</option>`).join('')}</select>`)}
      <td><button type="button" class="swk-link swc-del" aria-label="Remove ${esc(c.name)}">Remove</button></td>
    </tr>`;
  }).join('');
  return `<h3 class="swk-h">Your modules — software the catalogue does not have</h3>
    <p class="swk-sub">Name it, pick its domain and give its nominal effort (person-months of fresh code at QM / Medium complexity — ASIL, complexity and reuse apply on top) and where that figure comes from. Testing, integration, maintenance and calibration follow the median of the catalogue's modules in the same domain. With no effort it costs nothing — nothing is assumed.</p>
    ${cm.length ? `<div class="swc-tw"><table class="sw-data-table swc-table"><thead><tr><th scope="col">In</th><th scope="col">Module</th><th scope="col">Domain</th><th scope="col">Nominal PM</th><th scope="col">ASIL</th><th scope="col">Complexity</th><th scope="col">Reuse</th><th scope="col">CAL</th><th scope="col">Royalty £ / veh</th><th scope="col">Source</th><th scope="col">Covers catalogue gap</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    <div class="swk-row swc-add">
      <label class="sw-label" for="swc-new-name" style="margin:0">Add</label>
      <input id="swc-new-name" class="sw-config-inp" type="text" list="swc-gaps" placeholder="e.g. Occupant restraint (airbag) control" style="max-width:300px" data-no-live>
      <datalist id="swc-gaps">${SW_CATALOGUE_GAP_DEFS.map(g => `<option value="${esc(g.head)}">`).join('')}</datalist>
      <label class="sr-only" for="swc-new-cat">Domain</label><select id="swc-new-cat" class="sw-config-sel" style="max-width:220px" data-no-live>${CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <button type="button" class="swk-btn" id="swc-add">Add module</button>
      <span class="swk-sub" id="swc-msg" role="status" style="margin:0"></span>
    </div>`;
}

/** Read the table back: the user's modules and their module inputs. */
function readCustom(root: HTMLElement, p: SWProgramInputs): Pick<SWProgramInputs, 'customModules' | 'modules'> {
  const custom: SWCustomModule[] = [];
  let modules = p.modules.filter(m => !m.moduleId.startsWith('custom-'));
  root.querySelectorAll<HTMLTableRowElement>('tr[data-c-row]').forEach(tr => {
    const id = tr.dataset.cRow!, v = <T extends HTMLInputElement | HTMLSelectElement>(c: string) => tr.querySelector<T>(`.${c}`)!;
    const prev = p.customModules?.find(c => c.id === id);
    const roy = num(v<HTMLInputElement>('swc-roy').value);
    custom.push({ id, name: v<HTMLInputElement>('swc-name').value.trim(), category: v<HTMLSelectElement>('swc-cat').value as SWCategory,
      nominalPersonMonths: num(v<HTMLInputElement>('swc-pm').value) ?? 0, defaultAsil: v<HTMLSelectElement>('swc-asil').value as ASILLevel,
      defaultComplexity: v<HTMLSelectElement>('swc-cx').value as SWComplexity, defaultCal: v<HTMLSelectElement>('swc-cal').value as SWCal,
      ...(roy !== undefined ? { perVehicleRoyaltyGBP: roy } : {}), ...(prev?.annualIPLicenceGBP !== undefined ? { annualIPLicenceGBP: prev.annualIPLicenceGBP } : {}),
      source: v<HTMLInputElement>('swc-src').value.trim(),
      ...(v<HTMLSelectElement>('swc-gap')?.value ? { coversGap: v<HTMLSelectElement>('swc-gap').value } : {}) });
    modules = [...modules, { moduleId: id, enabled: v<HTMLInputElement>('swc-on').checked, asil: v<HTMLSelectElement>('swc-asil').value as ASILLevel,
      complexity: v<HTMLSelectElement>('swc-cx').value as SWComplexity, reuse: v<HTMLSelectElement>('swc-reuse').value as SWReuse,
      cal: v<HTMLSelectElement>('swc-cal').value as SWCal, customPersonMonths: null }];
  });
  return { customModules: custom.length ? custom : undefined, modules };
}

export function wireCustomModulesCard(root: HTMLElement, host: QuotesHost): void {
  const redraw = () => { root.innerHTML = customModulesCardHTML(host.get()); wireCustomModulesCard(root, host); };
  root.addEventListener('change', e => { if ((e.target as HTMLElement).closest('tr[data-c-row]')) host.set(readCustom(root, host.get())); }, { once: false });
  root.querySelectorAll<HTMLButtonElement>('.swc-del').forEach(b => b.addEventListener('click', () => {
    b.closest('tr')?.remove();
    host.set(readCustom(root, host.get()));
    redraw();
  }));
  root.querySelector('#swc-add')?.addEventListener('click', () => {
    const name = root.querySelector<HTMLInputElement>('#swc-new-name')?.value.trim() ?? '';
    const msg = root.querySelector('#swc-msg');
    if (!name) { if (msg) msg.textContent = 'Name the module first.'; return; }
    const p = host.get();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'module';
    let id = `custom-${slug}`, n = 2;
    while (swModuleDefs(p).has(id)) id = `custom-${slug}-${n++}`;
    const category = (root.querySelector<HTMLSelectElement>('#swc-new-cat')?.value ?? 'D') as SWCategory;
    // Added with NO effort (0 PM) and no source: it costs nothing until the user enters their figure and its source.
    // Picked by its exact gap name from the list → linked to that gap (a partial name never links).
    const gap = SW_CATALOGUE_GAP_DEFS.find(g => g.head.toLowerCase() === name.toLowerCase());
    host.set({ customModules: [...(p.customModules ?? []), { id, name, category, nominalPersonMonths: 0, defaultAsil: 'QM', defaultComplexity: 'Medium', source: '', ...(gap ? { coversGap: gap.id } : {}) }],
      modules: [...p.modules, { moduleId: id, enabled: true, asil: 'QM', complexity: 'Medium', reuse: 'Fresh', customPersonMonths: null }] });
    redraw();
    const m2 = root.querySelector('#swc-msg'); if (m2) m2.textContent = `Added "${name}" — enter its nominal person-months and where that figure comes from.`;
  });
}

export const QUOTES_CSS = `
.swq-table td, .swc-table td{padding:3px 6px;vertical-align:middle}
.swq-table input.swq-v{width:110px}.swq-table input.swq-s{min-width:200px}
.swc-table input.swc-name{min-width:200px}.swc-table input.swc-pm{width:80px}.swc-table input.swc-roy{width:80px}.swc-table input.swc-src{min-width:180px}
.swq-ip{margin:8px 0}.swq-ip summary{cursor:pointer;font-size:.8rem;color:var(--sw-text-body)}
.swq-reg,.swc-add{margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center}
`;
