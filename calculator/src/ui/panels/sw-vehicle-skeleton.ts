/**
 * SUV skeleton — where the software being costed runs (Chief Engineer review, Oct 2026).
 *
 * A top-view SVG of an SUV with the ECUs, sensors, actuators and networks of src/engine/sw-vehicle-map.ts. The
 * components of the modules in scope light up; selecting a module (or a costing step in sw-costing-pipeline.ts)
 * lights only its components; hovering / focusing a component lists the modules that run on it with THEIR costs as
 * the engine computed them. The map never allocates £ to a component — a module on four ECUs counts at each, and
 * the heat colour says so.
 *
 * Pure builders `(data) → string` plus one `wireVehicleMap` for the interactions; no main.ts state.
 */

import {
  SW_VEHICLE_COMPONENTS, SW_BACKBONE_LINKS, SW_MODULE_COMPONENTS, componentOnPowertrain, vehicleComponent,
  type SWVehicleComponent,
} from '../../engine/sw-vehicle-map.js';
import { SW_POWERTRAIN_MODULE_IDS, type SWPowertrain } from '../../engine/sw-should-cost.js';

export interface SkeletonModule {
  id:        string;
  name:      string;
  category:  string;
  categoryLabel: string;
  asil:      string;
  cost:      number;   // the module's attributed grand total, as the engine computed it
}

export interface SkeletonState {
  powertrain?: SWPowertrain;
  modules:     SkeletonModule[];          // modules IN SCOPE (enabled)
  /** Modules to light; absent = every module in scope. */
  focusModules?: string[];
  colourBy?:   'scope' | 'cost' | 'asil';
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

const ASIL_RANK: Record<string, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };
const ASIL_NAME = ['QM', 'A', 'B', 'C', 'D'];

/** Per component: the in-scope modules running on it, the sum of their costs (a module on several components counts
 *  at each — never shown as a component's "cost", cockpit review C11), its most costly single module and the highest
 *  ASIL among them. */
export function componentLoad(state: SkeletonState): Map<string, { modules: SkeletonModule[]; cost: number; top: number; asil: number }> {
  const out = new Map<string, { modules: SkeletonModule[]; cost: number; top: number; asil: number }>();
  const focus = state.focusModules ? new Set(state.focusModules) : null;
  for (const m of state.modules) {
    if (focus && !focus.has(m.id)) continue;
    for (const cid of SW_MODULE_COMPONENTS[m.id] ?? []) {
      const c = vehicleComponent(cid);
      if (!c || !componentOnPowertrain(c, state.powertrain)) continue;
      const e = out.get(cid) ?? { modules: [], cost: 0, top: 0, asil: 0 };
      e.modules.push(m);
      e.cost += m.cost;
      e.top = Math.max(e.top, m.cost);
      e.asil = Math.max(e.asil, ASIL_RANK[m.asil] ?? 0);
      out.set(cid, e);
    }
  }
  return out;
}

function marker(c: SWVehicleComponent, x: number, y: number): string {
  switch (c.kind) {
    case 'ecu':      return `<rect class="swv-m" x="${x - 10}" y="${y - 7}" width="20" height="14" rx="3"/>`;
    case 'hmi':      return `<rect class="swv-m" x="${x - 11}" y="${y - 5}" width="22" height="10" rx="2"/>`;
    case 'actuator': return `<rect class="swv-m" x="${x - 7}" y="${y - 7}" width="14" height="14" rx="2" transform="rotate(45 ${x} ${y})"/>`;
    case 'energy':   return `<polygon class="swv-m" points="${[0, 60, 120, 180, 240, 300].map(a => `${(x + 9 * Math.cos(a * Math.PI / 180)).toFixed(1)},${(y + 9 * Math.sin(a * Math.PI / 180)).toFixed(1)}`).join(' ')}"/>`;
    case 'offboard': return `<path class="swv-m" d="M${x - 18} ${y + 5} a8 8 0 0 1 4-14 a10 10 0 0 1 19-3 a7 7 0 0 1 13 6 a6 6 0 0 1 -2 11 z"/>`;
    default:         return `<circle class="swv-m" cx="${x}" cy="${y}" r="6.5"/>`;
  }
}

const fmtDefault = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

/** The SVG. `fmt` is the page's currency formatter — the skeleton never prints a bare £ of its own. */
export function renderVehicleSkeletonSVG(state: SkeletonState, fmt: (n: number) => string = fmtDefault): string {
  const load = componentLoad(state);
  const maxCost = Math.max(1, ...[...load.values()].map(v => v.top));
  const colourBy = state.colourBy ?? 'scope';
  // A drivetrain-specific part (engine, battery, e-axle, 48 V) is drawn on its drivetrain; with none stated, only when a
  // module in scope runs on it — so a BEV scope shows no engine and an ICE scope no battery.
  // Only DRIVETRAIN modules decide (AUTOSAR / RTOS run on every classic ECU, the engine's included).
  const inScope = componentLoad({ ...state, focusModules: undefined, modules: state.modules.filter(m => SW_POWERTRAIN_MODULE_IDS.has(m.id)) });
  const comps = SW_VEHICLE_COMPONENTS.filter(c => componentOnPowertrain(c, state.powertrain)
    && (!c.powertrains || !!state.powertrain || inScope.has(c.id)));
  const pos = (id: string): [number, number] | undefined => vehicleComponent(id)?.points[0];
  const backboneLit = load.has('backbone');

  const links = SW_BACKBONE_LINKS.map(([a, b]) => {
    const pa = pos(a), pb = pos(b);
    if (!pa || !pb) return '';
    return `<line class="swv-link${backboneLit ? ' swv-lit' : ''}" x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}"/>`;
  }).join('');
  const cloudLink = (() => {
    const t = pos('tcu'), c = pos('cloud');
    return t && c ? `<line class="swv-air${load.has('cloud') ? ' swv-lit' : ''}" x1="${t[0]}" y1="${t[1]}" x2="${c[0]}" y2="${c[1] - 10}"/>` : '';
  })();

  // Regions (the traction battery) first, so the ECUs drawn over them stay clickable.
  const ordered = [...comps.filter(c => c.rect), ...comps.filter(c => !c.rect)];
  const nodes = ordered.filter(c => c.id !== 'backbone').map(c => {
    const l = load.get(c.id);
    const level = !l ? 0 : colourBy === 'cost' ? 0.25 + 0.75 * (l.top / maxCost) : colourBy === 'asil' ? 0.2 + 0.2 * l.asil : 1;
    const asilCls = l && colourBy === 'asil' ? ` swv-asil-${l.asil}` : '';
    const label = l
      ? `${c.label}: ${l.modules.length} software module${l.modules.length === 1 ? '' : 's'} (${l.modules.map(m => m.name).join(', ')})${colourBy === 'cost' ? ` — most costly ${fmt(l.top)}` : ''}`
      : `${c.label}: no software module in scope`;
    const region = c.rect ? `<rect class="swv-region" x="${c.rect[0]}" y="${c.rect[1]}" width="${c.rect[2]}" height="${c.rect[3]}" rx="18"/>` : '';
    return `<g class="swv-comp swv-k-${c.kind}${l ? ' swv-lit' : ''}${asilCls}" data-comp="${esc(c.id)}" style="--swv-level:${level.toFixed(2)}" tabindex="0" role="button" aria-label="${esc(label)}">
      ${region}${c.points.map(([x, y]) => marker(c, x, y)).join('')}
    </g>`;
  }).join('');

  return `<svg class="swv-svg" viewBox="0 0 1000 490" role="group" aria-label="SUV top view, front to the right: where the software in scope runs" focusable="false">
  <title>SUV software map</title>
  <g class="swv-body" aria-hidden="true">
    <rect class="swv-wheel" x="175" y="16" width="80" height="30" rx="9"/><rect class="swv-wheel" x="750" y="16" width="80" height="30" rx="9"/>
    <rect class="swv-wheel" x="175" y="424" width="80" height="30" rx="9"/><rect class="swv-wheel" x="750" y="424" width="80" height="30" rx="9"/>
    <path class="swv-shell" d="M120 40 L820 40 C905 40 965 92 968 165 L968 305 C965 378 905 430 820 430 L120 430 C70 430 34 400 32 350 L32 120 C34 70 70 40 120 40 Z"/>
    <path class="swv-glass" d="M690 92 L728 112 L728 358 L690 378 Z"/>
    <rect class="swv-roof" x="290" y="86" width="400" height="298" rx="34"/>
    <path class="swv-glass" d="M262 104 L290 98 L290 372 L262 366 Z"/>
    <rect class="swv-mirror" x="640" y="30" width="26" height="12" rx="4"/><rect class="swv-mirror" x="640" y="428" width="26" height="12" rx="4"/>
    <text class="swv-front" x="985" y="240" text-anchor="middle" transform="rotate(90 985 240)">FRONT</text>
  </g>
  <g class="swv-net" aria-hidden="true">${links}${cloudLink}</g>
  ${nodes}
</svg>`;
}

/** Legend + colour-mode switch + the details line the interactions write into. */
export function renderVehicleMapHTML(state: SkeletonState, fmt?: (n: number) => string): string {
  const mode = state.colourBy ?? 'scope';
  const btn = (m: string, label: string) =>
    `<button type="button" class="swv-mode${mode === m ? ' is-on' : ''}" data-swv-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  const load = componentLoad(state);
  const lit = load.size;
  // The lit components as a list beside the car — names a reader cannot get from the markers alone; each item is the
  // same control as its marker (keyboard and screen-reader route to every component).
  const list = [...load.entries()]
    .filter(([id]) => id !== 'backbone' && componentOnPowertrain(vehicleComponent(id)!, state.powertrain))
    .sort((a, b) => b[1].modules.length - a[1].modules.length || b[1].asil - a[1].asil || b[1].top - a[1].top)
    // No £ per component: a module on several components would count at each and the list would add up to more
    // than the programme (cockpit review C11). Each module's own £ is in the hover detail.
    .map(([id, l]) => `<li><button type="button" class="swv-li-btn" data-comp="${esc(id)}">
      <span class="swv-li-name">${esc(vehicleComponent(id)!.label)}</span>
      <span class="swv-li-meta">${l.modules.length} module${l.modules.length === 1 ? '' : 's'} · ${l.asil ? `up to ASIL ${ASIL_NAME[l.asil]}` : 'QM'}</span></button></li>`).join('');
  return `<section class="swv-wrap" aria-labelledby="swv-title">
  <div class="swv-head">
    <div>
      <h4 id="swv-title" class="swv-title">Where this software runs</h4>
      <p class="swv-sub">${lit} vehicle component${lit === 1 ? '' : 's'} carry the software in scope${state.powertrain ? ` (${esc(state.powertrain)})` : ''}. Hover or tab to a component; pick a module or a costing step to see only its parts.</p>
    </div>
    <div class="swv-modes" role="group" aria-label="Colour the components by">${btn('scope', 'In scope')}${btn('cost', 'Cost')}${btn('asil', 'ASIL')}</div>
  </div>
  <div class="swv-body">
    <div class="swv-canvas">${renderVehicleSkeletonSVG(state, fmt)}</div>
    <div class="swv-side"><h5 class="swv-side-h">Components carrying this software</h5><ul class="swv-list">${list || '<li class="swv-li-none">None in scope</li>'}</ul></div>
  </div>
  <div class="swv-legend" aria-hidden="true">
    <span><i class="swv-li swv-li-ecu"></i>ECU / computer</span><span><i class="swv-li swv-li-sensor"></i>Sensor</span>
    <span><i class="swv-li swv-li-act"></i>Actuator</span><span><i class="swv-li swv-li-hmi"></i>Display</span>
    <span><i class="swv-li swv-li-energy"></i>Energy</span><span><i class="swv-li swv-li-net"></i>Network</span>
  </div>
  <p class="swv-detail" aria-live="polite">${mode === 'cost' ? 'Cost colour: the most costly single module running on each component. Modules are never summed per component — one module often runs on several.' : '&nbsp;'}</p>
</section>`;
}

/**
 * Wire hover / focus / click on a rendered map. `getState` returns the CURRENT state (the panel re-renders the SVG
 * on a mode change or a new focus); `onFocusModules` lets the host sync its module list.
 */
export function wireVehicleMap(root: HTMLElement, getState: () => SkeletonState, setState: (s: SkeletonState) => void,
  fmt?: (n: number) => string): void {
  const detail = () => root.querySelector<HTMLElement>('.swv-detail');
  const describe = (cid: string) => {
    const c = vehicleComponent(cid);
    // The detail lists EVERY in-scope module on the component, whatever step or selection is lit.
    const l = componentLoad({ ...getState(), focusModules: undefined }).get(cid);
    const d = detail();
    if (!c || !d) return;
    d.innerHTML = l
      ? `<strong>${esc(c.label)}</strong> — ${esc(c.what)} Runs: ${l.modules.map(m => `${esc(m.name)} (${esc((fmt ?? fmtDefault)(m.cost))}, ASIL ${esc(m.asil)})`).join('; ')}.`
      : `<strong>${esc(c.label)}</strong> — ${esc(c.what)} No module in scope runs here.`;
  };
  root.addEventListener('focusin', e => {
    const g = (e.target as Element).closest?.('[data-comp]');
    if (g) describe(g.getAttribute('data-comp')!);
  });
  root.addEventListener('pointerover', e => {
    const g = (e.target as Element).closest?.('[data-comp]');
    if (g) describe(g.getAttribute('data-comp')!);
  });
  root.addEventListener('click', e => {
    const t = e.target as Element;
    const mode = t.closest?.('[data-swv-mode]')?.getAttribute('data-swv-mode') as SkeletonState['colourBy'] | null;
    if (mode) { setState({ ...getState(), colourBy: mode }); return; }
    const g = t.closest?.('[data-comp]');
    if (g) {
      // Clicking a component focuses the modules that run on it (click it again to clear).
      const cid = g.getAttribute('data-comp')!;
      const s = getState();
      const on = s.modules.filter(m => (SW_MODULE_COMPONENTS[m.id] ?? []).includes(cid)).map(m => m.id);
      const same = s.focusModules && s.focusModules.length === on.length && on.every(id => s.focusModules!.includes(id));
      setState({ ...s, focusModules: same ? undefined : on });
    }
  });
  root.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('[data-comp]')) {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  });
}

/** Styles (theme tokens only; the dark theme follows the app's own switch through the --sw-* tokens). */
export const VEHICLE_MAP_CSS = `
.swv-wrap{border:1px solid var(--sw-border);border-radius:12px;background:var(--sw-surface);padding:14px 16px;margin:0 0 16px}
.swv-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.swv-title{margin:0;font-size:.92rem;font-weight:700;color:var(--sw-text-primary)}
.swv-sub{margin:2px 0 0;font-size:.74rem;color:var(--sw-text-secondary);max-width:62ch}
.swv-modes{display:flex;gap:4px}
.swv-mode{font:inherit;font-size:.72rem;padding:4px 10px;border-radius:999px;border:1px solid var(--sw-border);background:var(--sw-surface-alt);color:var(--sw-text-body);cursor:pointer}
.swv-mode.is-on{background:var(--sw-accent);border-color:var(--sw-accent);color:var(--sw-on-accent,#fff)}
.swv-body{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px;margin-top:8px;align-items:start}
@media (max-width:900px){.swv-body{grid-template-columns:1fr}}
.swv-side{border-left:1px solid var(--sw-border);padding-left:12px;max-height:420px;overflow:auto}
.swv-side-h{margin:0 0 6px;font-size:.72rem;font-weight:700;color:var(--sw-text-secondary);text-transform:uppercase;letter-spacing:.04em}
.swv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.swv-li-btn{width:100%;text-align:left;font:inherit;background:none;border:1px solid transparent;border-radius:6px;padding:5px 7px;cursor:pointer;display:flex;flex-direction:column;color:var(--sw-text-primary)}
.swv-li-btn:hover,.swv-li-btn:focus-visible{border-color:var(--sw-accent);background:var(--sw-accent-bg)}
.swv-li-name{font-size:.75rem;font-weight:600}
.swv-li-meta{font-size:.68rem;color:var(--sw-text-secondary);font-variant-numeric:tabular-nums}
.swv-li-none{font-size:.72rem;color:var(--sw-text-secondary)}
.swv-svg{width:100%;height:auto;display:block;max-height:420px}
.swv-shell{fill:var(--sw-surface-alt);stroke:var(--sw-text-muted);stroke-width:2}
.swv-roof{fill:none;stroke:var(--sw-border);stroke-width:1.5;stroke-dasharray:6 5}
.swv-glass{fill:var(--sw-accent-bg);stroke:var(--sw-border)}
.swv-wheel,.swv-mirror{fill:var(--sw-text-muted);opacity:.55}
.swv-front{font-size:11px;letter-spacing:.2em;fill:var(--sw-text-muted);font-weight:700}
.swv-link{stroke:var(--sw-border);stroke-width:2}
.swv-air{stroke:var(--sw-border);stroke-width:1.5;stroke-dasharray:3 4}
.swv-link.swv-lit,.swv-air.swv-lit{stroke:var(--sw-accent);stroke-width:2.5}
.swv-comp{cursor:pointer;outline:none}
.swv-comp .swv-m{fill:var(--sw-surface);stroke:var(--sw-text-muted);stroke-width:1.5;transition:fill var(--dur-hover,200ms) ease,stroke var(--dur-hover,200ms) ease,opacity var(--dur-hover,200ms) ease;opacity:.55}
.swv-comp .swv-region{fill:transparent;stroke:var(--sw-border);stroke-width:1.5;stroke-dasharray:4 4}
.swv-comp.swv-lit .swv-m{fill:var(--sw-accent);stroke:var(--sw-accent);opacity:calc(.35 + .65 * var(--swv-level,1))}
.swv-comp.swv-lit .swv-region{fill:var(--sw-accent-bg);stroke:var(--sw-accent)}
.swv-comp.swv-asil-3 .swv-m{fill:var(--sw-warn,#b45309);stroke:var(--sw-warn,#b45309)}
.swv-comp.swv-asil-4 .swv-m{fill:var(--sw-bad);stroke:var(--sw-bad)}
.swv-comp:focus-visible .swv-m,.swv-comp:hover .swv-m{stroke:var(--sw-text-primary);stroke-width:3;opacity:1}
.swv-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:.7rem;color:var(--sw-text-secondary);margin-top:6px}
.swv-li{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px;border:1.5px solid var(--sw-text-muted);background:var(--sw-surface)}
.swv-li-ecu{border-radius:2px;width:14px}.swv-li-sensor{border-radius:50%}.swv-li-act{transform:rotate(45deg) scale(.85)}
.swv-li-hmi{height:6px;width:14px}.swv-li-energy{border-radius:3px}.swv-li-net{border-radius:50%;width:6px;height:6px}
.swv-detail{margin:8px 0 0;font-size:.76rem;color:var(--sw-text-body);min-height:2.4em}
`;
