/**
 * Universal machine-sizing dispatcher.
 *
 * The lesson from real parts (fuel-tank bottle-machine, bumper undersized press)
 * generalised: for every process where the machine is tiered by size, pick the
 * smallest machine whose capacity covers the part — never leave the form default.
 * One registry so a new commodity inherits the rule and the self-audit layer has
 * a single place to ask "is the machine sized to this part?".
 *
 * These functions only SELECT a machine id from the rate library — they never set
 * a price. The £/hr still comes from the deterministic rate library (golden rule).
 */
import { pickIMMPressId } from './modules/injection-moulding.js';
import { pickEBMMachineId } from './modules/blow-moulding.js';

export { pickIMMPressId, pickEBMMachineId };

/** Pick the smallest id from an ascending [capacity, id] ladder that covers
 *  `required`; fall back to the largest tier when nothing is big enough. */
function pickTier(ladder: ReadonlyArray<readonly [number, string]>, required: number): string {
  for (const [cap, id] of ladder) if (cap >= required) return id;
  return ladder[ladder.length - 1][1];
}

/** Mechanical stamping presses (metric tonnes-force) present in the rate library. */
const STAMPING_PRESS_TIERS: ReadonlyArray<readonly [number, string]> = [
  [100, 'press-100t'], [200, 'press-200t'], [400, 'press-400t'],
  [630, 'press-630t'], [800, 'press-800t'], [1000, 'press-1000t'], [1250, 'press-1250t'],
];

/** Closed-die forging presses (metric tonnes-force) present in the rate library. */
const FORGE_PRESS_TIERS: ReadonlyArray<readonly [number, string]> = [
  [500, 'forge-press-500t'], [1600, 'forge-press-1600t'], [2500, 'forge-press-2500t'],
  [4000, 'forge-press-4000t'], [8000, 'forge-press-8000t'],
];

/** High-pressure die-casting machines (clamp/locking force, metric tonnes). */
const HPDC_MACHINE_TIERS: ReadonlyArray<readonly [number, string]> = [
  [160, 'hpdc-160t'], [500, 'hpdc-500t'], [800, 'hpdc-800t'], [1600, 'hpdc-1600t'],
  [6100, 'hpdc-giga-6100t'], [9000, 'hpdc-giga-9000t'],
];

/** Smallest stamping press covering the blanking/forming force × safety factor. */
export function pickStampingPressId(requiredTonnes: number, safety = 1.25): string {
  return pickTier(STAMPING_PRESS_TIERS, Math.max(0, requiredTonnes) * safety);
}

/** Smallest forging press covering the die-fill force × safety factor. */
export function pickForgePressId(requiredTonnes: number, safety = 1.2): string {
  return pickTier(FORGE_PRESS_TIERS, Math.max(0, requiredTonnes) * safety);
}

/** Smallest HPDC machine covering the clamp/locking force × safety factor. */
export function pickHPDCMachineId(requiredTonnes: number, safety = 1.2): string {
  return pickTier(HPDC_MACHINE_TIERS, Math.max(0, requiredTonnes) * safety);
}

/** Physics inputs for the dispatcher — each commodity reads only the field it needs. */
export interface MachineSizingParams {
  /** injection moulding: estimated clamp tonnage. */
  clampTonnes?: number;
  /** blow moulding: gross shot weight (part + flash) kg. */
  shotKg?: number;
  /** forging: estimated die-fill force, metric tonnes. */
  forgeTonnes?: number;
  /** sheet-metal stamping: estimated blanking force, metric tonnes. */
  stampTonnes?: number;
  /** HPDC (casting / cast+machine): estimated clamp/locking force, metric tonnes. */
  hpdcTonnes?: number;
}

/** Commodities whose machine is tiered by part size, and the driver that tiers it.
 *  The self-audit layer reads this to know which estimates to check. Casting is
 *  tiered only for the HPDC subtype — sand/gravity/investment are not machine-force
 *  tiered. Rubber / rotomoulding / extrusion are process-variant tiered (compression
 *  vs injection, arm style, screw line), NOT part-size tiered, so they are absent. */
export const SIZE_TIERED_COMMODITIES: Record<string, keyof MachineSizingParams> = {
  injection_moulding: 'clampTonnes',
  blow_moulding: 'shotKg',
  forging: 'forgeTonnes',
  sheet_metal: 'stampTonnes',
  casting: 'hpdcTonnes',
  cast_and_machine: 'hpdcTonnes',
};

/** Pick the right machine id for a size-tiered commodity, or null if the commodity
 *  is not size-tiered or the needed driver is missing. */
export function sizeProcessMachine(commodity: string, p: MachineSizingParams): string | null {
  switch (commodity) {
    case 'injection_moulding': return p.clampTonnes != null ? pickIMMPressId(p.clampTonnes) : null;
    case 'blow_moulding':      return p.shotKg != null ? pickEBMMachineId(p.shotKg) : null;
    case 'forging':            return p.forgeTonnes != null ? pickForgePressId(p.forgeTonnes) : null;
    case 'sheet_metal':        return p.stampTonnes != null ? pickStampingPressId(p.stampTonnes) : null;
    case 'casting':
    case 'cast_and_machine':   return p.hpdcTonnes != null ? pickHPDCMachineId(p.hpdcTonnes) : null;
    default:                   return null;
  }
}
