/**
 * Sheet-metal material picker (Oct 2026): every sheet grade the library offers to the stamping and
 * fab forms is filed under a family and the standard it is designated in (EN 10130, EN 10346,
 * EN 10338, EN 10106…), so an engineer picks AHSS → Dual-phase → DP780 instead of scrolling 82 grades.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../src/engine/material-scope.js';
import { OTHER_STANDARD } from '../src/engine/material-taxonomy.js';
import { SHEET_FAMILIES, SHEET_STANDARDS, SHEET_TAXONOMY, groupSheetGrades, sheetFamilyDefaultGrade, sheetGradeInfo } from '../src/engine/sheet-material-taxonomy.js';
import { MATERIAL_PICKERS, materialOptionsHtml } from '../src/ui/material-picker.js';

const sheets = DEFAULT_RATE_LIBRARY.materials.filter(m => MATERIAL_SCOPE_BY_COMMODITY.sheet_metal.test(m.category));

describe('sheet-metal material taxonomy', () => {
  it('both sheet forms use it, and offer the same grades', () => {
    expect(MATERIAL_PICKERS['sm-mat'].tax).toBe(SHEET_TAXONOMY);
    expect(MATERIAL_PICKERS['smf-mat'].tax).toBe(SHEET_TAXONOMY);
    expect(MATERIAL_SCOPE_BY_COMMODITY.sheet_metal_fab.source).toBe(MATERIAL_SCOPE_BY_COMMODITY.sheet_metal.source);
  });

  it('files every library sheet grade under a known family and standard, each once', () => {
    expect(sheets.filter(m => !sheetGradeInfo(m).known).map(m => m.id), 'add these to GRADES in sheet-material-taxonomy.ts').toEqual([]);
    for (const m of sheets) expect(SHEET_STANDARDS[sheetGradeInfo(m).family as keyof typeof SHEET_STANDARDS]).toContain(sheetGradeInfo(m).standard);
    expect(groupSheetGrades(sheets).flatMap(g => g.grades.map(m => m.id)).sort()).toEqual(sheets.map(m => m.id).sort());
  });

  it('metal families follow the library category: aluminium, stainless, electrical, copper, spring', () => {
    const fam = (c: string) => /alumin/i.test(c) ? 'aluminium' : /stainless/i.test(c) ? 'stainless' : /electrical/i.test(c) ? 'electrical'
      : /copper|brass/i.test(c) ? 'copper' : /press-hardening/i.test(c) ? 'phs' : null;
    for (const m of sheets) {
      const expected = fam(m.category);
      if (expected) expect(sheetGradeInfo(m).family, m.id).toBe(expected);
    }
  });

  it('the standards engineers look for', () => {
    const at = (id: string) => { const i = sheetGradeInfo(sheets.find(m => m.id === id)!); return `${i.family} | ${i.standard}`; };
    expect(at('mat-dc04')).toBe('mild | EN 10130 cold-rolled (DC)');
    expect(at('mat-dc03-ga')).toBe('coated | EN 10346 hot-dip (GI, GA, ZM)');
    expect(at('mat-dp780')).toBe('ahss | Dual-phase (DP) — EN 10338');
    expect(at('mat-s355mc')).toBe('hss | EN 10149-2 hot-rolled (S…MC)');
    expect(at('mat-usibor1500')).toBe('phs | AlSi-coated PHS (Usibor — proprietary)');
    expect(at('mat-nogo-m270-35a')).toBe('electrical | Non-oriented — EN 10106 (M…A)');
    expect(at('mat-go-m105-30p')).toBe('electrical | Grain-oriented — EN 10107 (M…P / S)');
    expect(at('mat-aa6016-t4')).toBe('aluminium | 6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA');
  });

  it('a 5xxx / 6xxx / 7xxx / 1xxx grade sits under its own aluminium series', () => {
    for (const m of sheets.filter(x => /^AA(\d)/.test(x.grade))) {
      const series = /^AA(\d)/.exec(m.grade)![1];
      expect(sheetGradeInfo(m).standard, m.id).toMatch(new RegExp(`${series}xxx`));
    }
  });

  it('picking a family opens on a library grade of that family; a company grade is kept', () => {
    for (const f of SHEET_FAMILIES) {
      const m = sheets.find(x => x.id === sheetFamilyDefaultGrade(f.id));
      expect(m, f.id).toBeDefined();
      expect(sheetGradeInfo(m!).family).toBe(f.id);
    }
    const extra = { id: 'mat-co-dp', grade: 'Supplier DP800', category: 'AHSS Sheet', pricePerKg: 1, densityKgPerM3: 7850 };
    expect(groupSheetGrades([...sheets, extra]).find(g => g.grades.includes(extra))).toMatchObject({ family: 'ahss', standard: OTHER_STANDARD });
  });

  it('the grade drop-down HTML is grouped and priced', () => {
    const html = materialOptionsHtml(SHEET_TAXONOMY, sheets, p => `£${p.toFixed(2)}`);
    expect((html.match(/<option /g) ?? []).length).toBe(sheets.length);
    expect(html).toContain('<optgroup label="AHSS · Dual-phase (DP) — EN 10338" data-fam="ahss"');
    expect(html).toMatch(/<option value="mat-dp600" data-fam="ahss"[^>]*>DP600 — £[\d.]+\/kg<\/option>/);
  });
});
