import { describe, it, expect } from 'vitest';
import {
  validMaterialsForCommodity,
  CAD_FORGING_BILLET_MATERIALS,
  CAD_GENERIC_MATERIALS,
} from '../server/routes/cad.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const ids = (csv: string) => csv.split(',').map(s => s.trim()).filter(Boolean);
const matById = (id: string) => DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id);

describe('CAD-to-Cost material scoping by commodity', () => {
  it('offers wrought forging billets for forging, generic grades otherwise', () => {
    expect(validMaterialsForCommodity('forging')).toBe(CAD_FORGING_BILLET_MATERIALS);
    for (const c of ['machining', 'casting', 'injection_moulding', 'sheet_metal', 'extrusion']) {
      expect(validMaterialsForCommodity(c)).toBe(CAD_GENERIC_MATERIALS);
    }
  });

  it('every forging billet id exists in the rate library and is a Billet category', () => {
    for (const id of ids(CAD_FORGING_BILLET_MATERIALS)) {
      const m = matById(id);
      expect(m, `missing material ${id}`).toBeTruthy();
      // The forge-mat dropdown is scoped to /Billet/i — every offered grade must match,
      // or setMaterial() silently no-ops and the part keeps a wrong steel-billet default.
      expect(m!.category, `${id} category "${m!.category}" not a Billet`).toMatch(/Billet/i);
    }
  });

  it('offers a genuine aluminium forging billet so Al forgings are not costed as steel', () => {
    const alBillets = ids(CAD_FORGING_BILLET_MATERIALS)
      .map(matById)
      .filter(m => m && /alumin/i.test(m.category));
    expect(alBillets.length).toBeGreaterThan(0);
    // Aluminium billet must be lighter and pricier-per-kg than a plain steel billet —
    // the two levers that make the should-cost come out right for an Al forging.
    const al = matById('mat-al6061-forge')!;
    const steel = matById('mat-steel1045')!;
    expect(al.densityKgPerM3).toBeLessThan(steel.densityKgPerM3);
    expect(al.pricePerKg).toBeGreaterThan(steel.pricePerKg);
  });

  it('spans every alloy family a forging can be (steel, stainless, Al, Ti, Ni, brass)', () => {
    const cats = ids(CAD_FORGING_BILLET_MATERIALS).map(id => (matById(id)?.category ?? '').toLowerCase());
    const has = (re: RegExp) => cats.some(c => re.test(c));
    expect(has(/carbon steel/)).toBe(true);
    expect(has(/alloy steel/)).toBe(true);
    expect(has(/stainless/)).toBe(true);
    expect(has(/aluminium/)).toBe(true);
    expect(has(/titanium/)).toBe(true);
    expect(has(/nickel|superalloy/)).toBe(true);
  });

  it('does not leak plastic grades into the forging list', () => {
    for (const id of ids(CAD_FORGING_BILLET_MATERIALS)) {
      expect(id).not.toMatch(/mat-(pp|hdpe|pa6|pc|abs|pom)/);
    }
  });
});
