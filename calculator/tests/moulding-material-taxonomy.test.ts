/**
 * Injection-moulding material picker (Oct 2026): resins are picked Family → Polymer → Grade — a
 * plastic is its base polymer (ISO 1043) plus a filler, not a grade in a material standard. Every
 * library moulding resin is filed; the info line carries morphology, drying and the ISO 11469 marking.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../src/engine/material-scope.js';
import {
  MOULD_FAMILIES, MOULD_STANDARDS, MOULDING_TAXONOMY, POLYMERS, describeMouldGrade, groupMouldingGrades,
  mouldFamilyDefaultGrade, mouldGradeFacts, mouldGradeInfo,
} from '../src/engine/moulding-material-taxonomy.js';
import { OTHER_STANDARD } from '../src/engine/material-taxonomy.js';
import { MATERIAL_PICKERS, materialOptionsHtml } from '../src/ui/material-picker.js';

const resins = DEFAULT_RATE_LIBRARY.materials.filter(m => MATERIAL_SCOPE_BY_COMMODITY.injection_moulding.test(m.category));

describe('moulding material taxonomy', () => {
  it('files every library moulding resin under a family and polymer (none in "Other / company grades")', () => {
    expect(resins.length).toBeGreaterThan(50);
    expect(resins.filter(m => !mouldGradeInfo(m).known).map(m => m.id), 'add these to GRADES in moulding-material-taxonomy.ts').toEqual([]);
    for (const m of resins) expect(MOULD_STANDARDS[mouldGradeInfo(m).family as keyof typeof MOULD_STANDARDS]).toContain(mouldGradeInfo(m).standard);
  });

  it('the middle step is the polymer, labelled with its ISO 1043 code', () => {
    expect(MOULDING_TAXONOMY.levelLabel).toBe('Polymer');
    const at = (id: string) => { const i = mouldGradeInfo(resins.find(m => m.id === id)!); return `${i.family} | ${i.standard}`; };
    expect(at('mat-pa66gf30')).toBe('polyamide | PA66 — polyamide 66');
    expect(at('mat-ppa-gf35')).toBe('polyamide | PPA — polyphthalamide (high-temp PA)');   // chemistry, not the library category
    expect(at('mat-tpo')).toBe('polyolefin | TPO — PP/EPDM olefin blend');
    expect(at('mat-pc-abs')).toBe('polycarbonate | PC+ABS');
    expect(at('mat-pp-t20')).toBe('polyolefin | PP — polypropylene');
  });

  it('every ISO 11469 marking starts with its own polymer code', () => {
    for (const m of resins) {
      const f = mouldGradeFacts(m.id)!;
      if (!f.marking) continue;
      const code = f.polymer === 'PE' ? 'PE-' : f.polymer;
      expect(f.marking.startsWith(`>${code}`), `${m.id} ${f.marking}`).toBe(true);
      expect(f.marking.endsWith('<')).toBe(true);
    }
  });

  it('a filled grade is marked with its filler, as the grade name states it', () => {
    for (const m of resins) {
      const mk = mouldGradeFacts(m.id)!.marking;
      const gf = /\bL?GF\s?(\d\d)/i.exec(m.grade)?.[1];
      if (mk && gf) expect(mk, m.id).toContain(`GF${gf}`);
      const t = /\bT(\d\d)\b/.exec(m.grade)?.[1];
      if (mk && t) expect(mk, m.id).toContain(`T${t}`);
    }
  });

  it('the info line: morphology, drying, density, marking — no price', () => {
    expect(describeMouldGrade('mat-pa66gf30', 1300)).toBe('Polyamides (nylon) · PA66 · semi-crystalline · dry before moulding · 1,300 kg/m³ · marking >PA66-GF30<');
    expect(describeMouldGrade('mat-pp', 900)).toContain('no drying needed');
    expect(describeMouldGrade('mat-pc-fr', 1220)).not.toContain('marking');   // FR code depends on the retardant
    for (const p of Object.values(POLYMERS)) expect(p.morphology).toBeTruthy();
  });

  it('every grade appears once, families in picker order; a company resin is kept', () => {
    const groups = groupMouldingGrades(resins);
    expect(groups.flatMap(g => g.grades.map(m => m.id)).sort()).toEqual(resins.map(m => m.id).sort());
    const order = groups.map(g => MOULD_FAMILIES.findIndex(f => f.id === g.family));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const extra = { id: 'mat-co-tpe', grade: 'Supplier TPE', category: 'Thermoplastic Elastomer', pricePerKg: 1, densityKgPerM3: 1000 };
    expect(groupMouldingGrades([...resins, extra]).find(g => g.grades.includes(extra))).toMatchObject({ family: 'tpe', standard: OTHER_STANDARD });
  });

  it('picking a family opens on a library grade of that family', () => {
    for (const f of MOULD_FAMILIES) {
      const m = resins.find(x => x.id === mouldFamilyDefaultGrade(f.id));
      expect(m, f.id).toBeDefined();
      expect(mouldGradeInfo(m!).family).toBe(f.id);
    }
  });

  it('the moulding form uses it; the grade drop-down HTML is grouped and priced', () => {
    expect(MATERIAL_PICKERS['imm-mat'].tax).toBe(MOULDING_TAXONOMY);
    const html = materialOptionsHtml(MOULDING_TAXONOMY, resins, p => `£${p.toFixed(2)}`);
    expect((html.match(/<option /g) ?? []).length).toBe(resins.length);
    expect(html).toContain('<optgroup label="Polyamides (nylon) · PA66 — polyamide 66" data-fam="polyamide"');
    expect(html).toMatch(/<option value="mat-pa66gf30" data-fam="polyamide"[^>]*>PA66 GF30 — £[\d.]+\/kg<\/option>/);
  });
});
