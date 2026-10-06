/**
 * Casting material picker: Family → Standard → Grade (casting material picker, Oct 2026).
 *
 * The form's own grade <select> (`cast-mat`, `cam-mat`) stays the one value holder — the CAD
 * rules, drafts, demos and the collectors all read and write it — and becomes the "Grade" step.
 * Its options are grouped in <optgroup>s per family · standard; the two new drop-downs above it
 * only HIDE the groups outside the chosen family / standard, so every grade stays in `.options`
 * and a programmatic `sel.value = id` still lands. Setting the value (by code or by hand) moves
 * the family and standard to the grade's own, so the three never disagree.
 */
import { CAST_FAMILIES, HPDC_FAMILIES, castGradeInfo, familyDefaultGrade, familyLabel, groupCastingGrades, type CastFamily } from '../engine/casting-material-taxonomy.js';

type Mat = { id: string; grade: string; category: string; pricePerKg: number; densityKgPerM3: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The grade drop-down's options, grouped family · standard, each tagged with both. */
export function castingMaterialOptionsHtml(materials: Mat[], fmtPrice: (gbp: number) => string): string {
  return groupCastingGrades(materials).map(g => {
    const opts = g.grades.map(m => {
      const use = castGradeInfo(m).use;
      return `<option value="${esc(m.id)}" data-fam="${g.family}" data-std="${esc(g.standard)}" data-density="${m.densityKgPerM3}">`
        + `${esc(m.grade)}${use ? ` · ${use}` : ''} — ${fmtPrice(m.pricePerKg)}/kg</option>`;
    }).join('');
    return `<optgroup label="${esc(`${familyLabel(g.family)} · ${g.standard}`)}" data-fam="${g.family}" data-std="${esc(g.standard)}">${opts}</optgroup>`;
  }).join('');
}


/** Adds Family and Standard above the grade select (once) and brings all three in line. */
export function wireCastingMaterialPicker(sel: HTMLSelectElement): void {
  const id = sel.id;
  let famSel = document.getElementById(`${id}-family`) as HTMLSelectElement | null;
  let stdSel = document.getElementById(`${id}-standard`) as HTMLSelectElement | null;
  if (!famSel || !stdSel) {
    const grp = sel.closest('.field-group');
    const row = grp?.parentElement;
    if (!grp || !row) return;
    const famGrp = document.createElement('div');
    famGrp.className = 'field-group';
    famGrp.innerHTML = `<label for="${id}-family">Material family</label><select id="${id}-family" title="Aluminium, cast iron, steel… — then pick the standard and the grade below."></select>`;
    row.replaceChild(famGrp, grp);
    // Standard and Grade each take the full width: the names are long (EN 1563 (EN-GJS), EN-GJS-500-7 (Ductile Iron)).
    const stdGrp = document.createElement('div');
    stdGrp.className = 'field-group';
    stdGrp.style.marginTop = '6px';
    stdGrp.innerHTML = `<label for="${id}-standard">Standard</label><select id="${id}-standard" title="The material standard the grade is designated in. 'All standards' lists every grade of the family."></select>`;
    const lab = grp.querySelector('label');
    if (lab) { lab.textContent = 'Grade'; lab.htmlFor = id; }
    (grp as HTMLElement).style.marginTop = '6px';
    const info = document.createElement('div');
    info.id = `${id}-info`;
    info.className = 'cast-mat-info';
    info.setAttribute('aria-live', 'polite');
    info.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);margin:4px 2px 0';
    row.after(stdGrp, grp, info);
    const row2 = stdGrp;
    famSel = famGrp.querySelector('select')!;
    stdSel = row2.querySelector<HTMLSelectElement>(`#${id}-standard`)!;
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
        const def = familyDefaultGrade(fam.value as CastFamily, subtypeOf(sel)?.value);
        pick(sel, o => o.value === def && o.dataset.fam === fam.value);
        if (sel.selectedOptions[0]?.dataset.fam !== fam.value) pick(sel, o => o.dataset.fam === fam.value);
      }
      else sync(sel);
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

/** The casting route select beside the grade (the HPDC check and the aluminium default read it). */
const SUBTYPE_OF: Record<string, string> = { 'cast-mat': 'cast-subtype', 'cam-mat': 'cam-cast-subtype' };
const subtypeOf = (sel: HTMLSelectElement) => document.getElementById(SUBTYPE_OF[sel.id] ?? '') as HTMLSelectElement | null;

function sync(sel: HTMLSelectElement): void {
  const famSel = document.getElementById(`${sel.id}-family`) as HTMLSelectElement | null;
  const stdSel = document.getElementById(`${sel.id}-standard`) as HTMLSelectElement | null;
  if (!famSel || !stdSel) return;
  const opts = Array.from(sel.options).filter(o => o.dataset.fam);
  const cur = sel.selectedOptions[0];
  const fam = (cur?.dataset.fam ?? famSel.value ?? opts[0]?.dataset.fam ?? '') as CastFamily;

  const fams = CAST_FAMILIES.filter(f => opts.some(o => o.dataset.fam === f.id));
  const famHtml = fams.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('');
  if (famSel.dataset.html !== famHtml) { famSel.innerHTML = famHtml; famSel.dataset.html = famHtml; }
  famSel.value = fam;

  const stds = [...new Set(opts.filter(o => o.dataset.fam === fam).map(o => o.dataset.std!))];
  const stdHtml = `<option value="">All standards (${stds.length})</option>` + stds.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
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
    const f = CAST_FAMILIES.find(x => x.id === fam);
    const hpdcMismatch = subtypeOf(sel)?.value === 'hpdc' && !HPDC_FAMILIES.includes(fam);
    info.textContent = cur?.dataset.fam && f
      ? `${f.label} · ${cur.dataset.std} · ${Number(cur.dataset.density).toLocaleString('en-GB')} kg/m³ · usual routes: ${f.processes}`
      : '';
    let warn = info.querySelector<HTMLElement>('.cast-mat-warn');
    if (hpdcMismatch && f) {
      warn = document.createElement('div');
      warn.className = 'cast-mat-warn';
      warn.style.cssText = 'color:var(--warning);font-weight:600;margin-top:2px';
      warn.textContent = `⚠ ${f.label} cannot be high-pressure die cast — HPDC is for aluminium, magnesium or zinc. Set the subtype to sand or investment.`;
      info.appendChild(warn);
    }
  }
}
