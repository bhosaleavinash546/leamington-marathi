/**
 * Which process, with no model to ask?
 *
 * On the AI path a Haiku call picks the commodity and
 * `enforceGeometryCommodity` overrides it where the measurement is decisive.
 * The deterministic path has no such starting guess, so this supplies one —
 * and, more often, admits it cannot.
 *
 * That admission is the honest part. The fill-ratio ladder the prompt has
 * carried for months is written as prose *pairs*:
 *
 *     < 0.20  very sparse/thin-wall → sheet metal, injection moulding, or
 *             thin-wall machined
 *     < 0.40  moderate fill → casting OR machined from billet
 *     < 0.65  semi-solid → forging OR heavy section casting
 *     else    near-solid → forging OR machined from solid bar
 *
 * Every rung names two or three routes because the shape genuinely does not
 * separate them: a 0.5-fill bracket is a forging or a casting depending on
 * volume, tolerance and who is quoting. Reading that ladder as a classifier —
 * which is what asking a model to "pick one" amounts to — turns a documented
 * ambiguity into a confident-sounding answer.
 *
 * So this returns a commodity only where the geometry is decisive, and a
 * Decision listing the plausible routes everywhere else. The three decisive
 * signals are the ones `enforceGeometryCommodity` already trusts enough to
 * override a model with.
 */
import type { Decision, RuleContext } from '../types.js';
import { hollowVerdict } from './hollow.js';

export const COMMODITY_DECISION_ID = 'commodity.route';

export interface CommodityVerdict {
  /** Set when the measurement settles it. */
  commodity?: string;
  basis?: string;
  /** Set when it does not. */
  decision?: Decision;
}

interface Route { value: string; label: string; consequence: string }

const ROUTES: Record<string, Route> = {
  machining: { value: 'machining', label: 'Machined from solid', consequence: 'no tooling; cost is cutting time and the billet' },
  casting: { value: 'casting', label: 'Cast', consequence: 'a die or pattern to amortise; near-net, little machining' },
  cast_and_machine: { value: 'cast_and_machine', label: 'Cast then machined', consequence: 'die plus finish machining on the datums' },
  forging: { value: 'forging', label: 'Forged', consequence: 'die set plus billet; best grain flow, heaviest tooling' },
  sheet_metal: { value: 'sheet_metal', label: 'Pressed sheet metal', consequence: 'press tool and coil' },
  injection_moulding: { value: 'injection_moulding', label: 'Injection moulded', consequence: 'mould and resin' },
  blow_moulding: { value: 'blow_moulding', label: 'Blow moulded', consequence: 'blow mould and resin; hollow by construction' },
  rotational_moulding: { value: 'rotational_moulding', label: 'Rotomoulded', consequence: 'cheap tool, very long cycle' },
  thermoforming: { value: 'thermoforming', label: 'Thermoformed', consequence: 'cheap tool, sheet stock, high trim waste' },
};

function ask(why: string, routes: string[], leaning?: string): Decision {
  return {
    id: COMMODITY_DECISION_ID,
    kind: 'commodity',
    question: 'Which process makes this part?',
    why,
    options: routes.map(r => ({ ...ROUTES[r], leaning: leaning === r })),
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/**
 * Infer the commodity, or ask.
 *
 * The three decisive signals, in the order `enforceGeometryCommodity` applies
 * them: measured bends at a sheet gauge; a large thin shell with no enclosed
 * void; a large thin shell that does enclose one.
 */
export function inferCommodity(ctx: RuleContext): CommodityVerdict {
  const g = ctx.geo;

  const answered = ctx.answers[COMMODITY_DECISION_ID];
  if (typeof answered === 'string' && ROUTES[answered]) {
    return { commodity: answered, basis: 'chosen by the engineer' };
  }

  if (g.status !== 'success' || g.fillRatio == null || !g.boundingBox) {
    return {
      decision: ask(
        'No fill ratio or bounding box was measured, so nothing about the shape '
        + 'narrows the process. This is the STL or text-parsed path.',
        ['machining', 'casting', 'sheet_metal', 'injection_moulding']),
    };
  }

  const fill = g.fillRatio;
  const wall = g.wallThickness?.meanMm ?? null;
  const maxDim = Math.max(g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm);

  // 1. Bends at a sheet gauge. A moulding has no measurable bend radius on a
  //    1.5 mm wall — this is the one thin-shell signal that is not ambiguous.
  const sm = g.sheetMetal;
  if (sm && (sm.bendCount ?? 0) >= 2 && (sm.thicknessMm ?? 0) > 0 && (sm.thicknessMm ?? 99) <= 6) {
    return {
      commodity: 'sheet_metal',
      basis: `${sm.bendCount} bends measured at a ${sm.thicknessMm?.toFixed(1)} mm gauge`,
    };
  }

  const largeThinShell = fill < 0.03 && maxDim >= 250 && (wall == null || wall <= 10);
  // `near-enclosed` (a watertight thin container whose cavity has openings — a
  // fuel tank with a filler neck) must land in the HOLLOW branch: topology says
  // "no sealed void" for it, and routing a tank to injection/thermoform on that
  // technicality is the exact £216.97-sand-casting error class this exists for.
  const hv = hollowVerdict(g);
  const sealed = g.topology?.available
    ? (hv === 'near-enclosed' ? true : (g.topology.enclosesSealedVoid ?? null))
    : null;

  if (largeThinShell && sealed === true) {
    // A sealed cavity rules out every solid process — no core comes out. Which
    // hollow route it is depends on size and volume, which the shape does not say.
    return {
      decision: ask(
        `A ${maxDim.toFixed(0)} mm shell at ${(fill * 100).toFixed(1)}% fill enclosing a sealed `
        + 'void cannot come out of a solid process — there is no way to extract a core. '
        + 'Which hollow route depends on the size and the annual volume, not the shape.',
        ['blow_moulding', 'rotational_moulding', 'sheet_metal'],
        maxDim > 900 ? 'rotational_moulding' : 'blow_moulding'),
    };
  }

  if (largeThinShell && sealed === false) {
    // An open drape: not a solid process, and not blowable. Injection moulding
    // or thermoforming, and the volume decides which.
    return {
      decision: ask(
        `A ${maxDim.toFixed(0)} mm open drape at ${(fill * 100).toFixed(1)}% fill encloses no `
        + 'cavity, so it is neither a solid process nor a blown one. Injection moulding and '
        + 'thermoforming both make this shape; the volume and the surface finish decide.',
        ['injection_moulding', 'thermoforming', 'sheet_metal'],
        ctx.annualVolume >= 50_000 ? 'injection_moulding' : 'thermoforming'),
    };
  }

  // 2. Everything else is the prompt's fill ladder, and every rung of it names
  //    more than one route. Ask, with the rung as the reason.
  const rung =
    fill < 0.20 ? {
      why: `${(fill * 100).toFixed(0)}% fill — a sparse thin-wall part.`,
      routes: ['sheet_metal', 'injection_moulding', 'machining'],
    } : fill < 0.40 ? {
      why: `${(fill * 100).toFixed(0)}% fill — moderate.`,
      routes: ['casting', 'cast_and_machine', 'machining'],
    } : fill < 0.65 ? {
      why: `${(fill * 100).toFixed(0)}% fill — semi-solid.`,
      routes: ['forging', 'casting', 'cast_and_machine'],
    } : {
      why: `${(fill * 100).toFixed(0)}% fill — near-solid.`,
      routes: ['machining', 'forging', 'cast_and_machine'],
    };

  return {
    decision: ask(
      `${rung.why} The fill ratio narrows the field to these routes but does not choose `
      + 'between them: the same shape is cast at one volume and machined at another, and '
      + 'nothing in the geometry says which. This is a sourcing decision, not a measurement.',
      rung.routes),
  };
}
