/**
 * Physics audit — the electroplating assumptions against Faraday's law.
 *
 * Almost every number in the surface-treatment library is an engineering
 * estimate. This is the one place an assumption is checked against a physical
 * law rather than against judgement, and it earns its place: the source
 * workbook's equivalent tab caught two real errors in its own author's earlier
 * draft — hard chrome assumed at 22 kWh/m² when Faraday requires 44 of DC alone
 * at 50 um and 15% cathode efficiency, and hard anodising at 11.5 against ~13
 * of DC plus an equal chiller load.
 *
 * The deposit mass and the charge it requires are NOT negotiable — they are
 * fixed by the specification. What is negotiable is cathode efficiency, cell
 * voltage, rack or barrel fill and the ancillary load. Anyone claiming to plate
 * 50 um of hard chrome cheaply is claiming to break Faraday's law.
 *
 * These tests exist so that a future edit to a deposit thickness or an
 * efficiency that implies impossible energy fails CI instead of shipping.
 */
import { describe, it, expect } from 'vitest';
import {
  SURFACE_STAGES, ELECTROCHEMISTRY, FARADAY_CONSTANT_C_PER_MOL, SURFACE_METAL_PRICES,
  type SurfaceStage,
} from '../src/engine/surface-treatment-data.js';
import { depositedMetalCost } from '../src/engine/surface-treatment-rate.js';
import { flatPlateAreaM2PerKg } from '../src/engine/surface-geometry-bridge.js';

/** Grams of metal on one square metre at the stage's specified thickness. */
function depositGramsPerM2(s: SurfaceStage): number {
  const d = s.deposit!;
  return d.thicknessUm.value * 1e-6 * d.densityKgPerM3.value * 1000;
}

/** Coulombs per gram: n x F / M, the inverse of the electrochemical equivalent. */
function chargeAhPerM2(s: SurfaceStage): number {
  const e = ELECTROCHEMISTRY[s.deposit!.metal]!;
  const equivalentGPerC = e.molarMassGPerMol / (e.electrons * FARADAY_CONSTANT_C_PER_MOL);
  const coulombs = depositGramsPerM2(s) / equivalentGPerC;
  return coulombs / 3600 / e.cathodeEfficiency;
}

function dcEnergyKwhPerM2(s: SurfaceStage): number {
  return chargeAhPerM2(s) * ELECTROCHEMISTRY[s.deposit!.metal]!.cellVolts / 1000;
}

/** Every stage that actually passes current to deposit a metal. */
const ELECTROPLATING = Object.entries(SURFACE_STAGES)
  .filter(([, s]) => s.kind === 'plating' && s.deposit)
  .map(([key, s]) => ({ key, s }));

describe('the electroplating stages obey Faraday\'s law', () => {
  it('there are plating stages to check — the filter has not silently emptied', () => {
    expect(ELECTROPLATING.length).toBeGreaterThan(0);
    expect(ELECTROPLATING.map(x => x.key)).toContain('zinc_plate');
  });

  for (const { key, s } of ELECTROPLATING) {
    it(`${key}: assumed electricity covers the DC the deposit requires`, () => {
      const dc = dcEnergyKwhPerM2(s);
      const assumed = s.electricityKwhPerUnit.value;
      // You cannot plate below Faraday. Assumed total must cover the DC, and
      // what is left over is the ancillary load (pumps, filtration, agitation,
      // ventilation, rectifier losses) — which must not be negative.
      expect(assumed, `${key}: ${assumed} kWh/m² assumed vs ${dc.toFixed(3)} of DC alone`)
        .toBeGreaterThanOrEqual(dc);
      expect(assumed - dc).toBeGreaterThanOrEqual(0);
    });

    it(`${key}: the ancillary load left over is plausible, not absurd`, () => {
      const dc = dcEnergyKwhPerM2(s);
      const ancillary = s.electricityKwhPerUnit.value - dc;
      // A wet plating line's ancillary load is real but bounded. More than
      // ~20 kWh/m² of it on a low-current process means the electricity figure
      // is carrying something that is not electricity.
      expect(ancillary).toBeLessThan(20);
    });
  }

  it('reproduces the workbook\'s zinc figures exactly', () => {
    // Workbook sheet 10, ST-15: 57.12 g/m², 58.538 Ah/m², 0.2634 kWh/m² of DC.
    const zinc = SURFACE_STAGES.zinc_plate;
    expect(depositGramsPerM2(zinc)).toBeCloseTo(57.12, 6);
    expect(chargeAhPerM2(zinc)).toBeCloseTo(58.5383654532477, 6);
    expect(dcEnergyKwhPerM2(zinc)).toBeCloseTo(0.263422644539615, 9);
  });

  it('zinc-nickel needs far more charge than zinc for the same thickness', () => {
    // 55% cathode efficiency against 80% is the whole reason it is dear: it
    // costs more nickel AND more rectifier energy for the same 8 um.
    const zn = chargeAhPerM2(SURFACE_STAGES.zinc_plate);
    const znni = chargeAhPerM2(SURFACE_STAGES.zinc_nickel);
    expect(znni).toBeGreaterThan(zn * 1.4);
  });

  it('every electrochemistry entry is a real element, not a placeholder', () => {
    for (const [metal, e] of Object.entries(ELECTROCHEMISTRY)) {
      expect(e!.molarMassGPerMol, metal).toBeGreaterThan(10);
      expect(e!.electrons, metal).toBeGreaterThanOrEqual(1);
      expect(e!.cathodeEfficiency, metal).toBeGreaterThan(0);
      expect(e!.cathodeEfficiency, metal).toBeLessThanOrEqual(1);
      expect(e!.cellVolts, metal).toBeGreaterThan(0);
    }
  });
});

describe('hot dip galvanising is not electrolytic and is not Faraday-checked', () => {
  it('galvanise deposits metal but passes no current', () => {
    const g = SURFACE_STAGES.galvanise;
    expect(g.deposit).toBeTruthy();
    expect(g.kind).toBe('hot_dip');
    // It must NOT be in the Faraday set — applying a cathode-efficiency check
    // to a molten zinc bath would be physics theatre, not physics.
    expect(ELECTROPLATING.map(x => x.key)).not.toContain('galvanise');
  });

  it('its zinc uptake lands in the 4-6% band the industry quotes', () => {
    // An independent physical check on the utilisation factor. At 85 um mean and
    // 55% zinc utilisation, a 6 mm steel section should take up 4-6% of its own
    // weight in zinc — which is what galvanisers actually invoice.
    const g = SURFACE_STAGES.galvanise;
    const areaPerKg = flatPlateAreaM2PerKg(6, 7850);          // m²/kg of 6 mm plate
    const zincKgPerKgSteel = depositedMetalCost(g, areaPerKg) / SURFACE_METAL_PRICES.zinc.value;
    expect(zincKgPerKgSteel).toBeGreaterThan(0.04);
    expect(zincKgPerKgSteel).toBeLessThan(0.06);
    expect(zincKgPerKgSteel).toBeCloseTo(0.047, 3);           // workbook: 4.7% on 6 mm
  });

  it('and a thin section takes up proportionally more zinc than a heavy one', () => {
    // The reason galvanising is quoted per tonne but PRICED on section
    // thickness — and the reason deposited metal is split out at all.
    const g = SURFACE_STAGES.galvanise;
    const thin = depositedMetalCost(g, flatPlateAreaM2PerKg(3, 7850));
    const heavy = depositedMetalCost(g, flatPlateAreaM2PerKg(16, 7850));
    expect(thin / heavy).toBeCloseTo(16 / 3, 6);
  });
});

describe('deposited metal is a pass-through that scales with area', () => {
  it('doubling the area doubles the metal', () => {
    const s = SURFACE_STAGES.zinc_plate;
    expect(depositedMetalCost(s, 2)).toBeCloseTo(depositedMetalCost(s, 1) * 2, 9);
  });

  it('doubling the plating thickness doubles the metal — linear, not square', () => {
    const s = SURFACE_STAGES.zinc_plate;
    expect(depositedMetalCost(s, 1, 16)).toBeCloseTo(depositedMetalCost(s, 1, 8) * 2, 9);
  });

  it('a stage with no deposit contributes no metal', () => {
    expect(depositedMetalCost(SURFACE_STAGES.degrease, 1)).toBe(0);
    // Anodising grows an oxide from the substrate — there is no metal bought in.
    expect(depositedMetalCost(SURFACE_STAGES.anodise, 1)).toBe(0);
  });

  it('the zinc figure reconciles by hand', () => {
    // 1 m² x 8 um x 7140 kg/m³ = 0.05712 kg, / 0.80 efficiency = 0.0714 kg,
    // x £2.7594/kg = £0.1970.
    const expected = (1 * 8e-6 * 7140 / 0.80) * SURFACE_METAL_PRICES.zinc.value;
    expect(depositedMetalCost(SURFACE_STAGES.zinc_plate, 1)).toBeCloseTo(expected, 9);
    expect(expected).toBeCloseTo(0.1970, 3);
  });
});
