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
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
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
  cureHr: number;
  /** Layup rate, hours per m² of laminated area per ply. */
  layupHrPerM2PerPly: number;
  note: string;
}

/**
 * The four systems that cover almost every real composite should-cost.
 *
 * Ply thickness, fibre fraction and waste are the published characteristics of
 * each system; the cure times mirror the ranges the prompt carried
 * (autoclave 2–4 hr, RTM 0.5–1.5 hr, infusion 1–2 hr).
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
    densityKgPerM3: 1550, cureHr: 3.0, layupHrPerM2PerPly: 0.06,
    note: 'aerospace and motorsport structure — highest properties, highest cost',
  },
  {
    value: 'prepreg-gf',
    label: 'Glass prepreg, oven cure',
    fibreId: 'mat-gfrp-prepreg-e', resinId: null,
    process: 'prepreg_layup',
    plyThicknessMm: 0.30, fibreWeightFraction: 0.60, wasteFraction: 0.15,
    densityKgPerM3: 1900, cureHr: 2.0, layupHrPerM2PerPly: 0.05,
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
  return DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id)?.pricePerKg ?? 0;
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
