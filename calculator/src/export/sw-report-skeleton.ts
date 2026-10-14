/**
 * The vehicle skeleton for REPORTS (360 report plan §4, Oct 2026): the screen's top-view map
 * (src/ui/panels/sw-vehicle-skeleton.ts, the same component map src/engine/sw-vehicle-map.ts) drawn as a SELF-CONTAINED
 * SVG — inline styles only, no CSS variables, no fonts beyond Arial / Helvetica — so it rasterises to the same picture in
 * a browser canvas (PDF / Excel export) and in headless Chromium (scripts, CI).
 *
 * - Body: SUV (the screen's), saloon, hatchback, pickup or van. Components are placed by ZONE (rear / cabin / front), so
 *   each body re-maps the x positions piecewise onto its own zones — no map per car. Always labelled "schematic".
 * - Colour, never £: the highest ASIL of the lit modules on each component (a sequential navy ramp), or the number of
 *   lit modules on it, or — for the scope view — the parts out-of-scope software would run on (grey, hatched).
 * - Every lit component carries its architecture NUMBER (the report's component table), so colour is never the only
 *   cue and a reader can find each part in the legend.
 */

import { SW_VEHICLE_COMPONENTS, SW_BACKBONE_LINKS, SW_MODULE_COMPONENTS, componentOnPowertrain,
  type SWVehicleComponent } from '../engine/sw-vehicle-map.js';
import type { ASILLevel, SWPowertrain } from '../engine/sw-should-cost.js';
import type { SWBodyType, SWReportModel, SWReportSkeletonView } from '../engine/sw-report-model.js';

// ── Palette (brand light theme: navy #16325C, blue #1D6FB8) ─────────────────────────────────────────────────────────

/** Sequential ramp QM → D (light → dark navy). Lightness falls monotonically; every lit marker also carries a number. */
export const SKELETON_ASIL_RAMP: Record<ASILLevel, string> = { QM: '#DCE9F7', A: '#9EC2EA', B: '#5B93D3', C: '#2B63AA', D: '#16325C' };
/** Number of modules on a component: 1 · 2–3 · 4–6 · 7–9 · 10+. */
export const SKELETON_COUNT_STEPS: Array<{ min: number; label: string; fill: string }> = [
  { min: 1, label: '1', fill: '#DCE9F7' }, { min: 2, label: '2–3', fill: '#9EC2EA' }, { min: 4, label: '4–6', fill: '#5B93D3' },
  { min: 7, label: '7–9', fill: '#2B63AA' }, { min: 10, label: '10+', fill: '#16325C' },
];
const INK = '#16325C', MUTED = '#64748B', LINE = '#DCE3EE', UNLIT_STROKE = '#B6C2D2', BLUE = '#1D6FB8';
const BODY_FILL = '#F4F7FB', BODY_STROKE = '#8796AB', GLASS = '#E3ECF7', WHEEL = '#5B6B80';
const EXCL_FILL = '#EEF0F3', EXCL_STROKE = '#6B7280';
const DARK_FILLS = new Set(['#5B93D3', '#2B63AA', '#16325C']);
const FONT = 'Arial, Helvetica, sans-serif';

// ── Bodies ──────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Body {
  /** Zone breakpoints the SUV map is laid out on [rear bumper, cabin start, cabin end, front bumper] → this body's. */
  zones:  [number, number, number, number];
  shell:  string;
  roof:   [number, number, number];            // x0, x1, corner radius
  glass:  string[];
  wheels: [number, number];                    // left x of the rear and front wheel
  extra?: string;                              // pickup bed etc.
}

const SUV_ZONES: [number, number, number, number] = [32, 290, 690, 968];

const BODIES: Record<SWBodyType, Body> = {
  suv: {
    zones: SUV_ZONES,
    shell: 'M120 40 L820 40 C905 40 965 92 968 165 L968 305 C965 378 905 430 820 430 L120 430 C70 430 34 400 32 350 L32 120 C34 70 70 40 120 40 Z',
    roof: [290, 690, 34], glass: ['M690 92 L728 112 L728 358 L690 378 Z', 'M262 104 L290 98 L290 372 L262 366 Z'], wheels: [175, 750],
  },
  saloon: {
    zones: [40, 340, 650, 962],
    shell: 'M115 44 L830 44 C915 44 960 104 962 175 L962 295 C960 366 915 426 830 426 L115 426 C68 426 40 392 40 345 L40 125 C40 78 68 44 115 44 Z',
    roof: [340, 650, 60], glass: ['M650 96 L712 120 L712 350 L650 374 Z', 'M300 116 L340 104 L340 366 L300 354 Z'], wheels: [165, 765],
  },
  hatchback: {
    zones: [70, 255, 655, 930],
    shell: 'M128 46 L800 46 C880 46 928 98 930 168 L930 302 C928 372 880 424 800 424 L128 424 C92 424 70 398 70 360 L70 110 C70 72 92 46 128 46 Z',
    roof: [255, 655, 40], glass: ['M655 98 L705 118 L705 352 L655 372 Z', 'M232 104 L255 98 L255 372 L232 366 Z'], wheels: [140, 735],
  },
  pickup: {
    zones: [32, 470, 720, 968],
    shell: 'M90 40 L830 40 C910 40 965 92 968 165 L968 305 C965 378 910 430 830 430 L90 430 C55 430 32 410 32 375 L32 95 C32 60 55 40 90 40 Z',
    roof: [470, 720, 28], glass: ['M720 96 L762 114 L762 356 L720 374 Z', 'M452 100 L470 96 L470 374 L452 370 Z'], wheels: [175, 760],
    extra: '<rect x="52" y="66" width="392" height="338" rx="10" fill="none" stroke="#8796AB" stroke-width="2"/>'
      + '<text x="248" y="76" text-anchor="middle" font-family="' + FONT + '" font-size="11" fill="#64748B" dy="14">LOAD BED</text>',
  },
  van: {
    zones: [32, 140, 820, 968],
    shell: 'M66 40 L885 40 C938 40 968 82 968 140 L968 330 C968 388 938 430 885 430 L66 430 C44 430 32 416 32 394 L32 76 C32 54 44 40 66 40 Z',
    roof: [140, 820, 16], glass: ['M820 92 L870 110 L870 360 L820 378 Z'], wheels: [110, 790],
  },
};

/** SUV x → this body's x, piecewise linear over the zones. */
function mapX(body: Body, x: number): number {
  const [a0, a1, a2, a3] = SUV_ZONES, [b0, b1, b2, b3] = body.zones;
  const seg = (x0: number, x1: number, y0: number, y1: number) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  if (x <= a1) return seg(a0, a1, b0, b1);
  if (x <= a2) return seg(a1, a2, b1, b2);
  return seg(a2, a3, b2, b3);
}

// ── Markers ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function marker(c: SWVehicleComponent, x: number, y: number, fill: string, stroke: string, sw: number, dash = ''): string {
  const st = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}`;
  switch (c.kind) {
    case 'ecu':      return `<rect x="${x - 15}" y="${y - 10}" width="30" height="20" rx="4" ${st}/>`;
    case 'hmi':      return `<rect x="${x - 15}" y="${y - 9}" width="30" height="18" rx="3" ${st}/>`;
    case 'actuator': return `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" rx="3" transform="rotate(45 ${x} ${y})" ${st}/>`;
    case 'energy':   return `<polygon points="${[0, 60, 120, 180, 240, 300].map(a => `${(x + 14 * Math.cos(a * Math.PI / 180)).toFixed(1)},${(y + 14 * Math.sin(a * Math.PI / 180)).toFixed(1)}`).join(' ')}" ${st}/>`;
    case 'offboard': return `<path d="M${x - 22} ${y + 8} a10 10 0 0 1 5-17 a12 12 0 0 1 23-4 a9 9 0 0 1 16 7 a8 8 0 0 1 -3 14 z" ${st}/>`;
    default:         return `<circle cx="${x}" cy="${y}" r="12" ${st}/>`;
  }
}

const num = (x: number, y: number, n: number, fill: string) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${n > 9 ? 11 : 12}" font-weight="700" fill="${fill}">${n}</text>`;

// ── Separation ──────────────────────────────────────────────────────────────────────────────────────────────────

const RADIUS: Record<string, number> = { ecu: 17, hmi: 17, actuator: 15, energy: 15, sensor: 13, offboard: 26, network: 13 };

function relax(pts: Array<{ id: string; i: number; kind: string; x: number; y: number }>): Map<string, { x: number; y: number }> {
  const p = pts.map(q => ({ ...q }));
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) {
      const A = p[a], B = p[b];
      const min = (RADIUS[A.kind] ?? 14) + (RADIUS[B.kind] ?? 14) + 3;
      let dx = B.x - A.x, dy = B.y - A.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      const push = (min - d) / 2 + 0.01;
      A.x -= (dx / d) * push; A.y -= (dy / d) * push;
      B.x += (dx / d) * push; B.y += (dy / d) * push;
      moved = true;
    }
    for (const q of p) { q.x = Math.min(975, Math.max(25, q.x)); q.y = Math.min(472, Math.max(14, q.y)); }
    if (!moved) break;
  }
  return new Map(p.map(q => [`${q.id}#${q.i}`, { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }]));
}

// ── Builder ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ReportSkeletonInput {
  body:        SWBodyType;
  powertrain?: SWPowertrain;
  /** Modules in scope with their ASIL. */
  modules:     Array<{ id: string; asil: ASILLevel }>;
  /** Architecture numbers (component id → number) — the report's component table. */
  numbers:     Map<string, number>;
  /** Modules lit; absent = all in scope. */
  lit?:        string[];
  colourBy:    'asil' | 'count' | 'excluded';
  /** Out-of-scope module ids (excluded view). */
  excluded?:   string[];
  /** Draw the key under the car (default true). */
  legend?:     boolean;
  title?:      string;
}

export const SKELETON_W = 1000;
export const SKELETON_H = 610;
export const SKELETON_H_NO_LEGEND = 490;

const ASIL_ORDER: ASILLevel[] = ['QM', 'A', 'B', 'C', 'D'];

export function buildReportSkeletonSVG(inp: ReportSkeletonInput): string {
  const body = BODIES[inp.body] ?? BODIES.suv;
  const X = (x: number) => Math.round(mapX(body, x) * 10) / 10;
  const pt = inp.powertrain;
  const inScope = new Set(inp.modules.map(m => m.id));
  const lit = new Set(inp.lit ?? inp.modules.map(m => m.id));
  const asilOf = new Map(inp.modules.map(m => [m.id, m.asil]));
  const excluded = new Set(inp.excluded ?? []);
  const legend = inp.legend !== false;
  const H = legend ? SKELETON_H : SKELETON_H_NO_LEGEND;

  // Per component: lit modules on it (their highest ASIL, their count), and for the scope view the out-of-scope ones.
  const load = new Map<string, { n: number; asil: number }>();
  const excl = new Set<string>();
  for (const [mid, comps] of Object.entries(SW_MODULE_COMPONENTS)) {
    for (const cid of comps) {
      if (lit.has(mid) && inScope.has(mid)) {
        const e = load.get(cid) ?? { n: 0, asil: 0 };
        e.n++; e.asil = Math.max(e.asil, ASIL_ORDER.indexOf(asilOf.get(mid) ?? 'QM'));
        load.set(cid, e);
      }
      if (excluded.has(mid)) excl.add(cid);
    }
  }
  // A drivetrain part is drawn on its drivetrain; with none stated, only when a module in scope runs on it.
  const anyScope = new Set([...inScope].flatMap(id => SW_MODULE_COMPONENTS[id] ?? []));
  const comps = SW_VEHICLE_COMPONENTS.filter(c => componentOnPowertrain(c, pt) && (!c.powertrains || !!pt || anyScope.has(c.id)));

  const fillFor = (cid: string): string | null => {
    if (inp.colourBy === 'excluded') return null;
    const l = load.get(cid);
    if (!l) return null;
    if (inp.colourBy === 'count') return [...SKELETON_COUNT_STEPS].reverse().find(s => l.n >= s.min)!.fill;
    return SKELETON_ASIL_RAMP[ASIL_ORDER[l.asil]];
  };

  // Marker centres after a small separation pass: the map is schematic, so two parts drawn on top of each other (cell
  // monitors over the gateway, a camera behind an ultrasonic sensor) are nudged apart until neither hides the other's number.
  const placed = relax(comps.filter(c => c.id !== 'backbone').flatMap(c => c.points.map(([px, py], i) => ({ id: c.id, i, kind: c.kind, x: X(px), y: py }))));
  const at = (id: string, i: number): [number, number] => { const p = placed.get(`${id}#${i}`)!; return [p.x, p.y]; };
  const pos = (id: string): [number, number] | undefined => (placed.has(`${id}#0`) ? at(id, 0) : undefined);
  const backboneLit = inp.colourBy !== 'excluded' && load.has('backbone');
  const links = SW_BACKBONE_LINKS.map(([a, b]) => {
    const pa = pos(a), pb = pos(b);
    if (!pa || !pb) return '';
    return `<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="${backboneLit ? BLUE : LINE}" stroke-width="${backboneLit ? 3 : 2}"/>`;
  }).join('');
  const t = pos('tcu'), cl = pos('cloud');
  const cloudLit = inp.colourBy !== 'excluded' && load.has('cloud');
  const air = t && cl ? `<line x1="${t[0]}" y1="${t[1]}" x2="${cl[0]}" y2="${cl[1] - 12}" stroke="${cloudLit ? BLUE : LINE}" stroke-width="2" stroke-dasharray="4 4"/>` : '';

  const ordered = [...comps.filter(c => c.rect), ...comps.filter(c => !c.rect)];
  const nodes = ordered.filter(c => c.id !== 'backbone').map(c => {
    const fill = fillFor(c.id);
    const isExcl = inp.colourBy === 'excluded' && excl.has(c.id);
    const n = inp.numbers.get(c.id);
    const region = c.rect ? (() => {
      const x0 = X(c.rect[0]), x1 = X(c.rect[0] + c.rect[2]);
      const f = fill ? '#EAF2FB' : isExcl ? 'url(#cv-hatch)' : 'none';
      const s = fill ? INK : isExcl ? EXCL_STROKE : UNLIT_STROKE;
      return `<rect x="${x0}" y="${c.rect[1]}" width="${x1 - x0}" height="${c.rect[3]}" rx="18" fill="${f}" stroke="${s}" stroke-width="1.5" stroke-dasharray="6 5"/>`;
    })() : '';
    const marks = c.points.map((_, i) => {
      const [x, py] = at(c.id, i);
      if (fill) return marker(c, x, py, fill, INK, 1.6) + (n != null ? num(x, py, n, DARK_FILLS.has(fill) ? '#FFFFFF' : INK) : '');
      if (isExcl) return marker(c, x, py, 'url(#cv-hatch)', EXCL_STROKE, 1.6, '3 2') + (n != null ? num(x, py, n, INK) : '');
      return marker(c, x, py, '#FFFFFF', UNLIT_STROKE, 1.2);
    }).join('');
    return { region, marks: `<g data-comp="${c.id}">${marks}</g>` };
  });
  // Regions (the traction battery) under the network, markers over it.
  const regions = nodes.map(n => n.region).join('');
  const markers = nodes.map(n => n.marks).join('');
  // The Ethernet backbone has no marker of its own: its number sits on the compute ↔ gateway link.
  const bbNo = inp.numbers.get('backbone');
  const pa = pos('central_compute'), pb = pos('gateway');
  const bb = backboneLit && bbNo != null && pa && pb
    ? `<circle cx="${(pa[0] + pb[0]) / 2}" cy="${(pa[1] + pb[1]) / 2}" r="11" fill="#FFFFFF" stroke="${BLUE}" stroke-width="2"/>${num((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, bbNo, INK)}`
    : '';

  const [r0, r1, rr] = body.roof;
  const [w0, w1] = body.wheels;
  const mirror = body.roof[1] - 50;
  const car = `<g>
  <rect x="${w0}" y="16" width="80" height="30" rx="9" fill="${WHEEL}" opacity="0.75"/><rect x="${w1}" y="16" width="80" height="30" rx="9" fill="${WHEEL}" opacity="0.75"/>
  <rect x="${w0}" y="424" width="80" height="30" rx="9" fill="${WHEEL}" opacity="0.75"/><rect x="${w1}" y="424" width="80" height="30" rx="9" fill="${WHEEL}" opacity="0.75"/>
  <path d="${body.shell}" fill="${BODY_FILL}" stroke="${BODY_STROKE}" stroke-width="2"/>
  ${body.extra ?? ''}
  ${body.glass.map(g => `<path d="${g}" fill="${GLASS}" stroke="${LINE}"/>`).join('')}
  <rect x="${r0}" y="86" width="${r1 - r0}" height="298" rx="${rr}" fill="none" stroke="#C5D0DE" stroke-width="1.5" stroke-dasharray="6 5"/>
  <rect x="${mirror}" y="30" width="26" height="12" rx="4" fill="${WHEEL}" opacity="0.6"/><rect x="${mirror}" y="428" width="26" height="12" rx="4" fill="${WHEEL}" opacity="0.6"/>
  <text x="988" y="240" text-anchor="middle" transform="rotate(90 988 240)" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="2" fill="${MUTED}">FRONT</text>
</g>`;

  const key = legend ? legendSVG(inp.colourBy, inp.body) : '';
  const defs = `<defs><pattern id="cv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${EXCL_FILL}"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9CA3AF" stroke-width="2"/></pattern></defs>`;
  const title = inp.title ? `<title>${escXml(inp.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SKELETON_W} ${H}" width="${SKELETON_W}" height="${H}">${title}${defs}`
    + `<rect width="${SKELETON_W}" height="${H}" fill="#FFFFFF"/>${car}${regions}<g>${links}${air}</g>${markers}${bb}${key}</svg>`;
}

function legendSVG(mode: ReportSkeletonInput['colourBy'], body: SWBodyType): string {
  const y = 500;
  const parts: string[] = [];
  let x = 20;
  const sw = (fill: string, label: string, stroke = INK, pattern = false) => {
    parts.push(`<rect x="${x}" y="${y + 6}" width="22" height="14" rx="3" fill="${pattern ? 'url(#cv-hatch)' : fill}" stroke="${stroke}" stroke-width="1.2"/>`
      + `<text x="${x + 28}" y="${y + 13}" dominant-baseline="central" font-family="${FONT}" font-size="13" fill="${INK}">${escXml(label)}</text>`);
    x += 28 + label.length * 7.4 + 18;
  };
  const heading = (s: string) => { parts.push(`<text x="${x}" y="${y + 13}" dominant-baseline="central" font-family="${FONT}" font-size="13" font-weight="700" fill="${INK}">${escXml(s)}</text>`); x += s.length * 7.6 + 12; };
  if (mode === 'asil') { heading('Highest ASIL on the part:'); ASIL_ORDER.forEach(a => sw(SKELETON_ASIL_RAMP[a], a === 'QM' ? 'QM' : `ASIL ${a}`)); }
  else if (mode === 'count') { heading('Software modules on the part:'); SKELETON_COUNT_STEPS.forEach(s => sw(s.fill, s.label)); }
  else { heading('Where out-of-scope software would run:'); sw('', 'not costed', EXCL_STROKE, true); }
  sw('#FFFFFF', 'no software lit here', UNLIT_STROKE);
  // Second row: shapes and the caption.
  const y2 = y + 42;
  const shapes: Array<[string, string]> = [['ecu', 'ECU / computer'], ['sensor', 'Sensor'], ['actuator', 'Actuator'], ['hmi', 'Display'], ['energy', 'Energy'], ['offboard', 'Cloud']];
  let sx = 30;
  for (const [kind, label] of shapes) {
    const fake = { kind } as SWVehicleComponent;
    parts.push(`<g transform="translate(${sx} ${y2}) scale(0.7) translate(${-sx} ${-y2})">${marker(fake, sx, y2, '#FFFFFF', INK, 1.6)}</g>`
      + `<text x="${sx + 20}" y="${y2}" dominant-baseline="central" font-family="${FONT}" font-size="12.5" fill="${MUTED}">${label}</text>`);
    sx += 20 + label.length * 7 + (kind === 'energy' ? 44 : 26);
  }
  parts.push(`<text x="20" y="${y2 + 34}" dominant-baseline="central" font-family="${FONT}" font-size="12" font-style="italic" fill="${MUTED}">${SW_BODY_LABEL[body]} — schematic top view, not to scale; front to the right. Numbers refer to the component table; parts are placed by vehicle zone.</text>`);
  return `<g>${parts.join('')}</g>`;
}

const SW_BODY_LABEL: Record<SWBodyType, string> = { suv: 'SUV', saloon: 'Saloon', hatchback: 'Hatchback', pickup: 'Pickup', van: 'Van' };

function escXml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);
}

/** The SVG for one of a report model's skeleton views. */
export function skeletonSVGFor(model: SWReportModel, view: SWReportSkeletonView, opts: { legend?: boolean } = {}): string {
  return buildReportSkeletonSVG({
    body: model.body, powertrain: model.powertrain,
    modules: model.result.modules.map(m => ({ id: m.moduleId, asil: m.asilUsed })),
    numbers: new Map(model.components.map(c => [c.id, c.no])),
    lit: view.lit, colourBy: view.colourBy, excluded: view.excluded, legend: opts.legend, title: view.title,
  });
}

/** Every skeleton view of a model as SVG (key → svg). */
export function skeletonSVGs(model: SWReportModel, opts: { legend?: boolean } = {}): Map<string, string> {
  return new Map(model.skeletons.map(v => [v.key, skeletonSVGFor(model, v, opts)]));
}

/** The pictures a report needs, with the size each is drawn at: the cover (no key), the architecture views, one per
 *  domain (with key), one per module and one per costing step (small, no key), and the scope view. */
export interface SkeletonImageSpec { key: string; svg: string; width: number; height: number; scale: number }

export function reportImageSpecs(model: SWReportModel): SkeletonImageSpec[] {
  const views = new Map(model.skeletons.map(v => [v.key, v]));
  const out: SkeletonImageSpec[] = [];
  const add = (key: string, view: SWReportSkeletonView | undefined, legend: boolean, scale: number) => {
    if (!view) return;
    out.push({ key, svg: skeletonSVGFor(model, view, { legend }), width: SKELETON_W, height: legend ? SKELETON_H : SKELETON_H_NO_LEGEND, scale });
  };
  const has = (id: string) => model.sections.some(x => x.id === id);
  const need = (key: string) => key === 'architecture' ? has('architecture')
    : key === 'architecture-count' ? has('architecture') && model.profile === 'vehicle'
    : key === 'excluded' ? has('scope') && model.slice.isWhole
    : key.startsWith('domain-') ? has('domains') && model.profile !== 'executive'
    : key.startsWith('module-') ? has('modules')
    : key.startsWith('step-') ? has('steps') : false;
  add('cover', views.get('architecture'), false, 2);
  for (const v of model.skeletons.filter(x => need(x.key))) {
    if (v.key === 'architecture' || v.key === 'architecture-count' || v.key === 'excluded' || v.key.startsWith('domain-')) add(v.key, v, true, v.key === 'architecture' ? 2 : 1.4);
    else add(v.key, v, false, v.key.startsWith('module-') ? 0.8 : 0.9);
  }
  return out;
}
