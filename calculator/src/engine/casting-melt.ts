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
  if (/ductile|gjs|spheroidal|cgi|adi/.test(c)) return 'ductile-iron';
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
 * The melt shop's labour and the moulding sand, per kg poured (casting review,
 * second pass). Engineering-typical, stated, replace with plant data:
 *
 * - Melt-shop labour: charging, melting, treating and ladling run ~1–2
 *   operator-hours per tonne poured on an induction shop; 1.5 is used, at the
 *   library's furnace-operator rate.
 * - Green-sand additions: a sand-to-metal ratio of ~5:1, with ~2% of the sand
 *   renewed each cycle as new sand, bentonite and coal dust at ~£0.10/kg —
 *   about £0.01 per kg poured. Chemically bonded (no-bake) sand runs several
 *   times this and should be entered by the foundry.
 */
export const MELT_SHOP = {
  labourHrPerTonnePoured: 1.5,
  labourId: 'lab-uk-furnace',
  greenSandAdditionsPerKgPoured: 0.01,
} as const;
