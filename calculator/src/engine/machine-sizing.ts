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

/**
 * Pick a machining centre.
 *
 * Deliberately NOT a size ladder. The other five commodities here tier by force
 * or shot weight because the rate library carries the tiers; machining does not
 * — `mach-vmc3`, `mach-vmc5`, `mach-lathe-cnc` and `mach-drill` differ by what
 * they can reach, not by how big a part they take. So this picks capability:
 * a part needing four or more approach directions goes on a 5-axis machine
 * rather than being refixtured four times, and an axisymmetric part is turned.
 *
 * Consequently `machining` is absent from `SIZE_TIERED_COMMODITIES` below — the
 * self-audit layer would otherwise look for a size driver that does not exist.
 */
export function pickMachiningCentreId(p: {
  principalDirections: number;
  axisymmetric: boolean;
}): string {
  if (p.axisymmetric) return 'mach-lathe-cnc';
  return p.principalDirections >= 4 ? 'mach-vmc5' : 'mach-vmc3';
}

// ─── Gear cutting and finishing ──────────────────────────────────────────────

/**
 * Gear machines are tiered by WORKPIECE SIZE, not by force.
 *
 * A hobber is rated by the largest gear it can swing and the coarsest module it
 * can cut, and the two are correlated but not interchangeable: a wide, coarse
 * truck gear and a large-diameter, fine ring gear can need the same machine for
 * different reasons. So each tier carries both limits and the part must clear
 * both — picking on diameter alone puts a module 10 gear on a machine whose
 * drive cannot take the cut.
 *
 * Capacities here are the machine CLASSES the rate library carries. Real
 * machine-builder envelopes belong in the plant's own data; these are the
 * boundaries between the classes, not a claim about any one builder's model.
 */
export interface GearMachineEnvelope {
  id: string;
  maxModuleMm: number;
  maxDiameterMm: number;
  maxFaceWidthMm: number;
}

/** Ascending by capability, so the first that fits is the smallest that fits. */
const GEAR_HOBBER_TIERS: readonly GearMachineEnvelope[] = [
  { id: 'gear-hob-small', maxModuleMm: 4, maxDiameterMm: 200, maxFaceWidthMm: 150 },
  { id: 'gear-hob-medium', maxModuleMm: 8, maxDiameterMm: 500, maxFaceWidthMm: 300 },
  { id: 'gear-hob-large', maxModuleMm: 25, maxDiameterMm: 1600, maxFaceWidthMm: 700 },
];

const GEAR_SHAPER_TIERS: readonly GearMachineEnvelope[] = [
  { id: 'gear-shaper-small', maxModuleMm: 6, maxDiameterMm: 300, maxFaceWidthMm: 120 },
  { id: 'gear-shaper-large', maxModuleMm: 12, maxDiameterMm: 800, maxFaceWidthMm: 250 },
];

const GEAR_SKIVER_TIERS: readonly GearMachineEnvelope[] = [
  { id: 'gear-skive-small', maxModuleMm: 4, maxDiameterMm: 250, maxFaceWidthMm: 100 },
  { id: 'gear-skive-medium', maxModuleMm: 8, maxDiameterMm: 600, maxFaceWidthMm: 200 },
];

/**
 * Gear grinders, split by what they can physically reach.
 *
 * A GENERATING grinder runs a threaded wheel that meshes with the gear from
 * outside — it cannot enter a bore, so it is external-only. A PROFILE grinder
 * uses a form wheel on a quill and is the route for internal teeth. Selecting
 * on size alone put an internal ring gear on a generating grinder, which is a
 * machine that cannot perform the operation at all.
 */
const GEAR_GRINDER_TIERS_EXTERNAL: readonly GearMachineEnvelope[] = [
  { id: 'gear-grind-generating', maxModuleMm: 6, maxDiameterMm: 400, maxFaceWidthMm: 200 },
  { id: 'gear-grind-profile', maxModuleMm: 12, maxDiameterMm: 1200, maxFaceWidthMm: 500 },
];
const GEAR_GRINDER_TIERS_INTERNAL: readonly GearMachineEnvelope[] = [
  { id: 'gear-grind-profile', maxModuleMm: 12, maxDiameterMm: 1200, maxFaceWidthMm: 500 },
];

/** Fixed-envelope machines — one class each, so no ladder. */
export const GEAR_FIXED_MACHINES = {
  broach: 'gear-broach',
  hone: 'gear-hone',
  shave: 'gear-shave',
  deburr: 'gear-deburr',
  induction: 'gear-induction',
  inspect: 'gear-checker',
  mill: 'mach-vmc5',
} as const;

/** Sentinel for an operation bought by weight rather than run on a rated machine. */
export const HEAT_TREAT_NOT_A_MACHINE = 'furnace-subcontract';

export interface GearMachinePick {
  machineId: string;
  envelope: GearMachineEnvelope | null;
  /** Set when nothing in the class covers the gear. The costing must stop. */
  blocked?: string;
}

/**
 * Smallest machine of the class that covers module, diameter AND face width.
 *
 * Returns `blocked` rather than falling back to the largest tier. That differs
 * on purpose from `pickTier` above, which is right for presses — a part needing
 * more tonnage than any press in the library is still a press job, just a bigger
 * one. A gear beyond the largest hobber is not a hobbing job at all, and
 * silently costing it on the biggest machine would state a cycle time for an
 * operation the shop cannot perform.
 */
function pickGearTier(
  tiers: readonly GearMachineEnvelope[],
  className: string,
  p: { normalModuleMm: number; outerDiameterMm: number; faceWidthMm: number },
): GearMachinePick {
  const fit = tiers.find(t =>
    p.normalModuleMm <= t.maxModuleMm
    && p.outerDiameterMm <= t.maxDiameterMm
    && p.faceWidthMm <= t.maxFaceWidthMm);
  if (fit) return { machineId: fit.id, envelope: fit };

  const biggest = tiers[tiers.length - 1];
  return {
    machineId: biggest.id,
    envelope: biggest,
    blocked: `No ${className} in the library covers module ${p.normalModuleMm} mm × `
      + `Ø${p.outerDiameterMm.toFixed(0)} mm × ${p.faceWidthMm} mm face. The largest is `
      + `${biggest.id} (module ${biggest.maxModuleMm}, Ø${biggest.maxDiameterMm}, face `
      + `${biggest.maxFaceWidthMm}). Add the machine to the rate library, or confirm the gear is `
      + `sub-contracted.`,
  };
}

/** Machine for a gear cutting or finishing operation. */
export function pickGearMachineId(
  process: string,
  p: { normalModuleMm: number; outerDiameterMm: number; faceWidthMm: number; internal?: boolean },
): GearMachinePick {
  switch (process) {
    case 'hobbing':  return pickGearTier(GEAR_HOBBER_TIERS, 'gear hobber', p);
    case 'shaping':  return pickGearTier(GEAR_SHAPER_TIERS, 'gear shaper', p);
    case 'skiving':  return pickGearTier(GEAR_SKIVER_TIERS, 'power skiving machine', p);
    case 'grinding':
      return p.internal
        ? pickGearTier(GEAR_GRINDER_TIERS_INTERNAL, 'internal (profile) gear grinder', p)
        : pickGearTier(GEAR_GRINDER_TIERS_EXTERNAL, 'gear grinder', p);
    case 'broaching':     return { machineId: GEAR_FIXED_MACHINES.broach, envelope: null };
    // Honing and shaving both work a gear from outside. Asked for on an internal
    // gear they are the wrong operation, not a smaller machine, so they block.
    case 'honing':
      return p.internal
        ? { machineId: GEAR_FIXED_MACHINES.hone, envelope: null,
            blocked: 'Gear honing works the flank from outside and cannot reach internal teeth. '
              + 'An internal gear needing that finish is honed on a dedicated internal honing '
              + 'machine, which the rate library does not carry.' }
        : { machineId: GEAR_FIXED_MACHINES.hone, envelope: null };
    case 'shaving':
      return p.internal
        ? { machineId: GEAR_FIXED_MACHINES.shave, envelope: null,
            blocked: 'Gear shaving is an external-only process — the shaving cutter cannot enter '
              + 'a bore. Finish an internal gear by skiving to size or by profile grinding.' }
        : { machineId: GEAR_FIXED_MACHINES.shave, envelope: null };
    case 'deburr':        return { machineId: GEAR_FIXED_MACHINES.deburr, envelope: null };
    case 'inspection':    return { machineId: GEAR_FIXED_MACHINES.inspect, envelope: null };
    case 'milling_5ax':   return { machineId: GEAR_FIXED_MACHINES.mill, envelope: null };
    // Heat treat is bought by weight from a sub-contract furnace, not run on a
    // machine we rate. Returning a machine id here would put a real machine's
    // name against zero cycle time on the operation sheet, which reads as a
    // costing error rather than as "this is not a machine operation".
    case 'case_hardening': return { machineId: HEAT_TREAT_NOT_A_MACHINE, envelope: null };
    case 'quench_temper':  return { machineId: HEAT_TREAT_NOT_A_MACHINE, envelope: null };
    // Every route bought BY WEIGHT from a furnace resolves to the same sentinel:
    // it carries cost but no machine hours, so putting a real machine's name
    // against a zero cycle would read as a costing error rather than as "this is
    // not a machine operation".
    case 'nitriding':
    case 'lpc_carburising':
    case 'carbonitriding':
    case 'martempering':
    case 'austempering':
    case 'fnc':
    case 'wash':
    case 'temper':
    case 'shot_peen':
    case 'straighten':
    case 'press_quench':
      return { machineId: HEAT_TREAT_NOT_A_MACHINE, envelope: null };
    // Induction hardening IS a rated machine: seconds per part on a coil and a
    // quench, not hours in a sub-contract furnace bought by weight.
    case 'induction_hardening':
      return { machineId: GEAR_FIXED_MACHINES.induction, envelope: null };
    default:
      return {
        machineId: GEAR_FIXED_MACHINES.mill, envelope: null,
        blocked: `No machine class is mapped to gear process "${process}".`,
      };
  }
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
