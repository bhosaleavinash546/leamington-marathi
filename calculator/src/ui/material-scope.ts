/**
 * Which library grades each commodity form's material drop-down offers, keyed
 * by the <select> id and matched (case-insensitive) against a material's
 * `category`. The scopes are the engine's own (material scope review). Keeps a forging picker on billets and a moulding picker on resins
 * instead of all ~430 grades. Every material drop-down is listed here (tests/material-scope-review.test.ts).
 *
 * Kept out of main.ts because the rules must never pick a grade the form
 * cannot show: the form only accepts a value its list offers, and a rejected
 * value leaves the drop-down on its FIRST option. That is how a steel casting
 * was priced at the aluminium die-cast alloy's rate on screen (2 Oct 2026).
 * tests/material-scope-parity.test.ts checks every representative grade
 * against the drop-down it lands in.
 */
import { MATERIAL_SCOPE_BY_COMMODITY } from '../engine/material-scope.js';

/** Each form's material drop-down → the commodity whose scope it shows. */
export const SELECT_COMMODITY: Record<string, string> = {
  'mach-mat': 'machining', 'cast-mat': 'casting', 'cam-mat': 'cast_and_machine', 'forge-mat': 'forging',
  'gear-mat': 'gear', 'sm-mat': 'sheet_metal', 'smf-mat': 'sheet_metal_fab', 'imm-mat': 'injection_moulding',
  'bm-mat': 'blow_moulding', 'rm-mat': 'rotational_moulding', 'tf-mat': 'thermoforming', 'ext-mat': 'extrusion',
  'rub-mat': 'rubber', 'em-lam': 'e_motor',
};

/**
 * The scope of each drop-down, from the ENGINE's table (src/engine/material-scope.ts)
 * — the screen offers exactly what the engine costs (material scope review, Oct 2026).
 */
export const MATERIAL_SCOPE_BY_SELECT: Record<string, RegExp> = Object.fromEntries(
  Object.entries(SELECT_COMMODITY).map(([sel, com]) => [sel, MATERIAL_SCOPE_BY_COMMODITY[com]]),
);
