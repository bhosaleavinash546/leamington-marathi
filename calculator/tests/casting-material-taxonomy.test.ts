/**
 * Casting material picker (Oct 2026): every casting grade the library offers is filed under a
 * family and a material standard, and the grade drop-down's HTML groups them that way, so a cost
 * engineer picks Cast iron → Ductile (SG) — EN 1563 → EN-GJS-500-7.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../src/engine/material-scope.js';
import { CAST_FAMILIES, CAST_STANDARDS, OTHER_STANDARD, castGradeInfo, familyDefaultGrade, groupCastingGrades } from '../src/engine/casting-material-taxonomy.js';
import { castingMaterialOptionsHtml } from '../src/ui/material-picker.js';

const castGrades = DEFAULT_RATE_LIBRARY.materials.filter(m => MATERIAL_SCOPE_BY_COMMODITY.casting.test(m.category));

describe('casting material taxonomy', () => {
  it('files every library casting grade under a known family and standard (none in "Other")', () => {
    const unknown = castGrades.filter(m => !castGradeInfo(m).known).map(m => m.id);
    expect(unknown, 'add these to GRADES in casting-material-taxonomy.ts').toEqual([]);
    for (const m of castGrades) expect(CAST_STANDARDS[castGradeInfo(m).family]).toContain(castGradeInfo(m).standard);
  });

  it('cast + machine offers the same grades as casting', () => {
    expect(MATERIAL_SCOPE_BY_COMMODITY.cast_and_machine.source).toBe(MATERIAL_SCOPE_BY_COMMODITY.casting.source);
  });

  it('a family is never contradicted by the library category (iron is iron, aluminium is aluminium)', () => {
    const fam = (c: string) => /alumin/i.test(c) ? 'aluminium' : /iron/i.test(c) ? 'cast_iron' : /stainless/i.test(c) ? 'stainless'
      : /steel/i.test(c) ? 'steel' : /magnesium/i.test(c) ? 'magnesium' : /zinc/i.test(c) ? 'zinc' : /copper/i.test(c) ? 'copper' : 'nickel';
    for (const m of castGrades) expect(castGradeInfo(m).family, m.id).toBe(fam(m.category));
  });

  it('the families and standards engineers look for', () => {
    const at = (id: string) => { const i = castGradeInfo(castGrades.find(m => m.id === id)!); return `${i.family} | ${i.standard}`; };
    expect(at('mat-gjs500')).toBe('cast_iron | Ductile (SG) — EN 1563 (EN-GJS)');
    expect(at('mat-gjl250')).toBe('cast_iron | Grey — EN 1561 (EN-GJL)');
    expect(at('mat-gjv450')).toBe('cast_iron | Compacted graphite — EN 16079 (EN-GJV)');
    expect(at('mat-lm25')).toBe('aluminium | BS 1490 (LM)');
    expect(at('mat-adc12')).toBe('aluminium | JIS H 5302 (ADC)');
    expect(at('mat-g42crmo4')).toBe('steel | EN 10293 (general engineering)');
    expect(at('mat-cf8m-cast')).toBe('stainless | ASTM A743 / EN 10283 (corrosion-resistant)');
  });

  it('groups come out family by family in the picker order, every grade exactly once', () => {
    const groups = groupCastingGrades(castGrades);
    const famOrder = CAST_FAMILIES.map(f => f.id);
    const seen = groups.map(g => famOrder.indexOf(g.family));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(groups.flatMap(g => g.grades.map(m => m.id)).sort()).toEqual(castGrades.map(m => m.id).sort());
  });

  it('a company grade the table does not know is kept, filed by its category', () => {
    const extra = { id: 'mat-company-gjs', grade: 'Supplier SG iron', category: 'Ductile Cast Iron', pricePerKg: 1, densityKgPerM3: 7100 };
    const g = groupCastingGrades([...castGrades, extra]).find(x => x.grades.includes(extra));
    expect(g).toMatchObject({ family: 'cast_iron', standard: OTHER_STANDARD });
  });

  it('the grade drop-down HTML: one optgroup per family · standard, each option tagged and priced', () => {
    const html = castingMaterialOptionsHtml(castGrades, p => `£${p.toFixed(2)}`);
    expect((html.match(/<option /g) ?? []).length).toBe(castGrades.length);
    expect(html).toContain('<optgroup label="Cast iron · Ductile (SG) — EN 1563 (EN-GJS)" data-fam="cast_iron"');
    expect(html).toMatch(/<option value="mat-gjs500" data-fam="cast_iron" data-std="Ductile \(SG\) — EN 1563 \(EN-GJS\)" data-density="7100">EN-GJS-500-7 \(Ductile Iron\) — £[\d.]+\/kg<\/option>/);
    expect(html).toMatch(/LM25 \/ A356 · sand \/ gravity — £/);
    expect(html).not.toMatch(/\(UK\)/);
  });

  it('picking a family opens on a library grade of that family (aluminium follows the route)', () => {
    for (const f of CAST_FAMILIES) for (const sub of ['hpdc', 'sand']) {
      const m = castGrades.find(x => x.id === familyDefaultGrade(f.id, sub));
      expect(m, `${f.id}/${sub}`).toBeDefined();
      expect(castGradeInfo(m!).family).toBe(f.id);
    }
    expect(familyDefaultGrade('aluminium', 'hpdc')).toBe('mat-adc12');
    expect(familyDefaultGrade('aluminium', 'sand')).toBe('mat-lm25');
  });
});
