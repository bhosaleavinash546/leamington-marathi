/**
 * Is an alternative route's MATERIAL price fit to rest a "cheaper route" claim on?
 *
 * Fresh review (4 Nov 2026, scratchpad review/fresh-numbers.md §1.3–1.4, §4.3): the steering knuckle (−23 %) and the hub
 * flange (−31 %) printed "a feasible route is cheaper: casting" on page 1. The comparison's casting row is costed in the
 * casting route's representative steel grade (GS-C25 — the forging's steel FAMILY travels to every route, the forging
 * billet grade is off the casting scope), with the steel melt; but the UK book prices that grade as the steel-foundry
 * CHARGE — UK 0A merchant scrap ÷ 0.96 melt loss, £0.148/kg — below the £0.20/kg the forging's own steel scrap is
 * credited at, and with none of a steel foundry's riser cut-off, refractory, deoxidation or weld repair. The arithmetic
 * was right; the comparison was not one a buyer could act on.
 *
 * Two readings, both off the rate book the costing used — no new figure:
 *  - IMPLAUSIBLE: the grade is bought for less than its own scrap is credited at, or for less than the costed route's
 *    scrap of the SAME metal family is credited at (a charge cannot cost less than the scrap it is made from sells for).
 *    The comparison refuses the row with the reason (route-compare.ts) — it is never offered as a route.
 *  - HELD: the book grades the price Low AND its note labels it unsourced ("held", "engineering-typical", "not sourced",
 *    ESTIMATE). The row stays in the comparison with a caveat, but no page-1 alert rests on it.
 */
import type { RateLibrary } from './types.js';
import { familyOfCategory } from './route-feasibility.js';

export type RouteMaterialStatus = 'ok' | 'held' | 'implausible';
export interface RouteMaterialCheck { status: RouteMaterialStatus; reason: string | null }

const UNSOURCED_NOTE = /not sourced|engineering[- ]typical|\bheld\b|\bESTIMATE\b/i;
const gbp = (n: number) => `£${n.toFixed(4)}/kg`;

/**
 * The material price check of an alternative row: `rowMaterialId` is the grade the row was costed in, `refMaterialId`
 * the costing's own grade, `book` the rate book both were priced in (the region's).
 */
export function routeMaterialCheck(rowMaterialId: string | null | undefined, refMaterialId: string | null | undefined, book: RateLibrary): RouteMaterialCheck {
  const m = rowMaterialId ? book.materials.find(x => x.id === rowMaterialId) : undefined;
  if (!m || !(m.pricePerKg > 0)) return { status: 'ok', reason: null };
  const own = m.scrapRecoveryPricePerKg;
  if (own != null && own > m.pricePerKg) {
    return { status: 'implausible', reason: `${m.grade} is bought at ${gbp(m.pricePerKg)}, below the ${gbp(own)} its own scrap is credited at `
      + 'in the same rate book — a material price that cannot be paid; not a basis for a cheaper route' };
  }
  const ref = refMaterialId && refMaterialId !== rowMaterialId ? book.materials.find(x => x.id === refMaterialId) : undefined;
  const fam = familyOfCategory(m.category), refFam = ref ? familyOfCategory(ref.category) : null;
  if (ref && fam && fam === refFam && ref.scrapRecoveryPricePerKg != null && m.pricePerKg < ref.scrapRecoveryPricePerKg) {
    return { status: 'implausible', reason: `${m.grade} is bought at ${gbp(m.pricePerKg)}, below the ${gbp(ref.scrapRecoveryPricePerKg)} the costed `
      + `route's own ${fam} scrap (${ref.grade}) is credited at — a ${fam} charge cannot cost less than the scrap it is made from sells for, `
      + 'so this row is a scrap price with none of the foundry\'s or mill\'s own costs; not a basis for a cheaper route' };
  }
  if (m.confidence === 'Low' && UNSOURCED_NOTE.test(m.sourceNote ?? '')) {
    return { status: 'held', reason: `${m.grade} at ${gbp(m.pricePerKg)} is a Low-confidence price the rate book labels unsourced — `
      + 'compare it with a quotation before acting on this route' };
  }
  return { status: 'ok', reason: null };
}
