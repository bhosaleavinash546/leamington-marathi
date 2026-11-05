/**
 * The built-in shop overhead and margin (rates flow R2, Nov 2026) — the ONE stated default every costing used before the
 * Overhead sheet was wired: overhead 12 % of material + process + labour + tooling, margin 8 % of the subtotal, for every
 * commodity. It is the built-in Overhead row (`oh-default`, commodity '*', UK). A country with no company row of its own
 * takes this row × its overhead multiplier (`regionalShopDefaults`); a company row for a commodity / country replaces it
 * there only. Pure data — imported by rate-library.ts and regional-rates.ts.
 */
import type { OverheadDefault } from './types.js';

export const BUILT_IN_SHOP_ROW: Readonly<OverheadDefault> = Object.freeze({
  id: 'oh-default',
  commodityType: '*',
  overheadPct: 0.12,
  marginPct: 0.08,
  sourceNote: 'CostVision default shop overhead 12 % (of material + process + labour + tooling) and supplier margin 8 % (of the '
    + 'subtotal), every commodity — engineering-typical, not sourced. The per-commodity "Industry benchmark" rows shipped before '
    + 'Nov 2026 were never read by a costing and are retired.',
});
