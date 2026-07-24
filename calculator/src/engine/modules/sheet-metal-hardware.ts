import type { OperationInput } from '../types.js';

/**
 * Sheet-metal fastening hardware — weld nuts, weld studs, clinch (PEM) nuts/studs,
 * rivnuts. Purchased-component cost goes to the material bucket (consumables);
 * installation time becomes a named operation costed at real machine + labour
 * rates. All numbers deterministic; the catalogue is an indicative UK 2026 prior
 * that every line can override.
 */

export type SheetHardwareType =
  | 'weld_nut_hex'      // DIN 929 hex weld nut — projection welded
  | 'weld_nut_square'   // DIN 928 square weld nut — projection welded
  | 'weld_stud'         // drawn-arc / CD weld stud
  | 'clinch_nut'        // self-clinching (PEM) nut — press installed
  | 'clinch_stud'       // self-clinching stud — press installed
  | 'rivnut';           // blind rivet nut — tool installed

export type ThreadSize = 'M4' | 'M5' | 'M6' | 'M8' | 'M10' | 'M12';

export interface SheetHardwareItem {
  type: SheetHardwareType;
  threadSize: ThreadSize;
  count: number;
  /** Purchased price per piece £. Omit/0 → catalogue default for type+size. */
  unitCostGBP?: number;
  /** Installation time per piece, seconds. Omit/0 → catalogue default. */
  installTimeSec?: number;
  /** Per-piece install consumable £ (electrode wear, ferrule…). Omit → default. */
  consumableCostPerPiece?: number;
}

interface CatalogueRow {
  label: string;
  /** £/piece by thread size — indicative UK distributor pricing, 2026-07. */
  unitCostGBP: Record<ThreadSize, number>;
  installTimeSec: number;
  consumableCostPerPiece: number;
}

/** Nominal thread bore diameter (mm) per size — used by CAD auto-detection to
 * match a detected coaxial bore to a metric hardware size (tapping-drill dia). */
export const THREAD_BORE_MM: Record<ThreadSize, number> = {
  M4: 3.3, M5: 4.2, M6: 5.0, M8: 6.8, M10: 8.5, M12: 10.2,
};

export const HARDWARE_CATALOGUE: Record<SheetHardwareType, CatalogueRow> = {
  weld_nut_hex: {
    label: 'Hex weld nut (DIN 929)',
    unitCostGBP: { M4: 0.025, M5: 0.030, M6: 0.035, M8: 0.048, M10: 0.075, M12: 0.110 },
    installTimeSec: 2.5,           // projection weld on pedestal welder, incl. load/locate
    consumableCostPerPiece: 0.008, // electrode wear + weld energy
  },
  weld_nut_square: {
    label: 'Square weld nut (DIN 928)',
    unitCostGBP: { M4: 0.022, M5: 0.026, M6: 0.030, M8: 0.042, M10: 0.066, M12: 0.098 },
    installTimeSec: 2.5,
    consumableCostPerPiece: 0.008,
  },
  weld_stud: {
    label: 'Weld stud (drawn-arc/CD)',
    unitCostGBP: { M4: 0.020, M5: 0.024, M6: 0.030, M8: 0.045, M10: 0.070, M12: 0.100 },
    installTimeSec: 1.5,           // stud gun cycle incl. positioning
    consumableCostPerPiece: 0.010, // ferrule / tip wear
  },
  clinch_nut: {
    label: 'Self-clinch nut (PEM)',
    unitCostGBP: { M4: 0.035, M5: 0.040, M6: 0.050, M8: 0.075, M10: 0.110, M12: 0.160 },
    installTimeSec: 3.0,           // press insertion incl. handling
    consumableCostPerPiece: 0.002, // anvil/punch wear
  },
  clinch_stud: {
    label: 'Self-clinch stud (PEM)',
    unitCostGBP: { M4: 0.035, M5: 0.040, M6: 0.050, M8: 0.075, M10: 0.110, M12: 0.160 },
    installTimeSec: 3.0,
    consumableCostPerPiece: 0.002,
  },
  rivnut: {
    label: 'Rivnut (blind rivet nut)',
    unitCostGBP: { M4: 0.040, M5: 0.045, M6: 0.055, M8: 0.085, M10: 0.130, M12: 0.190 },
    installTimeSec: 4.0,           // hand/pneumatic tool set
    consumableCostPerPiece: 0.002, // mandrel wear
  },
};

function activeItems(items: SheetHardwareItem[] | undefined): SheetHardwareItem[] {
  return (items ?? []).filter(i => i.count > 0 && HARDWARE_CATALOGUE[i.type] !== undefined);
}

function unitCost(i: SheetHardwareItem): number {
  return (i.unitCostGBP ?? 0) > 0
    ? (i.unitCostGBP as number)
    : HARDWARE_CATALOGUE[i.type].unitCostGBP[i.threadSize] ?? 0;
}

function pieceTimeSec(i: SheetHardwareItem): number {
  return (i.installTimeSec ?? 0) > 0
    ? (i.installTimeSec as number)
    : HARDWARE_CATALOGUE[i.type].installTimeSec;
}

function pieceConsumable(i: SheetHardwareItem): number {
  return i.consumableCostPerPiece !== undefined && i.consumableCostPerPiece >= 0
    ? i.consumableCostPerPiece
    : HARDWARE_CATALOGUE[i.type].consumableCostPerPiece;
}

/** Purchased hardware £/part (pieces only — install consumables are separate). */
export function hardwarePurchaseCostPerPart(items: SheetHardwareItem[] | undefined): number {
  return activeItems(items).reduce((s, i) => s + i.count * unitCost(i), 0);
}

/** Install consumables £/part (electrode wear, ferrules, mandrels). */
export function hardwareConsumableCostPerPart(items: SheetHardwareItem[] | undefined): number {
  return activeItems(items).reduce((s, i) => s + i.count * pieceConsumable(i), 0);
}

/** Total installation seconds per part across all hardware lines. */
export function hardwareInstallTimeSec(items: SheetHardwareItem[] | undefined): number {
  return activeItems(items).reduce((s, i) => s + i.count * pieceTimeSec(i), 0);
}

/** Human-readable summary, e.g. "3× M8 hex weld nut (DIN 929) + 2× M6 weld stud". */
export function describeHardware(items: SheetHardwareItem[] | undefined): string {
  return activeItems(items)
    .map(i => `${i.count}× ${i.threadSize} ${HARDWARE_CATALOGUE[i.type].label}`)
    .join(' + ');
}

export interface HardwareOpContext {
  machineId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  /** Scrap uplift multiplier (1/(1-rejectRate)); hardware on a scrapped part is lost too. */
  rejectUplift?: number;
}

/**
 * Build the named installation operation for the hardware set, or null when
 * there is nothing to install or no machine/labour to cost it against.
 */
export function hardwareInstallOperation(
  items: SheetHardwareItem[] | undefined,
  ctx: HardwareOpContext,
): OperationInput | null {
  const timeSec = hardwareInstallTimeSec(items);
  if (timeSec <= 0 || !ctx.machineId || !ctx.labourId) return null;
  const uplift = ctx.rejectUplift && ctx.rejectUplift > 0 ? ctx.rejectUplift : 1;
  const cycleTimeHr = (timeSec / 3600) * uplift;
  return {
    operationName: `Hardware Install — ${describeHardware(items)}`,
    machineId: ctx.machineId,
    labourId: ctx.labourId,
    cycleTimeHr,
    partsPerCycle: 1,
    oee: ctx.oee,
    manning: ctx.manning,
    labourTimeHr: cycleTimeHr,
    labourEfficiency: ctx.labourEfficiency,
  };
}
