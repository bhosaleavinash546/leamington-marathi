/**
 * Forging material picker (Oct 2026): every forging billet the library offers is filed under a
 * family and a material standard, so a cost engineer picks Alloy steel → EN 10083-3 → 42CrMo4
 * instead of scrolling 45 billets in library order.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { MATERIAL_SCOPE_BY_COMMODITY } from '../src/engine/material-scope.js';
import { FORGE_FAMILIES, FORGE_STANDARDS, FORGING_TAXONOMY, forgeFamilyDefaultGrade, forgeGradeInfo, groupForgingGrades } from '../src/engine/forging-material-taxonomy.js';
import { OTHER_STANDARD } from '../src/engine/material-taxonomy.js';
import { materialOptionsHtml, MATERIAL_PICKERS } from '../src/ui/material-picker.js';

const forgeGrades = DEFAULT_RATE_LIBRARY.materials.filter(m => MATERIAL_SCOPE_BY_COMMODITY.forging.test(m.category));

describe('forging material taxonomy', () => {
  it('files every library forging grade under a known family and standard (none in "Other")', () => {
    expect(forgeGrades.filter(m => !forgeGradeInfo(m).known).map(m => m.id), 'add these to GRADES in forging-material-taxonomy.ts').toEqual([]);
    for (const m of forgeGrades) expect(FORGE_STANDARDS[forgeGradeInfo(m).family as keyof typeof FORGE_STANDARDS]).toContain(forgeGradeInfo(m).standard);
  });

  it('a family never contradicts the library category', () => {
    const fam = (c: string) => /stainless/i.test(c) ? 'stainless' : /^alloy steel/i.test(c) ? 'alloy_steel' : /steel/i.test(c) ? 'carbon_steel'
      : /alumin/i.test(c) ? 'aluminium' : /titanium/i.test(c) ? 'titanium' : /magnesium/i.test(c) ? 'magnesium' : /copper/i.test(c) ? 'copper' : 'nickel';
    for (const m of forgeGrades) expect(forgeGradeInfo(m).family, m.id).toBe(fam(m.category));
  });

  it('the standards engineers look for', () => {
    const at = (id: string) => { const i = forgeGradeInfo(forgeGrades.find(m => m.id === id)!); return `${i.family} | ${i.standard}`; };
    expect(at('mat-steel-42crmo4')).toBe('alloy_steel | EN 10083-3 (alloy QT)');
    expect(at('mat-steel-20mncr5')).toBe('alloy_steel | EN 10084 (case-hardening)');
    expect(at('mat-steel-38mnvs6')).toBe('carbon_steel | EN 10267 (microalloyed, controlled-cooled)');
    expect(at('mat-steel-c45')).toBe('carbon_steel | EN 10083 (non-alloy QT)');
    expect(at('mat-ss17-4ph-bar')).toBe('stainless | Precipitation-hardening — ASTM A564');
    expect(at('mat-al6082-forge')).toBe('aluminium | 6xxx Al-Mg-Si — EN 573 / AA');
  });

  it('every grade appears once, families in picker order; a company grade is kept under "Other"', () => {
    const groups = groupForgingGrades(forgeGrades);
    expect(groups.flatMap(g => g.grades.map(m => m.id)).sort()).toEqual(forgeGrades.map(m => m.id).sort());
    const order = groups.map(g => FORGE_FAMILIES.findIndex(f => f.id === g.family));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const extra = { id: 'mat-co-bar', grade: 'Supplier 42CrMo4', category: 'Alloy Steel Billet', pricePerKg: 1, densityKgPerM3: 7850 };
    expect(groupForgingGrades([...forgeGrades, extra]).find(g => g.grades.includes(extra))).toMatchObject({ family: 'alloy_steel', standard: OTHER_STANDARD });
  });

  it('picking a family opens on a library grade of that family', () => {
    for (const f of FORGE_FAMILIES) {
      const m = forgeGrades.find(x => x.id === forgeFamilyDefaultGrade(f.id));
      expect(m, f.id).toBeDefined();
      expect(forgeGradeInfo(m!).family).toBe(f.id);
    }
  });

  it('the forging form uses it; the grade drop-down HTML is grouped and priced', () => {
    expect(MATERIAL_PICKERS['forge-mat'].tax).toBe(FORGING_TAXONOMY);
    const html = materialOptionsHtml(FORGING_TAXONOMY, forgeGrades, p => `£${p.toFixed(2)}`);
    expect((html.match(/<option /g) ?? []).length).toBe(forgeGrades.length);
    expect(html).toContain('<optgroup label="Alloy steel · EN 10083-3 (alloy QT)" data-fam="alloy_steel"');
    expect(html).toMatch(/<option value="mat-steel-42crmo4" data-fam="alloy_steel"[^>]*>42CrMo4 \/ 4140 \/ 1\.7225 \(Cr-Mo QT steel\) — £[\d.]+\/kg<\/option>/);
  });
});
