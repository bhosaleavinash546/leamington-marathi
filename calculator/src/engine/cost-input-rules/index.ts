/**
 * The deterministic cost-input rule engine — public surface.
 *
 * One place to look up "which rules cost this commodity", so the server route,
 * the prompt renderer and the form filler cannot each keep their own list.
 */
export * from './types.js';
export { runCostInputRules, renderCommodityRulesPrompt } from './engine.js';

import type { CommodityRuleSpec } from './types.js';
import { CASTING_RULES } from './commodities/casting.js';
import { SHEET_METAL_RULES } from './commodities/sheet-metal.js';
import { INJECTION_MOULDING_RULES } from './commodities/injection-moulding.js';
import { BLOW_MOULDING_RULES } from './commodities/blow-moulding.js';
import { MACHINING_RULES } from './commodities/machining.js';
import { FORGING_RULES } from './commodities/forging.js';
import { CAST_AND_MACHINE_RULES } from './commodities/cast-and-machine.js';

export {
  CASTING_RULES, SHEET_METAL_RULES, INJECTION_MOULDING_RULES, BLOW_MOULDING_RULES,
  MACHINING_RULES, FORGING_RULES, CAST_AND_MACHINE_RULES,
};

/**
 * Commodity → rule spec.
 *
 * `sheet_metal_fab` is the same measured blank as `sheet_metal` — the difference
 * is the fabrication route downstream, not the cost inputs the geometry yields —
 * so it shares the spec rather than duplicating it.
 */
export const RULE_SPECS: Record<string, CommodityRuleSpec> = {
  casting: CASTING_RULES,
  cast_and_machine: CAST_AND_MACHINE_RULES,
  sheet_metal: SHEET_METAL_RULES,
  sheet_metal_fab: SHEET_METAL_RULES,
  injection_moulding: INJECTION_MOULDING_RULES,
  blow_moulding: BLOW_MOULDING_RULES,
  machining: MACHINING_RULES,
  forging: FORGING_RULES,
};

/** Commodities that can be costed with no AI call today. */
export const DETERMINISTIC_COMMODITIES = Object.keys(RULE_SPECS);

/** The rules for a commodity, or null when it has not been converted yet. */
export function specForCommodity(commodity: string): CommodityRuleSpec | null {
  return RULE_SPECS[commodity] ?? null;
}
