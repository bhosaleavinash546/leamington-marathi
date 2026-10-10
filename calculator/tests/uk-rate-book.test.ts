/**
 * UK rate book (Oct 2026, docs/rates/uk-rate-book-2026-10.md): the BASE library's UK rates rebuilt from sourced
 * research — DESNZ industrial energy, ASHE-loaded labour, European mill / market anchors, foundry CHARGE prices and
 * machine-only build-ups for the machines with sourced capex. Written by scripts/uk-book.ts from
 * scripts/rate-refresh/2026-10-uk.json; every other country scales from this book.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { UK_ELECTRICITY_GBP_PER_KWH, UK_GAS_GBP_PER_KWH } from '../src/engine/uk-energy.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const mat = (id: string) => UK.materials.find(m => m.id === id)!;
const mach = (id: string) => UK.machines.find(m => m.id === id)!;
const lab = (id: string) => UK.labour.find(l => l.id === id)!;
const snap = JSON.parse(readFileSync('scripts/rate-refresh/uk-2026-10/current-uk-book.json', 'utf8')) as {
  machines: Array<{ id: string; region: string; gbpPerHr: number; buildup: { energy: number } | null }>;
};

describe('energy: one UK tariff, DESNZ manufacturing Q2 2026 + CCL', () => {
  it('the five places that hold it agree', () => {
    expect(UK_ELECTRICITY_GBP_PER_KWH).toBeCloseTo(0.182, 3);
    expect(UK_GAS_GBP_PER_KWH).toBeCloseTo(0.046, 3);
    expect(REGIONAL_DATA.UK.energy.electricityPerKwh).toBe(UK_ELECTRICITY_GBP_PER_KWH);
    expect(REGIONAL_DATA.UK.energy.gasPerKwh).toBe(UK_GAS_GBP_PER_KWH);
    const e = UK.energy.find(x => x.id === 'energy-uk')!;
    expect(e.electricityPerKwh).toBe(UK_ELECTRICITY_GBP_PER_KWH);
    expect(e.gasPerKwh).toBe(UK_GAS_GBP_PER_KWH);
    expect(readFileSync('server/data/pcb-country-rates.ts', 'utf8')).toContain(`gb: { kwh: ${UK_ELECTRICITY_GBP_PER_KWH},`);
  });
  it('every UK machine without sourced capex keeps its kWh and pays the new tariff', () => {
    for (const s of snap.machines.filter(x => x.region === 'UK' && x.buildup)) {
      const m = mach(s.id);
      if (/capex rebuilt|Capex £/.test(m.sourceNote) && /machine only/.test(m.sourceNote)) continue;
      expect(m.buildup!.energy / s.buildup!.energy, s.id).toBeCloseTo(0.182 / 0.268, 2);
    }
  });
});

describe('labour: ASHE 2025 basic, uprated and loaded for a 2-shift plant', () => {
  it('the lab-uk grades and the regional table are one figure', () => {
    for (const k of ['skilled', 'semiskilled', 'engineer', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor'] as const) {
      expect(lab(`lab-uk-${k}`).fullyLoadedRatePerHr, k).toBe(REGIONAL_DATA.UK.labour[k]);
    }
    expect(REGIONAL_DATA.UK.labour.skilled).toBeCloseTo(27.95, 2);
    expect(REGIONAL_DATA.UK.labour.engineer).toBeCloseTo(33.27, 2);
    expect(lab('lab-uk-forge').sourceNote).toMatch(/UK book/);
  });
});

describe('materials: European anchors; a casting is its charge', () => {
  it('CR coil at the mill base and DC01 no longer above the deeper-drawing DC04', () => {
    expect(mat('mat-dc01').pricePerKg).toBeCloseTo(0.756, 3);
    expect(mat('mat-dc01').pricePerKg).toBeLessThanOrEqual(mat('mat-dc04').pricePerKg);
  });
  it('a casting grade is the metal charge (the engine adds melt, loss, line, labour, overhead, margin)', () => {
    expect(mat('mat-gjs500').pricePerKg).toBeCloseTo(0.287, 3);
    expect(mat('mat-gjs500').sourceNote).toMatch(/charge/i);
    expect(mat('mat-gs-c25').scrapRecoveryPricePerKg).toBeLessThan(mat('mat-gs-c25').pricePerKg);
    expect(mat('mat-adc12').pricePerKg).toBeCloseTo(2.104, 3);
  });
  it('alloy content is an absolute £/kg: CF8M is CF8 + the book premium, ADI keeps its austempering', () => {
    expect(mat('mat-cf8m-cast').pricePerKg - mat('mat-ss304-cast').pricePerKg).toBeCloseTo(6.26 - 5.17, 3);
    expect(mat('mat-adi').pricePerKg - mat('mat-gjs500').pricePerKg).toBeCloseTo(1.58 - 0.86, 3);
  });
  it('secondary Al alloys ladder from the DIN226 ingot; primary-based ones never sit below P1020', () => {
    expect(mat('mat-a380').pricePerKg).toBeLessThan(2.787);
    for (const id of ['mat-lm25', 'mat-a357', 'mat-a365', 'mat-silafont36', 'mat-a206']) expect(mat(id).pricePerKg, id).toBeGreaterThanOrEqual(2.787 - 1e-9);
  });
  it('no grade is below the metal or resin it is made of', () => {
    expect(mat('mat-c101-bar').pricePerKg).toBeGreaterThanOrEqual(11.2355 - 0.001);
    expect(mat('mat-bronze-pb1').pricePerKg).toBeGreaterThanOrEqual(14.11);
    expect(mat('mat-upvc').pricePerKg).toBeGreaterThanOrEqual(1.096);
    expect(mat('mat-nr').pricePerKg).toBeGreaterThanOrEqual(1.905);
  });
  it('every rebuilt price says where it came from', () => {
    for (const m of UK.materials.filter(x => x.sourceNote.startsWith('UK book'))) {
      expect(m.sourceNote, m.id).toMatch(/https?:\/\//);
      expect(m.sourceNote, m.id).toMatch(/Was £/);
    }
  });
});

describe('machines: machine only, on sourced capex where it exists', () => {
  it('a 3-axis VMC is the ownership cost of a ~£77k machine, not a shop rate', () => {
    const v = mach('mach-vmc3');
    expect(v.sourceNote).toMatch(/machine only/);
    expect(v.buildup!.annualDepreciation).toBe(Math.round(77006 / 13));
    expect(v.computedRatePerHr).toBeGreaterThan(8);
    expect(v.computedRatePerHr).toBeLessThan(20);
  });
  it('the VF-2 reference is its list price over a 13-year life', () => {
    expect(mach('mach-haas-vf2').buildup!.annualDepreciation).toBe(Math.round(53204 / 13));
  });
  it('no UK machine rate went up', () => {
    for (const s of snap.machines.filter(x => x.region === 'UK')) {
      expect(mach(s.id).computedRatePerHr, s.id).toBeLessThanOrEqual(s.gbpPerHr + 0.01);
    }
  });
  it('a machine with no sourced capex says its capital is HELD', () => {
    expect(mach('press-400t').sourceNote).toMatch(/HELD/);
    expect(mach('mach-grind').sourceNote).toMatch(/target shop rate/);
  });
});

describe('the register', () => {
  const reg = readFileSync('scripts/rate-refresh/uk-2026-10/register.csv', 'utf8').trim().split('\n').slice(1);
  it('every library material and machine is in it once, with a decision', () => {
    const ids = reg.map(l => l.split('","')[1]);
    for (const m of DEFAULT_RATE_LIBRARY.materials) expect(ids.filter(i => i === m.id).length, m.id).toBe(1);
    for (const m of DEFAULT_RATE_LIBRARY.machines) expect(ids.filter(i => i === m.id).length, m.id).toBe(1);
  });
});
