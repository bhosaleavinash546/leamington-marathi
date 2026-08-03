/**
 * Near-net machining guard for CAD-to-Cost — the server-side wrapper.
 *
 * The envelope itself, and the reasoning behind it, now live in
 * `src/engine/near-net-machining.ts`: the deterministic cost-input rules need
 * the same ceiling the AI path is capped to, and one calibration constant in two
 * places is how the two drift apart. This module re-exports it unchanged and
 * adds `applyNearNetMachiningCap`, which knows the shape of a CAD analysis.
 *
 * Pure functions: no I/O, no AI.
 */

import type { CADSanityWarning } from './cad-sanity.js';
import {
  NEAR_NET_COMMODITIES, NEAR_NET_ENVELOPE,
  nearNetMachiningCeilingHr, capNearNetMachiningHr,
  type MachiningCapResult,
} from '../../src/engine/near-net-machining.js';

export {
  NEAR_NET_COMMODITIES, NEAR_NET_ENVELOPE,
  nearNetMachiningCeilingHr, capNearNetMachiningHr,
};
export type { MachiningCapResult };

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

interface OperationLike { cycleTimeHr?: unknown; [k: string]: unknown }
interface ProcessRecLike { commodityType?: unknown; process?: unknown; estimatedCycleTimeHr?: unknown; [k: string]: unknown }
interface MachiningCapAnalysis {
  costInputSuggestions?: {
    recommendedCommodity?: unknown;
    netWeightKg?: unknown;
    estimatedCycleTimeHr?: unknown;
    estimatedOperations?: OperationLike[];
    [k: string]: unknown;
  };
  processRecommendations?: ProcessRecLike[];
  [k: string]: unknown;
}

const MACHINING_RE = /\b(machin|cnc|mill|turn|lathe|bore|drill|ream|grind|hone)\b/i;
const isMachiningRec = (p: ProcessRecLike): boolean =>
  String(p.commodityType ?? '') === 'machining' || MACHINING_RE.test(String(p.process ?? ''));

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
  // Keep the displayed process table consistent: scale the machining process
  // recommendation(s) by the same factor (leave the casting/forging rec alone).
  if (Array.isArray(analysis.processRecommendations)) {
    for (const p of analysis.processRecommendations) {
      if (p && isMachiningRec(p) && Number.isFinite(Number(p.estimatedCycleTimeHr))) {
        p.estimatedCycleTimeHr = round4(Number(p.estimatedCycleTimeHr) * scale);
      }
    }
  }
  return [{ code: 'near_net_machining_capped', message: res.reason!, severity: 'warn' }];
}
