/**
 * Material picker: Family → Standard → Grade, for the casting, cast + machine and forging forms,
 * and Family → Polymer → Grade for injection moulding, blow moulding, thermoforming and extrusion
 * (material picker, Oct 2026). The taxonomies are data in src/engine/*-material-taxonomy.ts.
 *
 * The form's own grade <select> (`cast-mat`, `cam-mat`, `forge-mat`) stays the one value holder —
 * the CAD rules, drafts, demos and the collectors all read and write it — and becomes the "Grade"
 * step. Its options are grouped in <optgroup>s per family · standard; the two new drop-downs above
 * it only HIDE the groups outside the chosen family / standard, so every grade stays in `.options`
 * and a programmatic `sel.value = id` still lands. Setting the value (by code or by hand) moves
 * the family and standard to the grade's own, so the three never disagree.
 */
import { familyLabelOf, groupGrades, type MaterialTaxonomy } from '../engine/material-taxonomy.js';
import { CASTING_TAXONOMY } from '../engine/casting-material-taxonomy.js';
import { FORGING_TAXONOMY } from '../engine/forging-material-taxonomy.js';
import { BLOW_TAXONOMY, EXTRUSION_TAXONOMY, FORMING_TAXONOMY, MOULDING_TAXONOMY } from '../engine/polymer-material-taxonomy.js';

type Mat = { id: string; grade: string; category: string; pricePerKg: number; densityKgPerM3: number };

/** Each picker's grade select → its taxonomy and the route select beside it (default grade, route check). */
export const MATERIAL_PICKERS: Record<string, { tax: MaterialTaxonomy; subtype?: string }> = {
  'cast-mat': { tax: CASTING_TAXONOMY, subtype: 'cast-subtype' },
  'cam-mat': { tax: CASTING_TAXONOMY, subtype: 'cam-cast-subtype' },
  'forge-mat': { tax: FORGING_TAXONOMY },
  'imm-mat': { tax: MOULDING_TAXONOMY },
  'bm-mat': { tax: BLOW_TAXONOMY },
  'tf-mat': { tax: FORMING_TAXONOMY },
  'ext-mat': { tax: EXTRUSION_TAXONOMY },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The grade drop-down's options, grouped family · standard, each tagged with both. */
export function materialOptionsHtml(tax: MaterialTaxonomy, materials: Mat[], fmtPrice: (gbp: number) => string): string {
  return groupGrades(tax, materials).map(g => {
    const opts = g.grades.map(m => {
      const use = tax.info(m).use;
      return `<option value="${esc(m.id)}" data-fam="${g.family}" data-std="${esc(g.standard)}" data-density="${m.densityKgPerM3}">`
        + `${esc(m.grade)}${use ? ` · ${use}` : ''} — ${fmtPrice(m.pricePerKg)}/kg</option>`;
    }).join('');
    return `<optgroup label="${esc(`${familyLabelOf(tax, g.family)} · ${g.standard}`)}" data-fam="${g.family}" data-std="${esc(g.standard)}">${opts}</optgroup>`;
  }).join('');
}

/** Casting grades grouped (kept for the casting forms and the CAD panel). */
export const castingMaterialOptionsHtml = (materials: Mat[], fmtPrice: (gbp: number) => string): string =>
  materialOptionsHtml(CASTING_TAXONOMY, materials, fmtPrice);

/** Adds Family and Standard above the grade select (once) and brings all three in line. */
export function wireMaterialPicker(sel: HTMLSelectElement): void {
  const id = sel.id;
  const cfg = MATERIAL_PICKERS[id];
  if (!cfg) return;
  let famSel = document.getElementById(`${id}-family`) as HTMLSelectElement | null;
  let stdSel = document.getElementById(`${id}-standard`) as HTMLSelectElement | null;
  if (!famSel || !stdSel) {
    const grp = sel.closest('.field-group');
    const row = grp?.parentElement;
    if (!grp || !row) return;
    const famGrp = document.createElement('div');
    famGrp.className = 'field-group';
    famGrp.innerHTML = `<label for="${id}-family">Material family</label><select id="${id}-family" title="The material family — then narrow it below and pick the grade."></select>`;
    row.replaceChild(famGrp, grp);
    // Standard and Grade each take the full width: the names are long (EN 1563 (EN-GJS), EN-GJS-500-7 (Ductile Iron)).
    const stdGrp = document.createElement('div');
    stdGrp.className = 'field-group';
    stdGrp.style.marginTop = '6px';
    const level = cfg.tax.levelLabel ?? 'Standard';
    stdGrp.innerHTML = level === 'Standard'
      ? `<label for="${id}-standard">Standard</label><select id="${id}-standard" title="The material standard the grade is designated in. 'All standards' lists every grade of the family."></select>`
      : `<label for="${id}-standard">${esc(level)}</label><select id="${id}-standard" title="The base ${esc(level.toLowerCase())} (ISO 1043 code). 'All' lists every grade of the family."></select>`;
    const lab = grp.querySelector('label');
    if (lab) { lab.textContent = 'Grade'; lab.htmlFor = id; }
    (grp as HTMLElement).style.marginTop = '6px';
    const info = document.createElement('div');
    info.id = `${id}-info`;
    info.className = 'mat-pick-info';
    info.setAttribute('aria-live', 'polite');
    info.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);margin:4px 2px 0';
    row.after(stdGrp, grp, info);
    famSel = famGrp.querySelector('select')!;
    stdSel = stdGrp.querySelector('select')!;
    const fam = famSel, std = stdSel;

    const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
    const INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex')!;
    // A grade set by code (CAD apply, drafts, demos) or by hand moves family and standard with it.
    Object.defineProperty(sel, 'value', { configurable: true, get() { return VALUE.get!.call(this); }, set(v: string) { VALUE.set!.call(this, v); sync(sel); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return INDEX.get!.call(this); }, set(v: number) { INDEX.set!.call(this, v); sync(sel); } });
    sel.addEventListener('change', () => sync(sel));
    subtypeOf(sel)?.addEventListener('change', () => sync(sel));

    fam.addEventListener('change', () => {
      std.value = '';
      const cur = sel.selectedOptions[0];
      if (cur?.dataset.fam !== fam.value) {
        const def = cfg.tax.defaultGrade(fam.value, subtypeOf(sel)?.value);
        pick(sel, o => o.value === def && o.dataset.fam === fam.value);
        if (sel.selectedOptions[0]?.dataset.fam !== fam.value) pick(sel, o => o.dataset.fam === fam.value);
      } else sync(sel);
    });
    std.addEventListener('change', () => {
      const cur = sel.selectedOptions[0];
      if (std.value && cur?.dataset.std !== std.value) pick(sel, o => o.dataset.fam === fam.value && o.dataset.std === std.value);
      else sync(sel);
    });
  }
  sync(sel);
}

/** Selects the first grade matching, and tells the form (alloy warnings, advisor) it changed. */
function pick(sel: HTMLSelectElement, ok: (o: HTMLOptionElement) => boolean): void {
  const o = Array.from(sel.options).find(ok);
  if (!o) return;
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

const subtypeOf = (sel: HTMLSelectElement) =>
  document.getElementById(MATERIAL_PICKERS[sel.id]?.subtype ?? '') as HTMLSelectElement | null;

function sync(sel: HTMLSelectElement): void {
  const cfg = MATERIAL_PICKERS[sel.id];
  const famSel = document.getElementById(`${sel.id}-family`) as HTMLSelectElement | null;
  const stdSel = document.getElementById(`${sel.id}-standard`) as HTMLSelectElement | null;
  if (!cfg || !famSel || !stdSel) return;
  const opts = Array.from(sel.options).filter(o => o.dataset.fam);
  const cur = sel.selectedOptions[0];
  const fam = cur?.dataset.fam ?? famSel.value ?? opts[0]?.dataset.fam ?? '';

  const fams = cfg.tax.families.filter(f => opts.some(o => o.dataset.fam === f.id));
  const famHtml = fams.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('');
  if (famSel.dataset.html !== famHtml) { famSel.innerHTML = famHtml; famSel.dataset.html = famHtml; }
  famSel.value = fam;

  const stds = [...new Set(opts.filter(o => o.dataset.fam === fam).map(o => o.dataset.std!))];
  const stdHtml = `<option value="">All ${(cfg.tax.levelLabel ?? 'Standard').toLowerCase()}s (${stds.length})</option>` + stds.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const keep = stdSel.value;
  if (stdSel.dataset.html !== stdHtml) { stdSel.innerHTML = stdHtml; stdSel.dataset.html = stdHtml; }
  stdSel.value = keep && cur?.dataset.std === keep ? keep : '';
  const std = stdSel.value;

  for (const g of Array.from(sel.querySelectorAll<HTMLOptGroupElement>('optgroup'))) {
    const show = g.dataset.fam === fam && (!std || g.dataset.std === std);
    g.hidden = !show;
    for (const o of Array.from(g.children) as HTMLOptionElement[]) o.hidden = !show;
  }

  const info = document.getElementById(`${sel.id}-info`);
  if (info) {
    const f = cfg.tax.families.find(x => x.id === fam);
    const density = Number(cur?.dataset.density);
    const described = cur && cfg.tax.describe?.(cur.value, density);
    info.textContent = !cur?.dataset.fam || !f ? ''
      : described ?? `${f.label} · ${cur.dataset.std} · ${density.toLocaleString('en-GB')} kg/m³ · usual routes: ${f.processes}`;
    const warning = cfg.tax.routeWarning?.(fam, subtypeOf(sel)?.value);
    if (warning) {
      const w = document.createElement('div');
      w.className = 'mat-pick-warn';
      w.style.cssText = 'color:var(--warning);font-weight:600;margin-top:2px';
      w.textContent = `⚠ ${warning}`;
      info.appendChild(w);
    }
  }
}
