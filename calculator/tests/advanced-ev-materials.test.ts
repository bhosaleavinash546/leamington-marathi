import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, classifyMaterialFamily } from '../src/engine/regional-rates.js';

const lib = DEFAULT_RATE_LIBRARY;
const mat = (id: string) => lib.materials.find(m => m.id === id);
const price = (id: string) => mat(id)!.pricePerKg;

describe('Advanced 2026 EV materials (BYD / Xiaomi class)', () => {
  it('adds giga-casting HTF alloy, high-speed rotor steel, hairpin conductors, Al busbar', () => {
    for (const id of ['mat-htf-gigacast', 'mat-hsno-rotor-700', 'mat-hsno-rotor-960',
      'mat-cu-hairpin', 'mat-al-hairpin', 'mat-al-busbar']) {
      const m = mat(id)!;
      expect(m, id).toBeTruthy();
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.effectiveDate).toBe('2026-07');
    }
  });

  it('price sanity: ultra-HS rotor > HS rotor; copper hairpin ≫ aluminium hairpin', () => {
    expect(price('mat-hsno-rotor-960')).toBeGreaterThan(price('mat-hsno-rotor-700'));
    expect(price('mat-cu-hairpin')).toBeGreaterThan(price('mat-al-hairpin'));
    // HTF giga alloy sits with the structural HPDC family (~£3/kg), not exotic
    expect(price('mat-htf-gigacast')).toBeGreaterThan(2.5);
    expect(price('mat-htf-gigacast')).toBeLessThan(5);
  });

  it('classifies correctly for country pricing (Al/Cu exchange-traded, electrical steel = mill)', () => {
    expect(classifyMaterialFamily(mat('mat-htf-gigacast')!)).toBe('exchangeMetal');
    expect(classifyMaterialFamily(mat('mat-cu-hairpin')!)).toBe('exchangeMetal');
    expect(classifyMaterialFamily(mat('mat-al-hairpin')!)).toBe('exchangeMetal');
    expect(classifyMaterialFamily(mat('mat-al-busbar')!)).toBe('exchangeMetal');
    expect(classifyMaterialFamily(mat('mat-hsno-rotor-960')!)).toBe('millSteel');
  });

  it('exchange-traded EV metals stay near-flat by country (copper hairpin in CN)', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    const ratio = cn.materials.find(m => m.id === 'mat-cu-hairpin')!.pricePerKg / price('mat-cu-hairpin');
    expect(ratio).toBeGreaterThan(0.95);   // global copper market ~flat, not the 0.88 mill discount
  });

  it('adds 6100T and 9000T giga-casting presses, ordered above 1600T HPDC', () => {
    for (const id of ['hpdc-giga-6100t', 'hpdc-giga-9000t']) {
      expect(lib.machines.find(m => m.id === id), id).toBeTruthy();
    }
    const rate = (id: string) => lib.machines.find(m => m.id === id)!.computedRatePerHr;
    expect(rate('hpdc-1600t')).toBeLessThan(rate('hpdc-giga-6100t'));
    expect(rate('hpdc-giga-6100t')).toBeLessThan(rate('hpdc-giga-9000t'));
  });
});

describe('Flagship high-speed motor laminations (SU7 Ultra / Yangwang U7/U8/U9)', () => {
  it('adds ultra-thin, 6.5% Si, ~1100 MPa and thin cobalt-iron grades', () => {
    for (const id of ['mat-no15-15a', 'mat-no10-10a', 'mat-si65-jnex-10', 'mat-uhsno-1100', 'mat-cofe-thin-010']) {
      const m = mat(id)!;
      expect(m, id).toBeTruthy();
      expect(m.category).toBe('Electrical Steel Sheet');
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.effectiveDate).toBe('2026-07');
    }
  });

  it('price ladder: thinner NO dearer, 6.5%Si premium, CoFe tops the ladder', () => {
    expect(price('mat-no10-10a')).toBeGreaterThan(price('mat-no15-15a'));
    expect(price('mat-no15-15a')).toBeGreaterThan(price('mat-no20-20a'));   // 0.15 > 0.20mm
    expect(price('mat-uhsno-1100')).toBeGreaterThan(price('mat-hsno-rotor-960'));
    expect(price('mat-cofe-thin-010')).toBeGreaterThan(price('mat-si65-jnex-10'));
  });

  it('thin flagship grades still classify as mill steel for country pricing', () => {
    expect(classifyMaterialFamily(mat('mat-no10-10a')!)).toBe('millSteel');
    expect(classifyMaterialFamily(mat('mat-si65-jnex-10')!)).toBe('millSteel');
  });
});
