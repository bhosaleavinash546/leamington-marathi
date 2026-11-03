/**
 * Which laminate? The composites version of the material question — and the one
 * place in this project where the answer carries two materials, not one.
 *
 * A composite part is a fibre and a resin, and how they are combined is the
 * process. Prepreg arrives pre-impregnated and needs an autoclave; dry fabric
 * plus infusion resin needs a vacuum bag; RTM needs a matched die. Across the
 * systems this tool stocks, fibre price spans £3.99/kg for E-glass fabric to
 * £33.60/kg for T700 carbon prepreg, and the ply thickness that sets the ply
 * count spans 0.25 mm to 0.60 mm. Neither is visible in a solid model.
 *
 * The plan flagged composites as possibly staying engineer-input because no
 * parametric advisor exists. That turned out to be half right: there is no
 * advisor, but once the system is chosen, the ply count, the areas, the waste
 * fraction, the cure and the tool all follow from the measurement and from the
 * published characteristics of the system. So this asks ONE question and derives
 * the rest, rather than handing over a blank form.
 */
import { activeRates } from '../../rate-context.js';
import type { CompositeProcess } from '../../modules/composites.js';
import type { Decision, RuleContext } from '../types.js';

export const LAMINATE_DECISION_ID = 'material.laminate';

export interface LaminateSystem {
  value: string;
  label: string;
  fibreId: string;
  /** Prepreg carries its own resin, so there is no separate resin buy. */
  resinId: string | null;
  process: CompositeProcess;
  /** Cured single-ply thickness, mm — this is what sets the ply count. */
  plyThicknessMm: number;
  /** Fibre mass fraction of the cured laminate. */
  fibreWeightFraction: number;
  /** Trim and offcut loss. Prepreg is cut to a nest; hand layup wastes more. */
  wasteFraction: number;
  /** Cured laminate density, kg/m³. */
  densityKgPerM3: number;
  /** Cure cycle, hours — used ONLY where no published schedule applies (the oven and dry-fabric systems). An autoclave
   *  prepreg's cure is the published schedule of its resin system (`autoclaveCure`). */
  cureHr: number;
  /** Layup rate, hours per m² of laminated area per ply — used ONLY for dry fabric (no published preforming rate was
   *  found). A prepreg is laid by hand at the published mass rate (`HAND_LAYUP_KG_PER_HR`). */
  layupHrPerM2PerPly: number;
  note: string;
}

// ─── Published layup rates and cure schedules (report-standard research, 3 Nov 2026) ──────────────────────────────
// scripts/research/2026-11-report-standard/composites/{notes.md,data.json}; every row re-read in ../verify.md (all
// composites rows CONFIRMED). Rows marked "read through a fetch tool" refuse a plain download (HTTP 403) and were read
// through a page-fetch tool that returned the sentence verbatim — a person should open the page before a report quotes it.

/** 1 lb in kg (exact, international pound). */
const KG_PER_LB = 0.45359237;

/**
 * Hand layup of carbon/epoxy prepreg: "an average throughput speed of about 2 lb/hr" for a FLAT charge of 4–40 plies
 * (CompositesWorld, S. Black, Nov 2003 — LR-1; read through a fetch tool). 2 lb/h = 0.907 kg/h. On a shaped tool (a hat
 * section) it is an UPPER bound: a shaped ply is slower to lay than a flat one.
 */
export const HAND_LAYUP_KG_PER_HR = 2 * KG_PER_LB;
/**
 * Automated tape laying, 3 in tape, on the same flat charge: "20 lb/hr at an average speed of 20 ips" (LR-2, same
 * article). NOT costed: it lays a flat charge, so a shaped part then needs a forming step with no published rate, and
 * the tape-laying cell's capital is held (not sourced) in the rate book. Printed so the method costed is explicit —
 * the old 0.06 h/m²/ply (6.5 kg/h on 0.25 mm carbon) was tape-laying speed charged as hand layup.
 */
export const ATL_KG_PER_HR = 20 * KG_PER_LB;
export const LAYUP_RATE_SOURCE = 'CompositesWorld, "New Equipment Brings Tape Placement Within Reach Of Smaller Shops" '
  + '(S. Black, Nov 2003) — hand layup "about 2 lb/hr", tape laying "20 lb/hr", both on a flat carbon/epoxy charge; '
  + 'read through a fetch tool';

/** The answer that names the prepreg's resin system — an answer, never asked by the rules (as casting.processChoice). */
export const RESIN_SYSTEM_DECISION_ID = 'composites.resinSystem';
export type ResinSystem = 'epoxy-180' | 'fast-cure';

/** Room temperature the M21 heat-up starts from — the datasheet says "from room temperature"; 20 °C is taken. */
const ROOM_TEMP_C = 20;
/**
 * Hexcel HexPly M21 (180 °C aerospace toughened epoxy) data sheet ©2020, standard autoclave cure (AC-1, PDF text):
 * heat at 1–2 °C/min to 180 °C, hold 120 min, cool at 2–5 °C/min, vent at 60 °C or below.
 */
export const M21_SCHEDULE = { cureC: 180, rampCPerMin: [1, 2] as [number, number], holdMin: 120, coolCPerMin: [2, 5] as [number, number], ventC: 60 };
/** Hexcel HexPly M77 User Guide ©2016, standard autoclave cycle (AC-2, PDF text): 10 min to 140 °C, 7 min dwell, 6 min cool. */
export const M77_AUTOCLAVE_MIN = { toTemp: 10, dwell: 7, cool: 6 };

export interface CureSchedule { resin: ResinSystem; hr: number; lowHr: number; highHr: number; basis: string }

/** The autoclave cure of a prepreg, by its resin system — the datasheet schedule, with its arithmetic. */
export function autoclaveCure(resin: ResinSystem): CureSchedule {
  if (resin === 'fast-cure') {
    const m = M77_AUTOCLAVE_MIN;
    const min = m.toTemp + m.dwell + m.cool;
    const hr = Math.round(min / 60 * 10_000) / 10_000;
    return { resin, hr, lowHr: hr, highHr: hr,
      basis: `fast-cure 140 °C epoxy (Hexcel HexPly M77 class): ${m.toTemp} min to 140 °C + ${m.dwell} min dwell + ${m.cool} min cool `
        + `= ${min} min = ${hr} h (HexPly M77 User Guide ©2016, standard autoclave cycle; tool heat-up with a full load of tools `
        + 'is not in the schedule and is NOT costed — no published figure)' };
  }
  const s = M21_SCHEDULE;
  const heat = (s.cureC - ROOM_TEMP_C);
  const cool = (s.cureC - s.ventC);
  const lowMin = heat / s.rampCPerMin[1] + s.holdMin + cool / s.coolCPerMin[1];
  const highMin = heat / s.rampCPerMin[0] + s.holdMin + cool / s.coolCPerMin[0];
  const midMin = (lowMin + highMin) / 2;
  const hr = Math.round(midMin / 60 * 10_000) / 10_000;
  return { resin, hr, lowHr: Math.round(lowMin / 60 * 100) / 100, highHr: Math.round(highMin / 60 * 100) / 100,
    basis: `180 °C aerospace epoxy (Hexcel HexPly M21 class): heat ${heat} K at ${s.rampCPerMin[0]}–${s.rampCPerMin[1]} °C/min `
      + `(${heat / s.rampCPerMin[1]}–${heat / s.rampCPerMin[0]} min, from ${ROOM_TEMP_C} °C room temperature — taken) + ${s.holdMin} min hold `
      + `+ cool ${cool} K to the ${s.ventC} °C vent at ${s.coolCPerMin[0]}–${s.coolCPerMin[1]} °C/min (${cool / s.coolCPerMin[1]}–${cool / s.coolCPerMin[0]} min) `
      + `= ${lowMin}–${highMin} min; the centre, ${midMin} min = ${hr} h, is costed (HexPly M21 data sheet ©2020, standard cure; `
      + 'load, pressurise and unload are not in the schedule and are NOT costed — no published figure)' };
}

/** The resin system answered, or the default for the laminate: an autoclave prepreg is costed as the 180 °C system. */
export function resinSystemOf(answers: Readonly<Record<string, unknown>>): { resin: ResinSystem; answered: boolean } {
  const v = answers[RESIN_SYSTEM_DECISION_ID];
  if (v === 'fast-cure' || v === 'epoxy-180') return { resin: v, answered: true };
  return { resin: 'epoxy-180', answered: false };
}

/**
 * The four systems that cover almost every real composite should-cost.
 *
 * Ply thickness, fibre fraction and waste are the published characteristics of
 * each system. The autoclave prepreg's cure is its resin system's published schedule (`autoclaveCure`) and a prepreg is
 * laid at the published hand-layup mass rate; the `cureHr` / `layupHrPerM2PerPly` below are used only by the oven and
 * dry-fabric systems, and are engineering-typical, not sourced (printed so).
 *
 * The `process` values are the engine's `CompositeProcess`, which is worth
 * stating because the prompt's are not. `cad.ts` asks the model for
 * `hand_layup | prepreg_autoclave | rtm | infusion | smc | wet_layup`, and
 * `computeCompositeDrivers` accepts
 * `hand_layup | prepreg_layup | rtm | vartm | filament_winding | pultrusion`.
 * Four of the six words the prompt offers are not process names the engine has
 * ever known — a model that obediently returns "infusion" is returning a value
 * nothing downstream can use. Infusion IS vartm; prepreg autoclave IS
 * prepreg_layup.
 */
export const LAMINATE_SYSTEMS: LaminateSystem[] = [
  {
    value: 'prepreg-cf',
    label: 'Carbon prepreg, autoclave',
    fibreId: 'mat-cfrp-prepreg-t700', resinId: null,
    process: 'prepreg_layup',
    plyThicknessMm: 0.25, fibreWeightFraction: 0.65, wasteFraction: 0.15,
    densityKgPerM3: 1550, cureHr: 3.0, layupHrPerM2PerPly: 0.06,   // unused: published cure / layup (above)
    note: 'aerospace and motorsport structure — highest properties, highest cost',
  },
  {
    value: 'prepreg-gf',
    label: 'Glass prepreg, oven cure',
    fibreId: 'mat-gfrp-prepreg-e', resinId: null,
    process: 'prepreg_layup',
    plyThicknessMm: 0.30, fibreWeightFraction: 0.60, wasteFraction: 0.15,
    densityKgPerM3: 1900, cureHr: 2.0, layupHrPerM2PerPly: 0.05,   // cure used (oven); layup unused (hand rate)
    note: 'structural glass — radomes, covers, tooling',
  },
  {
    value: 'infusion-gf',
    label: 'Dry glass + epoxy infusion',
    fibreId: 'mat-gf-dry-e', resinId: 'mat-epoxy-infusion',
    process: 'vartm',
    plyThicknessMm: 0.55, fibreWeightFraction: 0.55, wasteFraction: 0.22,
    densityKgPerM3: 1850, cureHr: 1.5, layupHrPerM2PerPly: 0.035,
    note: 'large marine and wind structures — one-shot vacuum bag',
  },
  {
    value: 'rtm-gf',
    label: 'Dry glass + vinyl ester RTM',
    fibreId: 'mat-gf-dry-e', resinId: 'mat-vinylester-rtm',
    process: 'rtm',
    plyThicknessMm: 0.50, fibreWeightFraction: 0.50, wasteFraction: 0.12,
    densityKgPerM3: 1800, cureHr: 0.8, layupHrPerM2PerPly: 0.025,
    note: 'closed matched-die moulding — best surface both sides, higher tooling',
  },
];

export interface LaminateFacts {
  system: LaminateSystem | null;
  /** Cured part weight for the measured volume in this system. */
  massKg: number | null;
  fibrePricePerKg: number | null;
  resinPricePerKg: number | null;
  basis: string;
  decision?: Decision;
}

function price(id: string | null): number {
  if (!id) return 0;
  // The costed country's book (rate-context.ts) — it read the UK book in every country.
  return activeRates().materials.find(m => m.id === id)?.pricePerKg ?? 0;
}

function massFor(volumeCm3: number, s: LaminateSystem): number {
  return Math.round((volumeCm3 * s.densityKgPerM3) / 1e6 * 10_000) / 10_000;
}

/**
 * The system whose fibre a given material id names.
 *
 * Lets the AI path answer this question the way it answers the others: the model
 * picks a material, and the system it belongs to follows. Two systems share the
 * dry E-glass fabric, so the tie goes to infusion — the more common of the two
 * and the cheaper tool, which is the conservative side of the guess.
 */
export function systemForFibreId(materialId: string): LaminateSystem | null {
  return LAMINATE_SYSTEMS.find(s => s.fibreId === materialId) ?? null;
}

/** Resolve the laminate system, or ask. */
export function laminateFacts(ctx: RuleContext): LaminateFacts {
  const volumeCm3 = ctx.geo.volume?.cm3 ?? 0;

  const answered = ctx.answers[LAMINATE_DECISION_ID];
  const chosen = typeof answered === 'string'
    ? LAMINATE_SYSTEMS.find(s => s.value === answered) : undefined;
  if (chosen) {
    return {
      system: chosen,
      massKg: massFor(volumeCm3, chosen),
      fibrePricePerKg: price(chosen.fibreId),
      resinPricePerKg: price(chosen.resinId),
      basis: `${chosen.label} at ${chosen.densityKgPerM3} kg/m³ cured — `
        + `${volumeCm3.toFixed(0)} cm³ measured`,
    };
  }

  const haystack = `${ctx.filename} ${ctx.geo.partName ?? ''}`.toLowerCase();
  const hinted =
    /carbon|\bcf\b|cfrp|prepreg/.test(haystack) ? 'prepreg-cf'
    : /marine|hull|blade|infus/.test(haystack) ? 'infusion-gf'
    : /\brtm\b/.test(haystack) ? 'rtm-gf'
    : null;

  return {
    system: null, massKg: null, fibrePricePerKg: null, resinPricePerKg: null,
    basis: 'undecided — awaiting the engineer',
    decision: {
      id: LAMINATE_DECISION_ID,
      kind: 'material_grade',
      question: 'Which fibre and resin system?',
      why: 'A composite part is two materials and a process, and the model shows only '
        + 'the shape. Carbon prepreg is £33.60/kg and lays up 0.25 mm per ply; dry '
        + 'E-glass is £3.99/kg and lays up 0.55 mm. That changes both the material cost '
        + 'and how many plies the measured wall takes — a factor of several either way.',
      options: LAMINATE_SYSTEMS.map(s => ({
        value: s.value,
        label: s.label,
        consequence: `${massFor(volumeCm3, s).toFixed(3)} kg cured · fibre £${price(s.fibreId).toFixed(2)}/kg`
          + (s.resinId ? ` + resin £${price(s.resinId).toFixed(2)}/kg` : ' (resin included)')
          + ` · ${s.plyThicknessMm} mm/ply · ${s.note}`,
        leaning: hinted === s.value,
      })),
      blockedFieldIds: [],
      blockedRuleIds: [],
      severity: 'blocking',
    },
  };
}
