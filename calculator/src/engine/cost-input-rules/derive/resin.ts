/**
 * Which resin? The plastics equivalent of the material-family question.
 *
 * `materialFacts` gets a plastic part as far as "it is a plastic" and stops,
 * because that is all the commodity tells you. But "plastic" is not a costing
 * input — the resin is. Across the grades this tool actually stocks:
 *
 *   - density spans 900 (PP) to 1520 kg/m³ (PBT-GF30) — a 69% swing on weight
 *   - price spans £0.83 (uPVC) to £3.10/kg (PA66-GF30) — a 3.7x swing
 *   - cooling factor spans 2.0 (PA6, ABS) to 3.5 s/mm² (HDPE) — a 75% swing on
 *     cycle time, which is the entire process bucket
 *
 * Nothing in the geometry narrows that. A moulded PP bumper and a moulded PA66
 * bracket are the same shape problem. So we ask, once, and show what each answer
 * does to the weight — the same treatment the material family gets.
 *
 * Everything numeric here is read from `DEFAULT_RATE_LIBRARY` or from
 * `autoCoolFactorForMaterial`; nothing is duplicated. The one table this module
 * owns is cavity pressure, which no other module carries.
 */
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { autoCoolFactorForMaterial } from '../../modules/injection-moulding.js';
import type { Decision, RuleContext } from '../types.js';

export const RESIN_DECISION_ID = 'material.resin';

/**
 * Peak cavity pressure by resin, MPa.
 *
 * Drives the clamp-tonnage calculation and therefore the press. Easy-flow
 * polyolefins pack out at ~30–35 MPa; engineering resins and anything glass-filled
 * need substantially more. Ordered most-specific first, in the same style as
 * `autoCoolFactorForMaterial`, which this deliberately mirrors.
 */
const CAVITY_PRESSURE_MPA: Array<[RegExp, number]> = [
  [/peek|pei|ultem|pps|ppa/, 70],
  [/\bpc\b|pc-abs|pc-pbt|lexan/, 65],
  [/pa6|pa66|nylon|pbt|\bpet\b|pet-/, 55],
  [/pom|acetal|delrin/, 55],
  [/abs|asa|san|hips|gpps|\bps\b/, 45],
  [/\bpp|hdpe|ldpe|lldpe|upvc|fpvc|pvc/, 35],
];

/** Glass or mineral fill needs more pressure to pack out. */
const FILLED = /gf\d|-gf|glass|t20|t30|lgf|mineral/;

export function cavityPressureMPaFor(materialId: string): number {
  const id = (materialId || '').toLowerCase();
  const base = CAVITY_PRESSURE_MPA.find(([re]) => re.test(id))?.[1] ?? 50;
  return FILLED.test(id) ? base + 10 : base;
}

/**
 * The resins offered per commodity.
 *
 * Short lists on purpose: a menu of forty grades is a worse question than a menu
 * of six.
 *
 * Two kinds of filename hint, and the order matters. `grade` is the resin named
 * outright; `application` is a part name that usually implies one. A file called
 * `front-bumper-PA66.step` must lean PA66, not PP — the part is a bumper and
 * bumpers are usually PP, but somebody has written the grade on the file and
 * that beats an association every time. Either way it is only ever a leaning:
 * shown, never preselected.
 */
interface ResinCandidate { id: string; grade: RegExp; application?: RegExp }

const RESIN_MENUS: Record<string, ResinCandidate[]> = {
  injection_moulding: [
    { id: 'mat-pp-impact', grade: /\bpp\b|polyprop/, application: /bumper|fascia|cladding/ },
    { id: 'mat-abs', grade: /\babs\b/ },
    { id: 'mat-pc-abs', grade: /pc.?abs/ },
    { id: 'mat-pa6-gf30', grade: /\bpa6\b|nylon.?6\b/ },
    { id: 'mat-pa66gf30', grade: /pa66|nylon.?66/ },
    { id: 'mat-pom', grade: /\bpom\b|acetal|delrin/ },
  ],
  blow_moulding: [
    { id: 'mat-hdpe', grade: /hdpe|\bpe\b/, application: /tank|jerrican|drum|duct/ },
    { id: 'mat-pp-homo', grade: /\bpp\b|polyprop/ },
    { id: 'mat-pet-bg', grade: /\bpet\b/, application: /bottle/ },
  ],
  thermoforming: [
    { id: 'mat-hips', grade: /hips|\bps\b|polystyr/, application: /tray|liner|pack/ },
    { id: 'mat-abs', grade: /\babs\b/, application: /cover|housing|panel/ },
    { id: 'mat-pp-homo', grade: /\bpp\b|polyprop/ },
    { id: 'mat-upvc', grade: /pvc/ },
    { id: 'mat-pc', grade: /\bpc\b|polycarb|lexan/, application: /glazing|guard|shield/ },
  ],
  // Rotational moulding is overwhelmingly polyethylene; a short menu is the
  // honest one rather than a long list of grades nobody rotomoulds.
  rotational_moulding: [
    { id: 'mat-hdpe', grade: /hdpe|\bpe\b/, application: /tank|bin|kayak|planter|reservoir/ },
    { id: 'mat-pp-homo', grade: /\bpp\b|polyprop/ },
  ],
};

export interface ResinFacts {
  /** Rate-library material id, or null while the question is open. */
  materialId: string | null;
  grade: string | null;
  densityKgPerM3: number | null;
  /** kg for the measured volume in this resin. */
  massKg: number | null;
  coolFactorSPerMm2: number | null;
  cavityPressureMPa: number | null;
  basis: string;
  decision?: Decision;
}

function lookup(id: string) {
  return DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id) ?? null;
}

function factsFor(id: string, volumeCm3: number, how: string): ResinFacts {
  const m = lookup(id)!;
  // cm³ x kg/m³ / 1e6 = kg
  const massKg = Math.round((volumeCm3 * m.densityKgPerM3) / 1e6 * 10_000) / 10_000;
  return {
    materialId: id,
    grade: m.grade,
    densityKgPerM3: m.densityKgPerM3,
    massKg,
    coolFactorSPerMm2: autoCoolFactorForMaterial(id),
    cavityPressureMPa: cavityPressureMPaFor(id),
    basis: `${m.grade} at ${m.densityKgPerM3} kg/m³ — ${volumeCm3.toFixed(0)} cm³ measured (${how})`,
  };
}

/** Resolve the resin, or ask. */
export function resinFacts(ctx: RuleContext): ResinFacts {
  const volumeCm3 = ctx.geo.volume?.cm3 ?? 0;
  const menu = (RESIN_MENUS[ctx.commodity] ?? RESIN_MENUS.injection_moulding)
    .filter(c => lookup(c.id));

  // Any resin in the rate library is a valid answer — the menu exists to make
  // the question short, not to reject grades that are not on it. The AI path in
  // particular answers with whatever grade it picked, which is routinely a
  // sensible resin outside a six-item shortlist.
  const answered = ctx.answers[RESIN_DECISION_ID];
  if (typeof answered === 'string' && lookup(answered)) {
    return factsFor(answered, volumeCm3,
      menu.some(c => c.id === answered) ? 'chosen by the engineer' : 'chosen off-menu');
  }

  // Separators normalised to spaces first: '_' is a regex word character, so
  // 'bumper_pp.step' would otherwise defeat a \bpp\b anchor.
  const haystack = `${ctx.filename} ${ctx.geo.partName ?? ''}`.toLowerCase().replace(/[_\-.]+/g, ' ');
  const hinted = menu.find(c => c.grade.test(haystack))?.id
    ?? menu.find(c => c.application?.test(haystack))?.id
    ?? null;

  const kg = (id: string) => {
    const m = lookup(id)!;
    return (volumeCm3 * m.densityKgPerM3 / 1e6).toFixed(3);
  };

  return {
    materialId: null, grade: null, densityKgPerM3: null, massKg: null,
    coolFactorSPerMm2: null, cavityPressureMPa: null,
    basis: 'undecided — awaiting the engineer',
    decision: {
      id: RESIN_DECISION_ID,
      kind: 'material_grade',
      question: 'Which resin is this moulded in?',
      why: 'The geometry is the same whichever resin fills it, but the resin sets the '
        + 'weight, the £/kg and the cooling time — and cooling is most of the cycle. '
        + `The ${volumeCm3.toFixed(0)} cm³ measured here weighs `
        + `${kg(menu[0].id)} kg in ${lookup(menu[0].id)!.grade} and `
        + `${kg(menu[menu.length - 1].id)} kg in ${lookup(menu[menu.length - 1].id)!.grade}.`,
      options: menu.map(c => {
        const m = lookup(c.id)!;
        return {
          value: c.id,
          label: m.grade,
          consequence: `${kg(c.id)} kg at £${m.pricePerKg.toFixed(2)}/kg · `
            + `cools at ${autoCoolFactorForMaterial(c.id)} s/mm²`,
          leaning: hinted === c.id,
        };
      }),
      blockedFieldIds: [],
      blockedRuleIds: [],
      severity: 'blocking',
    },
  };
}
