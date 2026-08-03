/**
 * Sheet metal or plastic moulding? The costliest question in the tool.
 *
 * A 1.5 mm steel stamping and a 2.5 mm PA6 moulding are, to a geometry kernel,
 * the same object: a thin uniform-wall shell. Per docs/cad-to-cost-learnings.md
 * this ambiguity produced the seat LH cross-member error — a steel stamping
 * costed as PA6 injection moulding, £2.84 against a manual £1.40 — and is
 * implicated in the servo horn (aluminium costed as plastic) and the front
 * bumper (plastic costed as aluminium gravity die casting) as well.
 *
 * Three of six documented cost errors trace back to this one call. Nothing in
 * the geometry resolves it, so it is a hard stop rather than a heuristic.
 *
 * `enforceGeometryCommodity` in server/routes/cad.ts already overrides the AI
 * on the cases geometry CAN decide (bend count → sheet metal; open drape →
 * injection moulding; sealed void → blow moulding). This covers what is left:
 * a thin shell with no bends detected and no decisive topology.
 */
import type { Decision, RuleContext } from '../types.js';
import { DENSITY_KG_PER_CM3 } from './material.js';

export const THIN_WALL_COMMODITY_DECISION_ID = 'commodity.thinWallRoute';

/** Commodities a thin uniform-wall shell could plausibly be. */
const THIN_WALL_ROUTES = ['sheet_metal', 'injection_moulding'] as const;

export interface ThinWallVerdict {
  /** True when the part is thin-walled enough for the question to arise. */
  ambiguous: boolean;
  decision?: Decision;
  /** Why we did or did not ask — carried into the notes. */
  reason: string;
}

/**
 * Decide whether the sheet-metal/moulding question needs asking.
 *
 * We only ask when the geometry is genuinely thin-shelled AND the kernel found
 * nothing decisive. Bends are decisive: a plastic moulding does not have a
 * measurable bend radius on a 1.5 mm wall. So is a sealed void.
 */
export function thinWallAmbiguity(ctx: RuleContext): ThinWallVerdict {
  const g = ctx.geo;

  if (ctx.answers[THIN_WALL_COMMODITY_DECISION_ID]) {
    return { ambiguous: false, reason: 'answered by the engineer' };
  }

  const wall = g.wallThickness?.meanMm ?? null;
  const fill = g.fillRatio ?? null;
  const thinShell = wall !== null && wall > 0 && wall <= 4 && fill !== null && fill < 0.25;
  if (!thinShell) {
    return { ambiguous: false, reason: 'not a thin shell — the question does not arise' };
  }

  // Bends are the kernel's decisive sheet-metal signal.
  const bends = g.sheetMetal?.bendCount ?? 0;
  if (bends >= 2) {
    return { ambiguous: false, reason: `${bends} bends measured — decisively sheet metal` };
  }

  // A sealed cavity cannot be stamped: no way to extract the core.
  if (g.topology?.enclosesSealedVoid === true) {
    return { ambiguous: false, reason: 'encloses a sealed void — cannot be a stamping' };
  }

  const volumeCm3 = g.volume?.cm3 ?? 0;
  const kg = (fam: keyof typeof DENSITY_KG_PER_CM3) =>
    (volumeCm3 * DENSITY_KG_PER_CM3[fam]).toFixed(2);

  return {
    ambiguous: true,
    reason: `thin shell (${wall.toFixed(1)} mm wall, ${(fill * 100).toFixed(0)}% fill) with no bends detected`,
    decision: {
      id: THIN_WALL_COMMODITY_DECISION_ID,
      kind: 'commodity',
      question: 'Is this a pressed metal part or a moulded plastic one?',
      why: `The kernel measured a ${wall.toFixed(1)} mm uniform wall filling `
        + `${(fill * 100).toFixed(0)}% of the bounding box, and found no bends. `
        + 'A thin steel pressing and a thin plastic moulding are the same shape — '
        + 'nothing in the geometry separates them, and the two cost very differently: '
        + 'one buys a press tool and coil, the other buys a mould and resin.',
      options: [
        {
          value: 'sheet_metal',
          label: 'Pressed metal',
          consequence: `${kg('steel')} kg in steel · press tool + coil`,
        },
        {
          value: 'injection_moulding',
          label: 'Moulded plastic',
          consequence: `${kg('plastic')} kg in plastic · mould + resin`,
        },
      ],
      blockedFieldIds: [],
      blockedRuleIds: [],
      severity: 'blocking',
    },
  };
}

export { THIN_WALL_ROUTES };
