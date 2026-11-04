/**
 * What a foundry's melt shop costs per casting, by alloy.
 *
 * Two things the casting model used to get wrong (casting review, 2 Oct 2026):
 *
 * 1. **Runners, risers, biscuits and overflows are remelted in-house.** The
 *    engine credited every kilogram of gating back at the SCRAP price — £0.28/kg
 *    against £2.10/kg bought for cast steel, £0.54 against £2.75 for ADC12 — as
 *    if the foundry sold its own returns to a scrap yard. It does not: returns go
 *    straight back into the furnace. What is actually lost per melt is the
 *    oxidation / dross loss, a few percent of what is remelted. On a 65%-yield
 *    steel bracket that one line overcharged ~£2.50 of metal per part.
 *
 * 2. **Melting energy was not charged anywhere.** Every kilogram poured — part
 *    plus gating — is melted and held; that energy is not in an ingot price and
 *    not in a moulding-line or die-casting-machine rate (their energy lines are
 *    tens of kW, not a melt furnace's hundreds).
 *
 * The figures are engineering-typical, stated as such, and meant to be replaced
 * with plant meter data: induction melting of iron ~520–650 kWh/t and of steel
 * ~600–750 kWh/t; aluminium melt + holding ~0.6–0.8 kWh/kg electric-equivalent;
 * dross / oxidation loss per remelt: aluminium and magnesium 2–6%, ferrous 2–4%,
 * zinc ~1–3%. A midpoint of each band is used.
 */
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';
import type { AlloyFamily } from './modules/casting-advisor.js';
import type { CountryBasis } from './regional-services.js';

export interface MeltFacts {
  alloy: AlloyFamily;
  /** Fraction of the remelted returns lost to dross / oxidation per melt. */
  lossFraction: number;
  /** Melt + hold energy per kg poured, kWh. */
  energyKwhPerKg: number;
  basis: string;
}

const MELT: Record<AlloyFamily, { loss: number; kwh: number; note: string }> = {
  aluminium:         { loss: 0.04, kwh: 0.65, note: 'aluminium melt + hold 0.6–0.8 kWh/kg, dross 2–6%' },
  magnesium:         { loss: 0.04, kwh: 0.70, note: 'magnesium melt under cover gas ~0.7 kWh/kg, dross 2–6%' },
  zinc:              { loss: 0.02, kwh: 0.25, note: 'zinc hot-chamber melt ~0.25 kWh/kg, dross 1–3%' },
  'grey-iron':       { loss: 0.03, kwh: 0.60, note: 'induction iron 520–650 kWh/t, oxidation 2–4%' },
  'ductile-iron':    { loss: 0.03, kwh: 0.62, note: 'induction iron 520–650 kWh/t + Mg treatment, oxidation 2–4%' },
  'carbon-steel':    { loss: 0.03, kwh: 0.70, note: 'induction steel 600–750 kWh/t, oxidation 2–4%' },
  'stainless-steel': { loss: 0.03, kwh: 0.75, note: 'induction stainless ~650–800 kWh/t, oxidation 2–4%' },
  superalloy:        { loss: 0.03, kwh: 0.90, note: 'vacuum induction melt ~0.9 kWh/kg, loss 2–4%' },
  copper:            { loss: 0.03, kwh: 0.40, note: 'copper-alloy induction ~0.35–0.45 kWh/kg, oxidation 2–4%' },
};

/** The casting alloy family behind a rate-library material, from its category. */
export function castingAlloyOf(materialId: string): AlloyFamily | null {
  const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === materialId);
  if (!m) return null;
  const c = `${m.category} ${m.grade}`.toLowerCase();
  if (/inconel|superalloy|nickel/.test(c)) return 'superalloy';
  if (/stainless|cf8|cf3/.test(c)) return 'stainless-steel';
  // Compacted graphite (EN-GJV) is Mg-treated like ductile iron and melts and pours as it — its nearest
  // family. The grade text says "Compacted Graphite Iron", never "cgi" or "cast iron", so EN-GJV-450
  // used to fall through to null: no melt loss, no melt energy, no advisor alloy (casting grade gap review).
  if (/ductile|gjs|spheroidal|cgi|\badi\b|gjv|compacted graphite/.test(c)) return 'ductile-iron';
  if (/grey|gjl|cast iron/.test(c)) return 'grey-iron';
  if (/steel/.test(c)) return 'carbon-steel';
  if (/magnes/.test(c)) return 'magnesium';
  if (/zinc|zamak/.test(c)) return 'zinc';
  if (/copper|bronze|brass/.test(c)) return 'copper';
  if (/alumin/.test(c)) return 'aluminium';
  return null;
}

/** Melt loss and energy for a material, or null when it is not a casting alloy. */
export function meltFactsFor(materialId: string): MeltFacts | null {
  const alloy = castingAlloyOf(materialId);
  if (!alloy) return null;
  const f = MELT[alloy];
  return { alloy, lossFraction: f.loss, energyKwhPerKg: f.kwh, basis: `${f.note} (engineering-typical — replace with plant data)` };
}

/**
 * The melt shop's labour, per kg poured (casting review, second pass). Engineering-typical, stated, replace with plant
 * data: charging, melting, treating and ladling run ~1–2 operator-hours per tonne poured on an induction shop; 1.5 is
 * used, at the library's furnace-operator rate.
 *
 * The moulding sand is no longer here: the engineering-typical £0.01/kg poured "green-sand additions" was replaced by the
 * sourced new-sand + disposal line (`FOUNDRY_INDIRECT.newSand`, review round 4 Nov 2026). Chemically bonded (no-bake)
 * sand runs several times a green-sand system's and should be entered by the foundry.
 */
export const MELT_SHOP = {
  labourHrPerTonnePoured: 1.5,
  labourId: 'lab-uk-furnace',
} as const;

/**
 * Foundry indirect costs as NAMED lines (review round, 4 Nov 2026). Source: scripts/research/2026-11-review-round/
 * data.json (rows S2, S3, E1, E2, E3) and notes.md §1.1 — each figure's URL, quote and grade are there; the basis lines
 * the casting rules print repeat the value, the source and the arithmetic. Applied to the sand and gravity routes:
 *
 * - New sand: a green-sand system adds new sand at 10–20 % of the POURED weight (EU JRC SF BREF 2024 §3.2.1.4.4, S2,
 *   grade B); the midpoint is costed. It is bought at €45/t and the same tonnage is discarded at €43/t (DE UBA 2014 case
 *   study in the BREF, Tables 3.21–3.22, S3, grade B; 2014 money, not escalated — the library has no escalation rule).
 *   This replaces the old engineering-typical £0.01/kg poured "green-sand additions" (new sand, bentonite and coal dust).
 * - Ladle preheat, kWh per tonne of LIQUID metal (BAT-AEPL, BREF 2024 Tables 4.1–4.2, E1, grade B): iron 50–150, steel
 *   100–300; the midpoint is costed. A ladle is preheated by a burner — natural gas is ASSUMED (CostVision engineering
 *   judgement, not sourced); the kWh go to the core as gas so every country prices them at its own tariff.
 * - Dust extraction / off-gas cleaning: ~20 kWh per tonne of GOOD casting (German data restated in the BREF 2024
 *   §2.3.8.1, E2, grade B), electricity.
 * - Other plant electricity beyond melting and holding (sand plant, moulding, cleaning, compressed air, services): a US
 *   cupola ductile-iron green-sand plant used 720 kWh/t of electricity in all (US DOE 2003 site study, E3, grade B); with
 *   its two 1.2 MW channel holding furnaces taken out that leaves ~0.45–0.50 kWh/kg good casting — the research's OWN
 *   inference (grade D), so it is an ESTIMATE and says so. That figure includes the dust extraction, which is charged on
 *   its own line, so this line is the midpoint 0.475 less 0.020 = 0.455 kWh/kg.
 *
 * Ladle preheat and dust extraction are sourced for iron and steel foundries only; the plant figure is a green-sand iron
 * plant's, so it is charged on ferrous SAND castings only. Every other alloy is told it is not costed. What the research
 * could not price is listed (`FOUNDRY_NOT_COSTED`) and never invented.
 */
export const FOUNDRY_INDIRECT = {
  newSand: {
    shareBand: [0.10, 0.20] as const,
    shareOfPoured: 0.15,
    sandEurPerT: 45,
    disposalEurPerT: 43,
    /** REGIONAL_DATA.fxToGBP for the euro (book FX, 2026-10) — the research's own conversion. */
    eurPerGbp: 1.1965,
    source: 'EU JRC SF BREF 2024 §3.2.1.4.4 (new sand 10–20 % of poured metal) and Tables 3.21–3.22 (DE UBA 2014: new sand €45/t, disposal €43/t)',
  },
  ladlePreheatKwhPerT: {
    iron: { band: [50, 150] as const, mid: 100 },
    steel: { band: [100, 300] as const, mid: 200 },
    source: 'EU JRC SF BREF 2024, BAT-AEPL Tables 4.1 (iron) and 4.2 (steel), kWh per tonne of liquid metal',
    fuel: 'gas' as const,
    fuelBasis: 'natural-gas burner assumed (CostVision engineering judgement, not sourced)',
  },
  dustExtractionKwhPerT: {
    value: 20,
    source: 'German data restated in the EU JRC SF BREF 2024 §2.3.8.1 (flue-gas cleaning ~20 kWh per tonne of good casting)',
  },
  plantElectricity: {
    bandKwhPerKg: [0.45, 0.50] as const,
    midKwhPerKg: 0.475,
    source: 'US DOE "Energy Use in Selected Metalcasting Facilities – 2003": a cupola ductile-iron green-sand plant used 720 kWh/t '
      + 'of electricity in all; with its two 1.2 MW channel holding furnaces taken out, ~0.45–0.50 kWh/kg good casting is left '
      + '(the research\'s inference, grade D)',
  },
} as const;

/** New sand + its disposal, £ a tonne of sand, UK (2014 euros at the book FX, not escalated). */
export const NEW_SAND_GBP_PER_T_SAND = (FOUNDRY_INDIRECT.newSand.sandEurPerT + FOUNDRY_INDIRECT.newSand.disposalEurPerT)
  / FOUNDRY_INDIRECT.newSand.eurPerGbp;
/** The sand part of the £ is the traded mineral; the disposal is a local service — the split is the sourced prices'. */
export const NEW_SAND_TRADED_SHARE = FOUNDRY_INDIRECT.newSand.sandEurPerT
  / (FOUNDRY_INDIRECT.newSand.sandEurPerT + FOUNDRY_INDIRECT.newSand.disposalEurPerT);
/** The country basis of the new-sand £ (regional-services.ts): the sand is the traded share, the disposal a local
 *  process service — the split is the sourced prices' (€45 : €43). The CAD rule and the forms' default table share it. */
export const NEW_SAND_BASIS: CountryBasis = { globalShare: Math.round(NEW_SAND_TRADED_SHARE * 10_000) / 10_000, rest: 'process' };
/** Other plant electricity, kWh a tonne of good casting: the plant midpoint less the dust extraction charged on its own line. */
export const PLANT_OTHER_KWH_PER_T = Math.round(FOUNDRY_INDIRECT.plantElectricity.midKwhPerKg * 1000 - FOUNDRY_INDIRECT.dustExtractionKwhPerT.value);

/**
 * What the research could not price (review round, notes.md §3 gaps 5–6) — listed, NOT costed, never invented. Printed on
 * the casting rules' basis and in the report standard's "Not in the cost model".
 */
export const FOUNDRY_NOT_COSTED = 'NOT costed (no published price found): furnace and ladle refractory (8–9 kg/t molten on '
  + 'induction, 1994 data — no current price), the metallurgical lab a melt, the pouring and sand-plant crew beyond the '
  + 'moulding-line crew and the melt shop\'s operator-hours, bentonite and coal-dust additions (bentonite €228/t is published, '
  + 'no consumption a tonne poured), and on steel castings riser cut-off, weld repair and steel refractory wear';
