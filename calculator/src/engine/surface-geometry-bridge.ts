/**
 * The geometry bridge — how much surface a kilogram of part carries.
 *
 * ## The problem it solves
 *
 * Surface treatment is priced per SQUARE METRE. Sheet metal, casting and forging
 * cost models are driven by MASS. Bridging the two with a single "£/kg coating"
 * factor is the mistake this file exists to prevent, because the conversion is
 * not a constant — it is set by wall thickness, and it differs by an order of
 * magnitude between product forms:
 *
 *     1.5 mm steel stamping    0.1953 m²/kg     <- reference sheet form
 *     3.5 mm aluminium HPDC    0.2646 m²/kg     11.3x the forging
 *     12 mm steel forging      0.0234 m²/kg     <- reference forge form
 *
 * Same steel, same coating, same line: the stamping consumes 8.4x more coated
 * area per kilogram than the forging. A per-kg coating rate that does not state
 * its product form is meaningless, and the metal-finishing trade's own position
 * is that no per-kg estimating basis for electroplating exists at all.
 *
 * It also explains a result cost engineers find counter-intuitive: thinning a
 * part's walls to lighten it INCREASES its coating cost per kilogram, even as
 * total part cost falls.
 *
 * ## Measured area always wins
 *
 * This module is the FALLBACK. When CAD is present the wetted area is measured
 * off the B-rep (`surfaceArea.mm2`) or the STL mesh, and that is ground truth —
 * the same rule the rest of the tool follows. The bridge is for a drawing-only
 * part, a manual entry, or an early estimate with nothing but a mass.
 *
 * When BOTH are available `coatedArea()` reports the shape factor the
 * measurement implies, which turns the table below from an assumption into
 * something this tool can check against real parts. That is the fastest
 * credibility win available here: three measured parts replace the whole
 * shape-factor column.
 *
 * Source: Surface Treatment & Coating Should-Cost Model workbook (13 Aug 2026),
 * sheet 04_Geometry_Bridge. The formula is arithmetic; the SHAPE FACTORS are
 * engineering estimates and are tagged as such.
 */
import type { GearParam } from './gear-shop-data.js';

export type ShapeParam<T = number> = GearParam<T>;

const SRC = 'Surface Treatment & Coating Should-Cost Model workbook (13 Aug 2026), '
  + 'sheet 04_Geometry_Bridge. Shape factors are engineering estimates, not measurements.';
const RECORDED = '2026-08-13';

const p = (value: number, note?: string): ShapeParam => ({
  value, status: 'unverified', source: SRC, recordedAt: RECORDED, ...(note ? { note } : {}),
});

/** The three families the commodity cost models divide into. */
export type ProductFormFamily = 'sheet' | 'casting' | 'forging';

export interface ProductForm {
  id: string;
  label: string;
  family: ProductFormFamily;
  /** Substrate density, kg/m³. */
  densityKgPerM3: number;
  /** Wall or section thickness, mm — the variable that actually drives the ratio. */
  thicknessMm: number;
  /**
   * Uplift on the flat-plate ideal for real geometry: edges, holes, flanges and
   * bends on a stamping; ribs, bosses, draft faces and fillets on a casting; the
   * comparatively simple external form of a forging.
   */
  shapeFactor: ShapeParam;
  typicalParts: string;
}

const F = (
  id: string, label: string, family: ProductFormFamily,
  densityKgPerM3: number, thicknessMm: number, shapeFactor: number,
  typicalParts: string, shapeNote: string,
): ProductForm => ({
  id, label, family, densityKgPerM3, thicknessMm,
  shapeFactor: p(shapeFactor, shapeNote), typicalParts,
});

const SHEET_NOTE = 'edges, holes, flanges and bends on a pressing';
const CAST_NOTE = 'ribs, bosses, draft faces and fillets';
const FORGE_NOTE = 'comparatively simple external form, flash trimmed';

/**
 * Reference product forms. The three marked REFERENCE are the ones the rate card
 * quotes per kg against, and the ones the commodity defaults use.
 */
export const PRODUCT_FORMS: Record<string, ProductForm> = {
  sheet_thin: F('PF-01', 'Sheet metal — thin (0.8 mm steel)', 'sheet',
    7850, 0.8, 1.15, 'Appliance panels, light brackets, clips', SHEET_NOTE),
  sheet_standard: F('PF-02', 'Sheet metal — standard (1.5 mm steel)', 'sheet',
    7850, 1.5, 1.15, 'REFERENCE. Automotive stampings, brackets, enclosures', SHEET_NOTE),
  sheet_heavy: F('PF-03', 'Sheet metal — heavy (3.0 mm steel)', 'sheet',
    7850, 3.0, 1.15, 'Chassis members, structural pressings', SHEET_NOTE),
  sheet_aluminium: F('PF-04', 'Sheet metal — aluminium (1.5 mm)', 'sheet',
    2700, 1.5, 1.15, 'Al closures, heat shields, enclosures', SHEET_NOTE),

  cast_hpdc: F('PF-05', 'Casting — aluminium HPDC (3.5 mm wall)', 'casting',
    2700, 3.5, 1.25, 'REFERENCE. Housings, covers, e-drive casings', CAST_NOTE),
  cast_gravity: F('PF-06', 'Casting — aluminium gravity / LPDC (6 mm)', 'casting',
    2700, 6.0, 1.25, 'Knuckles, brackets, manifolds', CAST_NOTE),
  cast_iron: F('PF-07', 'Casting — grey / ductile iron (6 mm)', 'casting',
    7200, 6.0, 1.25, 'Brackets, housings, brake components', CAST_NOTE),

  forge_light: F('PF-08', 'Forging — steel, light section (8 mm)', 'forging',
    7850, 8.0, 1.10, 'Con-rods, small links, fasteners', FORGE_NOTE),
  forge_standard: F('PF-09', 'Forging — steel, standard (12 mm)', 'forging',
    7850, 12.0, 1.10, 'REFERENCE. Shafts, arms, hubs, yokes', FORGE_NOTE),
  forge_heavy: F('PF-10', 'Forging — steel, heavy (25 mm)', 'forging',
    7850, 25.0, 1.10, 'Crankshafts, heavy hubs, axle beams', FORGE_NOTE),
};

/** The form each commodity assumes when the user has not chosen one. */
export const DEFAULT_FORM_BY_FAMILY: Record<ProductFormFamily, string> = {
  sheet: 'sheet_standard',
  casting: 'cast_hpdc',
  forging: 'forge_standard',
};

export function findProductForm(key: string): ProductForm | null {
  return PRODUCT_FORMS[key]
    ?? Object.values(PRODUCT_FORMS).find(f => f.id === key)
    ?? null;
}

/**
 * Flat-plate specific area, m²/kg — both faces of a plate divided by its mass.
 *
 *     2 x A / (A x t_m x rho)  =  2 / (t_m x rho)  =  2000 / (t_mm x rho)
 *
 * No shape factor: this is the geometric floor a real part cannot go below.
 */
export function flatPlateAreaM2PerKg(thicknessMm: number, densityKgPerM3: number): number {
  if (!(thicknessMm > 0) || !(densityKgPerM3 > 0)) {
    throw new Error('flatPlateAreaM2PerKg needs a positive thickness and density');
  }
  return 2000 / (thicknessMm * densityKgPerM3);
}

/** Specific surface area of a reference form, m²/kg — the flat plate uplifted. */
export function specificSurfaceAreaM2PerKg(form: ProductForm): number {
  return flatPlateAreaM2PerKg(form.thicknessMm, form.densityKgPerM3) * form.shapeFactor.value;
}

export interface CoatedAreaInput {
  /** Wetted area measured from CAD, m². GROUND TRUTH when present. */
  measuredAreaM2?: number;
  /** Part mass, kg — what the sheet/casting/forging models already know. */
  massKg?: number;
  /** Reference form key, or a `ProductForm`. Ignored when area is measured. */
  form?: string | ProductForm;
  /** Override the form's thickness with the part's own, mm. */
  thicknessMm?: number;
}

export interface CoatedAreaResult {
  areaM2: number;
  source: 'measured' | 'bridge';
  /** The form used for the bridge, or the one the measurement was checked against. */
  formId: string | null;
  specificAreaM2PerKg: number | null;
  /**
   * Shape factor the MEASUREMENT implies, when both a measured area and a mass
   * are known. Comparing it with the form's assumed factor is how the table
   * above gets validated rather than trusted.
   */
  impliedShapeFactor: number | null;
  basis: string;
  /** Set when measurement and bridge disagree enough to be worth saying. */
  warning: string | null;
}

/** How far the bridge may sit from a measurement before the report says so. */
export const SHAPE_FACTOR_TOLERANCE = 0.25;

/**
 * The coated area of one part, and where the number came from.
 *
 * Order of preference is the tool's standing rule — measured geometry beats a
 * derived estimate — and it is also what the workbook itself recommends: "one
 * measured part beats every factor in tab 04".
 */
export function coatedArea(input: CoatedAreaInput): CoatedAreaResult {
  const form = typeof input.form === 'string' ? findProductForm(input.form) : (input.form ?? null);
  if (input.form && !form) {
    throw new Error(
      `No product form "${String(input.form)}" in the geometry bridge. Add it to `
      + 'surface-geometry-bridge.ts rather than silently costing the wrong shape.');
  }

  const effective = form && input.thicknessMm && input.thicknessMm > 0
    ? { ...form, thicknessMm: input.thicknessMm }
    : form;
  const specific = effective ? specificSurfaceAreaM2PerKg(effective) : null;

  if (input.measuredAreaM2 && input.measuredAreaM2 > 0) {
    const mass = input.massKg;
    // The measurement's own shape factor: measured area per kg, divided by the
    // flat-plate ideal for this thickness and density.
    const implied = (mass && mass > 0 && effective)
      ? (input.measuredAreaM2 / mass)
        / flatPlateAreaM2PerKg(effective.thicknessMm, effective.densityKgPerM3)
      : null;

    let warning: string | null = null;
    if (implied !== null && effective) {
      const assumed = effective.shapeFactor.value;
      const drift = Math.abs(implied - assumed) / assumed;
      if (drift > SHAPE_FACTOR_TOLERANCE) {
        warning =
          `Measured area implies a shape factor of ${implied.toFixed(2)} against the `
          + `${effective.label} assumption of ${assumed.toFixed(2)} (${(drift * 100).toFixed(0)}% `
          + 'apart). The measurement is being used and is right; the gap says this part is not '
          + 'typical of its form, so a MASS-based estimate of a similar part would be wrong by '
          + 'about that much.';
      }
    }

    return {
      areaM2: input.measuredAreaM2,
      source: 'measured',
      formId: effective?.id ?? null,
      specificAreaM2PerKg: specific,
      impliedShapeFactor: implied,
      basis:
        `Coated area ${input.measuredAreaM2.toFixed(4)} m² MEASURED from CAD geometry`
        + (implied !== null && effective
          ? `; implies ${implied.toFixed(2)} m²/kg shape factor vs ${effective.shapeFactor.value.toFixed(2)} assumed for ${effective.label}`
          : ''),
      warning,
    };
  }

  if (!effective || !specific) {
    throw new Error(
      'Coated area needs either a measured area from CAD or a product form to bridge from. '
      + 'Neither was supplied, and defaulting one would invent the largest driver in the '
      + 'commodity.');
  }
  if (!input.massKg || input.massKg <= 0) {
    throw new Error(
      'Coated area from the geometry bridge needs a positive part mass — the bridge converts '
      + 'mass to area and has nothing to work from otherwise.');
  }

  const areaM2 = specific * input.massKg;
  return {
    areaM2,
    source: 'bridge',
    formId: effective.id,
    specificAreaM2PerKg: specific,
    impliedShapeFactor: null,
    basis:
      `Coated area ${areaM2.toFixed(4)} m² ESTIMATED from mass: ${input.massKg} kg x `
      + `${specific.toFixed(4)} m²/kg (${effective.label} — 2000/(${effective.thicknessMm} mm x `
      + `${effective.densityKgPerM3} kg/m³) x ${effective.shapeFactor.value} shape factor). `
      + 'Measured CAD area would replace this and is worth more than any factor here.',
    warning:
      'Coated area is derived from mass and a reference wall thickness, not measured. It is the '
      + 'largest single driver of surface-treatment cost per kg — an 8x spread between a thin '
      + 'stamping and a heavy forging — so confirm the wall thickness before quoting.',
  };
}

/** Area ratio between two forms — the "8.4x" statement, computed rather than asserted. */
export function areaIndex(formKey: string, vsFormKey = 'forge_standard'): number {
  const a = findProductForm(formKey);
  const b = findProductForm(vsFormKey);
  if (!a || !b) throw new Error(`Unknown product form in areaIndex: ${formKey} vs ${vsFormKey}`);
  return specificSurfaceAreaM2PerKg(a) / specificSurfaceAreaM2PerKg(b);
}
