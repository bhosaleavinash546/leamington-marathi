/**
 * Aluminium extrusion — the screen form (built Oct 2026).
 *
 * A module, not main.ts (review L12). The form holds what the CAD rules state —
 * the section, the alloy and the choices — and the collector hands them to the
 * SAME builder headless uses (`buildAlExtrusionInputs`), so the press plan, the
 * yield and the die are worked out once, in the engine, for both paths. An
 * engineer can also cost a profile by hand: type the section and Calculate.
 */
import { AL_ALLOYS, AL_ALLOY_LIST, type AlAlloy, type AlExtrusionRoute, type AlFinish, type AlDieType, type AlSeries } from '../engine/al-extrusion-data.js';
import {
  buildAlExtrusionInputs, computeAluminiumExtrusionDrivers, type AlTemper, type AlExtrusionBuild,
} from '../engine/modules/aluminium-extrusion.js';
import type { CommodityDrivers } from '../engine/types.js';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderAlExtrusionForm(): string {
  // Grouped by series, so 31 alloys read as a list an engineer can scan.
  const SERIES: Array<[AlSeries, string]> = [['1xxx', '1xxx — pure aluminium'], ['3xxx', '3xxx — Al-Mn'], ['5xxx', '5xxx — Al-Mg'],
    ['6xxx', '6xxx — Al-Mg-Si'], ['2xxx', '2xxx — Al-Cu'], ['7xxx', '7xxx — Al-Zn-Mg']];
  const alloyOpts = SERIES.map(([ser, lab]) => `<optgroup label="${lab}">`
    + AL_ALLOY_LIST.filter(a => AL_ALLOYS[a].series === ser)
      .map(a => `<option value="${a}"${a === '6063' ? ' selected' : ''}>${esc(AL_ALLOYS[a].label)}</option>`).join('')
    + '</optgroup>').join('');
  const f = (id: string, label: string, value: string, tip: string, step = 'any') =>
    `<div class="field-group"><label for="${id}">${label} <span title="${esc(tip)}">ℹ</span></label><input type="number" id="${id}" step="${step}" min="0" value="${value}"/></div>`;
  return `
    <div class="section-title">Alloy and process</div>
    <div class="field-row">
      <div class="field-group"><label for="alx-alloy">Alloy</label><select id="alx-alloy">${alloyOpts}</select></div>
      <div class="field-group"><label for="alx-route">Process</label><select id="alx-route">
        <option value="direct" selected>Direct (forward) hot extrusion</option>
        <option value="indirect">Indirect (backward) hot extrusion</option>
        <option value="hydrostatic">Hydrostatic extrusion</option>
        <option value="conform">Conform continuous extrusion (rod feed)</option>
        <option value="impact">Cold impact extrusion (cup / can)</option>
      </select></div>
      <div class="field-group"><label for="alx-die">Die</label><select id="alx-die">
        <option value="" selected>— From the section —</option>
        <option value="solid">Solid (flat)</option><option value="semi-hollow">Semi-hollow</option>
        <option value="hollow-porthole">Porthole hollow</option><option value="hollow-bridge">Bridge hollow</option>
        <option value="seamless-mandrel">Seamless (mandrel)</option><option value="multi-port">Micro multi-port</option>
      </select></div>
    </div>
    <div class="section-title" style="margin-top:8px">Section (measured from CAD, or typed)</div>
    <div class="field-row">
      ${f('alx-area', 'Section area (mm²)', '300', 'Cross-section area: volume ÷ length for a constant section.')}
      ${f('alx-perim', 'Outline (mm)', '300', 'Section outline, outer and inner loops.')}
      ${f('alx-ccd', 'Circumscribing circle (mm)', '50', 'Smallest circle that encloses the section — sizes the die and the press.')}
    </div>
    <div class="field-row" style="margin-top:6px">
      ${f('alx-voids', 'Voids (chambers)', '0', '0 = solid section; ≥ 1 = hollow (porthole, bridge or seamless die).', '1')}
      ${f('alx-tongue', 'Tongue ratio', '0', 'Largest space the outline nearly encloses ÷ its gap². 3:1 or more needs a semi-hollow die.')}
      ${f('alx-wall', 'Thinnest wall (mm)', '2', 'Thin walls slow the press.')}
      ${f('alx-length', 'Cut length (mm)', '1000', 'Finished part length.')}
      ${f('alx-part-wt', 'Finished part (kg)', '0.81', 'Weight after fabrication (less than the extruded length when machined).')}
    </div>
    <div class="section-title" style="margin-top:8px">Heat treatment, fabrication and finish</div>
    <div class="field-row">
      <div class="field-group"><label for="alx-temper">Temper</label><select id="alx-temper">
        ${['H112', 'O', 'F', 'T3', 'T3510', 'T3511', 'T4', 'T5', 'T6', 'T64', 'T66', 'T7', 'T73', 'T76', 'T8'].map(t => `<option value="${t}"${t === 'T6' ? ' selected' : ''}>${t}</option>`).join('')}
      </select></div>
      ${f('alx-bends', 'Stretch bends', '0', 'Bends after extrusion (swept bumper beams, roof rails).', '1')}
      ${f('alx-cnc-min', 'CNC cutting (min)', '0', 'Holes, slots and end machining across the profile.')}
      ${f('alx-cnc-fix', 'CNC set-ups', '0', 'Fixturings on the long-bed centre.', '1')}
      ${f('alx-fab-rows', 'Feature rows', '0', 'Rows to programme.', '1')}
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label for="alx-finish">Finish</label><select id="alx-finish">
        <option value="mill" selected>Mill finish</option><option value="anodise">Anodised</option>
        <option value="powder">Powder coated</option><option value="ecoat">E-coat / conversion coat</option>
      </select></div>
      ${f('alx-finish-area', 'Whole surface (m²)', '0.1', 'Every surface, chambers included — what anodising and e-coat treat.')}
      ${f('alx-finish-out', 'Outside surface (m²)', '0', 'Outer outline × length — what powder coats. 0 = use the whole surface.')}
      ${f('alx-impact-dia', 'Cup Ø (mm, impact)', '0', 'Impact extrusion only: outer diameter.')}
      ${f('alx-amort', 'Annual volume', '50000', 'Parts a year — dies are amortised over it.', '1000')}
    </div>
    <div id="alx-plan" class="process-info-band" style="margin-top:8px;padding:6px 10px;border-left:3px solid var(--accent);border-radius:4px;font-size:0.8em;line-height:1.45"></div>`;
}

export interface AlFormReader {
  num(id: string): number;
  sel(id: string): string;
}

/** Read the form into the shared builder. */
export function buildFromForm(r: AlFormReader, annualVolumeFallback: number): AlExtrusionBuild {
  const alloy = (r.sel('alx-alloy') || '6063') as AlAlloy;
  const die = r.sel('alx-die') as AlDieType | '';
  return buildAlExtrusionInputs({
    alloy, route: (r.sel('alx-route') || 'direct') as AlExtrusionRoute,
    ...(die ? { dieType: die } : {}),
    section: { areaMm2: r.num('alx-area'), perimeterMm: r.num('alx-perim'), ccdMm: r.num('alx-ccd'),
      voids: Math.round(r.num('alx-voids')), minWallMm: r.num('alx-wall'), partLengthMm: r.num('alx-length'),
      ...(r.num('alx-tongue') > 0 ? { tongueRatio: r.num('alx-tongue') } : {}) },
    partWeightKg: r.num('alx-part-wt'),
    annualVolume: r.num('alx-amort') || annualVolumeFallback,
    temper: (r.sel('alx-temper') || AL_ALLOYS[alloy].defaultTemper) as AlTemper,
    finish: (r.sel('alx-finish') || 'mill') as AlFinish, finishAreaM2: r.num('alx-finish-area'),
    ...(r.num('alx-finish-out') > 0 ? { finishOutsideAreaM2: r.num('alx-finish-out') } : {}),
    bends: Math.round(r.num('alx-bends')), cncMinutes: r.num('alx-cnc-min'),
    cncFixturings: Math.round(r.num('alx-cnc-fix')), fabFeatureRows: Math.round(r.num('alx-fab-rows')),
    ...(r.num('alx-impact-dia') > 0 ? { impactOuterDiaMm: r.num('alx-impact-dia') } : {}),
  });
}

export function collectAlExtrusionDrivers(r: AlFormReader, annualVolumeFallback: number):
  { drivers: CommodityDrivers; build: AlExtrusionBuild } {
  const build = buildFromForm(r, annualVolumeFallback);
  return { drivers: computeAluminiumExtrusionDrivers(build.inputs), build };
}

/** The live plan panel: what the press, die and yield come out at, as the fields change. */
export function renderPlanPanel(build: AlExtrusionBuild): string {
  const p = build.plan;
  const head = p
    ? `<strong>${esc(p.pressLabel)}</strong> · ${esc(p.dieType)} die × ${p.holes} · ratio ${p.ratio} · ${p.forceT} t (${p.forceUsePct}%) · `
      + `${p.exitSpeedMPerMin} m/min · billet ${p.billetMm} mm${p.forceLimitedBilletMm && p.forceLimitedBilletMm < p.billetMm + 50 ? ' (force-limited)' : ''} · `
      + `${p.millLengthsPerStrand} × ${(p.millLengthMm / 1000).toFixed(2)} m mill lengths · ${p.partsPerPush} parts a push · recovery ${(p.recovery * 100).toFixed(1)}%`
    : `<strong>${esc(build.inputs.pressId)}</strong> · ${build.inputs.route}`;
  return `${head}<div style="color:var(--text-secondary);margin-top:3px">${build.notes.map(esc).join('<br>')}</div>`
    + (build.warnings.length ? `<div style="color:var(--warning,#b45309);margin-top:3px">${build.warnings.map(esc).join('<br>')}</div>` : '');
}

export function wireAlExtrusionForm(r: AlFormReader, annualVolumeFallback: () => number): void {
  const update = () => {
    const panel = document.getElementById('alx-plan');
    if (!panel) return;
    try { panel.innerHTML = renderPlanPanel(buildFromForm(r, annualVolumeFallback())); } catch { panel.textContent = ''; }
  };
  document.querySelectorAll<HTMLElement>('[id^="alx-"]').forEach(e => e.addEventListener('change', update));
  update();
}
