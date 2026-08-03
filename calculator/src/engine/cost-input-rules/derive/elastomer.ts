/**
 * Which rubber? The elastomer analogue of the resin question, and a sharper one.
 *
 * Across the compounds this tool stocks, price spans £1.45/kg for SBR to
 * £320/kg for a perfluoroelastomer — a 220x range on a part whose geometry is
 * identical either way. Cure time spans 25 s for LSR to 720 s for FFKM, and cure
 * time IS the cycle, so it sets the process bucket outright. Nothing in a CAD
 * file distinguishes a £2 EPDM grommet from a £30 Viton one.
 *
 * The menu is the compounds an engineer actually picks between, each mapped to
 * the `RubberCompoundFamily` that `estimateRubberCureTimeSec` needs. Prices and
 * densities come from `DEFAULT_RATE_LIBRARY`; nothing is duplicated here.
 */
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { RUBBER_CURE_BASE_SEC, type RubberCompoundFamily } from '../../modules/rubber-advisor.js';
import type { Decision, RuleContext } from '../types.js';

export const ELASTOMER_DECISION_ID = 'material.elastomer';

/**
 * The compounds offered, and the cure family each maps to.
 *
 * Ordered roughly by how often they turn up in an automotive should-cost. The
 * hint is a filename or part-name signal, shown as a leaning and never acted on
 * alone — the same rule the resin and material-family questions follow.
 */
interface ElastomerCandidate {
  id: string;
  family: RubberCompoundFamily;
  hint?: RegExp;
  /** What the compound is normally specified for — shown with the option. */
  use: string;
}

const ELASTOMER_MENU: ElastomerCandidate[] = [
  { id: 'mat-epdm', family: 'epdm-sulphur', hint: /epdm|weatherstrip|seal|coolant|glass ?run/, use: 'weather seals, coolant hose, glass run' },
  { id: 'mat-nbr', family: 'nbr', hint: /nbr|nitrile|\boil\b|fuel/, use: 'oil and fuel contact' },
  { id: 'mat-nr', family: 'nr', hint: /\bnr\b|natural ?rubber|mount|bush/, use: 'engine mounts, bushes — best fatigue' },
  { id: 'mat-sbr', family: 'sbr', hint: /\bsbr\b/, use: 'general-purpose, lowest cost' },
  { id: 'mat-cr', family: 'cr', hint: /neoprene|\bcr\b|boot|bellow/, use: 'boots and bellows, weather + oil' },
  { id: 'mat-silicone-hcr', family: 'silicone-hcr', hint: /silicone|\bvmq\b|hcr/, use: 'high and low temperature' },
  { id: 'mat-lsr', family: 'silicone-lsr', hint: /\blsr\b|liquid ?silicone/, use: 'liquid silicone — fast cure, precision' },
  { id: 'mat-viton-fkm', family: 'fkm', hint: /viton|\bfkm\b|fluoro/, use: 'hot oil, fuel, aggressive fluids' },
];

export interface ElastomerFacts {
  materialId: string | null;
  grade: string | null;
  family: RubberCompoundFamily | null;
  densityKgPerM3: number | null;
  massKg: number | null;
  basis: string;
  decision?: Decision;
}

function lookup(id: string) {
  return DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id) ?? null;
}

/** Resolve the compound, or ask. */
export function elastomerFacts(ctx: RuleContext): ElastomerFacts {
  const volumeCm3 = ctx.geo.volume?.cm3 ?? 0;
  const menu = ELASTOMER_MENU.filter(c => lookup(c.id));

  const answered = ctx.answers[ELASTOMER_DECISION_ID];
  const chosen = typeof answered === 'string' ? menu.find(c => c.id === answered) : undefined;
  if (chosen) {
    const m = lookup(chosen.id)!;
    return {
      materialId: chosen.id,
      grade: m.grade,
      family: chosen.family,
      densityKgPerM3: m.densityKgPerM3,
      massKg: Math.round((volumeCm3 * m.densityKgPerM3) / 1e6 * 10_000) / 10_000,
      basis: `${m.grade} at ${m.densityKgPerM3} kg/m³ — ${volumeCm3.toFixed(0)} cm³ measured`,
    };
  }

  const haystack = `${ctx.filename} ${ctx.geo.partName ?? ''}`.toLowerCase().replace(/[_\-.]+/g, ' ');
  const hinted = menu.find(c => c.hint?.test(haystack))?.id ?? null;
  const priceOf = (id: string) => lookup(id)!.pricePerKg;
  const cheapest = menu.reduce((a, b) => (priceOf(a.id) <= priceOf(b.id) ? a : b));
  const dearest = menu.reduce((a, b) => (priceOf(a.id) >= priceOf(b.id) ? a : b));

  return {
    materialId: null, grade: null, family: null, densityKgPerM3: null, massKg: null,
    basis: 'undecided — awaiting the engineer',
    decision: {
      id: ELASTOMER_DECISION_ID,
      kind: 'material_grade',
      question: 'Which rubber compound is this?',
      why: 'The shape is the same whichever compound fills the cavity, but the compound '
        + `sets both the £/kg and the cure time — and cure time is the cycle. `
        + `${lookup(cheapest.id)!.grade} is £${priceOf(cheapest.id).toFixed(2)}/kg and cures in `
        + `${RUBBER_CURE_BASE_SEC[cheapest.family]} s; ${lookup(dearest.id)!.grade} is `
        + `£${priceOf(dearest.id).toFixed(2)}/kg. Nothing in the geometry separates them.`,
      options: menu.map(c => {
        const m = lookup(c.id)!;
        return {
          value: c.id,
          label: m.grade,
          consequence: `£${m.pricePerKg.toFixed(2)}/kg · cures in ~${RUBBER_CURE_BASE_SEC[c.family]} s · ${c.use}`,
          leaning: hinted === c.id,
        };
      }),
      blockedFieldIds: [],
      blockedRuleIds: [],
      severity: 'blocking',
    },
  };
}
