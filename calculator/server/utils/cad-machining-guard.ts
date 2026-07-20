/**
 * Near-net machining guard for CAD-to-Cost.
 *
 * The OCCT CNC estimator (`_estimate_cnc_cycle` in cad-geometry-engine.py) times
 * milling as `planar_face_area / feed_rate` — i.e. it mills EVERY planar face as
 * if the part were machined from solid billet. That is correct for a `machining`
 * (machined-from-solid) part, but it badly over-states `cast_and_machine` /
 * forged near-net parts, where only a thin finish stock is removed from a few
 * datum / journal faces.
 *
 * Left unchecked, a 2.8 kg gravity die-cast stub axle was charged ~0.9 h of
 * machining and came out at ~£116 instead of a realistic ~£30 — the machining
 * (process + labour + overhead + margin) dwarfed a casting that should cost
 * ~£15-18. This module caps the machining time for near-net commodities to a
 * finish-machining envelope that scales with part mass, and reports when it did.
 *
 * Pure functions: no I/O, no AI.
 */

import type { CADSanityWarning } from './cad-sanity.js';

/** Commodities that arrive near-net and only need finish machining. */
export const NEAR_NET_COMMODITIES = new Set(['cast_and_machine', 'casting', 'forging']);

// Finish-machining envelope: a near-net part only needs its datum faces trued,
// journals/bores finished and holes drilled/tapped — not the whole envelope
// milled from solid. These bound the plausible ceiling, they don't set the value.
const SETUP_HR = 0.10;          // ~6 min: one or two datum/fixture setups
const FINISH_HR_PER_KG = 0.07;  // ~4.2 min/kg of finish machining — generous ceiling

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Finish-machining time ceiling (hours) for a near-net part of the given mass. */
export function nearNetMachiningCeilingHr(weightKg: number): number {
  return SETUP_HR + FINISH_HR_PER_KG * n(weightKg);
}

export interface MachiningCapResult {
  machiningHr: number;
  capped: boolean;
  ceilingHr: number;
  reason?: string;
}

/**
 * Cap a from-solid machining estimate to the near-net finish-machining envelope
 * for cast / forged commodities. Machined-from-solid commodities are returned
 * unchanged — there the from-solid estimate is exactly right.
 */
export function capNearNetMachiningHr(rawHr: number, weightKg: number, commodity: string): MachiningCapResult {
  const raw = n(rawHr);
  if (!NEAR_NET_COMMODITIES.has(commodity)) {
    return { machiningHr: raw, capped: false, ceilingHr: Infinity };
  }
  const ceilingHr = nearNetMachiningCeilingHr(weightKg);
  if (raw > ceilingHr) {
    return {
      machiningHr: round4(ceilingHr),
      capped: true,
      ceilingHr: round4(ceilingHr),
      reason: `Machining time ${raw.toFixed(2)} h looked machined-from-solid; a ${n(weightKg).toFixed(1)} kg near-net ${commodity} part only needs finish machining — capped to ${ceilingHr.toFixed(2)} h.`,
    };
  }
  return { machiningHr: raw, capped: false, ceilingHr: round4(ceilingHr) };
}

interface OperationLike { cycleTimeHr?: unknown; [k: string]: unknown }
interface MachiningCapAnalysis {
  costInputSuggestions?: {
    recommendedCommodity?: unknown;
    netWeightKg?: unknown;
    estimatedCycleTimeHr?: unknown;
    estimatedOperations?: OperationLike[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Apply the near-net machining cap to a CAD analysis IN PLACE. When the
 * recommended commodity is near-net and the machining time exceeds the finish
 * envelope, it caps `estimatedCycleTimeHr` and scales the machining operations
 * proportionally so the breakdown stays consistent. Returns a warning to surface
 * to the user (empty array when nothing was capped).
 */
export function applyNearNetMachiningCap(analysis: MachiningCapAnalysis): CADSanityWarning[] {
  const ci = analysis?.costInputSuggestions;
  if (!ci) return [];
  const commodity = String(ci.recommendedCommodity ?? '');
  if (!NEAR_NET_COMMODITIES.has(commodity)) return [];

  const weightKg = n(ci.netWeightKg);
  const rawHr = n(ci.estimatedCycleTimeHr);
  const res = capNearNetMachiningHr(rawHr, weightKg, commodity);
  if (!res.capped) return [];

  const scale = rawHr > 0 ? res.machiningHr / rawHr : 1;
  ci.estimatedCycleTimeHr = res.machiningHr;
  if (Array.isArray(ci.estimatedOperations)) {
    for (const op of ci.estimatedOperations) {
      if (op && Number.isFinite(Number(op.cycleTimeHr))) op.cycleTimeHr = round4(Number(op.cycleTimeHr) * scale);
    }
  }
  return [{ code: 'near_net_machining_capped', message: res.reason!, severity: 'warn' }];
}
