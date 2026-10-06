/**
 * "Vehicle electronics library" panel on the PCB forms (Oct 2026 research): which ECUs
 * each powertrain carries, their typical board, and the key ICs — each named chip linked
 * to its catalogue price at 100k / 200k / 300k a year, with its source. Loaded on open.
 */
import { escHtml } from '../toast.js';

interface Part { mpn: string; mfr: string; desc: string; confidence: string; asOf: string; unitGBP: number | null }
interface KeyIc { role: string; examples: string[]; source?: string; parts: Part[] }
interface Ecu { ecu: string; name: string; function: string; powertrains: string[]; pcb?: Record<string, string>; placements?: Record<string, string>; keyIcs: KeyIc[] }
interface Lib { researched: string; volume: number; powertrains: Array<{ id: string; name?: string; ecuCountTypical?: string; semiContentUSD?: { value: string; source: string }; ecus?: string[] }>; ecus: Ecu[] }

const src = (s?: string) => !s ? '' : /^https?:/.test(s)
  ? `<a href="${escHtml(s)}" target="_blank" rel="noopener" style="font-size:0.66rem">source</a>`
  : `<span style="font-size:0.66rem;color:var(--text-muted)">${escHtml(s)}</span>`;

export function ecuLibraryShell(): string {
  return `<details id="pcb-ecu-lib" class="pcb-ecu-lib" style="margin:10px 0;border:1px solid var(--border);border-radius:8px;padding:8px 12px">
    <summary style="cursor:pointer;font-weight:600;font-size:0.82rem">Vehicle electronics library — ECUs by powertrain and their key ICs, priced at 100k / 200k / 300k a year</summary>
    <div id="pcb-ecu-lib-body" style="margin-top:8px;font-size:0.78rem">Loading…</div>
  </details>`;
}

function render(lib: Lib, pt: string): string {
  const ptRow = lib.powertrains.find(p => p.id === pt);
  const ecus = lib.ecus.filter(e => e.powertrains.includes(pt));
  const tabs = lib.powertrains.map(p => `<button type="button" class="btn btn-secondary btn-sm" data-ecu-pt="${escHtml(p.id)}" aria-pressed="${p.id === pt}" style="${p.id === pt ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : ''}">${escHtml(p.id)}</button>`).join('');
  const vols = [100000, 200000, 300000].map(v => `<option value="${v}"${v === lib.volume ? ' selected' : ''}>${(v / 1000)}k / year</option>`).join('');
  const rows = ecus.map(e => {
    const ics = e.keyIcs.map(k => `<li><strong>${escHtml(k.role)}:</strong> ${k.examples.map(x => escHtml(x)).join(' · ')} ${src(k.source)}${k.parts.length ? `<div style="margin-top:2px">${k.parts.map(p => `<span class="pcb-badge" style="background:${p.confidence === 'distributor' ? '#16a34a' : '#0f766e'};color:#fff" title="${escHtml(`${p.mfr} ${p.desc} — ${p.confidence === 'distributor' ? 'distributor price' : 'catalogue estimate'}, ${p.asOf}`)}">${escHtml(p.mpn)} ${p.unitGBP != null ? `£${p.unitGBP.toFixed(2)}` : ''}</span>`).join(' ')}</div>` : ''}</li>`).join('');
    return `<details style="border-top:1px solid var(--border);padding:6px 0"><summary style="cursor:pointer"><strong>${escHtml(e.ecu)}</strong> — ${escHtml(e.name)}${e.pcb?.layers ? ` <span style="color:var(--text-muted)">· ${escHtml(e.pcb.layers)} layers</span>` : ''}</summary>
      <div style="padding:4px 0 2px 12px"><div style="color:var(--text-secondary)">${escHtml(e.function)}</div>
      ${e.pcb ? `<div style="color:var(--text-muted);margin-top:2px">Board: ${escHtml([e.pcb.layers && `${e.pcb.layers} layers`, e.pcb.size, e.pcb.technology].filter(Boolean).join(' · '))} ${src(e.pcb.basis)}</div>` : ''}
      ${e.placements?.range ? `<div style="color:var(--text-muted)">Placements: ${escHtml(e.placements.range)} ${src(e.placements.basis)}</div>` : ''}
      <ul style="margin:4px 0 0;padding-left:18px">${ics}</ul></div></details>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">${tabs}<label style="margin-left:auto;font-size:0.72rem">Volume <select id="pcb-ecu-vol" aria-label="Annual volume for prices">${vols}</select></label></div>
    ${ptRow ? `<div style="color:var(--text-secondary);margin-bottom:4px">${escHtml(ptRow.name ?? ptRow.id)} · ECUs per vehicle: ${escHtml(ptRow.ecuCountTypical ?? '—')}${ptRow.semiContentUSD ? ` · semiconductor content ${escHtml(ptRow.semiContentUSD.value)} ${src(ptRow.semiContentUSD.source)}` : ''}</div>` : ''}
    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">Green chips: distributor-priced catalogue parts; teal: catalogue estimates. Prices at the selected annual volume, derived above the largest published break. Board figures marked "engineering judgement" are not sourced.</div>
    ${rows || '<div>No ECUs listed for this powertrain.</div>'}`;
}

export function wireEcuLibrary(doc: Document = document): void {
  const det = doc.getElementById('pcb-ecu-lib') as HTMLDetailsElement | null;
  const body = doc.getElementById('pcb-ecu-lib-body');
  if (!det || !body) return;
  let pt = 'BEV400', vol = 100000;
  const load = async () => {
    try {
      const r = await fetch(`/api/pcb/ecu-library?volume=${vol}`);
      if (!r.ok) throw new Error(r.statusText);
      const lib = await r.json() as Lib;
      if (!lib.powertrains.some(p => p.id === pt)) pt = lib.powertrains[0]?.id ?? pt;
      body.innerHTML = render(lib, pt);
      body.querySelectorAll<HTMLButtonElement>('[data-ecu-pt]').forEach(b => b.addEventListener('click', () => { pt = b.dataset.ecuPt!; void load(); }));
      body.querySelector<HTMLSelectElement>('#pcb-ecu-vol')?.addEventListener('change', e => { vol = Number((e.target as HTMLSelectElement).value); void load(); });
    } catch (err) { body.textContent = `Could not load the library (${(err as Error).message}).`; }
  };
  det.addEventListener('toggle', () => { if (det.open && body.textContent === 'Loading…') void load(); });
}
