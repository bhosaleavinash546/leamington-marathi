/**
 * The commodity pack registry (offline 2D drawing intelligence, Layer 3).
 *
 * One pack per rule-pack commodity. reconcile.ts and to-costing.ts read packs ONLY through `packFor` — they name no
 * commodity themselves — so a new commodity is a new pack registered here (or with `registerCommodityPack`).
 */
import type { CommodityPack } from './types.js';
import { CASTING_PACK, CAST_AND_MACHINE_PACK } from './casting.js';
import { FORGING_PACK } from './forging.js';
import { SHEET_METAL_PACK, SHEET_METAL_FAB_PACK } from './sheet-metal.js';
import { MACHINING_PACK } from './machining.js';
import { INJECTION_MOULDING_PACK, THERMOFORMING_PACK, BLOW_MOULDING_PACK, ROTATIONAL_MOULDING_PACK, EXTRUSION_PACK } from './polymers.js';
import { RUBBER_PACK } from './rubber.js';
import { COMPOSITES_PACK } from './composites.js';
import { GEAR_PACK } from './gear.js';
import { ALUMINIUM_EXTRUSION_PACK } from './aluminium-extrusion.js';

export type { CommodityPack, DecisionBinding, ExpectedParameter, FormFieldBinding, AnswerCodec } from './types.js';

const BUILT_IN: readonly CommodityPack[] = [
  CASTING_PACK, CAST_AND_MACHINE_PACK, FORGING_PACK, SHEET_METAL_PACK, SHEET_METAL_FAB_PACK, MACHINING_PACK,
  INJECTION_MOULDING_PACK, THERMOFORMING_PACK, BLOW_MOULDING_PACK, ROTATIONAL_MOULDING_PACK, EXTRUSION_PACK,
  RUBBER_PACK, COMPOSITES_PACK, GEAR_PACK, ALUMINIUM_EXTRUSION_PACK,
];

const REGISTRY = new Map<string, CommodityPack>(BUILT_IN.map(p => [p.commodity, p]));

/** The pack of a commodity, or undefined when it has none (then nothing is expected and nothing can be answered). */
export function packFor(commodity: string | undefined): CommodityPack | undefined {
  return commodity ? REGISTRY.get(commodity) : undefined;
}

/** Every registered pack. */
export function allPacks(): CommodityPack[] { return [...REGISTRY.values()]; }

/** Add (or replace) a pack. Returns a function that restores what was there before. */
export function registerCommodityPack(pack: CommodityPack): () => void {
  const before = REGISTRY.get(pack.commodity);
  REGISTRY.set(pack.commodity, pack);
  return () => { if (before) REGISTRY.set(pack.commodity, before); else REGISTRY.delete(pack.commodity); };
}
