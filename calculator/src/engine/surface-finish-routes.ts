/**
 * Finishing routes a commodity form can carry, and the ONE builder of the finish spec the casting, cast + machine,
 * forging and sheet-metal modules cost (`finishingForCommodity`).
 *
 * The screen's surface-treatment block (`collectSurfaceFinishing` in main.ts) and the headless costing
 * (`toCostParams`, from the CAD finish question) both build the spec here. They used to be one table in main.ts that
 * headless could not see, so a finish answered on CAD to COST could only ever reach the screen — two numbers for one
 * part. CAD to COST phase 2, D4 (28 Oct 2026; docs/ui/cad-to-cost-redesign-2026-10.md).
 */
import type { CommodityFinishingInput } from './modules/surface-finishing.js';
import type { MaterialFamily } from './material-family.js';

/** Stage keys per route, in process order (surface-treatment-data.ts resolves each key). */
export const SURFACE_FINISH_ROUTES: Record<string, string[] | undefined> = {
  '': undefined,
  powder_coat: ['degrease', 'rinse', 'iron_phosphate', 'rinse', 'di_rinse', 'dry_off', 'powder_coat', 'cure_oven'],
  powder_coat_zn: ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'dry_off', 'powder_coat', 'cure_oven'],
  e_coat: ['degrease', 'rinse', 'zirconium', 'rinse', 'di_rinse', 'dry_off', 'e_coat', 'cure_oven'],
  zinc_plate: ['degrease', 'rinse', 'pickle', 'rinse', 'zinc_plate', 'rinse', 'passivate', 'dry_off'],
  zinc_nickel: ['degrease', 'rinse', 'pickle', 'rinse', 'zinc_nickel', 'rinse', 'passivate', 'dry_off'],
  zinc_flake: ['degrease', 'rinse', 'zinc_flake', 'cure_oven'],
  anodise: ['degrease', 'rinse', 'anodise', 'rinse', 'dry_off'],
  galvanise: ['degrease', 'rinse', 'pickle', 'rinse', 'galvanise'],
  blast_only: ['shot_blast'],
  blast_zinc: ['shot_blast', 'degrease', 'rinse', 'pickle', 'rinse', 'zinc_plate', 'rinse', 'passivate', 'dry_off'],
  cast_ecoat: ['shot_blast', 'impregnation', 'degrease', 'rinse', 'zirconium', 'rinse', 'di_rinse', 'dry_off', 'e_coat', 'cure_oven'],
  mass_finish: ['mass_finish'],
};

export const SURFACE_ROUTE_LABELS: Record<string, string> = {
  '': 'None — bare part',
  powder_coat: 'Powder coat (iron phosphate pre-treat)',
  powder_coat_zn: 'Powder coat (zinc phosphate pre-treat)',
  e_coat: 'E-coat / KTL (zirconium pre-treat)',
  zinc_plate: 'Zinc plate + passivate',
  zinc_nickel: 'Zinc-nickel + passivate',
  zinc_flake: 'Zinc flake dip-spin (no H₂ embrittlement)',
  anodise: 'Sulphuric anodise (aluminium)',
  galvanise: 'Hot dip galvanise',
  blast_only: 'Shot blast only (descale)',
  blast_zinc: 'Shot blast → zinc plate + passivate',
  cast_ecoat: 'Blast → impregnate → e-coat (casting)',
  mass_finish: 'Vibratory mass finish (deburr)',
};

/** The commodity forms that carry the surface-treatment block, and their field-id prefix. */
export const FINISH_PREFIX_BY_COMMODITY: Readonly<Record<string, string>> = {
  sheet_metal: 'sm', sheet_metal_fab: 'smf', casting: 'cast', cast_and_machine: 'cam', forging: 'forge',
};

/** The bridge product form each form selects first — used only when no measured area is supplied. */
export const FINISH_PRODUCT_FORM: Readonly<Record<string, string>> = {
  sheet_metal: 'sheet_standard', sheet_metal_fab: 'sheet_standard',
  casting: 'cast_hpdc', cast_and_machine: 'cast_hpdc', forging: 'forge_standard',
};

/**
 * The form's own rack defaults — NOT a sourced figure, and used only on a hand-filled form. Every time-based finishing
 * cost divides by parts per rack: on a barrel zinc line 6 parts a load put 200 s of line time on a 0.3 kg bracket
 * (£7.17 of zinc plate on a £1.68 pressing). A costing from CAD sizes the load from the measured part instead
 * (`finishLoading`).
 */
export const FINISH_RACK_DEFAULTS = { partsPerRack: 6, racksPerHour: 20 } as const;

/**
 * Line loading figures, each read from a published source (via web search, 28 Oct 2026 — the pages themselves were
 * not reachable from the build session, so each is labelled to confirm with the coater). Line CAPACITY, not a price.
 */
export const FINISH_LINE_LOADING = {
  /** Conveyor / hoist coating line: surface hung per load bar, and load bars an hour. */
  conveyor: {
    areaPerLoadM2: 83.6,      // 900 ft² of surface per loadbar
    loadsPerHour: 20,         // 18,000 ft²/h ÷ 900 ft² per loadbar (Therma-Tron-X square transfer: 20 loads/h too)
    maxLoadKg: 113.4,         // 250 lb maximum rack load
    source: 'Electro-Coat Technologies line, 900 ft² a loadbar and 18,000 ft²/h (pfonline.com/articles/building-an-e-coat-line-from-the-ground-up); '
      + 'Therma-Tron-X monorail v square transfer, 250 lb maximum rack load and 20 loads/h '
      + '(thermotronx.com …/Square Transfer vs Monorail Comparison.pdf)',
  },
  /** Barrel electroplating: mass a barrel holds, and barrels an hour. */
  barrel: {
    loadKg: 90.7,             // 200 lb a barrel
    loadsPerHour: 10,         // ten barrels an hour
    source: 'SUR/FIN 2003 paper sf0347: ten barrels an hour at 200 lb a barrel, chloride zinc (sterc.org/pdf/sf2003/sf0347.pdf)',
  },
} as const;

export interface FinishLoading { partsPerRack: number; racksPerHour: number; basis: string }

/**
 * Parts a load and loads an hour for a route, from the part's measured surface and mass. Electroplated zinc and
 * zinc-nickel run in a barrel (load by mass); every other route hangs on a conveyor / hoist (load by surface, capped by
 * the rack's weight limit). The plating dwell can still cap the hourly loads below this (computeSurfaceTreatment).
 */
export function finishLoading(route: string, areaM2: number, massKg: number): FinishLoading | null {
  if (!SURFACE_FINISH_ROUTES[route] || !(areaM2 > 0) || !(massKg > 0)) return null;
  const barrel = route === 'zinc_plate' || route === 'zinc_nickel' || route === 'blast_zinc';
  if (barrel) {
    const b = FINISH_LINE_LOADING.barrel;
    const n = Math.max(1, Math.floor(b.loadKg / massKg));
    return { partsPerRack: n, racksPerHour: b.loadsPerHour,
      basis: `barrel load ${b.loadKg} kg ÷ ${massKg.toFixed(3)} kg = ${n} parts a barrel, ${b.loadsPerHour} barrels/h — ${b.source}; `
        + 'a part too large to tumble is rack plated instead — confirm with the plater' };
  }
  const c = FINISH_LINE_LOADING.conveyor;
  const byArea = Math.floor(c.areaPerLoadM2 / areaM2);
  const byMass = Math.floor(c.maxLoadKg / massKg);
  const n = Math.max(1, Math.min(byArea, byMass));
  return { partsPerRack: n, racksPerHour: c.loadsPerHour,
    basis: `load bar ${c.areaPerLoadM2} m² ÷ ${areaM2.toFixed(4)} m² = ${byArea}, rack limit ${c.maxLoadKg} kg ÷ ${massKg.toFixed(3)} kg = ${byMass} `
      + `→ ${n} parts a load, ${c.loadsPerHour} loads/h — ${c.source}; confirm the hanging with the coater` };
}

export interface FinishSpecInput {
  route: string;
  productForm: string;
  measuredAreaM2?: number;
  thicknessMm?: number;
  partsPerRack?: number;
  racksPerHour?: number;
  depositThicknessUm?: number;
  maskedFeatures?: number;
  tensileStrengthMPa?: number;
  platingRejectPct?: number;
  annualVolume: number;
  region: string;
}

/** The module input for a route, or undefined for a bare part (the cost is then exactly what it was). */
export function finishSpec(i: FinishSpecInput): CommodityFinishingInput | undefined {
  const stages = SURFACE_FINISH_ROUTES[i.route];
  if (!stages) return undefined;
  const masked = i.maskedFeatures ?? 0;
  // Masking is per feature: the mask / de-mask pair is added only when the part has masked features.
  const withMasking = masked > 0
    ? [...stages.slice(0, -1), 'masking', stages[stages.length - 1], 'demask']
    : stages;
  return {
    stages: withMasking,
    productForm: i.productForm,
    ...(i.measuredAreaM2 && i.measuredAreaM2 > 0 ? { measuredAreaM2: i.measuredAreaM2 } : {}),
    ...(i.thicknessMm && i.thicknessMm > 0 ? { thicknessMm: i.thicknessMm } : {}),
    partsPerRack: Math.max(1, i.partsPerRack ?? FINISH_RACK_DEFAULTS.partsPerRack),
    racksPerHour: Math.max(1, i.racksPerHour ?? FINISH_RACK_DEFAULTS.racksPerHour),
    ...(i.depositThicknessUm && i.depositThicknessUm > 0 ? { depositThicknessUm: i.depositThicknessUm } : {}),
    ...(masked > 0 ? { maskedFeatures: masked } : {}),
    ...(i.tensileStrengthMPa && i.tensileStrengthMPa > 0 ? { tensileStrengthMPa: i.tensileStrengthMPa } : {}),
    ...(i.platingRejectPct && i.platingRejectPct > 0 ? { platingRejectPct: i.platingRejectPct } : {}),
    annualVolume: i.annualVolume || 100000,
    region: i.region || 'UK',
  };
}

/** The measured surface as the form holds it: m², 4 decimals (setNumericField rounds the CAD fill the same way). */
export function measuredFinishAreaM2(surfaceCm2: number | null | undefined): number {
  return typeof surfaceCm2 === 'number' && surfaceCm2 > 0 ? Number((surfaceCm2 / 10_000).toFixed(4)) : 0;
}

/**
 * The finishes worth offering for a route and metal. Anodising is for aluminium only; zinc systems and galvanising for
 * ferrous parts. Routes that start with a step the commodity's rules ALREADY charge are left out, or it would be paid
 * twice: every casting is shot-blasted by the casting rules (and a leak-tight aluminium one impregnated), and every hot
 * forging descaled by the forging rules — so no blast-only, blast → zinc or blast → impregnate → e-coat on those routes.
 */
export function finishOptionsFor(commodity: string, family: MaterialFamily | null): string[] {
  const ferrous = family === 'steel' || family === 'cast iron';
  const alu = family === 'aluminium';
  const sheet = commodity === 'sheet_metal' || commodity === 'sheet_metal_fab';
  const cast = commodity === 'casting' || commodity === 'cast_and_machine';
  if (sheet) {
    if (alu) return ['powder_coat', 'e_coat', 'anodise'];
    if (ferrous) return ['e_coat', 'powder_coat', 'powder_coat_zn', 'zinc_plate', 'zinc_nickel', 'zinc_flake', 'galvanise'];
    return ['powder_coat', 'e_coat'];
  }
  if (cast) {
    if (alu) return ['e_coat', 'powder_coat', 'mass_finish'];
    if (ferrous) return ['e_coat', 'powder_coat', 'zinc_flake'];
    return ['e_coat', 'powder_coat'];
  }
  if (commodity === 'forging') {
    if (alu) return ['anodise', 'powder_coat'];
    if (ferrous) return ['e_coat', 'powder_coat', 'zinc_plate', 'zinc_flake'];
    return ['powder_coat'];
  }
  return [];
}
